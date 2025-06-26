const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Данные в памяти ---
let appointments = [];
let nextAppointmentId = 1; // Счетчик для ID записей
const adminUser = { username: 'admin', password: '1234', token: 'admintoken' };
let doctors = [
    { id: 1, name: 'Иванов И.И.', specialty: 'Терапевт', username: 'ivanov', password: 'doc1' },
    { id: 2, name: 'Петрова А.А.', specialty: 'Хирург', username: 'petrova', password: 'doc2' },
    { id: 3, name: 'Сидоров В.В.', specialty: 'Педиатр', username: 'sidorov', password: 'doc3' }
];
let nextDoctorId = 4;

const DOCTORS_FILE = path.join(__dirname, 'doctors.json');
const APPOINTMENTS_FILE = path.join(__dirname, 'appointments.json');

function saveDoctors() {
    fs.writeFileSync(DOCTORS_FILE, JSON.stringify(doctors, null, 2), 'utf-8');
}
function saveAppointments() {
    fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2), 'utf-8');
}

// Загрузка данных из файлов при старте
if (fs.existsSync(DOCTORS_FILE)) {
    doctors = JSON.parse(fs.readFileSync(DOCTORS_FILE, 'utf-8'));
    nextDoctorId = Math.max(...doctors.map(d => d.id), 0) + 1;
}
if (fs.existsSync(APPOINTMENTS_FILE)) {
    appointments = JSON.parse(fs.readFileSync(APPOINTMENTS_FILE, 'utf-8'));
    nextAppointmentId = Math.max(...appointments.map(a => a.id), 0) + 1;
}

const verifyAdmin = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token !== `Bearer ${adminUser.token}`) {
        return res.status(403).json({ success: false, message: 'Доступ запрещен' });
    }
    next();
};

// --- Ограничение попыток входа ---
const loginAttempts = {};
const MAX_ATTEMPTS = 5;
const BLOCK_TIME = 10 * 60 * 1000; // 10 минут

function isBlocked(ip) {
    const entry = loginAttempts[ip];
    if (!entry) return false;
    if (entry.count >= MAX_ATTEMPTS && Date.now() - entry.last > BLOCK_TIME) {
        // Снимаем блокировку после BLOCK_TIME
        delete loginAttempts[ip];
        return false;
    }
    return entry.count >= MAX_ATTEMPTS && Date.now() - entry.last < BLOCK_TIME;
}
function recordAttempt(ip) {
    if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, last: Date.now() };
    loginAttempts[ip].count++;
    loginAttempts[ip].last = Date.now();
}
function resetAttempts(ip) {
    delete loginAttempts[ip];
}

// --- Функции для работы с датами ---
function getTimeOfDay(time) {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
}

function getAvailableDates(doctorId, month, year) {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    const dates = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dayOfWeek = d.getDay();
        
        // Врачи работают только в будние дни (пн-пт, 0=воскресенье, 1=понедельник)
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            dates.push(dateStr);
        }
    }
    
    return dates;
}

function getDateLoadLevel(doctorId, date) {
    // Получаем количество записей на эту дату
    const appointmentsOnDate = appointments.filter(a => 
        a.doctorId === doctorId && a.date === date
    );
    
    if (appointmentsOnDate.length === 0) return 'free';
    if (appointmentsOnDate.length <= 3) return 'low';
    if (appointmentsOnDate.length <= 6) return 'medium';
    return 'high';
}

// --- Audit log ---
async function logAction(action, details, user = null) {
    try {
        await pool.query(
            'INSERT INTO audit_log (action, details, username, created_at) VALUES ($1, $2, $3, NOW())',
            [action, details, user]
        );
    } catch (e) { /* ignore log errors */ }
}

// --- Создание таблицы audit_log при старте ---
pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    username VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
)`);

// --- API ---

// Получить список врачей
app.get('/api/doctors', async (req, res) => {
    try {
        // Используем данные из памяти вместо PostgreSQL
        const doctorsWithCount = doctors.map(doc => ({
            ...doc,
            appointmentCount: appointments.filter(a => a.doctorId === doc.id).length
        }));
        res.json(doctorsWithCount);
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Получить доступные даты для врача
app.get('/api/doctors/:id/calendar', async (req, res) => {
    const doctorId = parseInt(req.params.id, 10);
    const { month, year } = req.query;
    const currentMonth = month ? parseInt(month, 10) : new Date().getMonth();
    const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();
    
    try {
        const availableDates = getAvailableDates(doctorId, currentMonth, currentYear);
        const calendarData = availableDates.map(date => ({
            date,
            loadLevel: getDateLoadLevel(doctorId, date)
        }));
        
        res.json({ success: true, calendar: calendarData });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Получить доступные времена для врача на конкретную дату
app.get('/api/doctors/:id/times', async (req, res) => {
    const doctorId = parseInt(req.params.id, 10);
    const { date, timeFilter } = req.query;
    
    if (!date) {
        return res.status(400).json({ success: false, message: 'Дата обязательна' });
    }
    
    try {
        // Получаем занятые времена на эту дату
        const busyTimes = appointments.filter(a => 
            a.doctorId === doctorId && a.date === date
        ).map(a => a.time);
        
        // Генерируем все возможные времена
        const allTimes = [];
        for (let h = 9; h <= 18; h++) {
            const timeStr = `${h.toString().padStart(2, '0')}:00`;
            const timeOfDay = getTimeOfDay(timeStr);
            
            // Применяем фильтр по времени дня
            if (!timeFilter || timeFilter === timeOfDay) {
                allTimes.push({
                    time: timeStr,
                    available: !busyTimes.includes(timeStr),
                    timeOfDay
                });
            }
        }
        
        res.json({ success: true, times: allTimes });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Добавить врача
app.post('/api/doctors', verifyAdmin, async (req, res) => {
    const { name, specialty } = req.body;
    if (!name || !specialty) {
        return res.status(400).json({ success: false, message: 'Имя и специальность обязательны' });
    }
    try {
        // Проверка на уникальность (имя+специальность)
        const exists = doctors.find(d => d.name === name && d.specialty === specialty);
        if (exists) {
            return res.json({ success: false, message: 'Врач с таким именем и специальностью уже существует' });
        }
        const newDoctor = {
            id: nextDoctorId++,
            name,
            specialty
        };
        doctors.push(newDoctor);
        saveDoctors();
        await logAction('add_doctor', `Добавлен врач: ${name}, ${specialty}`, req.user?.username || 'admin');
        res.json({ success: true, doctor: newDoctor });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Удалить врача
app.delete('/api/doctors/:id', verifyAdmin, async (req, res) => {
    const doctorId = parseInt(req.params.id, 10);
    try {
        doctors = doctors.filter(d => d.id !== doctorId);
        appointments = appointments.filter(a => a.doctorId !== doctorId);
        saveDoctors();
        saveAppointments();
        await logAction('delete_doctor', `Удалён врач id=${doctorId}`, req.user?.username || 'admin');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Создать запись к врачу
app.post('/api/appointments', async (req, res) => {
    const { doctorId, name, snils, phone, time, date } = req.body;
    if (!doctorId || !name || !snils || !phone || !time || !date) {
        return res.json({ success: false, message: 'Все поля обязательны' });
    }
    try {
        // Приводим телефон к 10 цифрам
        const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
        // Проверяем, занято ли время на эту дату
        const busy = appointments.filter(a => 
            a.doctorId === doctorId && a.time === time && a.date === date
        );
        if (busy.length > 0) {
            return res.json({ success: false, message: 'Это время уже занято' });
        }
        
        const newAppointment = {
            id: nextAppointmentId++,
            doctorId,
            name,
            snils,
            phone: cleanPhone,
            time,
            date
        };
        appointments.push(newAppointment);
        saveAppointments();
        
        await logAction('add_appointment', `Запись к врачу id=${doctorId} на ${date} ${time} (${name})`, name);
        res.json({ success: true, appointment: newAppointment });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Удалить запись (пациент или админ)
app.delete('/api/appointments/:id', async (req, res) => {
    const appointmentId = parseInt(req.params.id, 10);
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        try {
            const appointment = appointments.find(a => a.id === appointmentId);
            if (appointment) {
                appointments = appointments.filter(a => a.id !== appointmentId);
                saveAppointments();
                await logAction('delete_appointment', `Удалена запись id=${appointmentId}`, req.user?.username || 'admin');
            }
            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, message: 'DB error', error: err.message });
        }
    }
    // Теперь телефон берём из query
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ success: false, message: 'Телефон обязателен' });
    try {
        const appointment = appointments.find(a => a.id === appointmentId);
        if (!appointment) return res.status(404).json({ success: false, message: 'Запись не найдена' });
        
        // Приводим оба телефона к 10 цифрам
        const cleanPhone = (phone || '').replace(/[^0-9]/g, '').slice(-10);
        const appPhone = (appointment.phone || '').replace(/[^0-9]/g, '').slice(-10);
        if (appPhone !== cleanPhone) {
            return res.status(403).json({ success: false, message: 'Вы не можете отменить чужую запись' });
        }
        
        appointments = appointments.filter(a => a.id !== appointmentId);
        saveAppointments();
        await logAction('delete_appointment', `Пациент отменил запись id=${appointmentId}`, phone);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Получить записи (по врачу или по пациенту)
app.get('/api/appointments', async (req, res) => {
    const { doctorId, name, phone } = req.query;
    try {
        let result = [];
        if (doctorId) {
            // Поиск для админа/врача
            result = appointments.filter(a => a.doctorId === parseInt(doctorId, 10));
        } else if (phone) {
            // Поиск для пациента
            let cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
            result = appointments.filter(a => {
                const appPhone = (a.phone || '').replace(/[^0-9]/g, '').slice(-10);
                return appPhone === cleanPhone;
            });
        } else {
            return res.json([]);
        }
        
        // Добавим имя врача и специальность для вывода
        const doctorIds = [...new Set(result.map(a => a.doctorId))];
        let doctorsMap = {};
        doctors.forEach(d => {
            if (doctorIds.includes(d.id)) {
                doctorsMap[d.id] = d;
            }
        });
        
        const finalResult = result.map(a => ({
            ...a,
            doctorName: doctorsMap[a.doctorId]?.name || '',
            specialty: doctorsMap[a.doctorId]?.specialty || ''
        }));
        res.json(finalResult);
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Вход для администратора
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (isBlocked(ip)) {
        await logAction('login_blocked', `Too many attempts from ${ip}`, username);
        return res.json({ success: false, message: 'Слишком много попыток входа. Попробуйте позже.' });
    }
    if (username === adminUser.username && password === adminUser.password) {
        resetAttempts(ip);
        await logAction('admin_login', 'Успешный вход', username);
        return res.json({ success: true, token: adminUser.token });
    } else {
        recordAttempt(ip);
        await logAction('admin_login_fail', 'Неверный логин или пароль', username);
        return res.json({ success: false, message: 'Неверный логин или пароль' });
    }
});

// Вход для врача
app.post('/api/doctor/login', async (req, res) => {
    const { username, password } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (isBlocked(ip)) {
        await logAction('login_blocked', `Too many attempts from ${ip}`, username);
        return res.json({ success: false, message: 'Слишком много попыток входа. Попробуйте позже.' });
    }
    try {
        const doctor = doctors.find(d => d.username === username && d.password === password);
        if (doctor) {
            resetAttempts(ip);
            await logAction('doctor_login', 'Успешный вход', username);
            res.json({ success: true, doctorId: doctor.id, name: doctor.name, specialty: doctor.specialty });
        } else {
            recordAttempt(ip);
            await logAction('doctor_login_fail', 'Неверный логин или пароль', username);
            res.json({ success: false, message: 'Неверный логин или пароль' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Обновить логин/пароль врача
app.put('/api/doctors/:id/credentials', verifyAdmin, async (req, res) => {
    const doctorId = parseInt(req.params.id, 10);
    const { username, password } = req.body;
    try {
        const doctorIndex = doctors.findIndex(d => d.id === doctorId);
        if (doctorIndex === -1) {
            return res.status(404).json({ success: false, message: 'Врач не найден' });
        }
        doctors[doctorIndex].username = username;
        doctors[doctorIndex].password = password;
        saveDoctors();
        await logAction('update_doctor_credentials', `Изменены логин/пароль врача id=${doctorId} (логин: ${username})`, req.user?.username || 'admin');
        res.json({ success: true, doctor: doctors[doctorIndex] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Редактировать данные врача (имя, специальность, логин)
app.put('/api/doctors/:id', verifyAdmin, async (req, res) => {
    const doctorId = parseInt(req.params.id, 10);
    const { name, specialty, username } = req.body;
    if (!name || !specialty) {
        return res.status(400).json({ success: false, message: 'Имя и специальность обязательны' });
    }
    try {
        const doctorIndex = doctors.findIndex(d => d.id === doctorId);
        if (doctorIndex === -1) {
            return res.status(404).json({ success: false, message: 'Врач не найден' });
        }
        doctors[doctorIndex].name = name;
        doctors[doctorIndex].specialty = specialty;
        doctors[doctorIndex].username = username;
        saveDoctors();
        await logAction('update_doctor', `Изменены данные врача id=${doctorId} (имя: ${name}, спец: ${specialty}, логин: ${username})`, req.user?.username || 'admin');
        res.json({ success: true, doctor: doctors[doctorIndex] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Получить логи (только для админа)
app.get('/api/audit-log', verifyAdmin, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const type = req.query.type;
    let query = 'SELECT * FROM audit_log';
    let params = [];
    if (type) {
        query += ' WHERE action = $1';
        params.push(type);
    }
    query += ' ORDER BY created_at DESC LIMIT ' + limit;
    try {
        const result = await pool.query(query, params);
        res.json({ success: true, logs: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// --- Запуск сервера ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
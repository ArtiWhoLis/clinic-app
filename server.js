const express = require('express');
const cors = require('cors');
const path = require('path');
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
const adminUser = { username: 'admin', password: '1234', token: 'admintoken' };

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

async function getDateLoadLevel(doctorId, date) {
    try {
        const result = await pool.query(
            'SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND date = $2',
            [doctorId, date]
        );
        const count = parseInt(result.rows[0].count);
        
        if (count === 0) return 'free';
        if (count <= 3) return 'low';
        if (count <= 6) return 'medium';
        return 'high';
    } catch (err) {
        console.error('Ошибка получения загрузки даты:', err);
        return 'free';
    }
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

// --- Создание таблиц при старте ---
async function initializeDatabase() {
    try {
        // Создаем таблицу врачей
        await pool.query(`CREATE TABLE IF NOT EXISTS doctors (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            specialty VARCHAR(100) NOT NULL,
            username VARCHAR(50),
            password VARCHAR(100)
        )`);

        // Создаем таблицу записей с поддержкой дат
        await pool.query(`CREATE TABLE IF NOT EXISTS appointments (
            id SERIAL PRIMARY KEY,
            doctor_id INTEGER REFERENCES doctors(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            snils VARCHAR(20) NOT NULL,
            phone VARCHAR(15) NOT NULL,
            time VARCHAR(5) NOT NULL,
            date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )`);

        // Создаем таблицу логов
        await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            action VARCHAR(100) NOT NULL,
            details TEXT,
            username VARCHAR(100),
            created_at TIMESTAMP DEFAULT NOW()
        )`);

        // Добавляем индексы для оптимизации
        await pool.query('CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments(doctor_id, date)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(phone)');

        // Проверяем, есть ли врачи в базе
        const doctorsCount = await pool.query('SELECT COUNT(*) FROM doctors');
        if (parseInt(doctorsCount.rows[0].count) === 0) {
            // Добавляем тестовых врачей
            await pool.query(`
                INSERT INTO doctors (name, specialty, username, password) VALUES 
                ('Иванов И.И.', 'Терапевт', 'ivanov', 'doc1'),
                ('Петрова А.А.', 'Хирург', 'petrova', 'doc2'),
                ('Сидоров В.В.', 'Педиатр', 'sidorov', 'doc3')
            `);
        }
    } catch (err) {
        console.error('Ошибка инициализации базы данных:', err);
    }
}

// Инициализируем базу данных при запуске
initializeDatabase();

// --- API ---

// Получить список врачей
app.get('/api/doctors', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM doctors ORDER BY id');
        const apps = await pool.query('SELECT doctor_id, COUNT(*) as count FROM appointments GROUP BY doctor_id');
        const appCount = {};
        apps.rows.forEach(a => appCount[a.doctor_id] = Number(a.count));
        const doctorsWithCount = result.rows.map(doc => ({
            ...doc,
            appointmentCount: appCount[doc.id] || 0
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
        const calendarData = [];
        
        for (const date of availableDates) {
            const loadLevel = await getDateLoadLevel(doctorId, date);
            calendarData.push({ date, loadLevel });
        }
        
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
        const busyResult = await pool.query(
            'SELECT time FROM appointments WHERE doctor_id = $1 AND date = $2',
            [doctorId, date]
        );
        const busyTimes = busyResult.rows.map(row => row.time);
        
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
        const exists = await pool.query('SELECT 1 FROM doctors WHERE name = $1 AND specialty = $2', [name, specialty]);
        if (exists.rows.length > 0) {
            return res.json({ success: false, message: 'Врач с таким именем и специальностью уже существует' });
        }
        const result = await pool.query(
            'INSERT INTO doctors (name, specialty) VALUES ($1, $2) RETURNING *',
            [name, specialty]
        );
        await logAction('add_doctor', `Добавлен врач: ${name}, ${specialty}`, req.user?.username || 'admin');
        res.json({ success: true, doctor: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Удалить врача
app.delete('/api/doctors/:id', verifyAdmin, async (req, res) => {
    const doctorId = parseInt(req.params.id, 10);
    try {
        await pool.query('DELETE FROM doctors WHERE id = $1', [doctorId]);
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
        const busy = await pool.query(
            'SELECT 1 FROM appointments WHERE doctor_id = $1 AND time = $2 AND date = $3',
            [doctorId, time, date]
        );
        if (busy.rows.length > 0) {
            return res.json({ success: false, message: 'Это время уже занято' });
        }
        
        const result = await pool.query(
            'INSERT INTO appointments (doctor_id, name, snils, phone, time, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [doctorId, name, snils, cleanPhone, time, date]
        );
        await logAction('add_appointment', `Запись к врачу id=${doctorId} на ${date} ${time} (${name})`, name);
        res.json({ success: true, appointment: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Удалить запись (пациент или админ)
app.delete('/api/appointments/:id', async (req, res) => {
    const appointmentId = parseInt(req.params.id, 10);
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        try {
            await pool.query('DELETE FROM appointments WHERE id = $1', [appointmentId]);
            await logAction('delete_appointment', `Удалена запись id=${appointmentId}`, req.user?.username || 'admin');
            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ success: false, message: 'DB error', error: err.message });
        }
    }
    // Теперь телефон берём из query
    const phone = req.query.phone;
    if (!phone) return res.status(400).json({ success: false, message: 'Телефон обязателен' });
    try {
        const result = await pool.query('SELECT * FROM appointments WHERE id = $1', [appointmentId]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Запись не найдена' });
        const app = result.rows[0];
        // Приводим оба телефона к 10 цифрам
        const cleanPhone = (phone || '').replace(/[^0-9]/g, '').slice(-10);
        const appPhone = (app.phone || '').replace(/[^0-9]/g, '').slice(-10);
        if (appPhone !== cleanPhone) {
            return res.status(403).json({ success: false, message: 'Вы не можете отменить чужую запись' });
        }
        await pool.query('DELETE FROM appointments WHERE id = $1', [appointmentId]);
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
            const apps = await pool.query('SELECT * FROM appointments WHERE doctor_id = $1 ORDER BY date, time', [doctorId]);
            result = apps.rows;
        } else if (phone) {
            // Поиск для пациента
            let cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
            let query = 'SELECT * FROM appointments WHERE phone = $1';
            let params = [cleanPhone];
            if (name) {
                query += ' AND LOWER(name) = LOWER($2)';
                params.push(name.trim());
            }
            query += ' ORDER BY date, time';
            const apps = await pool.query(query, params);
            result = apps.rows;
        } else {
            return res.json([]);
        }
        
        // Добавим имя врача и специальность для вывода
        const doctorIds = [...new Set(result.map(a => a.doctor_id))];
        let doctorsMap = {};
        if (doctorIds.length) {
            const docs = await pool.query('SELECT id, name, specialty FROM doctors WHERE id = ANY($1)', [doctorIds]);
            docs.rows.forEach(d => doctorsMap[d.id] = d);
        }
        
        const finalResult = result.map(a => ({
            ...a,
            doctorName: doctorsMap[a.doctor_id]?.name || '',
            specialty: doctorsMap[a.doctor_id]?.specialty || ''
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
        const result = await pool.query(
            'SELECT * FROM doctors WHERE username = $1 AND password = $2',
            [username, password]
        );
        if (result.rows.length > 0) {
            resetAttempts(ip);
            const doctor = result.rows[0];
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
        const result = await pool.query(
            'UPDATE doctors SET username = $1, password = $2 WHERE id = $3 RETURNING *',
            [username, password, doctorId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Врач не найден' });
        }
        await logAction('update_doctor_credentials', `Изменены логин/пароль врача id=${doctorId} (логин: ${username})`, req.user?.username || 'admin');
        res.json({ success: true, doctor: result.rows[0] });
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
        const result = await pool.query(
            'UPDATE doctors SET name = $1, specialty = $2, username = $3 WHERE id = $4 RETURNING *',
            [name, specialty, username, doctorId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Врач не найден' });
        }
        await logAction('update_doctor', `Изменены данные врача id=${doctorId} (имя: ${name}, спец: ${specialty}, логин: ${username})`, req.user?.username || 'admin');
        res.json({ success: true, doctor: result.rows[0] });
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
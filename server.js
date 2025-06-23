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

// Добавить врача
app.post('/api/doctors', verifyAdmin, async (req, res) => {
    const { name, specialty } = req.body;
    if (!name || !specialty) {
        return res.status(400).json({ success: false, message: 'Имя и специальность обязательны' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO doctors (name, specialty) VALUES ($1, $2) RETURNING *',
            [name, specialty]
        );
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
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Создать запись к врачу
app.post('/api/appointments', async (req, res) => {
    const { doctorId, name, snils, phone, time } = req.body;
    if (!doctorId || !name || !snils || !phone || !time) {
        return res.json({ success: false, message: 'Все поля обязательны' });
    }
    try {
        // Проверяем, занято ли время
        const busy = await pool.query(
            'SELECT 1 FROM appointments WHERE doctor_id = $1 AND time = $2',
            [doctorId, time]
        );
        if (busy.rows.length > 0) {
            return res.json({ success: false, message: 'Это время уже занято' });
        }
        const result = await pool.query(
            'INSERT INTO appointments (doctor_id, name, snils, phone, time) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [doctorId, name, snils, phone, time]
        );
        res.json({ success: true, appointment: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// Удалить запись
app.delete('/api/appointments/:id', verifyAdmin, async (req, res) => {
    const appointmentId = parseInt(req.params.id, 10);
    try {
        await pool.query('DELETE FROM appointments WHERE id = $1', [appointmentId]);
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
            const apps = await pool.query('SELECT * FROM appointments WHERE doctor_id = $1', [doctorId]);
            result = apps.rows;
        } else if (phone) {
            // Поиск для пациента
            let query = 'SELECT * FROM appointments WHERE phone = $1';
            let params = [phone.trim()];
            if (name) {
                query += ' AND LOWER(name) = LOWER($2)';
                params.push(name.trim());
            }
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
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === adminUser.username && password === adminUser.password) {
        res.json({ success: true, token: adminUser.token });
    } else {
        res.json({ success: false, message: 'Неверный логин или пароль' });
    }
});

// Вход для врача
app.post('/api/doctor/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM doctors WHERE username = $1 AND password = $2',
            [username, password]
        );
        if (result.rows.length > 0) {
            const doctor = result.rows[0];
            res.json({ success: true, doctorId: doctor.id, name: doctor.name, specialty: doctor.specialty });
        } else {
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
        res.json({ success: true, doctor: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'DB error', error: err.message });
    }
});

// --- Запуск сервера ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
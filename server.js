const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
app.get('/api/doctors', (req, res) => {
    const doctorAppointments = appointments.reduce((acc, app) => {
        acc[app.doctorId] = (acc[app.doctorId] || 0) + 1;
        return acc;
    }, {});

    const doctorsWithCount = doctors.map(doc => ({
        ...doc,
        appointmentCount: doctorAppointments[doc.id] || 0
    }));
    res.json(doctorsWithCount);
});

// Добавить врача
app.post('/api/doctors', verifyAdmin, (req, res) => {
    const { name, specialty } = req.body;
    if (!name || !specialty) {
        return res.status(400).json({ success: false, message: 'Имя и специальность обязательны' });
    }
    const newDoctor = { id: nextDoctorId++, name, specialty };
    doctors.push(newDoctor);
    saveDoctors();
    res.json({ success: true, doctor: newDoctor });
});

// Удалить врача
app.delete('/api/doctors/:id', verifyAdmin, (req, res) => {
    const doctorId = parseInt(req.params.id, 10);
    doctors = doctors.filter(d => d.id !== doctorId);
    saveDoctors();
    // Также удаляем все записи к этому врачу
    appointments = appointments.filter(a => a.doctorId !== doctorId);
    saveAppointments();
    res.json({ success: true });
});

// Создать запись к врачу
app.post('/api/appointments', (req, res) => {
    const { doctorId, name, snils, phone, time } = req.body;
    if (!doctorId || !name || !snils || !phone || !time) {
        return res.json({ success: false, message: 'Все поля обязательны' });
    }
    const newAppointment = {
        id: nextAppointmentId++,
        doctorId,
        name,
        snils,
        phone,
        time
    };
    appointments.push(newAppointment);
    saveAppointments();
    console.log('Текущие записи:', appointments); // Для отладки
    res.json({ success: true });
});

// Удалить запись
app.delete('/api/appointments/:id', verifyAdmin, (req, res) => {
    const appointmentId = parseInt(req.params.id, 10);
    const initialLength = appointments.length;
    appointments = appointments.filter(a => a.id !== appointmentId);
    saveAppointments();
    if (appointments.length < initialLength) {
        console.log(`Запись с ID ${appointmentId} удалена.`);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: 'Запись не найдена' });
    }
});

// Получить записи (по врачу или по пациенту)
app.get('/api/appointments', (req, res) => {
    const { doctorId, name, phone } = req.query;
    let result = []; // Начинаем с пустого массива

    if (doctorId) { // Поиск для админа
        result = appointments.filter(a => a.doctorId == doctorId);
    } else if (phone) { // Поиск для пациента
        // Сначала ищем по номеру телефона
        let patientAppointments = appointments.filter(a => a.phone.trim() === phone.trim());
        // Если передано и имя - фильтруем дополнительно
        if (name) {
            patientAppointments = patientAppointments.filter(a => a.name.trim().toLowerCase() === name.trim().toLowerCase());
        }
        result = patientAppointments;
    } else {
        // Если не указан ни doctorId, ни phone - ничего не возвращаем
        return res.json([]);
    }

    // Добавим имя врача и специальность для вывода
    const finalResult = result.map(a => {
        const doc = doctors.find(d => d.id == a.doctorId);
        return {
            ...a,
            doctorName: doc ? doc.name : '',
            specialty: doc ? doc.specialty : ''
        };
    });
    console.log('Запрос на поиск:', req.query, 'Результат:', finalResult); // Для отладки
    res.json(finalResult);
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
app.post('/api/doctor/login', (req, res) => {
    const { username, password } = req.body;
    const doctor = doctors.find(d => d.username === username && d.password === password);
    if (doctor) {
        res.json({ success: true, doctorId: doctor.id, name: doctor.name, specialty: doctor.specialty });
    } else {
        res.json({ success: false, message: 'Неверный логин или пароль' });
    }
});

// Обновить логин/пароль врача
app.put('/api/doctors/:id/credentials', verifyAdmin, (req, res) => {
    const doctorId = parseInt(req.params.id, 10);
    const { username, password } = req.body;
    const doctor = doctors.find(d => d.id === doctorId);
    if (!doctor) {
        return res.status(404).json({ success: false, message: 'Врач не найден' });
    }
    doctor.username = username;
    doctor.password = password;
    saveDoctors();
    res.json({ success: true, doctor });
});

// --- Запуск сервера ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
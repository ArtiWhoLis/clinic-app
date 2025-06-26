const API_URL = '/api';

// --- Глобальные функции для модалок ---
function focusFirstInput(modal) {
    setTimeout(() => {
        const input = modal.querySelector('input, select, textarea');
        if (input) input.focus();
    }, 100);
}
function openModal(modal) {
    modal.style.display = 'flex';
    setTimeout(() => {
        const modalWindow = modal.querySelector('.modal');
        if (modalWindow) {
            modalWindow.classList.remove('hide');
            modalWindow.classList.add('show');
        }
        focusFirstInput(modal);
    }, 10);
}

// --- Theme Switcher ---
document.addEventListener('DOMContentLoaded', () => {
    const themeSwitcher = document.getElementById('theme-switcher');
    const currentTheme = localStorage.getItem('theme');

    if (currentTheme === 'dark') {
        document.body.classList.add('dark-theme');
        themeSwitcher.textContent = '🌙';
    } else {
        themeSwitcher.textContent = '☀️';
    }

    themeSwitcher.onclick = () => {
        if (document.body.classList.contains('dark-theme')) {
            document.body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
            themeSwitcher.textContent = '☀️';
        } else {
            document.body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
            themeSwitcher.textContent = '🌙';
        }
    };

    // Add focus class to parent form-group for prefixed inputs
    document.querySelectorAll('.form-input.with-prefix').forEach(input => {
        const formGroup = input.closest('.form-group');
        if (formGroup) {
            input.addEventListener('focus', () => {
                formGroup.classList.add('is-focused');
            });
            input.addEventListener('blur', () => {
                formGroup.classList.remove('is-focused');
            });
        }
    });
});

// --- patient.html ---
if (window.location.pathname.endsWith('patient.html')) {
    const doctorCards = document.getElementById('doctor-cards');
    const calendarSection = document.getElementById('calendar-section');
    const calendarContainer = document.getElementById('calendar-container');
    const modalBg = document.getElementById('modal-bg');
    const signupForm = document.getElementById('signup-form');
    const closeModalBtn = document.getElementById('close-modal');
    const toast = document.getElementById('toast');
    const myAppointmentsBtn = document.getElementById('my-appointments-btn');
    const patientBackArrow = document.getElementById('patient-back-arrow');
    
    let selectedDoctor = null;
    let calendar = null;
    
    // SNILS auto-formatting
    const snilsInput = document.getElementById('snils');
    if (snilsInput) {
        snilsInput.addEventListener('input', (e) => {
            const target = e.target;
            // Сначала удаляем всё, кроме цифр
            let digits = target.value.replace(/\D/g, '');
            let formatted = '';

            // Собираем строку в нужном формате
            if (digits.length > 0) {
                formatted = digits.substring(0, 3);
            }
            if (digits.length > 3) {
                formatted += '-' + digits.substring(3, 6);
            }
            if (digits.length > 6) {
                formatted += '-' + digits.substring(6, 9);
            }
            if (digits.length > 9) {
                formatted += ' ' + digits.substring(9, 11);
            }
            target.value = formatted;
        });
    }

    // Переход на страницу "Мои записи"
    myAppointmentsBtn.onclick = () => {
        window.location.href = 'my-appointments.html';
    };

    // Загрузка списка врачей
    function loadDoctors() {
        fetch(`${API_URL}/doctors`)
            .then(res => res.json())
            .then(doctors => {
                doctorCards.innerHTML = '';
                doctors.forEach(doc => {
                    const card = document.createElement('div');
                    card.className = 'doctor-card';
                    card.innerHTML = `
                        <div class="doctor-avatar">${doc.name.charAt(0)}</div>
                        <div class="doctor-name">${doc.name}</div>
                        <div class="doctor-specialty">${doc.specialty || '-'}</div>
                        <div class="doctor-stats">
                            <span>📅 ${doc.appointmentCount || 0} записей</span>
                        </div>
                    `;
                    
                    card.onclick = () => selectDoctor(doc);
                    doctorCards.appendChild(card);
                });
            })
            .catch(err => {
                console.error('Ошибка загрузки врачей:', err);
                doctorCards.innerHTML = '<p style="color: red; text-align: center;">Ошибка загрузки списка врачей</p>';
            });
    }
    
    function selectDoctor(doctor) {
        selectedDoctor = doctor;
        
        // Обновляем выделение карточки
        document.querySelectorAll('.doctor-card').forEach(card => {
            card.classList.remove('selected');
        });
        event.target.closest('.doctor-card').classList.add('selected');
        
        // Показываем календарь
        calendarSection.style.display = 'block';
        
        // Инициализируем календарь
        if (calendar) {
            calendar.reset();
        }
        
        calendar = new AppointmentCalendar(calendarContainer, {
            doctorId: doctor.id,
            onDateSelect: (date) => {
                console.log('Выбрана дата:', date);
            },
            onTimeSelect: (date, time) => {
                console.log('Выбрано время:', date, time);
                openAppointmentModal(doctor, date, time);
            }
        });
        
        // Прокручиваем к календарю
        calendarSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    function openAppointmentModal(doctor, date, time) {
        const modalInfo = document.getElementById('modal-info');
        if (modalInfo) {
            modalInfo.style.display = 'block';
            const dateObj = new Date(date);
            const formattedDate = dateObj.toLocaleDateString('ru-RU', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            modalInfo.innerHTML = `
                <b>${doctor.name}</b><br>
                <span style='color:#888;'>${doctor.specialty || ''}</span><br>
                <span style='color:#1976d2;font-weight:500;'>${formattedDate} в ${time}</span>
            `;
        }
        
        // Сохраняем выбранные дату и время в форме
        signupForm.dataset.selectedDate = date;
        signupForm.dataset.selectedTime = time;
        
        openModal(modalBg);
    }

    // Инициализация
    loadDoctors();

    // Закрытие модального окна записи с анимацией
    closeModalBtn.onclick = () => {
        document.querySelector('.modal').classList.remove('show');
        setTimeout(() => {
            modalBg.style.display = 'none';
            signupForm.reset();
            const modalInfo = document.getElementById('modal-info');
            if (modalInfo) modalInfo.style.display = 'none';
        }, 250);
    };

    // Клик по фону модалки закрывает окно
    modalBg.addEventListener('mousedown', function(e) {
        if (e.target === modalBg) {
            document.querySelector('.modal').classList.remove('show');
            setTimeout(() => {
                modalBg.style.display = 'none';
                signupForm.reset();
                const modalInfo = document.getElementById('modal-info');
                if (modalInfo) modalInfo.style.display = 'none';
            }, 250);
        }
    });

    // Улучшенное toast-уведомление
    function showToast(message, isError = false) {
        toast.textContent = message;
        toast.className = 'toast' + (isError ? ' toast-error' : '');
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }

    // Отправка формы записи
    signupForm.onsubmit = (e) => {
        e.preventDefault();
        const fio = document.getElementById('fio').value.trim();
        const snils = document.getElementById('snils').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const fullPhone = `+7${phone}`;
        const selectedDate = signupForm.dataset.selectedDate;
        const selectedTime = signupForm.dataset.selectedTime;
        
        if (!fio || !snils || !phone || !selectedDate || !selectedTime) {
            alert('Пожалуйста, заполните все поля и выберите дату и время!');
            return;
        }
        
        // Спиннер на кнопке
        const submitBtn = signupForm.querySelector('.signup-btn');
        const origText = submitBtn.textContent;
        submitBtn.innerHTML = 'Запись... <span class="button-spinner"></span>';
        submitBtn.disabled = true;
        
        fetch(`${API_URL}/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doctorId: selectedDoctor.id,
                name: fio,
                snils: snils,
                phone: fullPhone,
                time: selectedTime,
                date: selectedDate
            })
        })
        .then(res => res.json())
        .then(data => {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
            if (data.success) {
                showToast(`Вы успешно записались к ${selectedDoctor.name} на ${selectedDate} в ${selectedTime}`);
                // Обновляем календарь
                if (calendar) {
                    calendar.updateCalendar();
                }
            } else {
                showToast(data.message || 'Ошибка записи. Возможно, время уже занято. Попробуйте выбрать другое.', true);
            }
            document.querySelector('.modal').classList.remove('show');
            setTimeout(() => {
                modalBg.style.display = 'none';
                signupForm.reset();
                const modalInfo = document.getElementById('modal-info');
                if (modalInfo) modalInfo.style.display = 'none';
            }, 300);
        })
        .catch(err => {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
            showToast('Ошибка соединения с сервером', true);
            document.querySelector('.modal').classList.remove('show');
            setTimeout(() => {
                modalBg.style.display = 'none';
                signupForm.reset();
                const modalInfo = document.getElementById('modal-info');
                if (modalInfo) modalInfo.style.display = 'none';
            }, 300);
        });
    };

    // Фильтрация ФИО: только буквы, точки и пробелы, максимум 40 символов
    const fioInput = document.getElementById('fio');
    if (fioInput) {
        fioInput.addEventListener('input', (e) => {
            let val = e.target.value;
            val = val.replace(/[^А-Яа-яA-Za-zЁё.\s]/g, '');
            if (val.length > 40) val = val.slice(0, 40);
            e.target.value = val;
        });
    }

    if (patientBackArrow) {
        patientBackArrow.onclick = () => {
            window.location.href = 'index.html';
        };
    }
}

// --- my-appointments.html ---
if (window.location.pathname.endsWith('my-appointments.html')) {
    const myAppointmentsForm = document.getElementById('my-appointments-form');
    const myAppointmentsList = document.getElementById('my-appointments-list');
    const myBackArrow = document.getElementById('my-back-arrow');
    const myPhoneInput = document.getElementById('my-phone');

    myAppointmentsForm.onsubmit = (e) => {
        e.preventDefault();
        const phone = document.getElementById('my-phone').value.trim();
        if (!phone) {
            myAppointmentsList.innerHTML = '<div style="color:red;">Введите номер телефона</div>';
            return;
        }
        const fullPhone = `+7${phone}`;
        fetch(`${API_URL}/appointments?phone=${encodeURIComponent(fullPhone)}`)
            .then(res => res.json())
            .then(apps => {
                if (!apps.length) {
                    myAppointmentsList.innerHTML = '<div style="color:#1976d2;">У вас нет записей</div>';
                } else {
                    // Разделяем на прошедшие и будущие
                    const now = new Date();
                    const future = [], past = [];
                    apps.forEach(a => {
                        // Проверяем дату и время
                        const appointmentDate = new Date(a.date + 'T' + a.time);
                        if (appointmentDate >= now) {
                            future.push(a);
                        } else {
                            past.push(a);
                        }
                    });
                    
                    let html = '';
                    if (future.length) {
                        html += '<div style="margin-bottom:12px;"><b>Будущие записи:</b></div>';
                        html += `<table class="doctor-table"><thead><tr><th>Дата</th><th>Время</th><th>Врач</th><th>Специальность</th><th></th></tr></thead><tbody>`;
                        html += future.map(a => {
                            const dateObj = new Date(a.date);
                            const formattedDate = dateObj.toLocaleDateString('ru-RU', { 
                                weekday: 'short', 
                                month: 'short', 
                                day: 'numeric' 
                            });
                            return `
                                <tr>
                                    <td>${formattedDate}</td>
                                    <td>${a.time}</td>
                                    <td>${a.doctorName || 'Врач'}</td>
                                    <td>${a.specialty || '-'}</td>
                                    <td><button class="delete-btn" data-id="${a.id}">Отменить</button></td>
                                </tr>
                            `;
                        }).join('');
                        html += '</tbody></table>';
                    }
                    if (past.length) {
                        html += '<div style="margin:18px 0 8px 0;"><b>Прошедшие записи:</b></div>';
                        html += `<table class="doctor-table"><thead><tr><th>Дата</th><th>Время</th><th>Врач</th><th>Специальность</th></tr></thead><tbody>`;
                        html += past.map(a => {
                            const dateObj = new Date(a.date);
                            const formattedDate = dateObj.toLocaleDateString('ru-RU', { 
                                weekday: 'short', 
                                month: 'short', 
                                day: 'numeric' 
                            });
                            return `
                                <tr>
                                    <td>${formattedDate}</td>
                                    <td>${a.time}</td>
                                    <td>${a.doctorName || 'Врач'}</td>
                                    <td>${a.specialty || '-'}</td>
                                </tr>
                            `;
                        }).join('');
                        html += '</tbody></table>';
                    }
                    myAppointmentsList.innerHTML = html;
                    // Кнопки отмены только для будущих
                    myAppointmentsList.querySelectorAll('.delete-btn').forEach(btn => {
                        btn.onclick = () => {
                            confirmModal('Вы уверены, что хотите отменить эту запись?').then(ok => {
                                if (!ok) return;
                                fetch(`/api/appointments/${btn.dataset.id}?phone=${encodeURIComponent(myPhoneInput.value.trim())}`, { method: 'DELETE' })
                                .then(res => res.json())
                                .then(data => {
                                    if (data.success) {
                                        btn.closest('tr').remove();
                                    } else {
                                        alert(data.message || 'Ошибка удаления');
                                    }
                                })
                                .catch(() => alert('Ошибка соединения'));
                            });
                        };
                    });
                }
            })
            .catch(() => {
                myAppointmentsList.innerHTML = '<div style="color:red;">Ошибка соединения с сервером</div>';
            });
    };

    if (myBackArrow) {
        myBackArrow.onclick = () => {
            window.location.href = 'patient.html';
        };
    }
}

// --- admin.html ---
if (window.location.pathname.endsWith('admin.html')) {
    const loginDiv = document.getElementById('admin-login');
    const panelDiv = document.getElementById('admin-panel');
    const loginForm = document.getElementById('admin-login-form');
    const loginResult = document.getElementById('admin-login-result');
    const doctorListDiv = document.getElementById('admin-doctor-list');
    const appointmentsDiv = document.getElementById('admin-appointments');
    const logoutBtn = document.getElementById('admin-logout-btn');
    const addDoctorForm = document.getElementById('add-doctor-form');
    const backArrow = document.getElementById('admin-back-arrow');
    const showLogsBtn = document.getElementById('show-logs-btn');
    const logsModal = document.getElementById('logs-modal');
    const logsCloseBtn = document.getElementById('logs-close-btn');
    const logsTableBody = document.getElementById('logs-table-body');
    const logsFilter = document.getElementById('logs-filter');
    let token = null;

    loginForm.onsubmit = (e) => {
        e.preventDefault();
        const username = document.getElementById('admin-username').value;
        const password = document.getElementById('admin-password').value;
        const loginBtn = document.getElementById('admin-login-btn');
        const origText = loginBtn.textContent;
        loginBtn.innerHTML = 'Вход... <span class="button-spinner"></span>';
        loginBtn.disabled = true;
        fetch(`/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
        .then(res => res.json())
        .then(data => {
            loginBtn.innerHTML = origText;
            loginBtn.disabled = false;
            if (data.success) {
                token = data.token;
                loginDiv.style.display = 'none';
                panelDiv.style.display = 'block';
                loadDoctors();
            } else {
                // Если не супер-админ, пробуем как врач
                fetch('/api/doctor/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                })
                .then(res => res.json())
                .then(docData => {
                    if (docData.success) {
                        loginDiv.style.display = 'none';
                        panelDiv.style.display = 'block';
                        document.getElementById('doctor-management').style.display = 'none';
                        document.getElementById('admin-doctor-list').style.display = 'none';
                        var docListTitle = document.getElementById('admin-doctor-list-title');
                        if (docListTitle) docListTitle.style.display = 'none';
                        // Скрываем кнопку Логи для обычных врачей
                        if (showLogsBtn) showLogsBtn.style.display = 'none';
                        loadAppointments(docData.doctorId, docData.name, docData.specialty, true);
                    } else {
                        loginResult.textContent = docData.message || 'Ошибка входа';
                    }
                });
            }
        })
        .catch(() => {
            loginBtn.innerHTML = origText;
            loginBtn.disabled = false;
            loginResult.textContent = 'Ошибка соединения';
        });
    };

    function loadDoctors() {
        fetch(`/api/doctors`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(doctors => {
            doctorListDiv.innerHTML = '';
            doctors.forEach(doc => {
                const docContainer = document.createElement('div');
                docContainer.style.display = 'flex';
                docContainer.style.alignItems = 'center';
                docContainer.style.justifyContent = 'center';
                docContainer.style.margin = '8px 0';

                const btn = document.createElement('button');
                btn.innerHTML = `${doc.name} (${doc.specialty}) <span style="font-weight:normal;opacity:0.8;"> - ${doc.appointmentCount} записей</span>`;
                btn.className = 'role-btn';
                btn.style.margin = '0';
                btn.style.width = 'auto';
                btn.style.flexGrow = '1';
                btn.onclick = () => loadAppointments(doc.id, doc.name, doc.specialty);
                
                const editBtn = document.createElement('button');
                editBtn.className = 'profile-icon-btn';
                editBtn.title = 'Редактировать';
                editBtn.innerHTML = '✏️';
                editBtn.onclick = () => openEditDoctorModal(doc);

                const profileBtn = document.createElement('button');
                profileBtn.className = 'profile-icon-btn';
                profileBtn.title = 'Профиль врача';
                profileBtn.innerHTML = '&#128100;';
                profileBtn.onclick = () => openDoctorProfile(doc);

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Удалить';
                deleteBtn.className = 'delete-btn';
                deleteBtn.style.marginLeft = '16px';
                deleteBtn.onclick = () => deleteDoctor(doc.id);

                docContainer.appendChild(btn);
                docContainer.appendChild(editBtn);
                docContainer.appendChild(profileBtn);
                docContainer.appendChild(deleteBtn);
                doctorListDiv.appendChild(docContainer);
            });
        });
    }

    function deleteDoctor(doctorId) {
        confirmModal('Вы уверены, что хотите удалить этого врача? Все его записи также будут удалены!').then(ok => {
            if (!ok) return;
            fetch(`/api/doctors/${doctorId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    loadDoctors();
                    appointmentsDiv.innerHTML = '';
                } else {
                    alert(data.message || 'Ошибка удаления');
                }
            });
        });
    }

    addDoctorForm.onsubmit = (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('new-doctor-name');
        const specialtyInput = document.getElementById('new-doctor-specialty');
        const name = nameInput.value.trim();
        const specialty = specialtyInput.value.trim();
        const addBtn = addDoctorForm.querySelector('.signup-btn');
        const origText = addBtn.textContent;
        addBtn.innerHTML = 'Добавление... <span class="button-spinner"></span>';
        addBtn.disabled = true;
        if (!name || !specialty) {
            alert('Заполните все поля');
            addBtn.innerHTML = origText;
            addBtn.disabled = false;
            return;
        }
        fetch('/api/doctors', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, specialty })
        })
        .then(res => res.json())
        .then(data => {
            addBtn.innerHTML = origText;
            addBtn.disabled = false;
            if (data.success) {
                loadDoctors();
                nameInput.value = '';
                specialtyInput.value = '';
            } else {
                alert(data.message || 'Ошибка добавления');
            }
        });
    };

    function loadAppointments(doctorId, doctorName, specialty, isDoctor) {
        fetch(`/api/appointments?doctorId=${doctorId}`)
        .then(res => res.json())
        .then(apps => {
            appointmentsDiv.innerHTML = `<h3>Записи к ${doctorName} (${specialty}):</h3>`;
            if (!apps.length) {
                appointmentsDiv.innerHTML += '<p>Нет записей</p>';
            } else {
                appointmentsDiv.innerHTML += `
                    <table class="doctor-table">
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Время</th>
                                <th>ФИО</th>
                                <th>СНИЛС</th>
                                <th>Телефон</th>
                                ${!isDoctor ? '<th>Действие</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${apps.map(a => {
                                const dateObj = new Date(a.date);
                                const formattedDate = dateObj.toLocaleDateString('ru-RU', { 
                                    weekday: 'short', 
                                    month: 'short', 
                                    day: 'numeric' 
                                });
                                return `
                                    <tr id="appointment-${a.id}">
                                        <td>${formattedDate}</td>
                                        <td>${a.time}</td>
                                        <td>${a.name}</td>
                                        <td>${a.snils}</td>
                                        <td>+7${a.phone}</td>
                                        ${!isDoctor ? `<td><button class="delete-btn" data-id="${a.id}">Отменить</button></td>` : ''}
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;
                // Добавляем обработчики для кнопок удаления (только для супер-админа)
                if (!isDoctor) {
                    appointmentsDiv.querySelectorAll('.delete-btn').forEach(btn => {
                        btn.onclick = () => deleteAppointment(btn.dataset.id, doctorId, doctorName, specialty);
                    });
                }
            }
        });
    }

    function deleteAppointment(appointmentId, currentDoctorId, currentDoctorName, currentSpecialty) {
        if (!confirm('Вы уверены, что хотите отменить эту запись?')) {
            return;
        }
        fetch(`/api/appointments/${appointmentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Вместо полной перезагрузки можно просто удалить строку из DOM, но для простоты перезагрузим
                loadAppointments(currentDoctorId, currentDoctorName, currentSpecialty);
            } else {
                alert(data.message || 'Ошибка удаления');
            }
        })
        .catch(() => alert('Ошибка соединения'));
    }

    if (logoutBtn) {
        logoutBtn.onclick = () => {
            token = null;
            panelDiv.style.display = 'none';
            loginDiv.style.display = 'block';
            document.getElementById('admin-username').value = '';
            document.getElementById('admin-password').value = '';
            loginResult.textContent = '';
            appointmentsDiv.innerHTML = '';
        };
    }

    if (backArrow) {
        backArrow.onclick = () => {
            window.location.href = 'index.html';
        };
    }

    // --- Модалка профиля врача ---
    const doctorProfileModal = document.getElementById('doctor-profile-modal');
    const doctorProfileInfo = document.getElementById('doctor-profile-info');
    const doctorCredentialsForm = document.getElementById('doctor-credentials-form');
    const doctorUsernameInput = document.getElementById('doctor-username');
    const doctorPasswordInput = document.getElementById('doctor-password');
    const doctorProfileClose = document.getElementById('doctor-profile-close');
    const doctorProfileResult = document.getElementById('doctor-profile-result');
    const doctorProfileViewApps = document.getElementById('doctor-profile-view-apps');
    let currentProfileDoctor = null;

    function openDoctorProfile(doc) {
        currentProfileDoctor = doc;
        doctorProfileInfo.innerHTML = `<b>${doc.name}</b><br><span style='color:#888;'>${doc.specialty || ''}</span>`;
        doctorUsernameInput.value = doc.username || '';
        doctorPasswordInput.value = doc.password || '';
        doctorProfileResult.textContent = '';
        openModal(doctorProfileModal);
    }
    doctorProfileClose.onclick = () => {
        doctorProfileModal.style.display = 'none';
    };
    doctorCredentialsForm.onsubmit = (e) => {
        e.preventDefault();
        if (!currentProfileDoctor) return;
        fetch(`/api/doctors/${currentProfileDoctor.id}/credentials`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                username: doctorUsernameInput.value.trim(),
                password: doctorPasswordInput.value.trim()
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                doctorProfileResult.textContent = 'Сохранено!';
                loadDoctors();
            } else {
                doctorProfileResult.textContent = data.message || 'Ошибка сохранения';
            }
        });
    };
    doctorProfileViewApps.onclick = () => {
        if (!currentProfileDoctor) return;
        doctorProfileModal.style.display = 'none';
        loadAppointments(currentProfileDoctor.id, currentProfileDoctor.name, currentProfileDoctor.specialty);
    };

    // --- Модалка редактирования врача ---
    const editDoctorModal = document.getElementById('edit-doctor-modal');
    const editDoctorForm = document.getElementById('edit-doctor-form');
    const editDoctorName = document.getElementById('edit-doctor-name');
    const editDoctorSpecialty = document.getElementById('edit-doctor-specialty');
    const editDoctorUsername = document.getElementById('edit-doctor-username');
    const editDoctorCancel = document.getElementById('edit-doctor-cancel');
    const editDoctorResult = document.getElementById('edit-doctor-result');
    let currentEditDoctorId = null;

    // Фильтрация ФИО врача: только буквы, точки и пробелы, максимум 40 символов
    if (editDoctorName) {
        editDoctorName.addEventListener('input', (e) => {
            let val = e.target.value;
            val = val.replace(/[^А-Яа-яA-Za-zЁё.\s]/g, '');
            if (val.length > 40) val = val.slice(0, 40);
            e.target.value = val;
        });
    }

    // Открытие модалки редактирования
    function openEditDoctorModal(doc) {
        currentEditDoctorId = doc.id;
        editDoctorName.value = doc.name || '';
        editDoctorSpecialty.value = doc.specialty || '';
        editDoctorUsername.value = doc.username || '';
        editDoctorResult.textContent = '';
        openModal(editDoctorModal);
    }
    if (editDoctorCancel) {
        editDoctorCancel.onclick = () => {
            editDoctorModal.style.display = 'none';
        };
    }
    editDoctorForm.onsubmit = (e) => {
        e.preventDefault();
        if (!currentEditDoctorId) return;
        const saveBtn = editDoctorForm.querySelector('.signup-btn');
        const origText = saveBtn.textContent;
        saveBtn.innerHTML = 'Сохранение... <span class="button-spinner"></span>';
        saveBtn.disabled = true;
        fetch(`/api/doctors/${currentEditDoctorId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: editDoctorName.value.trim(),
                specialty: editDoctorSpecialty.value.trim(),
                username: editDoctorUsername.value.trim()
            })
        })
        .then(res => res.json())
        .then(data => {
            saveBtn.innerHTML = origText;
            saveBtn.disabled = false;
            if (data.success) {
                editDoctorResult.textContent = 'Сохранено!';
                setTimeout(() => {
                    editDoctorModal.style.display = 'none';
                    loadDoctors();
                }, 600);
            } else {
                editDoctorResult.textContent = data.message || 'Ошибка сохранения';
            }
        })
        .catch(() => {
            saveBtn.innerHTML = origText;
            saveBtn.disabled = false;
            editDoctorResult.textContent = 'Ошибка соединения';
        });
    };

    // --- Логи ---
    function actionIcon(action) {
        switch(action) {
            case 'admin_login': return '🛡️';
            case 'doctor_login': return '👨‍⚕️';
            case 'add_doctor': return '➕';
            case 'delete_doctor': return '🗑️';
            case 'add_appointment': return '📅';
            case 'delete_appointment': return '❌';
            case 'admin_login_fail': return '⚠️';
            case 'doctor_login_fail': return '⚠️';
            case 'login_blocked': return '🚫';
            default: return 'ℹ️';
        }
    }
    function actionColor(action) {
        if (action.includes('fail') || action === 'login_blocked') return 'color:#f44336;';
        if (action === 'add_doctor' || action === 'add_appointment') return 'color:#4CAF50;';
        if (action === 'delete_doctor' || action === 'delete_appointment') return 'color:#1976d2;';
        return '';
    }
    function renderLogs(logs) {
        logsTableBody.innerHTML = logs.map((log, idx) => `
            <tr class="log-row" data-log-idx="${idx}">
                <td style="font-size:0.97em;white-space:nowrap;">${new Date(log.created_at).toLocaleString()}</td>
                <td style="${actionColor(log.action)}">${actionIcon(log.action)} ${log.action.replace(/_/g,' ')}</td>
                <td>${log.username || '-'}</td>
                <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${log.details || ''}</td>
            </tr>
        `).join('');
        // Добавляем обработчик клика по строке
        Array.from(logsTableBody.querySelectorAll('.log-row')).forEach(row => {
            row.onclick = function() {
                const idx = this.getAttribute('data-log-idx');
                const log = logs[idx];
                showLogDetailsModal(log);
            };
        });
    }
    function loadLogs(type = '') {
        fetch(`/api/audit-log${type ? '?type=' + encodeURIComponent(type) : ''}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) renderLogs(data.logs);
            else logsTableBody.innerHTML = '<tr><td colspan="4">Ошибка загрузки логов</td></tr>';
        });
    }
    if (showLogsBtn) {
        showLogsBtn.onclick = () => {
            openModal(logsModal);
            loadLogs();
        };
    }
    if (logsCloseBtn) logsCloseBtn.onclick = () => { logsModal.style.display = 'none'; };
    if (logsFilter) logsFilter.onchange = () => loadLogs(logsFilter.value);

    // --- Модалка подробностей лога ---
    const logDetailsModal = document.getElementById('log-details-modal');
    const logDetailsContent = document.getElementById('log-details-content');
    const logDetailsClose = document.getElementById('log-details-close');
    function showLogDetailsModal(log) {
        logDetailsContent.innerHTML = `
            <b>Время:</b> ${new Date(log.created_at).toLocaleString()}<br>
            <b>Действие:</b> ${actionIcon(log.action)} ${log.action.replace(/_/g,' ')}<br>
            <b>Пользователь:</b> ${log.username || '-'}<br>
            <b>Детали:</b><br><div style="margin-top:4px;white-space:pre-wrap;">${log.details || ''}</div>
        `;
        openModal(logDetailsModal);
    }
    if (logDetailsClose) logDetailsClose.onclick = () => { logDetailsModal.style.display = 'none'; };
    if (logDetailsModal) {
        logDetailsModal.addEventListener('mousedown', function(e) {
            if (e.target === logDetailsModal) {
                const modalWindow = logDetailsModal.querySelector('.modal');
                if (modalWindow) modalWindow.classList.remove('show');
                setTimeout(() => {
                    logDetailsModal.style.display = 'none';
                    logDetailsContent.innerHTML = '';
                }, 250);
            }
        });
    }
}

// Универсальная модалка подтверждения
function confirmModal(message) {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        const text = document.getElementById('confirm-modal-text');
        const yes = document.getElementById('confirm-yes');
        const no = document.getElementById('confirm-no');
        text.textContent = message;
        modal.style.display = 'flex';
        function close(result) {
            modal.style.display = 'none';
            yes.onclick = null;
            no.onclick = null;
            resolve(result);
        }
        yes.onclick = () => close(true);
        no.onclick = () => close(false);
    });
}

// Универсальный обработчик закрытия всех модалок по клику вне окна
window.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.modal-bg').forEach(function(bg) {
        bg.addEventListener('mousedown', function(e) {
            if (e.target === bg) {
                const modalWindow = bg.querySelector('.modal');
                if (modalWindow) {
                    modalWindow.classList.remove('show');
                    modalWindow.classList.add('hide');
                }
                setTimeout(() => {
                    bg.style.display = 'none';
                    if (modalWindow) modalWindow.classList.remove('hide');
                    // Очищаем содержимое для некоторых окон
                    if (bg.id === 'log-details-modal') {
                        const content = bg.querySelector('#log-details-content');
                        if (content) content.innerHTML = '';
                    }
                    if (bg.id === 'confirm-modal') {
                        const text = bg.querySelector('#confirm-modal-text');
                        if (text) text.textContent = '';
                    }
                }, 350);
            }
        });
    });
});
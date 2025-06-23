const API_URL = '/api';

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
    const tableBody = document.getElementById('doctor-table-body');
    const modalBg = document.getElementById('modal-bg');
    const signupForm = document.getElementById('signup-form');
    const closeModalBtn = document.getElementById('close-modal');
    const toast = document.getElementById('toast');
    const myAppointmentsBtn = document.getElementById('my-appointments-btn');
    const patientBackArrow = document.getElementById('patient-back-arrow');
    
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

    let currentDoctor = null;
    let currentTime = null;
    const modalInfo = document.getElementById('modal-info');

    // Загрузка списка врачей с разделением слотов
    function loadDoctorsTable() {
        fetch(`${API_URL}/doctors`)
            .then(res => res.json())
            .then(doctors => {
                tableBody.innerHTML = '';
                doctors.forEach(doc => {
                    fetch(`${API_URL}/appointments?doctorId=${doc.id}`)
                        .then(res => res.json())
                        .then(apps => {
                            const busyTimes = apps.map(a => a.time);
                            const freeOptions = [];
                            const busyOptions = [];
                            for (let h = 11; h <= 20; h++) {
                                const hour = h < 10 ? '0' + h : h;
                                const timeStr = `${hour}:00`;
                                if (busyTimes.includes(timeStr)) {
                                    busyOptions.push(`<option value="${timeStr}" disabled class="option-busy">${timeStr} (занято)</option>`);
                                } else {
                                    freeOptions.push(`<option value="${timeStr}">${timeStr}</option>`);
                                }
                            }
                            let timeOptions = [];
                            if (freeOptions.length > 0) {
                                timeOptions = [...freeOptions];
                                if (busyOptions.length > 0) {
                                    timeOptions.push(`<option disabled class='option-divider'>────────────</option>`);
                                    timeOptions = [...timeOptions, ...busyOptions];
                                }
                            } else {
                                // Все занято
                                timeOptions = [
                                    `<option disabled class='option-divider'>Нет свободных времен</option>`,
                                    ...busyOptions
                                ];
                            }
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td>${doc.name}</td>
                                <td>${doc.specialty || '-'}</td>
                                <td><select class="time-select">${timeOptions.join('')}</select></td>
                                <td><button class="signup-btn">Записаться</button></td>
                            `;
                            const select = tr.querySelector('.time-select');
                            const signupBtn = tr.querySelector('.signup-btn');
                            // Если нет свободных слотов — блокируем кнопку
                            if (freeOptions.length === 0) {
                                signupBtn.disabled = true;
                                signupBtn.textContent = 'Нет мест';
                            }
                            // По умолчанию выбираем первый свободный слот
                            if (freeOptions.length > 0) {
                                select.value = freeOptions[0].match(/value=\"(.*?)\"/)[1];
                            }
                            // Обработчик кнопки
                            signupBtn.onclick = () => {
                                currentDoctor = doc;
                                currentTime = select.value;
                                // Показываем инфо о враче и времени
                                if (modalInfo) {
                                    modalInfo.style.display = 'block';
                                    modalInfo.innerHTML = `<b>${doc.name}</b><br><span style='color:#888;'>${doc.specialty || ''}</span><br><span style='color:#1976d2;font-weight:500;'>${currentTime}</span>`;
                                }
                                // Анимация открытия модального окна
                                openModal(modalBg);
                            };
                            tableBody.appendChild(tr);
                        });
                });
            });
    }
    // Инициализация таблицы
    loadDoctorsTable();

    // Закрытие модального окна записи с анимацией
    closeModalBtn.onclick = () => {
        document.querySelector('.modal').classList.remove('show');
        setTimeout(() => {
            modalBg.style.display = 'none';
            signupForm.reset();
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

    // Фокусировка на первом поле формы при открытии модалки
    function focusFirstInput(modal) {
        setTimeout(() => {
            const input = modal.querySelector('input, select, textarea');
            if (input) input.focus();
        }, 100);
    }

    // Плавная анимация открытия модалок
    function openModal(modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.querySelector('.modal').classList.add('show');
            focusFirstInput(modal);
        }, 10);
    }

    // Отправка формы записи
    signupForm.onsubmit = (e) => {
        e.preventDefault();
        const fio = document.getElementById('fio').value.trim();
        const snils = document.getElementById('snils').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const fullPhone = `+7${phone}`;
        if (!fio || !snils || !phone) {
            alert('Пожалуйста, заполните все поля!');
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
                doctorId: currentDoctor.id,
                name: fio,
                snils: snils,
                phone: fullPhone,
                time: currentTime
            })
        })
        .then(res => res.json())
        .then(data => {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
            if (data.success) {
                showToast(`Вы успешно записались к ${currentDoctor.name} на ${currentTime}`);
            } else {
                showToast(data.message || 'Ошибка записи. Возможно, время уже занято. Попробуйте выбрать другое.');
            }
            document.querySelector('.modal').classList.remove('show');
            setTimeout(() => {
                modalBg.style.display = 'none';
                signupForm.reset();
                if (modalInfo) modalInfo.style.display = 'none';
                loadDoctorsTable();
            }, 300);
        })
        .catch(err => {
            submitBtn.innerHTML = origText;
            submitBtn.disabled = false;
            showToast('Ошибка соединения с сервером');
            document.querySelector('.modal').classList.remove('show');
            setTimeout(() => {
                modalBg.style.display = 'none';
                signupForm.reset();
                if (modalInfo) modalInfo.style.display = 'none';
                loadDoctorsTable();
            }, 300);
        });
    };

    // Фильтрация ФИО: только буквы и пробелы, максимум 40 символов
    const fioInput = document.getElementById('fio');
    if (fioInput) {
        fioInput.addEventListener('input', (e) => {
            let val = e.target.value;
            val = val.replace(/[^А-Яа-яA-Za-zЁё\s]/g, '');
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
                    // Если в будущем появится дата — сравнивать по дате, сейчас только по времени
                    const future = [], past = [];
                    apps.forEach(a => {
                        // a.time в формате "HH:MM"
                        const [h, m] = a.time.split(':').map(Number);
                        const appDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
                        if (appDate >= now) future.push(a); else past.push(a);
                    });
                    let html = '';
                    if (future.length) {
                        html += '<div style="margin-bottom:12px;"><b>Будущие записи:</b></div>';
                        html += `<table class="doctor-table"><thead><tr><th>Время</th><th>Врач</th><th>Специальность</th><th></th></tr></thead><tbody>`;
                        html += future.map(a => `
                            <tr>
                                <td>${a.time}</td>
                                <td>${a.doctorName || 'Врач'}</td>
                                <td>${a.specialty || '-'}</td>
                                <td><button class="delete-btn" data-id="${a.id}">Отменить</button></td>
                            </tr>
                        `).join('');
                        html += '</tbody></table>';
                    }
                    if (past.length) {
                        html += '<div style="margin:18px 0 8px 0;"><b>Прошедшие записи:</b></div>';
                        html += `<table class="doctor-table"><thead><tr><th>Время</th><th>Врач</th><th>Специальность</th></tr></thead><tbody>`;
                        html += past.map(a => `
                            <tr>
                                <td>${a.time}</td>
                                <td>${a.doctorName || 'Врач'}</td>
                                <td>${a.specialty || '-'}</td>
                            </tr>
                        `).join('');
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
                                <th>Время</th>
                                <th>ФИО</th>
                                <th>СНИЛС</th>
                                <th>Телефон</th>
                                ${!isDoctor ? '<th>Действие</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${apps.map(a => `
                                <tr id="appointment-${a.id}">
                                    <td>${a.time}</td>
                                    <td>${a.name}</td>
                                    <td>${a.snils}</td>
                                    <td>${a.phone}</td>
                                    ${!isDoctor ? `<td><button class="delete-btn" data-id="${a.id}">Отменить</button></td>` : ''}
                                </tr>
                            `).join('')}
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

    // Фильтрация ФИО врача: только буквы и пробелы, максимум 40 символов
    if (editDoctorName) {
        editDoctorName.addEventListener('input', (e) => {
            let val = e.target.value;
            val = val.replace(/[^А-Яа-яA-Za-zЁё\s]/g, '');
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
// Календарный компонент для записи к врачу
class AppointmentCalendar {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            doctorId: null,
            onDateSelect: null,
            onTimeSelect: null,
            ...options
        };
        
        this.currentDate = new Date();
        this.selectedDate = null;
        this.selectedTime = null;
        this.timeFilter = '';
        
        this.init();
    }
    
    init() {
        this.render();
        this.bindEvents();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="calendar-container">
                <div class="calendar-header">
                    <button class="calendar-nav-btn" id="prev-month">‹</button>
                    <h3 class="calendar-title" id="calendar-title"></h3>
                    <button class="calendar-nav-btn" id="next-month">›</button>
                </div>
                
                <div class="calendar-grid">
                    <div class="calendar-weekdays">
                        <div>Пн</div>
                        <div>Вт</div>
                        <div>Ср</div>
                        <div>Чт</div>
                        <div>Пт</div>
                        <div>Сб</div>
                        <div>Вс</div>
                    </div>
                    <div class="calendar-days" id="calendar-days"></div>
                </div>
                
                <div class="calendar-legend">
                    <div class="legend-item">
                        <span class="legend-color free"></span>
                        <span>Свободно</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color low"></span>
                        <span>Мало записей</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color medium"></span>
                        <span>Средняя загрузка</span>
                    </div>
                    <div class="legend-item">
                        <span class="legend-color high"></span>
                        <span>Высокая загрузка</span>
                    </div>
                </div>
            </div>
            
            <div class="time-selection" id="time-selection" style="display: none;">
                <h4>Выберите время</h4>
                <div class="time-filters">
                    <button class="time-filter-btn active" data-filter="">Все</button>
                    <button class="time-filter-btn" data-filter="morning">Утро (9:00-12:00)</button>
                    <button class="time-filter-btn" data-filter="afternoon">День (12:00-18:00)</button>
                    <button class="time-filter-btn" data-filter="evening">Вечер (18:00-21:00)</button>
                </div>
                <div class="time-slots" id="time-slots"></div>
            </div>
        `;
        
        this.updateCalendar();
    }
    
    bindEvents() {
        document.getElementById('prev-month').addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.updateCalendar();
        });
        
        document.getElementById('next-month').addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.updateCalendar();
        });
        
        // Фильтры времени
        document.querySelectorAll('.time-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.timeFilter = e.target.dataset.filter;
                this.updateTimeSlots();
            });
        });
    }
    
    updateCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // Обновляем заголовок
        const monthNames = [
            'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
        ];
        document.getElementById('calendar-title').textContent = `${monthNames[month]} ${year}`;
        
        // Загружаем данные календаря
        this.loadCalendarData(year, month);
    }
    
    async loadCalendarData(year, month) {
        try {
            const response = await fetch(`/api/doctors/${this.options.doctorId}/calendar?month=${month}&year=${year}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderCalendarDays(year, month, data.calendar);
            }
        } catch (error) {
            console.error('Ошибка загрузки календаря:', error);
        }
    }
    
    renderCalendarDays(year, month, calendarData) {
        const daysContainer = document.getElementById('calendar-days');
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        
        // Находим первый понедельник
        while (startDate.getDay() !== 1) {
            startDate.setDate(startDate.getDate() - 1);
        }
        
        let html = '';
        const currentDate = new Date();
        
        for (let i = 0; i < 42; i++) { // 6 недель
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            const dateStr = date.toISOString().split('T')[0];
            const isCurrentMonth = date.getMonth() === month;
            const isPast = date < currentDate && date.toDateString() !== currentDate.toDateString();
            const isSelected = this.selectedDate === dateStr;
            
            // Находим данные о загрузке для этой даты
            const calendarItem = calendarData.find(item => item.date === dateStr);
            const loadLevel = calendarItem ? calendarItem.loadLevel : 'free';
            
            let dayClass = 'calendar-day';
            if (!isCurrentMonth) dayClass += ' other-month';
            if (isPast) dayClass += ' past';
            if (isSelected) dayClass += ' selected';
            if (calendarItem) dayClass += ` load-${loadLevel}`;
            
            const dayNumber = date.getDate();
            
            html += `
                <div class="${dayClass}" data-date="${dateStr}" ${isPast ? 'disabled' : ''}>
                    <span class="day-number">${dayNumber}</span>
                    ${calendarItem ? `<span class="load-indicator"></span>` : ''}
                </div>
            `;
        }
        
        daysContainer.innerHTML = html;
        
        // Добавляем обработчики кликов
        daysContainer.querySelectorAll('.calendar-day:not(.past):not(.other-month)').forEach(day => {
            day.addEventListener('click', () => {
                this.selectDate(day.dataset.date);
            });
        });
    }
    
    selectDate(dateStr) {
        this.selectedDate = dateStr;
        
        // Обновляем выделение в календаре
        document.querySelectorAll('.calendar-day').forEach(day => {
            day.classList.remove('selected');
        });
        document.querySelector(`[data-date="${dateStr}"]`).classList.add('selected');
        
        // Показываем выбор времени
        document.getElementById('time-selection').style.display = 'block';
        this.loadTimeSlots(dateStr);
        
        if (this.options.onDateSelect) {
            this.options.onDateSelect(dateStr);
        }
    }
    
    async loadTimeSlots(dateStr) {
        try {
            const response = await fetch(`/api/doctors/${this.options.doctorId}/times?date=${dateStr}&timeFilter=${this.timeFilter}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderTimeSlots(data.times);
            }
        } catch (error) {
            console.error('Ошибка загрузки временных слотов:', error);
        }
    }
    
    renderTimeSlots(times) {
        const timeSlotsContainer = document.getElementById('time-slots');
        
        if (times.length === 0) {
            timeSlotsContainer.innerHTML = '<p class="no-times">Нет доступного времени на эту дату</p>';
            return;
        }
        
        const html = times.map(timeSlot => {
            const timeClass = timeSlot.available ? 'time-slot available' : 'time-slot busy';
            const timeOfDayClass = `time-${timeSlot.timeOfDay}`;
            
            return `
                <button class="${timeClass} ${timeOfDayClass}" 
                        data-time="${timeSlot.time}" 
                        ${!timeSlot.available ? 'disabled' : ''}>
                    ${timeSlot.time}
                    ${!timeSlot.available ? '<span class="busy-indicator">занято</span>' : ''}
                </button>
            `;
        }).join('');
        
        timeSlotsContainer.innerHTML = html;
        
        // Добавляем обработчики для доступных слотов
        timeSlotsContainer.querySelectorAll('.time-slot.available').forEach(slot => {
            slot.addEventListener('click', () => {
                this.selectTime(slot.dataset.time);
            });
        });
    }
    
    selectTime(time) {
        this.selectedTime = time;
        
        // Обновляем выделение времени
        document.querySelectorAll('.time-slot').forEach(slot => {
            slot.classList.remove('selected');
        });
        document.querySelector(`[data-time="${time}"]`).classList.add('selected');
        
        if (this.options.onTimeSelect) {
            this.options.onTimeSelect(this.selectedDate, time);
        }
    }
    
    updateTimeSlots() {
        if (this.selectedDate) {
            this.loadTimeSlots(this.selectedDate);
        }
    }
    
    getSelectedDateTime() {
        return {
            date: this.selectedDate,
            time: this.selectedTime
        };
    }
    
    reset() {
        this.selectedDate = null;
        this.selectedTime = null;
        document.getElementById('time-selection').style.display = 'none';
        document.querySelectorAll('.calendar-day').forEach(day => {
            day.classList.remove('selected');
        });
    }
} 
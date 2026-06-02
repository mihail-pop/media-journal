document.addEventListener("DOMContentLoaded", function () {
    const calendarGrid = document.getElementById("calendar-grid");
    const monthYearDisplay = document.getElementById("month-year-display");
    const dayDetailsSection = document.getElementById("day-details-section");
    const dayEventsGrid = document.getElementById("day-events-grid");
    const selectedDateDisplay = document.getElementById("selected-date-display");

    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    let selectedDateStr = null;
    let eventsCache = {}; // Keys: 'YYYY-MM-DD', Values: Array of events

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    function initCalendar() {
        renderCalendar();
        
        document.getElementById("prev-month").addEventListener("click", () => {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderCalendar();
        });

        document.getElementById("next-month").addEventListener("click", () => {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderCalendar();
        });

        document.getElementById("today-btn").addEventListener("click", () => {
            const now = new Date();
            currentMonth = now.getMonth();
            currentYear = now.getFullYear();
            renderCalendar();
        });
    }

    async function fetchEvents(year, month) {
        // month is 0-indexed in JS, but 1-indexed in Python
        try {
            const res = await fetch(`/api/calendar/events/?year=${year}&month=${month + 1}`);
            const data = await res.json();
            if (data.success) {
                eventsCache = {};
                data.events.forEach(ev => {
                    // Extract YYYY-MM-DD from ISO datetime
                    const dateKey = ev.date.split("T")[0];
                    if (!eventsCache[dateKey]) eventsCache[dateKey] = [];
                    eventsCache[dateKey].push(ev);
                });
                populateEvents();
                if (selectedDateStr) renderDayDetails(selectedDateStr);
            }
        } catch (e) {
            console.error("Failed to fetch events", e);
        }
    }

    function renderCalendar() {
        calendarGrid.innerHTML = "";
        monthYearDisplay.textContent = `${monthNames[currentMonth]} ${currentYear}`;
        
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        // JS getDay() is 0=Sun, 1=Mon. We want Mon=0, Sun=6 for European style calendar
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;
        
        // Previous month padding
        const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
        for (let i = startOffset - 1; i >= 0; i--) {
            createDayCell(currentYear, currentMonth - 1, prevMonthDays - i, true);
        }
        
        // Current month
        for (let i = 1; i <= daysInMonth; i++) {
            createDayCell(currentYear, currentMonth, i, false);
        }
        
        // Next month padding to fill grid (42 cells max)
        const totalCells = startOffset + daysInMonth;
        let nextMonthDay = 1;
        while (calendarGrid.children.length % 7 !== 0 || calendarGrid.children.length < 35) {
            createDayCell(currentYear, currentMonth + 1, nextMonthDay++, true);
        }

        fetchEvents(currentYear, currentMonth);
    }

    function createDayCell(year, month, day, isOtherMonth) {
        // Handle year overflow from padding
        let adjYear = year;
        let adjMonth = month;
        if (month < 0) { adjMonth = 11; adjYear--; }
        else if (month > 11) { adjMonth = 0; adjYear++; }
        
        const dateStr = `${adjYear}-${String(adjMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const cell = document.createElement("div");
        cell.className = "calendar-day";
        if (isOtherMonth) cell.classList.add("other-month");
        cell.dataset.date = dateStr;
        
        const todayStr = new Date().toISOString().split("T")[0];
        if (dateStr === todayStr) cell.classList.add("today");
        if (dateStr === selectedDateStr) cell.classList.add("selected");

        cell.innerHTML = `
            <span class="day-number">${day}</span>
            <div class="day-events-container" id="events-${dateStr}"></div>
        `;

        cell.addEventListener("click", () => {
            document.querySelectorAll(".calendar-day").forEach(c => c.classList.remove("selected"));
            cell.classList.add("selected");
            selectedDateStr = dateStr;
            renderDayDetails(dateStr);
        });

        calendarGrid.appendChild(cell);
    }

    function populateEvents() {
        // Clear ALL event containers first to remove deleted "ghost" items
        document.querySelectorAll(".day-events-container").forEach(container => {
            container.innerHTML = "";
        });

        // Populate with fresh data
        Object.keys(eventsCache).forEach(dateStr => {
            const container = document.getElementById(`events-${dateStr}`);
            if (container) {
                const events = eventsCache[dateStr];
                events.forEach(ev => {
                    const pill = document.createElement("div");
                    pill.className = `event-pill bg-${ev.media_type || 'default'}`;
                    pill.textContent = ev.title;
                    pill.title = ev.title; // Shows full title on mouse hover
                    container.appendChild(pill);
                });
            }
        });
    }

    function renderDayDetails(dateStr) {
        dayDetailsSection.classList.remove("hidden");
        
        // Format date beautifully
        const dateObj = new Date(dateStr);
        selectedDateDisplay.textContent = `Releasing on ${dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        
        dayEventsGrid.innerHTML = "";
        const events = eventsCache[dateStr] || [];
        
        if (events.length === 0) {
            dayEventsGrid.innerHTML = `<p style="color:var(--text-secondary)">No items tracked for this date.</p>`;
            return;
        }

        events.forEach(ev => {
            const card = document.createElement("div");
            card.className = "event-card";
            
            // Format time if available
            let timeString = "";
            if (ev.date.includes("T")) {
                const rawTime = ev.date.split("T")[1].substring(0, 5);
                if (rawTime !== "00:00") {
                    timeString = rawTime;
                }
            }

            let titleStr = ev.title;
            let subtitle = ev.event_title || (ev.is_custom ? "Custom Entry" : "API Schedule");

            // Build dynamic detail URL
            let targetUrl = "#";
            if (!ev.is_custom || ev.source_id) {
                if (ev.source === "tmdb" && ev.media_type === "tv" && ev.source_id.includes("_s")) {
                    const parts = ev.source_id.split("_s");
                    targetUrl = `/tmdb/season/${parts[0]}/${parts[1]}/`;
                } else if (ev.source === "tmdb") {
                    targetUrl = `/tmdb/${ev.media_type}/${ev.source_id}/`;
                } else if (["anime", "manga"].includes(ev.media_type) || ev.source === "anilist") {
                    targetUrl = `/anilist/${ev.media_type}/${ev.source_id}/`;
                } else if (ev.source === "igdb") {
                    targetUrl = `/igdb/game/${ev.source_id}/`;
                } else if (ev.source === "openlib") {
                    targetUrl = `/openlib/book/${ev.source_id}/`;
                } else if (ev.source === "musicbrainz") {
                    targetUrl = `/musicbrainz/music/${ev.source_id}/`;
                }
            }

            card.innerHTML = `
                <a href="${targetUrl}" class="event-card-link">
                    <img src="${ev.cover_url}" alt="Cover">
                    <div class="event-card-info">
                        <div class="event-card-title">${titleStr}</div>
                        <div class="event-card-desc">${subtitle}</div>
                        ${timeString ? `<div class="event-card-time">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: text-bottom; margin-right: 4px;">
                                <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
                            </svg>${timeString}
                        </div>` : ""}
                        ${ev.notes ? `<div class="event-card-desc" style="font-style:italic">"${ev.notes}"</div>` : ""}
                    </div>
                </a>
                ${ev.is_custom ? `<button class="event-delete-btn" data-id="${ev.id}" data-group="${ev.recurring_group || ''}" title="Delete Entry">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>` : ""}
            `;
            dayEventsGrid.appendChild(card);
        });

        // Add Delete Listeners for Custom Modals
        document.querySelectorAll(".event-delete-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevents clicking the link underneath
                const id = btn.dataset.id;
                const group = btn.dataset.group;
                
                pendingDeleteId = id;
                pendingDeleteGroup = group;
                
                const deleteModal = document.getElementById("delete-confirm-modal");
                const overlay = document.getElementById("custom-modal-overlay");
                
                if (group && group !== "null") {
                    document.getElementById("delete-modal-text").textContent = "This is a recurring event. How would you like to delete it?";
                    document.getElementById("delete-all-btn").classList.remove("hidden");
                } else {
                    document.getElementById("delete-modal-text").textContent = "Are you sure you want to delete this custom entry?";
                    document.getElementById("delete-all-btn").classList.add("hidden");
                }
                
                deleteModal.classList.remove("modal-hidden");
                overlay.classList.remove("modal-hidden");
            });
        });
    }

    // --- Delete Custom Event Modal Logic ---
    let pendingDeleteId = null;
    let pendingDeleteGroup = null;

    function closeDeleteModal() {
        document.getElementById("delete-confirm-modal").classList.add("modal-hidden");
        document.getElementById("custom-modal-overlay").classList.add("modal-hidden");
        pendingDeleteId = null;
        pendingDeleteGroup = null;
    }

    document.getElementById("close-delete-modal").addEventListener("click", closeDeleteModal);
    document.getElementById("cancel-delete-btn").addEventListener("click", closeDeleteModal);
    document.getElementById("custom-modal-overlay").addEventListener("click", () => {
        closeDeleteModal();
        closeModal(); // Closes the add modal too if clicked outside
    });

    function executeDelete(deleteAll) {
        if (!pendingDeleteId) return;
        fetch(`/api/calendar/delete/${pendingDeleteId}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ delete_all: deleteAll })
        }).then(res => res.json()).then(data => {
            if (data.success) fetchEvents(currentYear, currentMonth);
            closeDeleteModal();
        });
    }

    document.getElementById("delete-single-btn").addEventListener("click", () => executeDelete(false));
    document.getElementById("delete-all-btn").addEventListener("click", () => executeDelete(true));

    // --- Add Custom Event Modal Logic --- //
    const modal = document.getElementById("custom-event-modal");
    const overlay = document.getElementById("custom-modal-overlay");
    const openBtn = document.getElementById("open-custom-event-btn");
    const closeBtn = document.getElementById("close-custom-modal");
    const searchInput = document.getElementById("event-item-search");
    const searchResults = document.getElementById("event-search-results");
    
    openBtn.addEventListener("click", () => {
        modal.classList.remove("modal-hidden");
        overlay.classList.remove("modal-hidden");
        // Pre-fill date with currently selected date if exists
        if (selectedDateStr) {
            document.getElementById("event-date").value = selectedDateStr;
        }
    });

    const closeModal = () => {
        modal.classList.add("modal-hidden");
        overlay.classList.add("modal-hidden");
        
        // Reset form completely on close
        document.getElementById("event-item-id").value = "";
        document.getElementById("event-date").value = "";
        document.getElementById("event-time").value = "";
        document.getElementById("event-title").value = "";
        document.getElementById("event-notes").value = "";
        document.getElementById("event-is-recurring").checked = false;
        document.getElementById("recurring-options").classList.add("hidden");
        
        // Reset Search UI
        searchInput.value = "";
        searchInput.classList.remove("hidden");
        searchResults.innerHTML = "";
        searchResults.classList.add("hidden");
        document.getElementById("selected-item-preview").classList.add("hidden");
    };
    
    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", closeModal);

    // Search Logic
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value;
        if (q.length < 2) {
            searchResults.classList.add("hidden");
            return;
        }
        searchTimeout = setTimeout(() => {
            fetch(`/api/calendar/search-local/?q=${encodeURIComponent(q)}`)
                .then(res => res.json())
                .then(data => {
                    searchResults.innerHTML = "";
                    if (data.items.length === 0) {
                        searchResults.innerHTML = `<div style="padding:10px; color:var(--text-secondary)">No items found in your library.</div>`;
                    } else {
                        data.items.forEach(item => {
                            const div = document.createElement("div");
                            div.className = "search-result-item";
                            div.innerHTML = `<img src="${item.cover_url}"><span>${item.title}</span>`;
                            div.addEventListener("click", () => {
                                selectItem(item);
                            });
                            searchResults.appendChild(div);
                        });
                    }
                    searchResults.classList.remove("hidden");
                })
                .catch(err => console.error("Search fetch error:", err));
        }, 300);
    });

    function selectItem(item) {
        document.getElementById("event-item-id").value = item.id;
        document.getElementById("selected-item-cover").src = item.cover_url;
        document.getElementById("selected-item-title").textContent = item.title;
        
        document.getElementById("selected-item-preview").classList.remove("hidden");
        searchInput.classList.add("hidden");
        searchResults.classList.add("hidden");
        searchInput.value = "";
    }

    document.getElementById("clear-selected-item").addEventListener("click", () => {
        document.getElementById("event-item-id").value = "";
        document.getElementById("selected-item-preview").classList.add("hidden");
        searchInput.classList.remove("hidden");
    });

    // Toggle Recurring Options
    document.getElementById("event-is-recurring").addEventListener("change", (e) => {
        if (e.target.checked) {
            document.getElementById("recurring-options").classList.remove("hidden");
        } else {
            document.getElementById("recurring-options").classList.add("hidden");
        }
    });

    // Save Custom Event
    document.getElementById("save-custom-event-btn").addEventListener("click", () => {
        const itemId = document.getElementById("event-item-id").value;
        const date = document.getElementById("event-date").value;
        if (!itemId || !date) return alert("Please select an item and a date.");

        const payload = {
            item_id: itemId,
            date: date,
            time: document.getElementById("event-time").value,
            title: document.getElementById("event-title").value,
            notes: document.getElementById("event-notes").value,
            repeats: document.getElementById("event-is-recurring").checked ? document.getElementById("event-repeats").value : 1,
            interval_days: document.getElementById("event-interval").value
        };

        fetch('/api/calendar/add/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify(payload)
        }).then(res => res.json()).then(data => {
            if (data.success) {
                closeModal();
                fetchEvents(currentYear, currentMonth); // Reload events
            } else {
                alert("Failed to save: " + data.error);
            }
        });
    });

    // Utility for CSRF Token
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // Sync Button Filters & LocalStorage
    const ongoingBtn = document.getElementById("sync-ongoing-btn");
    const plannedBtn = document.getElementById("sync-planned-btn");
    
    // Load state (default to ongoing=true, planned=false)
    const isOngoingActive = localStorage.getItem('cal_sync_ongoing') !== 'false';
    const isPlannedActive = localStorage.getItem('cal_sync_planned') === 'true';
    
    if (isOngoingActive) ongoingBtn.classList.add("active-state");
    else ongoingBtn.classList.remove("active-state");
    
    if (isPlannedActive) plannedBtn.classList.add("active-state");
    else plannedBtn.classList.remove("active-state");

    ongoingBtn.addEventListener("click", () => {
        ongoingBtn.classList.toggle("active-state");
        localStorage.setItem('cal_sync_ongoing', ongoingBtn.classList.contains("active-state"));
    });

    plannedBtn.addEventListener("click", () => {
        plannedBtn.classList.toggle("active-state");
        localStorage.setItem('cal_sync_planned', plannedBtn.classList.contains("active-state"));
    });

    // Calendar Auto-Sync Function
    function triggerSync(force) {
        const syncBtn = document.getElementById("auto-sync-btn");
        const statusMsg = document.getElementById("sync-status-msg");
        
        if (force) {
            syncBtn.classList.add("is-syncing");
            syncBtn.style.pointerEvents = "none";
            statusMsg.textContent = "Syncing APIs...";
            statusMsg.classList.add("visible");
        }

        const payload = {
            sync_ongoing: ongoingBtn.classList.contains("active-state"),
            sync_planned: plannedBtn.classList.contains("active-state"),
            force: force
        };

        fetch('/api/calendar/sync/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify(payload)
        }).then(res => res.json()).then(data => {
            if (force) {
                syncBtn.classList.remove("is-syncing");
                syncBtn.style.pointerEvents = "auto";
                statusMsg.textContent = "Sync Complete!";
                
                // Hide message after 2.5 seconds
                setTimeout(() => {
                    statusMsg.classList.remove("visible");
                }, 2500);

                fetchEvents(currentYear, currentMonth); // Refresh calendar to show new dots
            }
        });
    }

    document.getElementById("auto-sync-btn").addEventListener("click", () => triggerSync(true));

    initCalendar();
    
    // Trigger background auto-sync on page load
    triggerSync(false);
});
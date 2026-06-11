document.addEventListener("DOMContentLoaded", function () {
    // --- Safe Background Scroll Locking (Prevents Layout Shifting) ---
    const keys = {37: 1, 38: 1, 39: 1, 40: 1, 32: 1, 33: 1, 34: 1, 35: 1, 36: 1};
    
    function preventDefault(e) { 
        // Allow scrolling if the event originates inside the modal body or search results dropdown
        if (e.target.closest('#event-search-results')) {
            return;
        }
        e.preventDefault(); 
    }
    function preventDefaultForScrollKeys(e) {
        // Do NOT block key presses (like space or arrow keys) if the user is typing inside an input field
        const targetTag = e.target.tagName.toLowerCase();
        if (targetTag === 'input' || targetTag === 'textarea' || e.target.isContentEditable) {
            return true;
        }
        if (keys[e.keyCode]) { e.preventDefault(); return false; }
    }
    const wheelEvent = 'onwheel' in document.createElement('div') ? 'wheel' : 'mousewheel';
    
    function enableScrollLock() {
        window.addEventListener('DOMMouseScroll', preventDefault, false);
        window.addEventListener(wheelEvent, preventDefault, { passive: false });
        window.addEventListener('touchmove', preventDefault, { passive: false });
        window.addEventListener('keydown', preventDefaultForScrollKeys, false);
    }
    function disableScrollLock() {
        window.removeEventListener('DOMMouseScroll', preventDefault, false);
        window.removeEventListener(wheelEvent, preventDefault, { passive: false });
        window.removeEventListener('touchmove', preventDefault, { passive: false });
        window.removeEventListener('keydown', preventDefaultForScrollKeys, false);
    }

    const calendarGrid = document.getElementById("calendar-grid");
    const monthYearDisplay = document.getElementById("month-year-display");
    const dayDetailsSection = document.getElementById("day-details-section");
    const dayEventsGrid = document.getElementById("day-events-grid");
    const selectedDateDisplay = document.getElementById("selected-date-display");

    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    let selectedDateStr = null;

    // Check if a specific date was passed from the home page
    const urlParams = new URLSearchParams(window.location.search);
    const passedDate = urlParams.get('date');
    if (passedDate) {
        selectedDateStr = passedDate;
        const passedObj = new Date(passedDate);
        currentMonth = passedObj.getMonth();
        currentYear = passedObj.getFullYear();
    }
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
            <div class="day-events-container">
                <div class="day-events-track" id="events-${dateStr}"></div>
            </div>
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
        // Clear ALL event track containers first to remove deleted "ghost" items
        document.querySelectorAll(".day-events-container").forEach(container => {
            if (container.dataset.tickerId) {
                clearInterval(container.dataset.tickerId);
            }
            container.scrollTop = 0; // Reset scroll cleanly
        });

        document.querySelectorAll(".day-events-track").forEach(track => {
            track.innerHTML = "";
            track.style.transform = 'none';
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

        // Initialize Step-Ticker after DOM has painted
        setTimeout(initStepTicker, 50);
    }

function initStepTicker() {
        document.querySelectorAll('.day-events-container').forEach(container => {
            const track = container.querySelector('.day-events-track');
            if (!track) return;

            // Only activate ticker if items overflow the container
            if (track.scrollHeight > container.clientHeight) {
                
                let tickerId;
                let isHovered = false;
                let animationFrameId = null;

                // Lock tracking on hover, allow user full manual scroll control
                container.addEventListener('mouseenter', () => {
                    isHovered = true;
                    // Instantly stop the animation if the user hovers while it's moving
                    if (animationFrameId) cancelAnimationFrame(animationFrameId);
                });
                
                // When mouse leaves, reset the timer so it waits before moving again
                container.addEventListener('mouseleave', () => {
                    isHovered = false;
                    resetTicker();
                });

                function resetTicker() {
                    clearInterval(tickerId);
                    tickerId = setInterval(tick, 3500); // 3.5 seconds wait time before next move
                    container.dataset.tickerId = tickerId;
                }

                // Custom peaceful scrolling animation
                function peacefulScrollTo(targetTop, duration) {
                    const startTop = container.scrollTop;
                    const distance = targetTop - startTop;
                    let startTime = null;

                    function animation(currentTime) {
                        if (isHovered) return; // Abort instantly if user hovers

                        if (startTime === null) startTime = currentTime;
                        const timeElapsed = currentTime - startTime;
                        const progress = Math.min(timeElapsed / duration, 1);
                        
                        // Easing function (Gentle start, smooth glide, gentle stop)
                        const ease = progress < 0.5 
                            ? 2 * progress * progress 
                            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                        container.scrollTop = startTop + distance * ease;

                        if (timeElapsed < duration) {
                            animationFrameId = requestAnimationFrame(animation);
                        }
                    }
                    animationFrameId = requestAnimationFrame(animation);
                }

                function tick() {
                    if (isHovered) return;

                    const maxScroll = container.scrollHeight - container.clientHeight;

                    // If we are at or extremely close to the bottom, loop back to the top
                    if (container.scrollTop >= maxScroll - 2) {
                        peacefulScrollTo(0, 800); // 800ms duration to glide back to top
                        return;
                    }

                    // Find the exact top pixel of the NEXT pill in the list
                    let nextTop = maxScroll; 
                    for (let child of track.children) {
                        if (child.offsetTop > container.scrollTop + 2) {
                            nextTop = child.offsetTop;
                            break;
                        }
                    }

                    // Glide to the next pill over 800ms
                    peacefulScrollTo(nextTop, 800); 
                }

                resetTicker(); // Start!
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
                        ${ev.notes ? `<div class="event-card-notes" title="${ev.notes.replace(/"/g, '&quot;')}">"${ev.notes}"</div>` : ""}
                    </div>
                </a>
                <div class="event-actions">
                    <button class="event-action-btn notify-btn ${ev.notify ? 'active' : ''}" data-id="${ev.id}" title="${ev.notify ? 'Disable Notification' : 'Enable Notification'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${ev.notify ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                    </button>
                    ${ev.is_custom ? `<button class="event-action-btn delete-btn" data-id="${ev.id}" data-group="${ev.recurring_group || ''}" title="Delete Entry">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="5" x2="5" y2="19"></line>
                            <line x1="5" y1="5" x2="19" y2="19"></line>
                        </svg>
                    </button>` : ""}
                </div>
            `;
            dayEventsGrid.appendChild(card);
        });

        // Add Notification Toggle Listeners
        document.querySelectorAll(".notify-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                
                fetch(`/api/calendar/toggle-notify/${id}/`, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': getCookie('csrftoken') }
                }).then(res => res.json()).then(data => {
                    if (data.success) {
                        btn.classList.toggle("active", data.notify);
                        btn.querySelector('svg').setAttribute('fill', data.notify ? 'currentColor' : 'none');
                        btn.title = data.notify ? 'Disable Notification' : 'Enable Notification';
                    }
                });
            });
        });

        // Add Delete Listeners for Custom Modals
        document.querySelectorAll(".delete-btn").forEach(btn => {
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
                    document.getElementById("delete-single-btn").textContent = "Just This One";
                    document.getElementById("delete-all-btn").classList.remove("hidden");
                } else {
                    document.getElementById("delete-modal-text").textContent = "Are you sure you want to delete this custom entry?";
                    document.getElementById("delete-single-btn").textContent = "Delete";
                    document.getElementById("delete-all-btn").classList.add("hidden");
                }
                
                deleteModal.classList.remove("modal-hidden");
                overlay.classList.remove("modal-hidden");
                enableScrollLock(); // Lock scroll completely
            });
        });
    }

    // --- Delete Custom Event Modal Logic ---
    let pendingDeleteId = null;
    let pendingDeleteGroup = null;

    function closeDeleteModal() {
        document.getElementById("delete-confirm-modal").classList.add("modal-hidden");
        document.getElementById("custom-modal-overlay").classList.add("modal-hidden");
        disableScrollLock(); // Unlock scroll safely
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
        enableScrollLock(); // Lock scroll
        // Pre-fill date with currently selected date if exists
        if (selectedDateStr) {
            document.getElementById("event-date").value = selectedDateStr;
        }
    });

    const closeModal = () => {
        modal.classList.add("modal-hidden");
        overlay.classList.add("modal-hidden");
        disableScrollLock(); // Unlock scroll
        
        // Reset form completely
        document.getElementById("custom-event-form").reset();
        document.getElementById("event-item-id").value = "";
        document.getElementById("recurring-options").classList.add("hidden");
        searchInput.setCustomValidity(""); // Clear custom validation errors
        
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
        searchInput.setCustomValidity(""); // Clear error when typing
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

    // Save Custom Event (Native Form Submission)
    document.getElementById("custom-event-form").addEventListener("submit", (e) => {
        e.preventDefault(); // Prevent page reload
        
        const itemId = document.getElementById("event-item-id").value;
        if (!itemId) {
            searchInput.setCustomValidity("Please search and select an item from your library.");
            searchInput.reportValidity(); // Show native browser popup
            return;
        }

        const date = document.getElementById("event-date").value;
        const payload = {
            item_id: itemId,
            date: date,
            time: document.getElementById("event-time").value,
            title: document.getElementById("event-title").value,
            notes: document.getElementById("event-notes").value,
            notify: document.getElementById("event-notify").checked,
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

    // Sync Button Filters (State loaded directly from Database)
    const ongoingBtn = document.getElementById("sync-ongoing-btn");
    const plannedBtn = document.getElementById("sync-planned-btn");

    ongoingBtn.addEventListener("click", () => {
        ongoingBtn.classList.toggle("active-state");
        triggerSync(false); // Triggers sync and saves preference to database
    });

    plannedBtn.addEventListener("click", () => {
        plannedBtn.classList.toggle("active-state");
        triggerSync(false); // Triggers sync and saves preference to database
    });

    // Calendar Auto-Sync Function
    function triggerSync(force) {
        const syncBtn = document.getElementById("auto-sync-btn");
        const statusMsg = document.getElementById("sync-status-msg");
        
        if (force) {
            syncBtn.style.pointerEvents = "none";
        }
        
        // Trigger animations/bubbles for BOTH manual and auto sync
        syncBtn.classList.add("is-syncing");
        statusMsg.textContent = force ? "Syncing APIs..." : "Auto-syncing...";
        statusMsg.classList.add("visible");

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
            syncBtn.classList.remove("is-syncing");
            if (force) syncBtn.style.pointerEvents = "auto";
            
            statusMsg.textContent = "Sync Complete!";
            setTimeout(() => {
                statusMsg.classList.remove("visible");
            }, 2500);

            // Update calendar if forced OR if auto-sync actually found updates
            if (force || data.synced_count > 0) {
                fetchEvents(currentYear, currentMonth);
            }
        });
    }

    document.getElementById("auto-sync-btn").addEventListener("click", () => triggerSync(true));

    initCalendar();
    
    // Trigger background auto-sync on page load
    triggerSync(false);
});
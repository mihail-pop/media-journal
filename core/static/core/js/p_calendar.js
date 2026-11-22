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

    let pageIsActive = true;
    let eventsRequest = null;
    let eventsRequestNumber = 0;
    let eventsReady = false;
    let tickerInitTimer = null;
    let syncStatusTimer = null;
    let contentionRefreshTimer = null;
    const tickers = new Map();

    function localDate(year, month, day) {
        const date = new Date(0);
        date.setFullYear(year, month, day);
        date.setHours(12, 0, 0, 0);
        return date;
    }

    function parseCalendarDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
        const [year, month, day] = value.split("-").map(Number);
        if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
        const date = localDate(year, month - 1, day);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
    }

    function calendarDateKey(date) {
        return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

    function imageUrl(value) {
        try {
            const url = new URL(value || '/static/core/img/placeholder.png', window.location.href);
            if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
        } catch (_) { }
        return '/static/core/img/placeholder.png';
    }

    async function responseJSON(response, fallback) {
        let data;
        try { data = await response.json(); }
        catch (_) { throw new Error(fallback); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(fallback);
        if (!response.ok) throw new Error(data.error || fallback);
        return data;
    }

    function showStatus(message, duration = 4500) {
        if (!pageIsActive) return;
        clearTimeout(syncStatusTimer);
        const status = document.getElementById('sync-status-msg');
        status.textContent = message;
        status.classList.add('visible');
        if (duration) {
            syncStatusTimer = setTimeout(() => status.classList.remove('visible'), duration);
        }
    }

    function clearDayDetails() {
        selectedDateStr = null;
        dayDetailsSection.classList.add('hidden');
        dayEventsGrid.innerHTML = '';
    }

    let currentDate = new Date();
    let currentMonth = currentDate.getMonth();
    let currentYear = currentDate.getFullYear();
    let selectedDateStr = null;

    // Check if a specific date was passed from the home page
    const urlParams = new URLSearchParams(window.location.search);
    const passedDate = urlParams.get('date');
    const passedObj = parseCalendarDate(passedDate);
    if (passedObj) {
        selectedDateStr = passedDate;
        currentMonth = passedObj.getMonth();
        currentYear = passedObj.getFullYear();
    }
    let eventsCache = {}; // Keys: 'YYYY-MM-DD', Values: Array of events

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    function initCalendar() {
        renderCalendar();
        
        document.getElementById("prev-month").addEventListener("click", () => {
            if (currentYear === 1 && currentMonth === 0) return;
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderCalendar();
        });

        document.getElementById("next-month").addEventListener("click", () => {
            if (currentYear === 9999 && currentMonth === 11) return;
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
        if (!pageIsActive || year !== currentYear || month !== currentMonth) return;
        const requestNumber = ++eventsRequestNumber;
        if (eventsRequest) eventsRequest.abort();
        const request = new AbortController();
        eventsRequest = request;
        try {
            const res = await fetch(`/api/calendar/events/?year=${year}&month=${month + 1}`, { signal: request.signal });
            const data = await responseJSON(res, 'Could not load calendar events.');
            if (!data.success || !Array.isArray(data.events)) throw new Error(data.error || 'Could not load calendar events.');
            if (pageIsActive && requestNumber === eventsRequestNumber && year === currentYear && month === currentMonth) {
                const nextEvents = {};
                data.events.forEach(ev => {
                    // Extract YYYY-MM-DD from ISO datetime
                    const dateKey = ev.date.split("T")[0];
                    if (!nextEvents[dateKey]) nextEvents[dateKey] = [];
                    nextEvents[dateKey].push(ev);
                });
                eventsCache = nextEvents;
                eventsReady = true;
                populateEvents();
                if (selectedDateStr) renderDayDetails(selectedDateStr);
                return true;
            }
        } catch (e) {
            if (e.name === 'AbortError' || requestNumber !== eventsRequestNumber || !pageIsActive) return;
            console.error("Failed to fetch events", e);
            showStatus(e.message || 'Could not load calendar events.');
            return false;
        } finally {
            if (eventsRequest === request) eventsRequest = null;
        }
    }

    function renderCalendar() {
        cleanupTickers();
        eventsCache = {};
        eventsReady = false;
        const selected = parseCalendarDate(selectedDateStr);
        if (selected && (selected.getFullYear() !== currentYear || selected.getMonth() !== currentMonth)) {
            clearDayDetails();
        }
        calendarGrid.innerHTML = "";
        monthYearDisplay.textContent = `${monthNames[currentMonth]} ${currentYear}`;
        
        const firstDay = localDate(currentYear, currentMonth, 1).getDay();
        const daysInMonth = localDate(currentYear, currentMonth + 1, 0).getDate();
        
        // JS getDay() is 0=Sun, 1=Mon. We want Mon=0, Sun=6 for European style calendar
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;
        
        // Previous month padding
        const prevMonthDays = localDate(currentYear, currentMonth, 0).getDate();
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
        
        const dateStr = calendarDateKey(localDate(adjYear, adjMonth, day));
        
        const cell = document.createElement("div");
        cell.className = "calendar-day";
        if (isOtherMonth) cell.classList.add("other-month");
        cell.dataset.date = dateStr;
        
        const todayStr = calendarDateKey(new Date());
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

    function cleanupTickers() {
        clearTimeout(tickerInitTimer);
        tickerInitTimer = null;
        tickers.forEach(dispose => dispose());
        tickers.clear();
    }

    function populateEvents() {
        cleanupTickers();
        document.querySelectorAll(".day-events-container").forEach(container => {
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
        tickerInitTimer = setTimeout(initStepTicker, 50);
    }

    function initStepTicker() {
        tickerInitTimer = null;
        if (!pageIsActive) return;
        document.querySelectorAll('.day-events-container').forEach(container => {
            const track = container.querySelector('.day-events-track');
            if (!track) return;

            // Only activate ticker if items overflow the container
            if (track.scrollHeight > container.clientHeight) {
                
                let tickerId = null;
                let isHovered = false;
                let animationFrameId = null;
                let disposed = false;

                // Lock tracking on hover, allow user full manual scroll control
                function onMouseEnter() {
                    isHovered = true;
                    clearInterval(tickerId);
                    // Instantly stop the animation if the user hovers while it's moving
                    if (animationFrameId) cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                
                // When mouse leaves, reset the timer so it waits before moving again
                function onMouseLeave() {
                    isHovered = false;
                    resetTicker();
                }

                container.addEventListener('mouseenter', onMouseEnter);
                container.addEventListener('mouseleave', onMouseLeave);

                function resetTicker() {
                    clearInterval(tickerId);
                    if (disposed || !pageIsActive) return;
                    tickerId = setInterval(tick, 3500); // 3.5 seconds wait time before next move
                }

                // Custom peaceful scrolling animation
                function peacefulScrollTo(targetTop, duration) {
                    const startTop = container.scrollTop;
                    const distance = targetTop - startTop;
                    let startTime = null;

                    function animation(currentTime) {
                        if (disposed || !pageIsActive || isHovered) return;

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
                        } else {
                            animationFrameId = null;
                        }
                    }
                    animationFrameId = requestAnimationFrame(animation);
                }

                function tick() {
                    if (disposed || !pageIsActive || isHovered) return;

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

                tickers.set(container, () => {
                    disposed = true;
                    clearInterval(tickerId);
                    if (animationFrameId) cancelAnimationFrame(animationFrameId);
                    container.removeEventListener('mouseenter', onMouseEnter);
                    container.removeEventListener('mouseleave', onMouseLeave);
                });
                resetTicker(); // Start!
            }
        });
    }

    function renderDayDetails(dateStr) {
        dayDetailsSection.classList.remove("hidden");
        
        // Format date beautifully
        const dateObj = parseCalendarDate(dateStr);
        if (!dateObj) {
            clearDayDetails();
            return;
        }
        selectedDateDisplay.textContent = `Releasing on ${dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        
        dayEventsGrid.innerHTML = "";
        if (!eventsReady) return;
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
            if (!ev.all_day && ev.date.includes("T")) {
                const rawTime = ev.date.split("T")[1].substring(0, 5);
                if (ev.all_day === false || rawTime !== "00:00") {
                    timeString = rawTime;
                }
            }

            let titleStr = ev.title;
            let subtitle = ev.event_title || (ev.is_custom ? "Custom Entry" : "API Schedule");

            // Build dynamic detail URL
            let targetUrl = "#";
            const sourceId = String(ev.source_id || '');
            const mediaType = encodeURIComponent(ev.media_type || '');
            const encodedId = encodeURIComponent(sourceId);
            if (sourceId) {
                if (ev.source === "tmdb" && ev.media_type === "tv" && sourceId.includes("_s")) {
                    const parts = sourceId.split("_s");
                    targetUrl = `/tmdb/season/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/`;
                } else if (ev.source === "tmdb") {
                    targetUrl = `/tmdb/${mediaType}/${encodedId}/`;
                } else if (["anime", "manga"].includes(ev.media_type) || ev.source === "anilist") {
                    const provider = ev.source === 'mal' ? 'mal' : 'anilist';
                    targetUrl = `/${provider}/${mediaType}/${encodedId}/`;
                } else if (ev.source === "igdb") {
                    targetUrl = `/igdb/game/${encodedId}/`;
                } else if (ev.source === "openlib") {
                    targetUrl = `/openlib/book/${encodedId}/`;
                } else if (ev.source === "musicbrainz") {
                    targetUrl = `/musicbrainz/music/${encodedId}/`;
                }
            }

            card.innerHTML = `
                <a href="${escapeHTML(targetUrl)}" class="event-card-link">
                    <img src="${escapeHTML(imageUrl(ev.cover_url))}" alt="Cover">
                    <div class="event-card-info">
                        <div class="event-card-title">${escapeHTML(titleStr)}</div>
                        <div class="event-card-desc">${escapeHTML(subtitle)}</div>
                        ${timeString ? `<div class="event-card-time">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: text-bottom; margin-right: 4px;">
                                <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
                            </svg>${escapeHTML(timeString)}
                        </div>` : ""}
                        ${ev.notes ? `<div class="event-card-notes" title="${escapeHTML(ev.notes)}">"${escapeHTML(ev.notes)}"</div>` : ""}
                    </div>
                </a>
                <div class="event-actions">
                    <button class="event-action-btn notify-btn ${ev.notify ? 'active' : ''}" data-id="${escapeHTML(ev.id)}" title="${ev.notify ? 'Disable Notification' : 'Enable Notification'}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${ev.notify ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                    </button>
                    ${ev.is_custom ? `<button class="event-action-btn delete-btn" data-id="${escapeHTML(ev.id)}" data-group="${escapeHTML(ev.recurring_group || '')}" title="Delete Entry">
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
        dayEventsGrid.querySelectorAll(".notify-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                const id = btn.dataset.id;
                btn.disabled = true;
                try {
                    const response = await fetch(`/api/calendar/toggle-notify/${encodeURIComponent(id)}/`, {
                        method: 'POST',
                        headers: { 'X-CSRFToken': getCookie('csrftoken') }
                    });
                    const data = await responseJSON(response, 'Could not update this notification.');
                    if (!data.success) throw new Error(data.error || 'Could not update this notification.');
                    Object.values(eventsCache).forEach(events => events.forEach(event => {
                        if (String(event.id) === id) event.notify = data.notify;
                    }));
                    if (pageIsActive) {
                        btn.classList.toggle("active", data.notify);
                        btn.querySelector('svg').setAttribute('fill', data.notify ? 'currentColor' : 'none');
                        btn.title = data.notify ? 'Disable Notification' : 'Enable Notification';
                    }
                } catch (error) {
                    showStatus(error.message || 'Could not update this notification.');
                } finally {
                    btn.disabled = false;
                }
            });
        });

        // Add Delete Listeners for Custom Modals
        dayEventsGrid.querySelectorAll(".delete-btn").forEach(btn => {
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
    let deletePending = false;

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

    async function executeDelete(deleteAll) {
        if (!pendingDeleteId || deletePending) return;
        const eventId = pendingDeleteId;
        const buttons = [document.getElementById('delete-single-btn'), document.getElementById('delete-all-btn')];
        deletePending = true;
        buttons.forEach(button => { button.disabled = true; });
        try {
            const response = await fetch(`/api/calendar/delete/${encodeURIComponent(eventId)}/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify({ delete_all: deleteAll })
            });
            const data = await responseJSON(response, 'Could not delete this event.');
            if (!data.success) throw new Error(data.error || 'Could not delete this event.');
            if (pendingDeleteId === eventId) closeDeleteModal();
            fetchEvents(currentYear, currentMonth);
        } catch (error) {
            showStatus(error.message || 'Could not delete this event.');
        } finally {
            deletePending = false;
            buttons.forEach(button => { button.disabled = false; });
        }
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
    let formVersion = 0;
    let customSavePending = false;
    let searchTimeout = null;
    let searchRequest = null;
    let searchRequestNumber = 0;

    function cancelSearch() {
        clearTimeout(searchTimeout);
        searchTimeout = null;
        searchRequestNumber++;
        if (searchRequest) searchRequest.abort();
        searchRequest = null;
    }
    
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
        formVersion++;
        cancelSearch();
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
    searchInput.addEventListener("input", (e) => {
        searchInput.setCustomValidity(""); // Clear error when typing
        cancelSearch();
        const requestNumber = searchRequestNumber;
        const q = e.target.value.trim();
        if (q.length < 2) {
            searchResults.innerHTML = '';
            searchResults.classList.add("hidden");
            return;
        }
        searchTimeout = setTimeout(async () => {
            const request = new AbortController();
            searchRequest = request;
            try {
                const response = await fetch(`/api/calendar/search-local/?q=${encodeURIComponent(q)}`, { signal: request.signal });
                const data = await responseJSON(response, 'Could not search your library.');
                if (!Array.isArray(data.items)) throw new Error('Could not search your library.');
                if (pageIsActive && requestNumber === searchRequestNumber && !modal.classList.contains('modal-hidden')) {
                    searchResults.innerHTML = "";
                    if (data.items.length === 0) {
                        searchResults.innerHTML = `<div style="padding:10px; color:var(--text-secondary)">No items found in your library.</div>`;
                    } else {
                        data.items.forEach(item => {
                            const div = document.createElement("div");
                            div.className = "search-result-item";
                            div.innerHTML = `<img src="${escapeHTML(imageUrl(item.cover_url))}"><span>${escapeHTML(item.title)}</span>`;
                            div.addEventListener("click", () => {
                                selectItem(item);
                            });
                            searchResults.appendChild(div);
                        });
                    }
                    searchResults.classList.remove("hidden");
                }
            } catch (error) {
                if (error.name !== 'AbortError' && requestNumber === searchRequestNumber) {
                    showStatus(error.message || 'Could not search your library.');
                }
            } finally {
                if (searchRequest === request) searchRequest = null;
            }
        }, 300);
    });

    function selectItem(item) {
        cancelSearch();
        document.getElementById("event-item-id").value = item.id;
        document.getElementById("selected-item-cover").src = imageUrl(item.cover_url);
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
    document.getElementById("custom-event-form").addEventListener("submit", async (e) => {
        e.preventDefault(); // Prevent page reload
        if (customSavePending) return;
        
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

        const version = formVersion;
        const saveButton = document.getElementById('save-custom-event-btn');
        customSavePending = true;
        saveButton.disabled = true;
        try {
            const response = await fetch('/api/calendar/add/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify(payload)
            });
            const data = await responseJSON(response, 'Could not save this event.');
            if (!data.success) throw new Error(data.error || 'Could not save this event.');
            if (version === formVersion) closeModal();
            fetchEvents(currentYear, currentMonth);
        } catch (error) {
            if (pageIsActive) alert('Failed to save: ' + error.message);
        } finally {
            customSavePending = false;
            saveButton.disabled = false;
        }
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
    const syncBtn = document.getElementById('auto-sync-btn');
    let syncRunning = false;
    let activeSyncForce = false;
    let pendingSync = null;

    function updateSyncButton() {
        syncBtn.classList.toggle('is-syncing', syncRunning || pendingSync !== null);
        syncBtn.style.pointerEvents = activeSyncForce || (pendingSync && pendingSync.force) ? 'none' : 'auto';
    }

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
        if (!pageIsActive) return;
        clearTimeout(contentionRefreshTimer);
        pendingSync = {
            sync_ongoing: ongoingBtn.classList.contains("active-state"),
            sync_planned: plannedBtn.classList.contains("active-state"),
            // Several quick changes need only one follow-up request, but a
            // requested manual refresh must survive a later filter click.
            force: Boolean(force || (pendingSync && pendingSync.force))
        };
        updateSyncButton();
        processSyncQueue();
    }

    async function processSyncQueue() {
        if (syncRunning || !pageIsActive) return;
        syncRunning = true;
        let message = '';
        try {
            while (pendingSync && pageIsActive) {
                const payload = pendingSync;
                pendingSync = null;
                activeSyncForce = payload.force;
                updateSyncButton();
                showStatus(payload.force ? 'Syncing APIs...' : 'Auto-syncing...', 0);
                try {
                    const response = await fetch('/api/calendar/sync/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                        body: JSON.stringify(payload)
                    });
                    const data = await responseJSON(response, 'Could not sync the calendar. Try again.');
                    if (!data.success) throw new Error(data.error || 'Could not sync the calendar. Try again.');
                    if (data.in_progress) {
                        message = 'Another sync is already running. Try again shortly.';
                        // The other page owns the sync. Refresh the local events
                        // once without starting another sync or polling forever.
                        clearTimeout(contentionRefreshTimer);
                        contentionRefreshTimer = setTimeout(() => fetchEvents(currentYear, currentMonth), 5000);
                        continue;
                    }
                    const failed = Number(data.failed_count) || 0;
                    const skipped = Number(data.skipped_count) || 0;
                    if (failed) {
                        message = `Sync finished; ${failed} item${failed === 1 ? '' : 's'} could not be checked. Try again later.`;
                    } else if (skipped) {
                        message = `Sync complete. ${skipped} item${skipped === 1 ? '' : 's'} skipped.`;
                    } else {
                        message = 'Sync Complete!';
                    }
                    if (data.changed || data.synced_count > 0 || payload.force) {
                        const refreshed = await fetchEvents(currentYear, currentMonth);
                        if (refreshed === false) message = 'Sync finished, but calendar events could not be reloaded.';
                    }
                } catch (error) {
                    message = error.message || 'Could not sync the calendar. Try again.';
                }
            }
        } finally {
            syncRunning = false;
            activeSyncForce = false;
            updateSyncButton();
            if (message) showStatus(message, message === 'Sync Complete!' ? 2500 : 6000);
        }
    }

    document.getElementById("auto-sync-btn").addEventListener("click", () => triggerSync(true));

    window.addEventListener('pagehide', () => {
        pageIsActive = false;
        eventsRequestNumber++;
        if (eventsRequest) eventsRequest.abort();
        cancelSearch();
        cleanupTickers();
        clearTimeout(syncStatusTimer);
        clearTimeout(contentionRefreshTimer);
        disableScrollLock();
        if (pendingSync) {
            // A filter changed while a previous sync was running. Preserve that
            // last choice even if the user immediately navigates elsewhere.
            const payload = { ...pendingSync, force: false, preferences_only: true };
            pendingSync = null;
            fetch('/api/calendar/sync/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(() => { });
        }
    });

    window.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        pageIsActive = true;
        if (!modal.classList.contains('modal-hidden') || !document.getElementById('delete-confirm-modal').classList.contains('modal-hidden')) {
            enableScrollLock();
        }
        fetchEvents(currentYear, currentMonth);
        triggerSync(false);
    });

    initCalendar();
    
    // Trigger background auto-sync on page load
    triggerSync(false);
});

(() => {
    'use strict';
    const key = 'calendarMediaTypes';
    const types = [
        ['movie', 'Movies'], ['tv', 'TV Shows'], ['anime', 'Anime'],
        ['manga', 'Manga'], ['game', 'Games'], ['book', 'Books'], ['music', 'Music']
    ];
    const all = types.map(([id]) => id);
    const controls = new Set();

    function normalize(value) {
        if (!Array.isArray(value)) return null;
        if (!value.length) return [];
        const selected = all.filter(id => value.includes(id));
        return selected.length ? selected : null;
    }

    function readTypes() {
        try {
            const saved = normalize(JSON.parse(localStorage.getItem(key)));
            if (saved) return saved;
        } catch (_) { }
        try {
            const cookie = document.cookie.split('; ').find(value => value.startsWith('calendar_media_types='));
            if (cookie) {
                const value = decodeURIComponent(cookie.slice('calendar_media_types='.length));
                return value === '-' ? [] : normalize(value.split(',')) || [...all];
            }
        } catch (_) { }
        return [...all];
    }

    let selected = readTypes();

    function writeCookie() {
        // The cookie lets the first Home render already use the browser choice.
        document.cookie = `calendar_media_types=${encodeURIComponent(selected.join(',') || '-')}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    }

    function updateControl(root) {
        const label = root.querySelector('.calendar-media-label');
        if (label) {
            label.textContent = selected.length === all.length ? 'All Media' :
                selected.length === 0 ? 'No Media' : selected.length === 1 ?
                    types.find(([id]) => id === selected[0])[1] : `${selected.length} Media Types`;
        }
        root.classList.toggle('has-filter', selected.length !== all.length);
        root.querySelectorAll('[data-calendar-media-type]').forEach(button => {
            const active = selected.includes(button.dataset.calendarMediaType);
            button.classList.toggle('is-selected', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }

    function announce() {
        controls.forEach(updateControl);
        document.dispatchEvent(new CustomEvent('calendar-media-filter-change', { detail: { types: [...selected] } }));
    }

    function setTypes(value) {
        const next = normalize(value);
        if (!next || next.join(',') === selected.join(',')) return;
        selected = next;
        try { localStorage.setItem(key, JSON.stringify(selected)); } catch (_) { }
        writeCookie();
        announce();
    }

    function close(root) {
        root.classList.remove('is-open');
        root.querySelector('.calendar-media-toggle').setAttribute('aria-expanded', 'false');
        root.querySelector('.calendar-media-options').hidden = true;
    }

    function attach(root) {
        if (!root || controls.has(root)) return;
        const toggle = root.querySelector('.calendar-media-toggle');
        const menu = root.querySelector('.calendar-media-options');
        const choices = root.querySelector('.calendar-media-choices');
        if (!toggle || !menu || !choices) return;
        controls.add(root);
        types.forEach(([id, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'calendar-media-option';
            button.dataset.calendarMediaType = id;
            const name = document.createElement('span');
            name.textContent = label;
            const mark = document.createElement('span');
            mark.className = 'calendar-media-check';
            mark.setAttribute('aria-hidden', 'true');
            mark.textContent = '✓';
            button.append(name, mark);
            choices.append(button);
        });
        toggle.addEventListener('click', () => {
            const opening = menu.hidden;
            controls.forEach(close);
            if (opening) {
                menu.hidden = false;
                root.classList.add('is-open');
                toggle.setAttribute('aria-expanded', 'true');
            }
        });
        root.addEventListener('click', event => {
            const action = event.target.closest('[data-media-action]')?.dataset.mediaAction;
            if (action) setTypes(action === 'all' ? all : []);
            const id = event.target.closest('[data-calendar-media-type]')?.dataset.calendarMediaType;
            if (id) setTypes(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
        });
        root.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !menu.hidden) {
                close(root);
                toggle.focus();
                event.stopPropagation();
            }
        });
        updateControl(root);
    }

    document.addEventListener('pointerdown', event => controls.forEach(root => {
        if (!root.contains(event.target)) close(root);
    }));
    function refreshStoredChoice() {
        const next = readTypes();
        if (next.join(',') !== selected.join(',')) {
            selected = next;
            announce();
        }
    }
    window.addEventListener('storage', event => { if (event.key === key) refreshStoredChoice(); });
    window.addEventListener('pageshow', refreshStoredChoice);
    window.addEventListener('pagehide', () => controls.forEach(close));
    writeCookie();
    window.CalendarMediaFilter = { getTypes: () => [...selected], attach };
    function initialize() { document.querySelectorAll('.calendar-media-filter').forEach(attach); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
})();

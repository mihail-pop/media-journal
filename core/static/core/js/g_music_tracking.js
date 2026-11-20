// Passive listening time and qualified play counts. Pending listens stay in this browser until a session starts
// or closes; there are no periodic requests to Media Journal.
(() => {
    const activeKey = 'music_play_tracking_active';
    const sessionKey = 'music_play_tracking_session';
    const queuePrefix = 'music_play_tracking_pending_';
    const maximumSeconds = 2147483647;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    function read(key, storageName = 'localStorage') {
        try { return JSON.parse(window[storageName].getItem(key)); }
        catch (error) { return null; }
    }

    function write(key, value, storageName = 'localStorage') {
        try { window[storageName].setItem(key, JSON.stringify(value)); return true; }
        catch (error) { return false; }
    }

    function remove(key, storageName = 'localStorage') {
        try { window[storageName].removeItem(key); }
        catch (error) { /* Tracking must not interfere with playback. */ }
    }

    function eventId() {
        const bytes = new Uint8Array(16);
        try { window.crypto.getRandomValues(bytes); }
        catch (error) {
            for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
        }
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function validPlay(play) {
        return play && uuidPattern.test(play.event_id) && Number.isSafeInteger(play.item_id)
            && play.item_id > 0 && /^[A-Za-z0-9_-]{11}$/.test(play.video_id)
            && typeof play.played_at === 'string' && Number.isFinite(Date.parse(play.played_at))
            && (play.listened_seconds == null || validSeconds(play.listened_seconds))
            && (play.qualified === undefined || typeof play.qualified === 'boolean')
            && (play.qualified !== false || validSeconds(play.listened_seconds));
    }

    function validSeconds(seconds) {
        return Number.isFinite(seconds) && seconds >= 0 && seconds <= maximumSeconds;
    }

    function validState(state) {
        return state && uuidPattern.test(state.event_id) && Number.isSafeInteger(state.item_id)
            && state.item_id > 0 && typeof state.video_id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(state.video_id)
            && validSeconds(state.seconds)
            && (state.played_at == null || (typeof state.played_at === 'string' && Number.isFinite(Date.parse(state.played_at))))
            && (state.started_at == null || (typeof state.started_at === 'string' && Number.isFinite(Date.parse(state.started_at))));
    }

    function pendingPlays() {
        const plays = [];
        try {
            const storage = window.localStorage;
            for (let index = 0; index < storage.length; index++) {
                const key = storage.key(index);
                if (key?.startsWith(queuePrefix)) {
                    const play = read(key);
                    if (validPlay(play) && key === queuePrefix + play.event_id) plays.push(play);
                }
            }
        } catch (error) { /* Storage may be unavailable in private/restricted contexts. */ }
        return plays.sort((left, right) => left.played_at.localeCompare(right.played_at));
    }

    window.createMusicPlayTracker = ({ getPlayer, getCookie, isOwner = () => true }) => {
        let current = null;
        let playing = false;
        let timer = null;
        let previousSample = null;
        let lastCheckpoint = 0;
        let flushing = null;
        let restored = false;
        const now = () => window.performance?.now?.() ?? Date.now();

        function ownsPlayer() {
            try { return isOwner(); }
            catch (error) { return false; }
        }

        function playerData() {
            try {
                const player = getPlayer();
                if (!player || player.getVideoData().video_id !== current?.video_id) return null;
                const position = player.getCurrentTime();
                const duration = player.getDuration();
                const rate = player.getPlaybackRate?.() || 1;
                if (!Number.isFinite(position) || position < 0 || !Number.isFinite(rate) || rate <= 0) return null;
                return { position, duration, rate, state: player.getPlayerState(), time: now() };
            } catch (error) { return null; }
        }

        function checkpoint(force = false) {
            if (!current || !ownsPlayer()) return;
            const saved = read(activeKey);
            if (validState(saved) && saved.event_id === current.event_id) {
                if (saved.qualified && !current.qualified) current.played_at = saved.played_at;
                current.seconds = Math.max(current.seconds, saved.seconds);
                current.qualified = !!(current.qualified || saved.qualified);
                current.ended = !!(current.ended || saved.ended);
                current.played_at = current.played_at || saved.played_at;
                current.started_at = current.started_at || saved.started_at || saved.played_at;
            }
            // A late event from the old iframe must not overwrite its successor.
            if (force || !saved || saved.event_id === current.event_id) {
                queueCurrent();
                write(activeKey, current);
            }
            lastCheckpoint = now();
        }

        function queueCurrent() {
            const seconds = Math.round(current.seconds * 1000) / 1000;
            if (seconds <= 0 && !current.qualified) return;
            current.started_at = current.started_at || current.played_at || new Date().toISOString();
            const play = {
                event_id: current.event_id, item_id: current.item_id, video_id: current.video_id,
                played_at: current.played_at || current.started_at,
                listened_seconds: seconds, qualified: !!current.qualified,
            };
            const key = queuePrefix + play.event_id;
            const pending = read(key);
            if (validPlay(pending)) {
                if (pending.item_id !== play.item_id || pending.video_id !== play.video_id) return;
                play.listened_seconds = Math.max(play.listened_seconds, pending.listened_seconds || 0);
                if (pending.qualified !== false) {
                    play.qualified = true;
                    play.played_at = pending.played_at;
                }
            }
            // Keep cumulative values under one UUID through navigation, retries
            // and player transfers, rather than inserting a new row per sample.
            current.seconds = Math.max(current.seconds, play.listened_seconds);
            current.qualified = play.qualified;
            if (play.qualified) current.played_at = play.played_at;
            write(key, play);
        }

        function stopTimer() {
            if (timer !== null) window.clearInterval(timer);
            timer = null;
        }

        function sample(allowStopped = false) {
            if (!current || !playing || !ownsPlayer()) return;
            const data = playerData();
            if (!data || (!allowStopped && data.state !== 1)) {
                previousSample = null;
                return;
            }
            if (previousSample) {
                const elapsed = Math.max(0, (data.time - previousSample.time) / 1000);
                const advanced = Math.max(0, (data.position - previousSample.position) / data.rate);
                // A seek cannot manufacture listening time. A delayed browser
                // timer can still count real playback that happened meanwhile.
                current.seconds = Math.min(maximumSeconds, current.seconds + Math.min(elapsed, advanced));
            }
            previousSample = data;
            const duration = Number.isFinite(data.duration) && data.duration > 0 ? data.duration : null;
            const threshold = duration === null ? 60 : Math.min(60, duration / 2);
            if (!current.qualified && current.seconds >= threshold) {
                current.played_at = current.played_at || new Date().toISOString();
                current.qualified = true;
                checkpoint();
            } else if (data.time - lastCheckpoint >= 5000) {
                checkpoint();
            }
        }

        function suspend() {
            sample(true);
            playing = false;
            previousSample = null;
            stopTimer();
            checkpoint();
        }

        function flushPending() {
            if (flushing) return flushing;
            let token;
            try { token = getCookie('csrftoken'); }
            catch (error) { return Promise.resolve(); }
            const pending = pendingPlays();
            if (!token || !pending.length) return Promise.resolve();
            flushing = (async () => {
                // Snapshot the queue at this explicit start/close. Plays that
                // qualify later wait for the next start/close, not this request.
                for (let offset = 0; offset < pending.length; offset += 100) {
                    const batch = pending.slice(offset, offset + 100);
                    try {
                        const response = await window.fetch('/api/music/plays/', {
                            method: 'POST', credentials: 'same-origin', keepalive: true,
                            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token },
                            body: JSON.stringify({ plays: batch }),
                        });
                        if (!response.ok) break;
                        const result = await response.json();
                        if (!result.success || !Array.isArray(result.acknowledged)) break;
                        const acknowledged = new Set(result.acknowledged);
                        for (const play of batch) {
                            if (!acknowledged.has(play.event_id)) continue;
                            const key = queuePrefix + play.event_id;
                            const latest = read(key);
                            // Playback may continue while this batch is in flight.
                            // An acknowledgement only covers the snapshot sent.
                            if (validPlay(latest) && latest.item_id === play.item_id && latest.video_id === play.video_id
                                && latest.played_at === play.played_at
                                && (latest.qualified === false || play.qualified !== false)
                                && (latest.listened_seconds == null || (play.listened_seconds != null && latest.listened_seconds <= play.listened_seconds))) {
                                remove(key);
                            }
                        }
                        if (batch.some(play => !acknowledged.has(play.event_id))) break;
                    } catch (error) { break; }
                }
            })().finally(() => { flushing = null; });
            return flushing;
        }

        function startSession({ fresh = false } = {}) {
            const previous = read(sessionKey, 'sessionStorage');
            write(sessionKey, true, 'sessionStorage');
            if (fresh || !previous) return flushPending();
            return Promise.resolve();
        }

        function begin(videoObj, { fresh = false } = {}) {
            suspend();
            startSession();
            const itemId = Number(videoObj?.item_id);
            const videoId = videoObj?.video_id;
            if (!Number.isSafeInteger(itemId) || itemId <= 0 || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
                current = null;
                return;
            }
            const saved = restored ? current : (read(activeKey) || current);
            restored = false;
            if (!fresh && validState(saved) && !saved.ended && saved.item_id === itemId && saved.video_id === videoId) {
                current = { ...saved };
            } else {
                current = { event_id: eventId(), item_id: itemId, video_id: videoId, seconds: 0, qualified: false, ended: false, started_at: null };
            }
            checkpoint(true);
        }

        function restore(state) {
            suspend();
            current = validState(state) ? { ...state } : null;
            restored = !!current;
            // Transferring an existing session is not a fresh start/queue flush.
            if (current) write(sessionKey, true, 'sessionStorage');
            checkpoint(true);
        }

        function stateChange(state) {
            if (!current || !ownsPlayer()) return;
            if (state === 1) {
                if (current.ended) begin({ item_id: current.item_id, video_id: current.video_id }, { fresh: true });
                current.started_at = current.started_at || current.played_at || new Date().toISOString();
                if (playing) sample();
                playing = true;
                previousSample = playerData();
                if (timer === null) timer = window.setInterval(sample, 1000);
            } else {
                sample(true);
                playing = false;
                previousSample = null;
                stopTimer();
                if (state === 0) current.ended = true;
                checkpoint();
            }
        }

        function snapshot() {
            sample(true);
            checkpoint();
            return current ? { ...current } : null;
        }

        function close() {
            suspend();
            const saved = read(activeKey);
            if (current && ownsPlayer() && saved?.event_id === current.event_id) remove(activeKey);
            current = null;
            remove(sessionKey, 'sessionStorage');
            return flushPending();
        }

        return { startSession, begin, restore, stateChange, snapshot, suspend, close, flushPending };
    };
})();

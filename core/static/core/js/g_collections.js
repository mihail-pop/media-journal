// Shared request/error handling for the two collection pages.
window.collectionUI = (() => {
    async function request(url, options = {}) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || data.success === false) {
            throw new Error(data?.error || 'The request could not be completed. Please try again.');
        }
        return data;
    }

    function notify(message) {
        document.querySelector('.collection-feedback')?.remove();
        const notice = document.createElement('div');
        notice.className = 'collection-feedback';
        notice.setAttribute('role', 'alert');
        notice.textContent = message;
        document.body.appendChild(notice);
        setTimeout(() => notice.remove(), 5000);
    }

    function orderSaver(url, onError, orderField = 'order') {
        let pending = null;
        let running = null;
        return {
            save(order) {
                pending = order;
                if (!running) {
                    running = (async () => {
                        // Keep only the newest waiting order; never send overlapping saves.
                        while (pending) {
                            const next = pending;
                            pending = null;
                            await request(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                                body: JSON.stringify({ [orderField]: next }),
                            });
                        }
                    })().catch(error => {
                        pending = null;
                        onError(error);
                    }).finally(() => { running = null; });
                }
                return running;
            },
            flush() { return running || Promise.resolve(); },
        };
    }

    function getCookie(name) {
        const prefix = `${name}=`;
        const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
        return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
    }

    return { request, notify, orderSaver, getCookie };
})();

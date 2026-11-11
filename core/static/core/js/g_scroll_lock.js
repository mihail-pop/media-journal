// Shared modal scroll locking. Leave the root scrollbar track in place.
(() => {
  const owners = new Set();
  let position = null;

  window.modalScrollLock = {
    lock(owner) {
      if (owners.has(owner)) return;
      if (!owners.size) {
        position = { x: window.scrollX, y: window.scrollY };
        document.body.style.setProperty('--modal-scroll-top', `${-position.y}px`);
        document.body.style.setProperty('--modal-scroll-left', `${-position.x}px`);
        document.documentElement.classList.add('modal-scroll-locked');
        document.body.classList.add('modal-scroll-locked');
      }
      owners.add(owner);
    },
    unlock(owner) {
      if (!owners.delete(owner) || owners.size) return;
      document.documentElement.classList.remove('modal-scroll-locked');
      document.body.classList.remove('modal-scroll-locked');
      document.body.style.removeProperty('--modal-scroll-top');
      document.body.style.removeProperty('--modal-scroll-left');
      window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
      position = null;
    },
  };
})();

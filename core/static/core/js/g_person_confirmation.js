// Shared destructive confirmation for people and characters on both pages.
(() => {
  let open = false;

  window.confirmPersonRemoval = (personType, remove) => {
    if (open) return Promise.resolve(false);
    open = true;
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const panel = document.createElement('section');
      panel.className = 'screenshot-delete-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-labelledby', 'person-delete-title');
      panel.setAttribute('aria-describedby', 'person-delete-message');
      panel.innerHTML = '<h3 id="person-delete-title">Are you sure?</h3>' +
        '<p id="person-delete-message" aria-live="polite"></p>' +
        '<div class="screenshot-delete-actions"><button type="button">Cancel</button>' +
        '<button type="button" class="screenshot-delete-confirm">Delete</button></div>';
      const message = panel.querySelector('p');
      message.textContent = `This will delete this ${personType === 'character' ? 'character' : 'person'}. It cannot be undone.`;
      const [cancel, confirm] = panel.querySelectorAll('button');
      let busy = false;

      function close(removed) {
        if (busy) return;
        panel.remove();
        document.removeEventListener('keydown', onKeyDown, true);
        window.modalScrollLock.unlock('person-unfavorite');
        open = false;
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        resolve(removed);
      }

      function onKeyDown(event) {
        event.stopImmediatePropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          close(false);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          if (!busy) (document.activeElement === cancel ? confirm : cancel).focus();
        }
      }

      cancel.addEventListener('click', () => close(false));
      confirm.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        cancel.disabled = confirm.disabled = true;
        confirm.textContent = 'Deleting…';
        try {
          await remove();
          busy = false;
          close(true);
        } catch (error) {
          message.textContent = error.message || 'Unable to delete. Please try again.';
          busy = false;
          cancel.disabled = confirm.disabled = false;
          confirm.textContent = 'Delete';
        }
      });
      document.body.appendChild(panel);
      window.modalScrollLock.lock('person-unfavorite');
      document.addEventListener('keydown', onKeyDown, true);
      cancel.focus({ preventScroll: true });
    });
  };
})();

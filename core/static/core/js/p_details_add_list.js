// Shared add button and initial-status menu for media and TV-season details.
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (sessionStorage.getItem('openEditModal')) {
      sessionStorage.removeItem('openEditModal');
      document.getElementById('edit-button')?.click();
    }
  } catch (error) { /* Adding still works without browser storage. */ }

  const control = document.querySelector('.add-list-control');
  if (!control) return;
  const addButton = control.querySelector('#add-to-list-button, #add-season-to-list-button');
  const select = control.querySelector('.add-list-status-select');
  const toggle = control.querySelector('.add-list-toggle');
  const menu = control.querySelector('.add-list-options');
  const options = [...menu.querySelectorAll('button[data-status]')];
  const buttons = [addButton, toggle, ...options];
  const canHover = () => window.matchMedia('(hover: hover)').matches;
  let saving = false;

  function setOpen(open) {
    open = open && !saving;
    menu.hidden = !open;
    select.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  select.addEventListener('mouseenter', () => { if (canHover()) setOpen(true); });
  select.addEventListener('mouseleave', () => { if (canHover()) setOpen(false); });
  toggle.addEventListener('click', event => {
    setOpen(event.detail > 0 && canHover() ? true : menu.hidden);
  });
  toggle.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      options[event.key === 'ArrowDown' ? 0 : options.length - 1].focus();
    }
  });
  menu.addEventListener('keydown', event => {
    const index = options.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      options[next].focus();
    }
  });
  select.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      toggle.focus();
    }
  });
  select.addEventListener('focusout', event => {
    if (!select.contains(event.relatedTarget)) setOpen(false);
  });
  document.addEventListener('pointerdown', event => {
    if (!select.contains(event.target)) setOpen(false);
  });

  async function addItem(status) {
    if (saving) return;
    saving = true;
    setOpen(false);
    buttons.forEach(button => { button.disabled = true; });
    const notification = showNotification('Adding to your list...', 'warning');
    const data = addButton.id === 'add-season-to-list-button' ? {
      tmdb_id: Number(addButton.dataset.tmdbId),
      season_number: Number(addButton.dataset.seasonNumber),
      status,
    } : {
      source: addButton.dataset.source,
      source_id: addButton.dataset.sourceId,
      media_type: addButton.dataset.mediaType,
      title: addButton.dataset.title,
      cover_url: addButton.dataset.coverUrl,
      status,
    };
    try {
      const response = await fetch(control.dataset.addUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok || result.error || !(result.message || result.success)) {
        throw new Error(result.error || 'Failed to add item.');
      }
      try {
        if (status === 'planned') sessionStorage.setItem('openEditModal', 'true');
        sessionStorage.setItem('refreshSuccess', '1');
      } catch (error) { /* The item is saved even if storage is unavailable. */ }
      location.reload();
    } catch (error) {
      saving = false;
      buttons.forEach(button => { button.disabled = false; });
      notification?.remove();
      alert(error.message || 'Failed to add item.');
    }
  }

  addButton.addEventListener('click', () => addItem('planned'));
  options.forEach(option => option.addEventListener('click', () => addItem(option.dataset.status)));
});

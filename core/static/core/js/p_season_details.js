function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

// Flag to prevent multiple concurrent refresh requests
let isRefreshing = false;

  function toggleSettingsDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('settingsDropdown');
    if (!dropdown) return;
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  }

  document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('settingsDropdown');
    const cogwheel = document.querySelector('.settings-cogwheel-btn');
    if (dropdown && cogwheel && !dropdown.contains(e.target) && !cogwheel.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  function refreshItem(itemId, refreshType = 'all') {
    // Prevent multiple concurrent refresh requests
    if (isRefreshing) return;
    isRefreshing = true;
    
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.style.display = 'none';

    // Disable all refresh-related buttons
    const settingsBtn = document.querySelector('.settings-cogwheel-btn');
    const refreshBtns = document.querySelectorAll('.dropdown-item');
    if (settingsBtn) settingsBtn.disabled = true;
    refreshBtns.forEach(btn => btn.disabled = true);

    const refreshNotification = showNotification('Refreshing...', 'warning');

    fetch('/refresh-item/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken'),
      },
      body: JSON.stringify({ id: itemId, refresh_type: refreshType }),
    })
      .then(res => ApiFeedback.readResponse(res, 'tmdb'))
      .then(() => {
        if (refreshType === 'all' || refreshType === 'data') window.DetailsSections?.invalidate();
        sessionStorage.setItem('refreshSuccess', '1');
        setTimeout(() => window.location.reload(true));
      })
      .catch((error) => {
        // Re-enable buttons if request fails
        isRefreshing = false;
        if (settingsBtn) settingsBtn.disabled = false;
        refreshBtns.forEach(btn => btn.disabled = false);
        refreshNotification?.remove();
        ApiFeedback.notify(error, 'tmdb');
      });
  }

function openBannerUpload(source, id) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg,.jpeg,.png,.webp,.gif";
  input.style.display = "none";

  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("banner", file);
    formData.append("source", source);
    formData.append("id", id);

      const mediaType = document.body.dataset.mediaType;
      if (mediaType) formData.append('media_type', mediaType);

      showNotification('Uploading banner...', 'warning');

      fetch('/upload-banner/', {
        method: 'POST',
        headers: {
          'X-CSRFToken': getCookie('csrftoken'),
        },
        body: formData,
      })
        .then((res) => res.json())
        .then((data) => {
          const banner = document.querySelector('.banner-section');
          if (data.success && data.url) {
            window.location.reload(true);
            if (banner) banner.style.backgroundImage = `url("${data.url}")`;
            sessionStorage.setItem('refreshSuccess', '1');
          } else {
            showNotification('Banner upload failed.', 'warning');
          }
        });
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

function openCoverUpload(source, id) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg,.jpeg,.png,.webp,.gif";
  input.style.display = "none";

  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("cover", file);
    formData.append("source", source);
    formData.append("id", id);

      const mediaType = document.body.dataset.mediaType;
      if (mediaType) formData.append('media_type', mediaType);

      showNotification('Uploading cover...', 'warning');

      fetch('/upload-cover/', {
        method: 'POST',
        headers: {
          'X-CSRFToken': getCookie('csrftoken'),
        },
        body: formData,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.url) {
            // If there's a poster element, update it
            const poster = document.querySelector('.poster');
            if (poster) poster.src = data.url;
            showNotification('Poster uploaded successfully.', 'success');
          } else {
            showNotification('Poster upload failed.', 'warning');
          }
        });
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

function showNotification(message, type) {
  // Remove any existing notification first
  const existingNotification = document.querySelector('[data-notification="true"]');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.setAttribute('data-notification', 'true');
  const isMobile = window.matchMedia("(orientation: portrait)").matches;
  const bgColor = type === "warning" ? "#FF9800" : "#4CAF50";
  notification.style.cssText = `
    position: fixed;
    top: ${isMobile ? '5rem' : '4rem'};
    left: 50%;
    transform: translateX(-50%);
    background: ${bgColor};
    color: white;
    padding: ${isMobile ? '20px 40px' : '12px 24px'};
    border-radius: ${isMobile ? '12px' : '6px'};
    z-index: 9999;
    font-weight: 500;
    font-size: ${isMobile ? '2.5rem' : '1rem'};
    width: ${isMobile ? '90%' : 'auto'};
    max-width: ${isMobile ? '90%' : 'auto'};
    text-align: center;
    box-sizing: border-box;
  `;
  document.body.appendChild(notification);
  const duration = type === "warning" ? 20000 : 2000;
  setTimeout(() => notification.remove(), duration);
  return notification;
}

document.addEventListener("DOMContentLoaded", function() {
  if (sessionStorage.getItem("refreshSuccess") === "1") {
    showNotification("Action has been done successfully!", "success");
    sessionStorage.removeItem("refreshSuccess");
  }

  // Favorite toggle functionality
  const favForm = document.getElementById("favorite-form");
  if (favForm) {
    const favInput = favForm.querySelector('input[name="favorite"]');
    const itemId = favForm.dataset.itemId;

    favInput?.addEventListener("change", function () {
      const newStatus = favInput.checked;

      fetch(`/edit-item/${itemId}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ favorite: newStatus }),
      })
        .then((res) => res.json())
        .then((res) => {
          if (!res.success) {
            alert("Failed to update favorite.");
            favInput.checked = !newStatus;
          }
        })
        .catch(() => {
          alert("Request failed.");
          favInput.checked = !newStatus;
        });
    });
  }
  
  // Keep the existing full episode layout as the default.
  const episodeList = document.querySelector('.episodes-list');
  const episodeSize = document.getElementById('episode-size-toggle');
  let episodeFrame = 0;
  function updateEpisodeExcerpts() {
    cancelAnimationFrame(episodeFrame);
    episodeFrame = requestAnimationFrame(() => {
      if (episodeList?.classList.contains('small')) return;
      document.querySelectorAll('.episode-overview-container').forEach(container => {
        if (container.dataset.expanded) return;
        const text = container.querySelector('.episode-overview');
        container.querySelector('.episode-read-more-btn').style.display = text.scrollHeight > text.clientHeight ? '' : 'none';
      });
    });
  }
  function updateEpisodeSize() {
    if (!episodeSize || !episodeList) return;
    const small = episodeList.classList.contains('small');
    episodeSize.setAttribute('aria-pressed', String(small));
    episodeSize.querySelector('path').setAttribute('d', small
      ? 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z'
      : 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z');
    updateEpisodeExcerpts();
  }
  episodeSize?.addEventListener('click', () => {
    episodeList.classList.toggle('small');
    try { localStorage.setItem('seasonEpisodeSize', episodeList.classList.contains('small') ? 'small' : 'large'); } catch (_) {}
    updateEpisodeSize();
  });
  updateEpisodeSize();
  window.addEventListener('resize', updateEpisodeExcerpts);

  // Episode read more functionality
  document.querySelectorAll('.episode-overview-container').forEach(container => {
    const overview = container.querySelector('.episode-overview');
    const btn = container.querySelector('.episode-read-more-btn');
    
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      container.dataset.expanded = 'true';
      overview.style.webkitLineClamp = 'unset';
      overview.style.overflow = 'visible';
      this.style.display = 'none';
    });
  });

  // Image modal functionality
  const imageModal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  const closeBtn = document.querySelector('.image-modal-close');
  const overlay = document.querySelector('.image-modal-overlay');

  document.querySelectorAll('.episode-image-container').forEach(container => {
    container.addEventListener('click', function() {
      const img = this.querySelector('.episode-image');
      modalImage.src = img.src;
      modalImage.alt = img.alt;
      imageModal.style.display = 'block';
    });
    container.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); container.click(); }
    });
  });

  function closeModal() {
    imageModal.style.display = 'none';
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && imageModal.style.display === 'block') {
      closeModal();
    }
  });

  // The main season link navigates directly; hovering reveals nearby seasons.
  const tabsState = JSON.parse(document.getElementById('details-tabs-state').textContent);
  const seasonTrigger = document.getElementById('season-navigation-trigger');
  const seasonMenu = document.getElementById('season-navigation-menu');
  let navigation = tabsState.season_navigation;
  let menuOpen = false;
  let closeTimer;
  let navigationRequest = null;
  const canHover = () => window.matchMedia('(hover: hover)').matches;

  function positionSeasonMenu() {
    if (seasonMenu.hidden) return;
    const trigger = seasonTrigger.getBoundingClientRect();
    const menu = seasonMenu.getBoundingClientRect();
    seasonMenu.style.left = Math.max(8, Math.min(innerWidth - menu.width - 8, trigger.left + (trigger.width - menu.width) / 2)) + 'px';
    const top = trigger.bottom + menu.height + 4 <= innerHeight ? trigger.bottom + 4 : trigger.top - menu.height - 4;
    seasonMenu.style.top = Math.max(8, top) + 'px';
  }
  function closeSeasonMenu() {
    clearTimeout(closeTimer);
    menuOpen = false;
    seasonMenu.hidden = true;
    seasonTrigger.setAttribute('aria-expanded', 'false');
  }
  function showSeasonMenu() {
    if (!menuOpen || !seasonMenu.childElementCount) return;
    seasonMenu.hidden = false;
    seasonTrigger.setAttribute('aria-expanded', 'true');
    positionSeasonMenu();
  }
  function renderNavigation(value) {
    if (!value?.known) return;
    navigation = value;
    seasonTrigger.hidden = !value.primary;
    if (!value.primary) { closeSeasonMenu(); return; }
    seasonTrigger.querySelector('.details-season-label').textContent = value.primary.label;
    seasonTrigger.href = `/tmdb/season/${tabsState.show_id}/${value.primary.number}/`;
    seasonTrigger.querySelector('.details-season-arrow').hidden = !value.options.length;
    if (value.options.length) seasonTrigger.setAttribute('aria-haspopup', 'menu');
    else seasonTrigger.removeAttribute('aria-haspopup');
    seasonMenu.replaceChildren();
    for (const entry of value.options) {
      const link = document.createElement('a');
      link.href = `/tmdb/season/${tabsState.show_id}/${entry.number}/`;
      link.textContent = entry.label;
      link.setAttribute('role', 'menuitem');
      seasonMenu.appendChild(link);
    }
    if (!value.options.length) closeSeasonMenu();
    else showSeasonMenu();
  }
  async function openSeasonMenu(focus = false) {
    clearTimeout(closeTimer);
    if (navigation?.known && !navigation.options.length) return;
    menuOpen = true;
    if (!navigation?.known) {
      try {
        navigationRequest ||= window.DetailsSections.load();
        const data = await navigationRequest;
        renderNavigation(data.season_navigation);
      } catch (error) {
        if (!menuOpen) return;
        ApiFeedback.render(seasonMenu, error, 'tmdb', { retry: () => openSeasonMenu() });
      } finally { navigationRequest = null; }
    }
    showSeasonMenu();
    if (focus && menuOpen) seasonMenu.querySelector('a')?.focus();
  }
  renderNavigation(navigation);
  document.addEventListener('details-sections-loaded', event => renderNavigation(event.detail.season_navigation));
  document.addEventListener('details-tab-change', closeSeasonMenu);
  seasonTrigger.addEventListener('mouseenter', () => { if (canHover()) openSeasonMenu(); });
  for (const surface of [seasonTrigger, seasonMenu]) {
    surface.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    surface.addEventListener('mouseleave', () => { if (canHover()) closeTimer = setTimeout(closeSeasonMenu, 140); });
    surface.addEventListener('focusout', event => {
      if (!seasonTrigger.contains(event.relatedTarget) && !seasonMenu.contains(event.relatedTarget)) closeSeasonMenu();
    });
    surface.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeSeasonMenu(); seasonTrigger.focus(); }
    });
  }
  seasonTrigger.addEventListener('click', event => {
    if (!navigation?.known || !canHover() && navigation.options.length && !menuOpen) {
      event.preventDefault();
      openSeasonMenu();
    }
  });
  seasonTrigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); openSeasonMenu(true); }
  });
  seasonMenu.addEventListener('keydown', event => {
    const links = [...seasonMenu.querySelectorAll('a')];
    const index = links.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % links.length;
    else if (event.key === 'ArrowUp') next = (index + links.length - 1) % links.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = links.length - 1;
    if (next !== undefined && links.length) { event.preventDefault(); links[next].focus(); }
  });
  document.addEventListener('pointerdown', event => {
    if (!seasonTrigger.contains(event.target) && !seasonMenu.contains(event.target)) closeSeasonMenu();
  });
  window.addEventListener('resize', positionSeasonMenu);
  window.addEventListener('scroll', positionSeasonMenu, { passive: true });
  window.addEventListener('pagehide', () => { closeSeasonMenu(); cancelAnimationFrame(episodeFrame); closeModal(); });

  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Don't trigger if user is typing in input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (e.shiftKey) {
      if (e.key === 'B' || e.key === 'b') {
        e.preventDefault();
        // Change banner - SHIFT + B
        const source = document.querySelector('[data-source]')?.dataset.source;
        const sourceId = document.body.dataset.itemId;
        if (source && sourceId) {
          openBannerUpload(source, sourceId);
        }
      } else if (e.key === 'P' || e.key === 'p') {
        e.preventDefault();
        // Change poster - SHIFT + P
        const source = document.querySelector('[data-source]')?.dataset.source;
        const sourceId = document.body.dataset.itemId;
        if (source && sourceId) {
          openCoverUpload(source, sourceId);
        }
      } else if (e.key === 'E' || e.key === 'e') {
        e.preventDefault();
        // Edit Metadata - SHIFT + E
        const editBtn = document.getElementById('edit-button');
        const itemId = editBtn?.dataset.id;
        if (itemId) {
          openMetadataModal(itemId);
        }
      } else if (e.key === 'R' || e.key === 'r') {
        e.preventDefault();
        // Refresh data - SHIFT + R
        const editBtn = document.getElementById('edit-button');
        const itemId = editBtn?.dataset.id;
        if (itemId) {
          refreshItem(itemId, 'data');
        }
      } else if (e.key === 'D' || e.key === 'd') {
        e.preventDefault();
        // Refresh data & images - SHIFT + D
        const editBtn = document.getElementById('edit-button');
        const itemId = editBtn?.dataset.id;
        if (itemId) {
          refreshItem(itemId, 'all');
        }
      }
    }
  });
});

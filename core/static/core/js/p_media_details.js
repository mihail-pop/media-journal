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

function refreshItem(sourceId, refreshType = 'all') {
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
  
  showNotification('Refreshing...', 'warning');
  
  fetch("/refresh-item/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
    body: JSON.stringify({ id: sourceId, refresh_type: refreshType }),
  })
    .then((res) => {
      sessionStorage.setItem("refreshSuccess", "1");
      setTimeout(() => window.location.reload(true));
    })
    .catch((error) => {
      // Re-enable buttons if request fails
      isRefreshing = false;
      if (settingsBtn) settingsBtn.disabled = false;
      refreshBtns.forEach(btn => btn.disabled = false);
      console.error('Refresh error:', error);
    });
}

function toggleSettingsDropdown(event) {
  event.stopPropagation();
  const dropdown = document.getElementById('settingsDropdown');
  dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('settingsDropdown');
  const cogwheel = document.querySelector('.settings-cogwheel-btn');
  if (dropdown && !dropdown.contains(e.target) && !cogwheel.contains(e.target)) {
    dropdown.style.display = 'none';
  }
})

function showNotification(message, type, duration = null) {
  const notification = document.createElement("div");
  notification.textContent = message;
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
  
  const timeoutDuration = duration !== null ? duration : (type === "warning" ? 20000 : 2000);
  if (timeoutDuration > 0) {
    setTimeout(() => notification.remove(), timeoutDuration);
  }
  return notification; // Return notification element for updates
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
    if (mediaType) formData.append("media_type", mediaType);

    fetch("/upload-banner/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.url) {
          sessionStorage.setItem("refreshSuccess", "1");
          window.location.reload(true);
        } else {
          alert(data.error || "Failed to upload banner.");
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
    if (mediaType) formData.append("media_type", mediaType);

    fetch("/upload-cover/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.url) {
          sessionStorage.setItem("refreshSuccess", "1");
          window.location.reload(true);
        } else {
          alert(data.error || "Failed to upload poster.");
        }
      });
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

const screenshotsElement = document.getElementById("screenshots-data");
const screenshotsData = screenshotsElement ? JSON.parse(screenshotsElement.textContent) : [];
let currentIndex = 0;
let autoplayInterval = null;
let autoplaySpeed = 0;
const SPEEDS = [0, 3000, 1500, 500];

let screenshotsPage = 1;
let isLoadingScreenshots = false;
let hasMoreScreenshots = true;
let screenshotsGeneration = 0;
let showFavoriteScreenshotsOnly = false;
let showScreenshotDates = false;
let isReloadingScreenshotGallery = false;
let isUpdatingScreenshotFavorite = false;

document.addEventListener("DOMContentLoaded", function () {
  const bg = document.querySelector('.screenshots-background');
  if (bg) {
    const total = parseInt(bg.dataset.totalScreenshots || 0);
    if (screenshotsData.length >= total) {
      hasMoreScreenshots = false;
    }
    
    const list = document.querySelector('.screenshots-list');
    if (list) {
      list.addEventListener('scroll', loadVisibleScreenshotPreviews);
      setupScreenshotPreviewResize(list);
    }
  }
  
  updateScreenshotFavoriteUI();

  // Hide navigation buttons if only one screenshot
  if (screenshotsData.length <= 1) {
    const rotator = document.querySelector('.screenshot-rotator');
    const overlay = document.querySelector('.screenshot-overlay');
    if (rotator) rotator.classList.add('single-screenshot');
    if (overlay) overlay.classList.add('single-screenshot');
  }
});

function createScreenshotThumbnail(shot, index) {
  const image = document.createElement('img');
  image.src = shot.url;
  image.alt = `Screenshot ${index + 1}`;
  image.className = `thumbnail${shot.is_favorite ? ' is-favorite' : ''}`;
  image.onclick = () => setScreenshot(index);
  return image;
}

function renderScreenshotThumbnails() {
  const list = document.querySelector('.screenshots-list');
  if (!list) return;
  const scrollTop = list.scrollTop;
  const fragment = document.createDocumentFragment();
  screenshotsData.forEach((shot, index) => fragment.appendChild(createScreenshotThumbnail(shot, index)));
  list.replaceChildren(fragment);
  list.scrollTop = scrollTop;
}

function positionScreenshotFavoriteOptions() {
  document.querySelectorAll('.favorite-screenshot-btn').forEach(button => {
    const viewer = button.closest('.screenshot-rotator, .screenshot-overlay');
    const bounds = button.getBoundingClientRect();
    if (!bounds.width) return;
    const parent = viewer.getBoundingClientRect();
    const options = viewer.querySelector('.screenshot-favorite-options');
    options.style.top = `${bounds.top - parent.top + bounds.height / 2}px`;
    options.style.right = `${parent.right - bounds.left}px`;
  });
}

function updateScreenshotDateUI() {
  const shot = screenshotsData[currentIndex];
  const addedDay = shot?.date_added?.slice(0, 10);
  const addedLabel = addedDay ? new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${addedDay}T12:00:00`)) : '';
  document.querySelectorAll('.screenshot-rotator, .screenshot-overlay').forEach(viewer => {
    const control = viewer.querySelector('.screenshot-date-control');
    viewer.classList.toggle('has-screenshot-date', !!addedLabel);
    viewer.classList.toggle('screenshot-date-expanded', !!addedLabel && showScreenshotDates);
    if (!control) return;
    control.hidden = !addedLabel;
    control.classList.toggle('is-expanded', showScreenshotDates);
    control.setAttribute('aria-expanded', String(showScreenshotDates));
    const label = showScreenshotDates ? `Hide screenshot date: ${addedLabel}` : 'Show screenshot date';
    control.setAttribute('aria-label', label);
    control.title = label;
    const date = control.querySelector('.screenshot-date-pill');
    date.hidden = !showScreenshotDates;
    date.textContent = addedLabel;
    date.dateTime = shot?.date_added || '';
  });
}

document.querySelectorAll('.screenshot-date-control').forEach(control => {
  control.addEventListener('click', () => {
    showScreenshotDates = !showScreenshotDates;
    updateScreenshotDateUI();
    showScreenshotControls();
  });
});

function updateScreenshotFavoriteUI() {
  const shot = screenshotsData[currentIndex];
  updateScreenshotDateUI();
  const locked = !!screenshotDeletePanel || !!screenshotSwapPanel || isDeletingScreenshot || isSwappingScreenshots || isReloadingScreenshotGallery || isUpdatingScreenshotFavorite;
  document.querySelectorAll('.favorite-screenshot-btn').forEach(button => {
    const favorite = !!shot?.is_favorite;
    button.setAttribute('aria-pressed', String(favorite));
    button.title = favorite ? 'Unfavorite screenshot' : 'Favorite screenshot';
    button.setAttribute('aria-label', button.title);
    button.disabled = locked || !shot?.id;
  });
  document.querySelectorAll('.screenshot-favorites-filter').forEach(button => {
    button.setAttribute('aria-pressed', String(showFavoriteScreenshotsOnly));
    button.title = showFavoriteScreenshotsOnly ? 'Show all screenshots' : 'Show favorite screenshots only';
    button.disabled = locked;
  });
  document.querySelectorAll('.screenshots-list .thumbnail').forEach((image, index) => {
    image.classList.toggle('is-favorite', !!screenshotsData[index]?.is_favorite);
  });
  document.querySelectorAll('.screenshot-rotator, .screenshot-overlay').forEach(viewer => {
    viewer.classList.toggle('favorites-only', showFavoriteScreenshotsOnly);
    viewer.classList.toggle('no-screenshots', !shot);
    viewer.querySelectorAll('.screenshots-empty-message').forEach(message => {
      message.hidden = !!shot;
      message.textContent = showFavoriteScreenshotsOnly ? 'No favorite screenshots yet.' : 'No screenshots available.';
    });
  });
  document.querySelectorAll('.autoplay-screenshot-btn, .download-screenshot-btn, .delete-screenshot-btn, .rotator-btn').forEach(button => {
    button.disabled = locked || !shot || (button.classList.contains('download-screenshot-btn') && isDownloadingScreenshot);
  });
  positionScreenshotFavoriteOptions();
}

function setScreenshotGalleryTotal(total) {
  const background = document.querySelector('.screenshots-background');
  if (background) background.dataset.totalScreenshots = total;
  document.querySelectorAll('.screenshot-rotator, .screenshot-overlay').forEach(viewer => {
    viewer.classList.toggle('single-screenshot', total <= 1);
  });
}

async function reloadScreenshotGallery() {
  const generation = ++screenshotsGeneration;
  const previousUrl = screenshotsData[currentIndex]?.url;
  isReloadingScreenshotGallery = true;
  updateScreenshotFavoriteUI();
  try {
    const params = new URLSearchParams({
      igdb_id: document.querySelector('.screenshots-background').dataset.igdbId,
      page: 1, favorites_only: String(showFavoriteScreenshotsOnly),
    });
    const response = await fetch(`/api/game_screenshots/?${params}`);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Could not load screenshots.');
    if (generation !== screenshotsGeneration) return false;
    screenshotsData.splice(0, screenshotsData.length, ...data.screenshots);
    screenshotsPage = 1;
    hasMoreScreenshots = data.has_more;
    setScreenshotGalleryTotal(data.total);
    currentIndex = Math.max(0, screenshotsData.findIndex(shot => shot.url === previousUrl));
    renderScreenshotThumbnails();
    if (screenshotsData.length) updateScreenshot(currentIndex, false);
    else {
      screenshotCropShape = null;
      resetScreenshotZoom();
    }
    return true;
  } catch (error) {
    const notification = showNotification('Could not load screenshots. Please try again.', 'warning');
    if (screenshotOverlay?.classList.contains('active')) screenshotOverlay.appendChild(notification);
    return false;
  } finally {
    isReloadingScreenshotGallery = false;
    updateScreenshotFavoriteUI();
    requestAnimationFrame(loadVisibleScreenshotPreviews);
  }
}

async function toggleScreenshotFavorite() {
  const shot = screenshotsData[currentIndex];
  if (!shot?.id || screenshotDeletePanel || isUpdatingScreenshotFavorite || isReloadingScreenshotGallery) return;
  stopScreenshotAutoplay();
  isUpdatingScreenshotFavorite = true;
  screenshotsGeneration++;
  updateScreenshotFavoriteUI();
  try {
    const formData = new FormData();
    formData.append('igdb_id', document.querySelector('.screenshots-background').dataset.igdbId);
    formData.append('screenshot_id', shot.id);
    formData.append('is_favorite', String(!shot.is_favorite));
    const response = await fetch('/api/favorite-game-screenshot/', {
      method: 'POST', headers: { 'X-CSRFToken': getCookie('csrftoken') }, body: formData,
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Could not save favorite.');
    shot.is_favorite = data.screenshot.is_favorite;
    if (showFavoriteScreenshotsOnly && !shot.is_favorite) {
      screenshotsData.splice(currentIndex, 1);
      currentIndex = Math.max(0, Math.min(currentIndex, screenshotsData.length - 1));
      const total = Math.max(0, Number(document.querySelector('.screenshots-background').dataset.totalScreenshots) - 1);
      setScreenshotGalleryTotal(total);
      hasMoreScreenshots = total > screenshotsData.length;
      renderScreenshotThumbnails();
      if (screenshotsData.length) updateScreenshot(currentIndex, false);
      else {
        screenshotCropShape = null;
        resetScreenshotZoom();
      }
    }
  } catch (error) {
    const notification = showNotification('Could not save screenshot favorite. Please try again.', 'warning');
    if (screenshotOverlay?.classList.contains('active')) screenshotOverlay.appendChild(notification);
  } finally {
    isUpdatingScreenshotFavorite = false;
    updateScreenshotFavoriteUI();
    showScreenshotControls();
    requestAnimationFrame(loadVisibleScreenshotPreviews);
  }
}

document.querySelectorAll('.favorite-screenshot-btn').forEach(button => {
  button.addEventListener('click', toggleScreenshotFavorite);
  const viewer = button.closest('.screenshot-rotator, .screenshot-overlay');
  const options = viewer.querySelector('.screenshot-favorite-options');
  function revealFavorites() {
    const bounds = button.getBoundingClientRect();
    const parent = viewer.getBoundingClientRect();
    options.style.top = `${bounds.top - parent.top + bounds.height / 2}px`;
    options.style.right = `${parent.right - bounds.left}px`;
    viewer.classList.add('favorite-options-open');
    showScreenshotControls();
  }
  function hideFavorites(event) {
    const target = event.relatedTarget;
    if (target && (options.contains(target) || button.contains(target))) return;
    viewer.classList.remove('favorite-options-open');
  }
  button.addEventListener('pointerenter', revealFavorites);
  button.addEventListener('pointerleave', hideFavorites);
  button.addEventListener('focus', revealFavorites);
  button.addEventListener('blur', hideFavorites);
  options.addEventListener('pointerenter', revealFavorites);
  options.addEventListener('pointerleave', hideFavorites);
  options.addEventListener('focusin', revealFavorites);
  options.addEventListener('focusout', hideFavorites);
  options.querySelector('button').addEventListener('click', async () => {
    if (screenshotDeletePanel || isUpdatingScreenshotFavorite || isReloadingScreenshotGallery) return;
    stopScreenshotAutoplay();
    const previous = showFavoriteScreenshotsOnly;
    showFavoriteScreenshotsOnly = !previous;
    const loaded = await reloadScreenshotGallery();
    if (!loaded) showFavoriteScreenshotsOnly = previous;
    updateScreenshotFavoriteUI();
    showScreenshotControls();
  });
});

function loadVisibleScreenshotPreviews() {
  const list = document.querySelector('.screenshots-list');
  if (list && list.scrollTop + list.clientHeight >= list.scrollHeight - 200) {
    loadMoreScreenshots();
  }
}

function setupScreenshotPreviewResize(list) {
  const handle = document.querySelector('.screenshots-resize-handle');
  if (!handle) return;

  let minimumHeight = null;
  let drag = null;

  function resizeTo(height) {
    if (minimumHeight === null) minimumHeight = list.getBoundingClientRect().height;
    const maximumHeight = Math.max(minimumHeight, window.innerHeight * 5);
    const nextHeight = Math.max(minimumHeight, Math.min(maximumHeight, height));
    list.classList.add('is-resized');
    list.style.maxHeight = `${maximumHeight}px`;
    list.style.height = `${nextHeight}px`;
    loadVisibleScreenshotPreviews();
  }

  function resetHeight() {
    list.classList.remove('is-resized');
    list.style.removeProperty('height');
    list.style.removeProperty('max-height');
    minimumHeight = null;
    drag = null;
  }

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = { pointerId: event.pointerId, y: event.clientY, height: list.getBoundingClientRect().height };
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    resizeTo(drag.height + event.clientY - drag.y);
  });

  handle.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    handle.releasePointerCapture(event.pointerId);
  });
  handle.addEventListener('lostpointercapture', () => { drag = null; });

  handle.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') {
      resetHeight();
    } else {
      resizeTo(list.getBoundingClientRect().height + (event.key === 'ArrowDown' ? 40 : -40));
    }
  });

  // Returning through the browser's page cache should also restore the default height.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resetHeight();
  });
}

function loadMoreScreenshots() {
  if (isLoadingScreenshots || !hasMoreScreenshots || isDeletingScreenshot || isReloadingScreenshotGallery || isUpdatingScreenshotFavorite) return;
  
  isLoadingScreenshots = true;
  const igdbId = document.querySelector('.screenshots-background').dataset.igdbId;
  const nextPage = screenshotsPage + 1;
  const generation = screenshotsGeneration;
  
  const params = new URLSearchParams({ igdb_id: igdbId, page: nextPage, offset: screenshotsData.length, favorites_only: String(showFavoriteScreenshotsOnly) });
  fetch(`/api/game_screenshots/?${params}`)
    .then(r => r.json())
    .then(data => {
      if (generation !== screenshotsGeneration) return;
      if (data.screenshots && data.screenshots.length > 0) {
        data.screenshots.forEach(s => {
          screenshotsData.push(s);
          const index = screenshotsData.length - 1;
          document.querySelector('.screenshots-list').appendChild(createScreenshotThumbnail(s, index));
        });
        screenshotsPage = nextPage;
        hasMoreScreenshots = data.has_more;
        updateScreenshotFavoriteUI();
        requestAnimationFrame(() => {
          if (document.querySelector('.screenshots-list').classList.contains('is-resized')) {
            loadVisibleScreenshotPreviews();
          }
        });
      } else {
        hasMoreScreenshots = false;
      }
    })
    .catch(error => console.error('Could not load more screenshots:', error))
    .finally(() => {
      isLoadingScreenshots = false;
      if (generation !== screenshotsGeneration && document.querySelector('.screenshots-list.is-resized')) {
        loadVisibleScreenshotPreviews();
      }
    });
}

function updateScreenshot(index, autoScroll = true) {
  if (index < 0 || index >= screenshotsData.length) return;
  
  const img = document.getElementById("screenshot-image");
  const overlayImg = document.getElementById("overlay-screenshot-image");
  img.style.opacity = 0;
  if (overlayImg) overlayImg.style.opacity = 0;

  document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
    thumb.classList.toggle('active-thumbnail', i === index);
  });

  currentIndex = index;
  img.src = screenshotsData[currentIndex].url;
  if (overlayImg) overlayImg.src = screenshotsData[currentIndex].url;
  screenshotCropShape = null;
  resetScreenshotZoom();
  img.style.opacity = 1;
  if (overlayImg) overlayImg.style.opacity = 1;
  updateScreenshotFavoriteUI();
  
  if (autoScroll) {
    const activeThumbnail = document.querySelector('.thumbnail.active-thumbnail');
    const listContainer = document.querySelector('.screenshots-list');
    if (activeThumbnail && listContainer) {
      const thumbTop = activeThumbnail.offsetTop;
      const containerScrollTop = listContainer.scrollTop;
      const containerHeight = listContainer.clientHeight;
      const thumbHeight = activeThumbnail.offsetHeight;
      
      if (thumbTop < containerScrollTop || thumbTop + thumbHeight > containerScrollTop + containerHeight) {
        const remInPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
        listContainer.scrollTop = thumbTop + thumbHeight - containerHeight + remInPx;
      }
    }
  }
}

function changeScreenshot(direction) {
  if (screenshotDeletePanel || screenshotSwapPanel || isDeletingScreenshot || isSwappingScreenshots || isReloadingScreenshotGallery || isUpdatingScreenshotFavorite || !screenshotsData.length) return;
  let newIndex = (currentIndex + direction + screenshotsData.length) % screenshotsData.length;
  
  // If we are near the end (within 5 items) and moving forward, try loading more
  if (direction > 0 && newIndex >= screenshotsData.length - 5) {
    loadMoreScreenshots();
  }
  
  updateScreenshot(newIndex);
}

function setScreenshot(index) {
  if (screenshotSwapPanel || isDeletingScreenshot || isSwappingScreenshots || isReloadingScreenshotGallery || isUpdatingScreenshotFavorite) return;
  if (screenshotDeleteMode && screenshotsData[index]) {
    const url = screenshotsData[index].url;
    if (selectedScreenshotUrls.has(url)) selectedScreenshotUrls.delete(url);
    else selectedScreenshotUrls.add(url);
    updateScreenshotDeletePanel();
    return;
  }
  if (screenshotDeletePanel) return;
  if (index >= 0 && index < screenshotsData.length) {
    updateScreenshot(index, false);
  }
}

// Fullscreen functionality
const fullscreenBtn = document.getElementById("fullscreen-screenshot-btn");
const overlayFullscreenBtn = document.getElementById("overlay-fullscreen-btn");
const screenshotOverlay = document.getElementById("screenshot-overlay");
const screenshotZoomStage = document.getElementById('screenshot-zoom-stage');
const screenshotZoomImage = document.getElementById('overlay-screenshot-image');
const screenshotZoomReset = document.getElementById('screenshot-zoom-reset');
const screenshotCropMask = document.getElementById('screenshot-crop-mask');
const screenshotCropOptions = document.getElementById('screenshot-crop-options');
let screenshotCropShape = null;
let screenshotScrollPosition = null;
const screenshotZoom = { scale: 1, x: 0, y: 0, width: 0, height: 0, pan: null };
let suppressScreenshotClick = false;
let screenshotControlsTimeout = null;
let isDownloadingScreenshot = false;

function scheduleScreenshotControlsHide(restart = false) {
  if (!screenshotOverlay) return;
  const shouldHide = !screenshotDeletePanel && screenshotOverlay.classList.contains('active') && (
    document.fullscreenElement === screenshotOverlay || screenshotZoom.scale > 1
  );
  if (!shouldHide) {
    clearTimeout(screenshotControlsTimeout);
    screenshotControlsTimeout = null;
    screenshotOverlay.classList.remove('controls-hidden');
    return;
  }
  if (!restart && (screenshotControlsTimeout !== null || screenshotOverlay.classList.contains('controls-hidden'))) return;
  clearTimeout(screenshotControlsTimeout);
  screenshotControlsTimeout = setTimeout(() => {
    screenshotControlsTimeout = null;
    screenshotOverlay.classList.add('controls-hidden');
  }, 1500);
}

function showScreenshotControls() {
  screenshotOverlay?.classList.remove('controls-hidden');
  scheduleScreenshotControlsHide(true);
}

function getScreenshotCropSize() {
  return Math.min(screenshotZoom.width, screenshotZoom.height);
}

function positionScreenshotCropOptions() {
  if (!screenshotCropOptions || !screenshotOverlay?.classList.contains('active')) return;
  const button = screenshotOverlay.querySelector('.download-screenshot-btn').getBoundingClientRect();
  const overlay = screenshotOverlay.getBoundingClientRect();
  screenshotCropOptions.style.top = `${button.top - overlay.top + button.height / 2}px`;
  screenshotCropOptions.style.right = `${overlay.right - button.left}px`;
}

function updateScreenshotCropUI() {
  const active = !!screenshotCropShape && screenshotOverlay?.classList.contains('active');
  screenshotOverlay?.classList.toggle('has-crop-shape', active);
  screenshotZoomStage?.classList.toggle('is-cropping', active);
  if (screenshotCropMask) {
    screenshotCropMask.hidden = !active;
    const size = getScreenshotCropSize();
    screenshotCropMask.style.width = `${size}px`;
    screenshotCropMask.style.height = `${size}px`;
    screenshotCropMask.classList.toggle('is-circle', screenshotCropShape === 'circle');
  }
  screenshotCropOptions?.querySelectorAll('.screenshot-crop-btn').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.shape === screenshotCropShape));
  });
  positionScreenshotCropOptions();
}

function renderScreenshotZoom() {
  if (!screenshotZoomImage || !screenshotZoomStage) return;
  const cropSize = screenshotCropShape ? getScreenshotCropSize() : null;
  const limitX = Math.max(0, (screenshotZoom.width * screenshotZoom.scale - (cropSize ?? screenshotZoom.width)) / 2);
  const limitY = Math.max(0, (screenshotZoom.height * screenshotZoom.scale - (cropSize ?? screenshotZoom.height)) / 2);
  screenshotZoom.x = Math.max(-limitX, Math.min(limitX, screenshotZoom.x));
  screenshotZoom.y = Math.max(-limitY, Math.min(limitY, screenshotZoom.y));
  screenshotZoomImage.style.transform = `translate(${screenshotZoom.x}px, ${screenshotZoom.y}px) scale(${screenshotZoom.scale})`;
  screenshotZoomStage.classList.toggle('is-zoomed', screenshotZoom.scale > 1);
  if (screenshotZoomReset) {
    screenshotZoomReset.hidden = screenshotZoom.scale === 1;
    screenshotZoomReset.textContent = `${Math.round(screenshotZoom.scale * 100)}%`;
  }
  document.querySelectorAll('.download-screenshot-btn').forEach(button => {
    const label = screenshotCropShape ? `Download ${screenshotCropShape} crop`
      : screenshotOverlay?.classList.contains('active') && screenshotZoom.scale > 1 ? 'Download visible crop' : 'Download screenshot';
    button.title = label;
    button.setAttribute('aria-label', label);
  });
  updateScreenshotCropUI();
  positionScreenshotFavoriteOptions();
  scheduleScreenshotControlsHide();
}

function resetScreenshotZoom() {
  screenshotZoom.scale = 1;
  screenshotZoom.x = 0;
  screenshotZoom.y = 0;
  screenshotZoom.pan = null;
  suppressScreenshotClick = false;
  screenshotZoomStage?.classList.remove('is-panning');
  renderScreenshotZoom();
}

function zoomScreenshotAt(clientX, clientY, scale) {
  const ratio = scale / screenshotZoom.scale;
  const bounds = screenshotZoomStage.getBoundingClientRect();
  const x = clientX - bounds.left - bounds.width / 2;
  const y = clientY - bounds.top - bounds.height / 2;
  // Keep the same point of the image beneath the pointer while scaling.
  screenshotZoom.x = x - (x - screenshotZoom.x) * ratio;
  screenshotZoom.y = y - (y - screenshotZoom.y) * ratio;
  screenshotZoom.scale = scale;
  renderScreenshotZoom();
}

function fitScreenshotToViewer() {
  if (!screenshotOverlay?.classList.contains('active') || !screenshotZoomImage?.naturalWidth || !screenshotZoomStage) return;
  const trueFullscreen = document.fullscreenElement === screenshotOverlay;
  const available = trueFullscreen ? 1 : 0.9;
  const fit = Math.min(
    screenshotZoomStage.clientWidth * available / screenshotZoomImage.naturalWidth,
    screenshotZoomStage.clientHeight * available / screenshotZoomImage.naturalHeight,
    trueFullscreen ? Infinity : 1
  );
  screenshotZoom.width = screenshotZoomImage.naturalWidth * fit;
  screenshotZoom.height = screenshotZoomImage.naturalHeight * fit;
  screenshotZoomImage.style.width = `${screenshotZoom.width}px`;
  screenshotZoomImage.style.height = `${screenshotZoom.height}px`;
  resetScreenshotZoom();
}

async function toggleTrueScreenshotFullscreen() {
  if (screenshotDeletePanel) return;
  try {
    if (document.fullscreenElement === screenshotOverlay) {
      await document.exitFullscreen();
    } else if (screenshotOverlay?.requestFullscreen) {
      await screenshotOverlay.requestFullscreen();
    }
  } catch (error) {
    console.warn('Could not toggle screenshot fullscreen:', error);
  }
}

async function setScreenshotFullscreen(open) {
  if (!screenshotOverlay || screenshotDeletePanel) return;

  if (!open && document.fullscreenElement === screenshotOverlay) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.warn('Could not exit screenshot fullscreen:', error);
    }
  }

  if (open && !screenshotScrollPosition) {
    screenshotScrollPosition = { x: window.scrollX, y: window.scrollY };
    document.body.style.setProperty('--screenshot-scroll-top', `${-screenshotScrollPosition.y}px`);
    document.body.style.setProperty('--screenshot-scroll-left', `${-screenshotScrollPosition.x}px`);
    // Fix the page in place while html keeps its existing scrollbar track.
    document.body.classList.add('screenshot-scroll-locked');
  }

  screenshotOverlay.classList.toggle('active', open);
  if (open) {
    fitScreenshotToViewer();
    showScreenshotControls();
  } else {
    screenshotCropShape = null;
    screenshotOverlay.classList.remove('crop-options-open');
    resetScreenshotZoom();
  }

  if (!open && screenshotScrollPosition) {
    const position = screenshotScrollPosition;
    document.body.classList.remove('screenshot-scroll-locked');
    document.body.style.removeProperty('--screenshot-scroll-top');
    document.body.style.removeProperty('--screenshot-scroll-left');
    screenshotScrollPosition = null;
    window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
    fullscreenBtn?.focus({ preventScroll: true });
  }
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", function() {
    setScreenshotFullscreen(true);
  });
}

if (overlayFullscreenBtn) {
  overlayFullscreenBtn.addEventListener("click", function() {
    setScreenshotFullscreen(false);
  });
}

if (screenshotOverlay) {
  screenshotOverlay.addEventListener('pointermove', showScreenshotControls);
  screenshotOverlay.addEventListener('pointerdown', showScreenshotControls);
  screenshotOverlay.addEventListener('focusin', showScreenshotControls);
  screenshotOverlay.addEventListener("click", function(e) {
    if (suppressScreenshotClick) {
      suppressScreenshotClick = false;
      return;
    }
    if (e.target === screenshotOverlay || e.target === screenshotZoomStage) {
      setScreenshotFullscreen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    const viewerOpen = screenshotOverlay.classList.contains('active');
    if (viewerOpen) showScreenshotControls();
    if (event.key === 'Escape' && viewerOpen && document.fullscreenElement !== screenshotOverlay) {
      setScreenshotFullscreen(false);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target.isContentEditable || target.closest?.('input, textarea, select, [role="textbox"], [role="slider"], [role="listbox"]')) return;
    if (screenshotDeletePanel || isDeletingScreenshot || isReloadingScreenshotGallery || isUpdatingScreenshotFavorite || screenshotsData.length < 2) return;
    const gallery = document.querySelector('.screenshots-background')?.getBoundingClientRect();
    if (!viewerOpen && (!gallery || gallery.bottom <= 0 || gallery.top >= window.innerHeight)) return;
    event.preventDefault();
    changeScreenshot(event.key === 'ArrowRight' ? 1 : -1);
  });
}

if (screenshotZoomStage && screenshotZoomImage) {
  screenshotZoomImage.addEventListener('load', fitScreenshotToViewer);
  screenshotZoomImage.addEventListener('dblclick', toggleTrueScreenshotFullscreen);
  screenshotZoomReset?.addEventListener('click', resetScreenshotZoom);
  window.addEventListener('resize', () => {
    fitScreenshotToViewer();
    positionScreenshotFavoriteOptions();
  });
  document.addEventListener('fullscreenchange', fitScreenshotToViewer);

  screenshotZoomStage.addEventListener('wheel', (event) => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? screenshotZoomStage.clientHeight : 1);
    const nextScale = Math.max(1, Math.min(8, screenshotZoom.scale * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.002)));
    zoomScreenshotAt(event.clientX, event.clientY, nextScale);
    showScreenshotControls();
  }, { passive: false });

  screenshotZoomImage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    if (screenshotZoom.scale === 1 && !screenshotCropShape) return;
    event.preventDefault();
    suppressScreenshotClick = false;
    screenshotZoom.pan = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: screenshotZoom.x, startY: screenshotZoom.y };
    screenshotZoomImage.setPointerCapture(event.pointerId);
  });

  screenshotZoomStage.addEventListener('pointermove', (event) => {
    const pan = screenshotZoom.pan;
    if (!pan || pan.id !== event.pointerId) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (Math.hypot(dx, dy) > 3) {
      suppressScreenshotClick = true;
      screenshotZoomStage.classList.add('is-panning');
    }
    screenshotZoom.x = pan.startX + dx;
    screenshotZoom.y = pan.startY + dy;
    renderScreenshotZoom();
  });

  screenshotZoomStage.addEventListener('pointerup', (event) => {
    if (screenshotZoomImage.hasPointerCapture(event.pointerId)) {
      screenshotZoomImage.releasePointerCapture(event.pointerId);
    }
  });
  screenshotZoomStage.addEventListener('lostpointercapture', () => {
    screenshotZoom.pan = null;
    screenshotZoomStage.classList.remove('is-panning');
  });
}

if (screenshotCropOptions && screenshotOverlay) {
  const downloadButton = screenshotOverlay.querySelector('.download-screenshot-btn');
  function revealCropOptions() {
    positionScreenshotCropOptions();
    screenshotOverlay.classList.add('crop-options-open');
    showScreenshotControls();
  }
  function hideCropOptions(event) {
    const target = event.relatedTarget;
    if (target && (screenshotCropOptions.contains(target) || downloadButton.contains(target))) return;
    screenshotOverlay.classList.remove('crop-options-open');
  }
  downloadButton.addEventListener('pointerenter', revealCropOptions);
  downloadButton.addEventListener('pointerleave', hideCropOptions);
  downloadButton.addEventListener('focus', revealCropOptions);
  downloadButton.addEventListener('blur', hideCropOptions);
  screenshotCropOptions.addEventListener('pointerenter', revealCropOptions);
  screenshotCropOptions.addEventListener('pointerleave', hideCropOptions);
  screenshotCropOptions.addEventListener('focusin', revealCropOptions);
  screenshotCropOptions.addEventListener('focusout', hideCropOptions);
  screenshotCropOptions.querySelectorAll('.screenshot-crop-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (screenshotDeletePanel || isDownloadingScreenshot) return;
      stopScreenshotAutoplay();
      screenshotCropShape = screenshotCropShape === button.dataset.shape ? null : button.dataset.shape;
      renderScreenshotZoom();
      showScreenshotControls();
    });
  });
}

function getVisibleScreenshotCrop() {
  if (!screenshotOverlay?.classList.contains('active') || (screenshotZoom.scale <= 1 && !screenshotCropShape)) return null;
  const image = screenshotZoomImage.getBoundingClientRect();
  const viewport = screenshotCropShape ? screenshotCropMask.getBoundingClientRect() : screenshotZoomStage.getBoundingClientRect();
  return {
    shape: screenshotCropShape,
    left: Math.max(0, (viewport.left - image.left) / image.width),
    top: Math.max(0, (viewport.top - image.top) / image.height),
    right: Math.min(1, (viewport.right - image.left) / image.width),
    bottom: Math.min(1, (viewport.bottom - image.top) / image.height),
  };
}

async function cropScreenshotBlob(blob, crop) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    let x = Math.max(0, Math.floor(crop.left * image.naturalWidth));
    let y = Math.max(0, Math.floor(crop.top * image.naturalHeight));
    let width = Math.min(image.naturalWidth, Math.ceil(crop.right * image.naturalWidth)) - x;
    let height = Math.min(image.naturalHeight, Math.ceil(crop.bottom * image.naturalHeight)) - y;
    if (crop.shape) {
      const side = Math.max(1, Math.round(Math.min(
        (crop.right - crop.left) * image.naturalWidth,
        (crop.bottom - crop.top) * image.naturalHeight,
        image.naturalWidth, image.naturalHeight
      )));
      width = height = side;
      x = Math.max(0, Math.min(image.naturalWidth - side, Math.round(crop.left * image.naturalWidth)));
      y = Math.max(0, Math.min(image.naturalHeight - side, Math.round(crop.top * image.naturalHeight)));
    }
    if (width <= 0 || height <= 0) throw new Error('No visible image area to download.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (crop.shape === 'circle') {
      context.beginPath();
      context.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2);
      context.clip();
    }
    context.drawImage(image, x, y, width, height, 0, 0, width, height);
    const result = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!result) throw new Error('Could not create the cropped screenshot.');
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function downloadScreenshot() {
  if (isDownloadingScreenshot || screenshotDeletePanel || !screenshotsData[currentIndex]) return;
  const shot = screenshotsData[currentIndex];
  const index = currentIndex;
  // Capture the view before fetching, so autoplay or further zooming cannot change the crop.
  const crop = getVisibleScreenshotCrop();
  isDownloadingScreenshot = true;
  document.querySelectorAll('.download-screenshot-btn, .screenshot-crop-btn').forEach(button => { button.disabled = true; });
  showScreenshotControls();
  try {
    const source = new URL(shot.url, window.location.href);
    const url = source.origin === window.location.origin
      ? source.href : `/api/game_screenshot_image/?${new URLSearchParams({ url: source.href })}`;
    const response = await fetch(url);
    if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) {
      throw new Error('Could not retrieve the screenshot.');
    }
    let blob = await response.blob();
    if (crop) blob = await cropScreenshotBlob(blob, crop);
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[blob.type] || 'jpg';
    const gameName = (document.querySelector('h1')?.textContent || 'Game')
      .replace(/[<>:"\/\\|?*\u0000-\u001F]/g, '-')
      .replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 180).trim() || 'Game';
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    const cropLabel = crop?.shape ? ` - ${crop.shape === 'circle' ? 'Circle' : 'Square'} Crop` : crop ? ' - Crop' : '';
    link.download = `${gameName} - Screenshot ${index + 1}${cropLabel}.${extension}`;
    link.hidden = true;
    (document.fullscreenElement || document.body).appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
  } catch (error) {
    console.error('Screenshot download failed:', error);
    const notification = showNotification('Could not download the screenshot. Please try again.', 'warning');
    if (screenshotOverlay?.classList.contains('active')) screenshotOverlay.appendChild(notification);
  } finally {
    isDownloadingScreenshot = false;
    document.querySelectorAll('.download-screenshot-btn, .screenshot-crop-btn').forEach(button => {
      button.disabled = !!screenshotDeletePanel || isDeletingScreenshot;
    });
    updateScreenshotFavoriteUI();
  }
}

document.querySelectorAll('.download-screenshot-btn').forEach(button => {
  button.addEventListener('click', downloadScreenshot);
});

let isDeletingScreenshot = false;
let isSwappingScreenshots = false;
let screenshotSwapPanel = null;
let cancelScreenshotSwap = null;
let screenshotDeletePanel = null;
let screenshotDeleteMode = false;
const selectedScreenshotUrls = new Set();
let screenshotDeleteFocus = null;

function stopScreenshotAutoplay() {
  clearInterval(autoplayInterval);
  autoplayInterval = null;
  autoplaySpeed = 0;
  document.querySelectorAll('.autoplay-screenshot-btn').forEach(button => {
    button.classList.remove('active', 'speed-2', 'speed-3');
  });
}

function updateScreenshotDeletePanel() {
  if (!screenshotDeletePanel) return;
  const count = selectedScreenshotUrls.size;
  screenshotDeletePanel.querySelector('.screenshot-delete-message').textContent = screenshotDeleteMode
    ? `${count} screenshot${count === 1 ? '' : 's'} selected. Click previews to select or deselect. This cannot be undone.`
    : 'Deleting this screenshot. It cannot be undone.';
  const confirm = screenshotDeletePanel.querySelector('.screenshot-delete-confirm');
  confirm.textContent = isDeletingScreenshot ? 'Deleting…' : screenshotDeleteMode ? 'Delete selected' : 'Yes';
  confirm.disabled = isDeletingScreenshot || count === 0;
  screenshotDeletePanel.querySelector('.screenshot-delete-more').hidden = screenshotDeleteMode || screenshotOverlay?.classList.contains('active') || !!document.fullscreenElement;
  screenshotDeletePanel.querySelectorAll('button:not(.screenshot-delete-confirm)').forEach(button => {
    button.disabled = isDeletingScreenshot;
  });
  const list = document.querySelector('.screenshots-list');
  list?.classList.toggle('is-delete-selecting', screenshotDeleteMode);
  list?.querySelectorAll('.thumbnail').forEach((thumbnail, index) => {
    thumbnail.classList.toggle('delete-selected', screenshotDeleteMode && selectedScreenshotUrls.has(screenshotsData[index]?.url));
  });
}

function setScreenshotDeleteControls(locked) {
  document.querySelectorAll('.delete-screenshot-btn, .autoplay-screenshot-btn, .download-screenshot-btn, .favorite-screenshot-btn, .screenshot-favorites-filter, .screenshot-crop-btn, .fullscreen-screenshot-btn, .rotator-btn').forEach(button => {
    button.disabled = locked || (button.matches('.download-screenshot-btn, .screenshot-crop-btn') && isDownloadingScreenshot);
  });
}

function closeScreenshotDeletePanel() {
  if (isDeletingScreenshot) return;
  screenshotDeletePanel?.remove();
  screenshotDeletePanel = null;
  screenshotDeleteMode = false;
  selectedScreenshotUrls.clear();
  document.querySelector('.screenshots-list')?.classList.remove('is-delete-selecting');
  document.querySelectorAll('.thumbnail.delete-selected').forEach(thumbnail => thumbnail.classList.remove('delete-selected'));
  setScreenshotDeleteControls(false);
  screenshotDeleteFocus?.focus({ preventScroll: true });
  screenshotDeleteFocus = null;
  updateScreenshotFavoriteUI();
  showScreenshotControls();
}

function handleDeleteScreenshot(button) {
  if (isDeletingScreenshot || isSwappingScreenshots || screenshotSwapPanel || screenshotDeletePanel || button.disabled || !screenshotsData[currentIndex]) return;
  stopScreenshotAutoplay();
  selectedScreenshotUrls.add(screenshotsData[currentIndex].url);
  screenshotDeleteFocus = button;
  screenshotDeletePanel = document.createElement('section');
  screenshotDeletePanel.className = 'screenshot-delete-panel';
  screenshotDeletePanel.setAttribute('role', 'dialog');
  screenshotDeletePanel.setAttribute('aria-labelledby', 'screenshot-delete-title');
  screenshotDeletePanel.innerHTML = `
    <h3 id="screenshot-delete-title">Are you sure?</h3>
    <p class="screenshot-delete-message" aria-live="polite"></p>
    <div class="screenshot-delete-actions">
      <button type="button" class="screenshot-delete-cancel">Cancel</button>
      <button type="button" class="screenshot-delete-more">Delete More</button>
      <button type="button" class="screenshot-delete-confirm">Yes</button>
    </div>`;
  const parent = screenshotOverlay?.classList.contains('active') ? screenshotOverlay : document.body;
  parent.appendChild(screenshotDeletePanel);
  screenshotDeletePanel.querySelector('.screenshot-delete-cancel').addEventListener('click', closeScreenshotDeletePanel);
  screenshotDeletePanel.querySelector('.screenshot-delete-more').addEventListener('click', () => {
    screenshotDeleteMode = true;
    updateScreenshotDeletePanel();
  });
  screenshotDeletePanel.querySelector('.screenshot-delete-confirm').addEventListener('click', deleteSelectedScreenshots);
  setScreenshotDeleteControls(true);
  updateScreenshotDeletePanel();
  showScreenshotControls();
  screenshotDeletePanel.querySelector('.screenshot-delete-cancel').focus({ preventScroll: true });
}

async function deleteSelectedScreenshots() {
  if (isDeletingScreenshot || selectedScreenshotUrls.size === 0) return;
  isDeletingScreenshot = true;
  screenshotsGeneration++;
  updateScreenshotDeletePanel();
  const oldLength = screenshotsData.length;
  const oldIndex = currentIndex;
  const currentUrl = screenshotsData[currentIndex]?.url;
  const count = selectedScreenshotUrls.size;
  try {
    const formData = new FormData();
    formData.append('igdb_id', document.querySelector('.screenshots-background').dataset.igdbId);
    formData.append('favorites_only', String(showFavoriteScreenshotsOnly));
    formData.append('limit', oldLength);
    selectedScreenshotUrls.forEach(url => formData.append('screenshot_urls[]', url));
    const response = await fetch('/upload-game-screenshots/', {
      method: 'POST',
      headers: { 'X-CSRFToken': getCookie('csrftoken'), 'X-Action': 'delete' },
      body: formData,
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Could not delete screenshots. Refresh the page before trying again.');

    const list = document.querySelector('.screenshots-list');
    const scrollTop = list.scrollTop;
    const updated = data.screenshots;
    setScreenshotGalleryTotal(data.total ?? updated.length);
    screenshotsData.splice(0, screenshotsData.length, ...updated.slice(0, oldLength));
    hasMoreScreenshots = data.has_more ?? updated.length > screenshotsData.length;
    screenshotsPage = Math.ceil(screenshotsData.length / 40) || 1;
    renderScreenshotThumbnails();
    list.scrollTop = scrollTop;
    const retainedIndex = screenshotsData.findIndex(shot => shot.url === currentUrl);
    currentIndex = retainedIndex >= 0 ? retainedIndex : Math.min(oldIndex, screenshotsData.length - 1);
    isDeletingScreenshot = false;
    closeScreenshotDeletePanel();
    if (screenshotsData.length === 0 && showFavoriteScreenshotsOnly) {
      currentIndex = 0;
      screenshotCropShape = null;
      resetScreenshotZoom();
      updateScreenshotFavoriteUI();
      return;
    }
    if (screenshotsData.length === 0) {
      sessionStorage.setItem('refreshSuccess', '1');
      window.location.reload();
      return;
    }
    updateScreenshot(currentIndex, false);
    if (list.classList.contains('is-resized')) requestAnimationFrame(loadVisibleScreenshotPreviews);
    const notification = showNotification(`${count} screenshot${count === 1 ? '' : 's'} deleted.`, 'success');
    if (screenshotOverlay?.classList.contains('active')) screenshotOverlay.appendChild(notification);
  } catch (error) {
    isDeletingScreenshot = false;
    updateScreenshotDeletePanel();
    if (screenshotDeletePanel) {
      screenshotDeletePanel.querySelector('.screenshot-delete-message').textContent = error.message;
    }
  } finally {
    isDeletingScreenshot = false;
  }
}

document.querySelectorAll('.delete-screenshot-btn').forEach(button => {
  button.addEventListener('click', () => handleDeleteScreenshot(button));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && (screenshotDeletePanel || screenshotSwapPanel)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (screenshotSwapPanel) cancelScreenshotSwap?.();
    else closeScreenshotDeletePanel();
  }
}, true);

// Autoplay functionality
const autoplayBtn = document.getElementById("autoplay-screenshot-btn");
const overlayAutoplayBtn = document.getElementById("overlay-autoplay-btn");

function toggleAutoplay(btn) {
  if (autoplayInterval) {
    clearInterval(autoplayInterval);
    autoplayInterval = null;
  }
  
  autoplaySpeed = (autoplaySpeed + 1) % SPEEDS.length;
  
  [autoplayBtn, overlayAutoplayBtn].forEach(b => {
    if (!b) return;
    b.classList.remove('active', 'speed-2', 'speed-3');
    if (autoplaySpeed === 1) b.classList.add('active');
    else if (autoplaySpeed === 2) b.classList.add('active', 'speed-2');
    else if (autoplaySpeed === 3) b.classList.add('active', 'speed-3');
  });
  
  if (autoplaySpeed > 0) {
    autoplayInterval = setInterval(() => {
      changeScreenshot(1);
    }, SPEEDS[autoplaySpeed]);
  }
}

if (autoplayBtn) {
  autoplayBtn.addEventListener("click", () => toggleAutoplay(autoplayBtn));
}
if (overlayAutoplayBtn) {
  overlayAutoplayBtn.addEventListener("click", () => toggleAutoplay(overlayAutoplayBtn));
}

document.addEventListener("DOMContentLoaded", function () {

  if (sessionStorage.getItem("refreshSuccess") === "1") {
    showNotification("Action has been done successfully!", "success");
    sessionStorage.removeItem("refreshSuccess");
  }

  // Check favorite status for all cast members
  const castFavorites = document.querySelectorAll('.cast-favorite');
  castFavorites.forEach(favorite => {
    const name = favorite.dataset.name;
    const type = favorite.dataset.type;
    const checkbox = favorite.querySelector('input[type="checkbox"]');
    
    fetch(`/api/check_favorite_person/?name=${encodeURIComponent(name)}&type=${type}`)
      .then(res => res.json())
      .then(result => {
        checkbox.checked = result.is_favorited;
      })
      .catch(() => {
        checkbox.checked = false;
      });
  });

  // Auto-refresh if cast exists but first member has no ID
  const mediaType = document.body.dataset.mediaType;
  const castMembers = document.querySelectorAll('.cast-member');
  
  if ((mediaType === 'anime' || mediaType === 'manga' || mediaType === 'movie' || mediaType === 'tv') && 
      castMembers.length > 0) {
    const firstMember = castMembers[0];
    const isClickable = firstMember.tagName === 'A';
    
    if (!isClickable) {
      showNotification("Automatically refreshing item to fetch actors/characters IDs", "warning");
      // Get the item_id from the refresh button or edit button
      const refreshBtn = document.querySelector('.refresh-btn');
      const editBtn = document.querySelector('#edit-button');
      const sourceId = refreshBtn ? refreshBtn.getAttribute('onclick').match(/'([^']+)'/)[1] : 
                    editBtn ? editBtn.dataset.id : null;
      
      if (sourceId) {
        refreshItem(sourceId);
        return;
      }
    }
  }

  const searchInput = document.getElementById("person-search-input");
  const searchToggleBtn = document.getElementById("search-toggle-btn");
  const resultsContainer = document.getElementById("person-search-results");

  function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      resultsContainer.innerHTML = "";
      return;
    }

    const endpoint =
      mediaType === "anime" || mediaType === "manga"
        ? "/api/character_search/"
        : "/api/actor_search/";

    fetch(`${endpoint}?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.length === 0) {
          resultsContainer.innerHTML = "<p>No results found.</p>";
          return;
        }

        // Check favorite status for each person
        const personPromises = data.map(person => {
          const type = mediaType === "anime" || mediaType === "manga" ? "character" : "actor";
          return fetch(`/api/check_favorite_person/?name=${encodeURIComponent(person.name)}&type=${type}`)
            .then(res => res.json())
            .then(result => ({ ...person, isFavorited: result.is_favorited }))
            .catch(() => ({ ...person, isFavorited: false }));
        });

        Promise.all(personPromises).then(personsWithStatus => {
          const fragment = document.createDocumentFragment();
          personsWithStatus.forEach((person) => {
            const card = document.createElement("div");
            card.className = "person-card";
            const type = mediaType === "anime" || mediaType === "manga" ? "character" : "actor";
            const personLink = person.id ? 
              (type === 'character' ? `/person/character/${person.id}/` : `/person/actor/${person.id}/`) : 
              '#';
            
            card.innerHTML = `
              ${person.id ? `<a href="${personLink}" class="person-card-link">` : ''}
                <img src="${person.image || "/static/core/img/placeholder.png"}" alt="${person.name}">
                <div class="card-title-overlay">
                  <p class="person-name">${person.name}</p>
                </div>
              ${person.id ? '</a>' : ''}
              <label class="person-favorite" data-name="${person.name}" data-img="${person.image}" data-type="${type}" data-id="${person.id || ''}">
                <input type="checkbox" ${person.isFavorited ? 'checked' : ''}>
                <span class="heart"></span>
              </label>
            `;
            fragment.appendChild(card);
          });
          resultsContainer.innerHTML = "";
          resultsContainer.appendChild(fragment);
        });
      })
      .catch(() => {
        resultsContainer.innerHTML = "<p>Error fetching data.</p>";
      });
  }

  searchToggleBtn?.addEventListener("click", function() {
    searchInput.classList.remove("hidden");
    searchInput.focus();
    searchToggleBtn.style.display = "none";
  });
  
  searchInput?.addEventListener("blur", function() {
    if (!searchInput.value.trim()) {
      searchInput.classList.add("hidden");
      searchToggleBtn.style.display = "flex";
      resultsContainer.innerHTML = "";
    }
  });
  
  searchInput?.addEventListener("keyup", (e) => {
    if (e.key === "Enter") performSearch();
    else if (e.key === "Escape") {
      searchInput.blur();
    }
  });

  resultsContainer?.addEventListener("change", function (e) {
    if (e.target.type === "checkbox" && e.target.closest(".person-favorite")) {
      const checkbox = e.target;
      const label = checkbox.closest(".person-favorite");
      const name = label.dataset.name;
      const image = label.dataset.img;
      const type = label.dataset.type;
      const personId = label.dataset.id;

      const requestData = { name, image_url: image, type };
      if (personId) {
        requestData.person_id = personId;
      }

      fetch("/api/toggle_favorite_person/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(requestData),
      })
        .then((res) => res.json())
        .then((data) => {
          // The checkbox state is already updated by the browser
          // We just need to handle any errors
          if (!data.status) {
            // Revert checkbox state on error
            checkbox.checked = !checkbox.checked;
          }
        })
        .catch(() => {
          // Revert checkbox state on error
          checkbox.checked = !checkbox.checked;
        });
    }
  });

  // Handle cast member favorites
  document.addEventListener("change", function (e) {
    if (e.target.type === "checkbox" && e.target.closest(".cast-favorite")) {
      const checkbox = e.target;
      const label = checkbox.closest(".cast-favorite");
      const name = label.dataset.name;
      const image = label.dataset.img;
      const type = label.dataset.type;
      const personId = label.dataset.id;

      const requestData = { name, image_url: image, type };
      if (personId) {
        requestData.person_id = personId;
      }

      fetch("/api/toggle_favorite_person/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(requestData),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.status) {
            checkbox.checked = !checkbox.checked;
          }
        })
        .catch(() => {
          checkbox.checked = !checkbox.checked;
        });
    }
  });


// Swap confirmation
const swapBtn = document.getElementById("swap-btn");
const uploadFileInput = document.getElementById("screenshot-file-input");

function confirmScreenshotSwap() {
  screenshotSwapPanel = document.createElement('section');
  screenshotSwapPanel.className = 'screenshot-delete-panel';
  screenshotSwapPanel.setAttribute('role', 'dialog');
  screenshotSwapPanel.setAttribute('aria-labelledby', 'screenshot-swap-title');
  screenshotSwapPanel.innerHTML = `
    <h3 id="screenshot-swap-title">Are you sure?</h3>
    <p>Replacing all existing screenshots with new images. Existing screenshots will be deleted and that cannot be undone.</p>
    <div class="screenshot-delete-actions">
      <button type="button" class="screenshot-delete-cancel">Cancel</button>
      <button type="button" class="screenshot-delete-confirm">Yes</button>
    </div>`;
  document.body.appendChild(screenshotSwapPanel);
  function finish(confirmed) {
    if (!screenshotSwapPanel) return;
    screenshotSwapPanel.remove();
    screenshotSwapPanel = null;
    cancelScreenshotSwap = null;
    swapBtn.disabled = false;
    const addButton = addForm?.querySelector('button');
    if (addButton) addButton.disabled = false;
    setScreenshotDeleteControls(false);
    updateScreenshotFavoriteUI();
    if (confirmed) {
      uploadFileInput.value = '';
      uploadFileInput.click();
    } else {
      swapBtn.focus({ preventScroll: true });
    }
  }
  cancelScreenshotSwap = () => finish(false);
  const cancel = screenshotSwapPanel.querySelector('.screenshot-delete-cancel');
  cancel.addEventListener('click', cancelScreenshotSwap);
  screenshotSwapPanel.querySelector('.screenshot-delete-confirm').addEventListener('click', () => finish(true));
  cancel.focus({ preventScroll: true });
}

swapBtn?.addEventListener('click', () => {
  if (isSwappingScreenshots || screenshotSwapPanel || screenshotDeletePanel || isUpdatingScreenshotFavorite || isReloadingScreenshotGallery) return;
  stopScreenshotAutoplay();
  swapBtn.disabled = true;
  const addButton = addForm?.querySelector('button');
  if (addButton) addButton.disabled = true;
  setScreenshotDeleteControls(true);
  confirmScreenshotSwap();
});

  // Screenshots Upload
  const uploadForm = document.getElementById("screenshot-upload-form");
  const addFileInput = document.getElementById("screenshot-add-file-input");
  const addForm = document.getElementById("screenshot-add-form");

  uploadFileInput?.addEventListener("change", async function () {
    const files = Array.from(uploadFileInput.files);
    if (!files.length || isSwappingScreenshots) return;
    if (files.some(file => !/\.(jpe?g|png)$/i.test(file.name))) {
      showNotification('Choose JPG or PNG screenshots before replacing the collection.', 'warning');
      uploadFileInput.value = '';
      return;
    }
    isSwappingScreenshots = true;
    stopScreenshotAutoplay();
    swapBtn.disabled = true;
    const addButton = addForm?.querySelector('button');
    if (addButton) addButton.disabled = true;
    setScreenshotDeleteControls(true);
    let notification = null;
    try {
      screenshotsGeneration++;
      const igdbId = uploadForm.querySelector('input[name="igdb_id"]').value;
      const BATCH_SIZE = 20;
      let uploadedFiles = 0;
      notification = showNotification(`Uploading 0/${files.length} screenshots...`, 'warning', 0);
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const formData = new FormData();
        formData.append('igdb_id', igdbId);
        batch.forEach(file => formData.append('screenshots[]', file));
        const response = await fetch('/upload-game-screenshots/', {
          method: 'POST',
          headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Action': i === 0 ? 'replace' : 'add',
          },
          body: formData,
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Upload failed');
        uploadedFiles += batch.length;
        notification.textContent = `Uploading ${uploadedFiles}/${files.length} screenshots...`;
      }
      notification.remove();
      sessionStorage.setItem('refreshSuccess', '1');
      location.reload();
    } catch (error) {
      notification?.remove();
      alert('Failed to upload screenshots: ' + error.message);
    } finally {
      isSwappingScreenshots = false;
      uploadFileInput.value = '';
      swapBtn.disabled = false;
      if (addButton) addButton.disabled = false;
      setScreenshotDeleteControls(false);
      updateScreenshotFavoriteUI();
      swapBtn.focus({ preventScroll: true });
    }
  });

  addFileInput?.addEventListener("change", async function () {
    const files = Array.from(addFileInput.files);
    if (!files.length) return;

    const igdbId = addForm.querySelector('input[name="igdb_id"]').value;
    const BATCH_SIZE = 20; // Upload 20 files at a time
    
    // Show progress notification
    const totalFiles = files.length;
    let uploadedFiles = 0;
    const notification = showNotification(`Adding 0/${totalFiles} screenshots...`, "warning", 0);
    
    try {
      // Upload in batches
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const formData = new FormData();
        formData.append("igdb_id", igdbId);
        
        for (const file of batch) {
          formData.append("screenshots[]", file);
        }
        
        const response = await fetch("/upload-game-screenshots/", {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Action": "add",
          },
          body: formData,
        });
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "Upload failed");
        }
        
        uploadedFiles += batch.length;
        notification.textContent = `Adding ${uploadedFiles}/${totalFiles} screenshots...`;
      }
      
      notification.remove();
      sessionStorage.setItem("refreshSuccess", "1");
      location.reload();
    } catch (error) {
      notification.remove();
      alert("Failed to add screenshots: " + error.message);
    }
  });

  // Add to list
  const addBtn = document.getElementById("add-to-list-button");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      showNotification("Adding to your list...", "warning");
      
      const data = {
        source: addBtn.dataset.source,
        source_id: addBtn.dataset.sourceId,
        media_type: addBtn.dataset.mediaType,
        title: addBtn.dataset.title,
        cover_url: addBtn.dataset.coverUrl,
      };
      
      fetch("/api/add_to_list/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(data),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.message) {
            sessionStorage.setItem("openEditModal", "true");
            sessionStorage.setItem("refreshSuccess", "1");
            location.reload();
          } else if (data.error) {
            alert("Error: " + data.error);
          }
        })
        .catch(() => alert("Failed to add item."));
    });
  }

  // Auto-open edit modal
  if (sessionStorage.getItem("openEditModal")) {
    sessionStorage.removeItem("openEditModal");
    const editButton = document.getElementById("edit-button");
    editButton?.click();
  }

  // Favorite toggle
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

  // Load More Cast functionality
  const loadMoreBtn = document.getElementById("load-more-cast");
  if (loadMoreBtn) {
    let isLoading = false;
    let scrollLoadingEnabled = false;
    let currentPage = parseInt(sessionStorage.getItem('castCurrentPage')) || 1;
    
    // Restore loaded cast members if returning from navigation
    const savedCastData = sessionStorage.getItem('loadedCastData');
    if (savedCastData && currentPage > 1) {
      const castData = JSON.parse(savedCastData);
      const castList = document.querySelector('.cast-list');
      const mediaType = document.body.dataset.mediaType;
      
      castData.forEach(member => {
        const castMember = document.createElement('div');
        const type = (mediaType === 'anime' || mediaType === 'manga') ? 'character' : 'actor';
        
        if (member.id && (mediaType === 'tv' || mediaType === 'movie')) {
          castMember.innerHTML = `
            <a href="/person/actor/${member.id}/" class="cast-member">
              <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                   alt="${member.name}" 
                   data-placeholder="/static/core/img/placeholder.png" 
                   onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
              <div class="card-title-overlay">
                <p class="actor-name">${member.name}</p>
                <p class="character-name">${member.character}</p>
              </div>
              <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="${type}" data-id="${member.id || ''}">
                <input type="checkbox">
                <span class="heart"></span>
              </label>
            </a>
          `;
        } else if (member.id && (mediaType === 'anime' || mediaType === 'manga')) {
          castMember.innerHTML = `
            <a href="/person/character/${member.id}/" class="cast-member">
              <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                   alt="${member.name}" 
                   data-placeholder="/static/core/img/placeholder.png" 
                   onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
              <div class="card-title-overlay">
                <p class="actor-name">${member.name}</p>
              </div>
              <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="${type}" data-id="${member.id || ''}">
                <input type="checkbox">
                <span class="heart"></span>
              </label>
            </a>
          `;
        } else {
          const nameHtml = (mediaType === 'anime' || mediaType === 'manga') ? 
            `<div class="card-title-overlay"><p class="actor-name">${member.name}</p></div>` : 
            `<div class="card-title-overlay"><p class="actor-name">${member.name}</p><p class="character-name">${member.character}</p></div>`;
          castMember.innerHTML = `
            <div class="cast-member">
              <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                   alt="${member.name}" 
                   data-placeholder="/static/core/img/placeholder.png" 
                   onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
              ${nameHtml}
              <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="${type}" data-id="">
                <input type="checkbox">
                <span class="heart"></span>
              </label>
            </div>
          `;
        }
        
        const newCastMember = castMember.firstElementChild;
        castList.appendChild(newCastMember);
        
        const favorite = newCastMember.querySelector('.cast-favorite');
        if (favorite) {
          const name = favorite.dataset.name;
          const type = favorite.dataset.type;
          const checkbox = favorite.querySelector('input[type="checkbox"]');
          
          fetch(`/api/check_favorite_person/?name=${encodeURIComponent(name)}&type=${type}`)
            .then(res => res.json())
            .then(result => {
              checkbox.checked = result.is_favorited;
            })
            .catch(() => {
              checkbox.checked = false;
            });
        }
      });
      
      loadMoreBtn.style.display = 'none';
      scrollLoadingEnabled = true;
      
      // Restore scroll position
      setTimeout(() => {
        const savedScrollY = sessionStorage.getItem('castScrollPosition');
        if (savedScrollY) {
          window.scrollTo(0, parseInt(savedScrollY));
        }
      }, 100);
    }
    
    function loadCastMembers(page) {
      if (isLoading) return;
      
      isLoading = true;
      const source = loadMoreBtn.dataset.source;
      const sourceId = loadMoreBtn.dataset.sourceId;
      const mediaType = loadMoreBtn.dataset.mediaType;
      
      fetch(`/api/load-more-cast/?source=${source}&source_id=${sourceId}&media_type=${mediaType}&page=${page}`)
        .then(res => res.json())
        .then(data => {
          if (data.cast && data.cast.length > 0) {
            const castList = document.querySelector('.cast-list');
            
            // Save loaded cast data
            const existingCastData = JSON.parse(sessionStorage.getItem('loadedCastData') || '[]');
            const allCastData = [...existingCastData, ...data.cast];
            sessionStorage.setItem('loadedCastData', JSON.stringify(allCastData));
            
            data.cast.forEach(member => {
              const castMember = document.createElement('div');
              const type = (mediaType === 'anime' || mediaType === 'manga') ? 'character' : 'actor';
              
              if (member.id && (mediaType === 'tv' || mediaType === 'movie')) {
                castMember.innerHTML = `
                  <a href="/person/actor/${member.id}/" class="cast-member">
                    <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                         alt="${member.name}" 
                         data-placeholder="/static/core/img/placeholder.png" 
                         onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                    <div class="card-title-overlay">
                      <p class="actor-name">${member.name}</p>
                      <p class="character-name">${member.character}</p>
                    </div>
                    <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="${type}" data-id="${member.id || ''}">
                      <input type="checkbox">
                      <span class="heart"></span>
                    </label>
                  </a>
                `;
              } else if (member.id && (mediaType === 'anime' || mediaType === 'manga')) {
                castMember.innerHTML = `
                  <a href="/person/character/${member.id}/" class="cast-member">
                    <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                         alt="${member.name}" 
                         data-placeholder="/static/core/img/placeholder.png" 
                         onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                    <div class="card-title-overlay">
                      <p class="actor-name">${member.name}</p>
                    </div>
                    <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="${type}" data-id="${member.id || ''}">
                      <input type="checkbox">
                      <span class="heart"></span>
                    </label>
                  </a>
                `;
              } else {
                const nameHtml = (mediaType === 'anime' || mediaType === 'manga') ? 
                  `<div class="card-title-overlay"><p class="actor-name">${member.name}</p></div>` : 
                  `<div class="card-title-overlay"><p class="actor-name">${member.name}</p><p class="character-name">${member.character}</p></div>`;
                castMember.innerHTML = `
                  <div class="cast-member">
                    <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                         alt="${member.name}" 
                         data-placeholder="/static/core/img/placeholder.png" 
                         onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                    ${nameHtml}
                    <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="${type}" data-id="">
                      <input type="checkbox">
                      <span class="heart"></span>
                    </label>
                  </div>
                `;
              }
              
              const newCastMember = castMember.firstElementChild;
              castList.appendChild(newCastMember);
              
              // Check favorite status for the new cast member
              const favorite = newCastMember.querySelector('.cast-favorite');
              if (favorite) {
                const name = favorite.dataset.name;
                const type = favorite.dataset.type;
                const checkbox = favorite.querySelector('input[type="checkbox"]');
                
                fetch(`/api/check_favorite_person/?name=${encodeURIComponent(name)}&type=${type}`)
                  .then(res => res.json())
                  .then(result => {
                    checkbox.checked = result.is_favorited;
                  })
                  .catch(() => {
                    checkbox.checked = false;
                  });
              }
            });
            
            currentPage++;
            sessionStorage.setItem('castCurrentPage', currentPage.toString());
            
            if (!data.has_more) {
              scrollLoadingEnabled = false;
              loadMoreBtn.style.display = 'none';
            }
          } else {
            scrollLoadingEnabled = false;
            loadMoreBtn.style.display = 'none';
          }
        })
        .catch(error => {
          console.error('Error loading more cast:', error);
        })
        .finally(() => {
          isLoading = false;
        });
    }
    
    loadMoreBtn.addEventListener("click", function() {
      loadCastMembers(currentPage);
      loadMoreBtn.style.display = 'none';
      scrollLoadingEnabled = true;
    });
    
    // Save scroll position and cast data when navigating away
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[href*="/person/"]');
      if (link) {
        sessionStorage.setItem('castScrollPosition', window.scrollY.toString());
      }
    });
    
    // Scroll loading
    window.addEventListener('scroll', function() {
      if (!scrollLoadingEnabled || isLoading) return;
      
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
        loadCastMembers(currentPage);
      }
    });
  }
  
  // Clear cast state when leaving the page (not to person pages)
  window.addEventListener('pagehide', function() {
    if (!document.activeElement || !document.activeElement.href || !document.activeElement.href.includes('/person/')) {
      sessionStorage.removeItem('loadedCastData');
      sessionStorage.removeItem('castCurrentPage');
      sessionStorage.removeItem('castScrollPosition');
    }
  });

  // Music section controls
  const musicAutoplayToggle = document.getElementById('music-autoplay-toggle');
  const musicHideToggle = document.getElementById('music-hide-toggle');
  const musicAddBtn = document.getElementById('music-add-btn');
  const musicAddForm = document.getElementById('music-add-form');
  const musicSaveBtn = document.getElementById('music-save-btn');
  const musicCancelBtn = document.getElementById('music-cancel-btn');
  const musicVideosContainer = document.getElementById('music-videos-container');

  function updateMusicControlVisibility() {
    if (!musicVideosContainer) return;
    const wrappers = musicVideosContainer.querySelectorAll('.music-video-wrapper');
    wrappers.forEach((wrapper, index) => {
      const upBtn = wrapper.querySelector('.music-up-btn');
      const downBtn = wrapper.querySelector('.music-down-btn');
      
      if (upBtn) {
        upBtn.style.display = index === 0 ? 'none' : '';
      }
      
      if (downBtn) {
        downBtn.style.display = index === wrappers.length - 1 ? 'none' : '';
      }
    });
  }

  updateMusicControlVisibility();

  // Load saved preferences
  if (musicAutoplayToggle) {
    const autoplayEnabled = localStorage.getItem('musicAutoplay') === 'true';
    musicAutoplayToggle.checked = autoplayEnabled;
    updateAutoplay(autoplayEnabled);

    musicAutoplayToggle.addEventListener('change', function() {
      const enabled = this.checked;
      localStorage.setItem('musicAutoplay', enabled);
      updateAutoplay(enabled);
    });
  }

  if (musicHideToggle) {
    const hideEnabled = localStorage.getItem('musicHide') === 'true';
    musicHideToggle.checked = hideEnabled;
    if (hideEnabled && musicVideosContainer) {
      musicVideosContainer.style.display = 'none';
    }

    musicHideToggle.addEventListener('change', function() {
      const enabled = this.checked;
      localStorage.setItem('musicHide', enabled);
      if (musicVideosContainer) {
        musicVideosContainer.style.display = enabled ? 'none' : '';
      }
    });
  }

  function updateAutoplay(enabled) {
    if (!musicVideosContainer) return;
    const iframes = musicVideosContainer.querySelectorAll('iframe');
    iframes.forEach((iframe, index) => {
      const src = iframe.src;
      if (index === 0) {
        if (enabled && !src.includes('autoplay=1')) {
          iframe.src = src + (src.includes('?') ? '&' : '?') + 'autoplay=1';
        } else if (!enabled && src.includes('autoplay=1')) {
          iframe.src = src.replace(/[?&]autoplay=1/, '');
        }
      }
    });
  }

  // Add video functionality
  if (musicAddBtn) {
    musicAddBtn.addEventListener('click', function() {
      musicAddForm.style.display = 'flex';
      document.getElementById('music-youtube-url').focus();
    });
  }

  if (musicCancelBtn) {
    musicCancelBtn.addEventListener('click', function() {
      musicAddForm.style.display = 'none';
      document.getElementById('music-youtube-url').value = '';
    });
  }

  if (musicSaveBtn) {
    musicSaveBtn.addEventListener('click', function() {
      const url = document.getElementById('music-youtube-url').value.trim();
      if (!url) return;

      const sourceId = document.body.dataset.sourceId;
      
      fetch('/api/add-music-video/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken'),
        },
        body: JSON.stringify({ source_id: sourceId, url: url }),
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          sessionStorage.setItem('refreshSuccess', '1');
          location.reload();
        } else {
          alert(data.error || 'Failed to add video');
        }
      })
      .catch(() => alert('Error adding video'));
    });
  }

  // Reorder and set cover functionality
  if (musicVideosContainer) {
    musicVideosContainer.addEventListener('click', function(e) {
      const sourceId = document.body.dataset.sourceId;
      
      // Set as cover
      if (e.target.classList.contains('music-cover-btn')) {
        const position = parseInt(e.target.dataset.position);
        
        fetch('/api/set-video-as-cover/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
          },
          body: JSON.stringify({ source_id: sourceId, position: position }),
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            sessionStorage.setItem('refreshSuccess', '1');
            location.reload();
          } else {
            alert(data.error || 'Failed to set poster');
          }
        })
        .catch(() => alert('Error setting poster'));
      }
      
      // Move up
      if (e.target.classList.contains('music-up-btn')) {
        const position = parseInt(e.target.dataset.position);
        if (position <= 1) return;
        
        const wrappers = Array.from(musicVideosContainer.querySelectorAll('.music-video-wrapper'));
        const currentOrder = wrappers.map(w => parseInt(w.dataset.position));
        
        // Swap positions
        const currentIdx = currentOrder.indexOf(position);
        const prevPos = currentOrder[currentIdx - 1];
        currentOrder[currentIdx] = prevPos;
        currentOrder[currentIdx - 1] = position;
        
        fetch('/api/reorder-music-videos/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
          },
          body: JSON.stringify({ source_id: sourceId, order: currentOrder }),
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            location.reload();
          } else {
            alert(data.error || 'Failed to reorder');
          }
        })
        .catch(() => alert('Error reordering'));
      }
      
      // Move down
      if (e.target.classList.contains('music-down-btn')) {
        const position = parseInt(e.target.dataset.position);
        const wrappers = Array.from(musicVideosContainer.querySelectorAll('.music-video-wrapper'));
        if (position >= wrappers.length) return;
        
        const currentOrder = wrappers.map(w => parseInt(w.dataset.position));
        
        // Swap positions
        const currentIdx = currentOrder.indexOf(position);
        const nextPos = currentOrder[currentIdx + 1];
        currentOrder[currentIdx] = nextPos;
        currentOrder[currentIdx + 1] = position;
        
        fetch('/api/reorder-music-videos/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken'),
          },
          body: JSON.stringify({ source_id: sourceId, order: currentOrder }),
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            location.reload();
          } else {
            alert(data.error || 'Failed to reorder');
          }
        })
        .catch(() => alert('Error reordering'));
      }
    });
  }
  
  let musicDeleteConfirm = false;
  let isDeletingMusic = false;
  let musicDeleteTimeout = null;

  function handleDeleteMusicVideo(btn) {
    if (isDeletingMusic || btn.disabled) return;
  
    const position = parseInt(btn.dataset.position);
    const sourceId = document.body.dataset.sourceId;
  
    if (!musicDeleteConfirm) {
      btn.classList.add('delete-confirm');
      btn.title = "Are you sure?";
      musicDeleteConfirm = true;
  
      if (musicDeleteTimeout) clearTimeout(musicDeleteTimeout);
  
      musicDeleteTimeout = setTimeout(() => {
        if (!isDeletingMusic) {
          musicDeleteConfirm = false;
          const allDeleteBtns = document.querySelectorAll(".music-delete-btn");
          allDeleteBtns.forEach(b => {
            b.classList.remove('delete-confirm');
            b.title = "Delete Video";
          });
        }
      }, 2000);
    } else {
      if (musicDeleteTimeout) {
        clearTimeout(musicDeleteTimeout);
        musicDeleteTimeout = null;
      }
      isDeletingMusic = true;
      const allDeleteBtns = document.querySelectorAll(".music-delete-btn");
      allDeleteBtns.forEach(b => {
        b.disabled = true;
        b.style.opacity = "0.5";
        b.style.cursor = "wait";
      });
  
      fetch('/api/delete-music-video/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken'),
        },
        body: JSON.stringify({ source_id: sourceId, position: position }),
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          sessionStorage.setItem('refreshSuccess', '1');
          location.reload();
        } else {
          alert(data.error || 'Failed to delete video');
          resetDeleteState();
        }
      })
      .catch(() => {
        alert('Error deleting video');
        resetDeleteState();
      });
    }
  }

  function resetDeleteState() {
    isDeletingMusic = false;
    musicDeleteConfirm = false;
    const allDeleteBtns = document.querySelectorAll(".music-delete-btn");
    allDeleteBtns.forEach(b => {
      b.disabled = false;
      b.classList.remove('delete-confirm');
      b.title = "Delete Video";
      b.style.opacity = "";
      b.style.cursor = "";
    });
  }
  
  // Delete video functionality
  if (musicVideosContainer) {
    musicVideosContainer.addEventListener('click', function(e) {
      if (e.target.classList.contains('music-delete-btn')) {
        handleDeleteMusicVideo(e.target);
      }
    });
  }

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Don't trigger if user is typing in input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if (e.shiftKey) {
    const key = e.key.toLowerCase();
    
    // Grab everything from the body dataset (the Master Record)
    const source = document.body.dataset.source;
    const sourceId = document.body.dataset.sourceId;
    const dbId = document.body.dataset.dbId;

    if (key === 'b') {
      e.preventDefault();
      // Change banner - SHIFT + B
      if (source && sourceId) {
        openBannerUpload(source, sourceId);
      }
    } else if (key === 'p') {
      e.preventDefault();
      // Change poster - SHIFT + P
      if (source && sourceId) {
        openCoverUpload(source, sourceId);
      }
    } else if (key === 'e') {
      e.preventDefault();
      // Edit Metadata - SHIFT + E
      if (dbId) {
        openMetadataModal(dbId);
      }
    } else if (key === 'r') {
      e.preventDefault();
      // Refresh data - SHIFT + R
      if (dbId && sourceId && !sourceId.startsWith('custom_')) {
        refreshItem(dbId, 'data');
      }
    } else if (key === 'd') {
      e.preventDefault();
      // Refresh data & images - SHIFT + D
      if (dbId && sourceId && !sourceId.startsWith('custom_')) {
        refreshItem(dbId, 'all');
      }
    }
  }
});
});

const moreInfoBtn = document.getElementById("more-info-btn");

if (moreInfoBtn) {
  document.getElementById("more-info-btn").addEventListener("click", async function() {
    const btn = this;
    const container = document.getElementById("extra-info-container");
    const mediaType = document.body.dataset.mediaType; // e.g., "movie", "tv", "anime"
    const sourceId = document.body.dataset.sourceId;

    const source = document.body.dataset.source || 'mal'; 

    btn.disabled = true;
    btn.textContent = "Loading...";

    try {
      let url = `/api/get-extra-info/?media_type=${mediaType}&item_id=${sourceId}&source=${source}`;
      
      // For music, add artist_id and album_id if available
      if (mediaType === 'music') {
        const artistId = document.body.dataset.artistId || '';
        const albumId = document.body.dataset.albumId || '';
        if (artistId) url += `&artist_id=${artistId}`;
        if (albumId) url += `&album_id=${albumId}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network response was not ok");

      const data = await response.json();

      // Render the data as HTML in the container (you'll write this function)
      container.innerHTML = renderExtraInfo(mediaType, data);

      btn.style.display = "none"; // Hide button after successful fetch
    } catch (error) {
      container.innerHTML = `<p style="color:red;">Failed to load extra information.</p>`;
      btn.disabled = false;
      btn.textContent = "More information";
      console.error(error);
    }
  });
}
// Helper function to render the extra info HTML per media type
function renderExtraInfo(mediaType, data) {

  if (!data) return "<p>No extra information available.</p>";

  const safeHTML = [];

  if (mediaType === "movie") {
    const runtime = data.runtime;

    if (data.vote_average !== undefined && data.vote_average !== null) {
      const score = Math.round(data.vote_average * 10) / 10;
      const percentage = (score / 10) * 100;
      safeHTML.push(`
        <div class="tmdb-score-container" style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 8px; background: rgba(245, 197, 24, 0.1); max-width: 12rem; border-radius: 8px; border-right: 4px solid #f5c518; border-left: 4px solid #f5c518;">
          <span style="font-weight: bold; color: #f5c518; font-size: 14px;">TMDB</span>
          <div style="background: #333; border-radius: 10px; width: 120px; height: 8px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #8b700d 0%, #f3ce48 50%, #f8e59e 100%); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
          </div>
          <span style="font-weight: bold; color: #f8e59e; font-size: 16px;">${score}/10</span>
        </div>
      `);
    }

    if (data.status) {
      safeHTML.push(`<p><span class="label">Status: </span> ${data.status}</p>`);
    }

    if (runtime) {
      const hours = Math.floor(runtime / 60);
      const minutes = runtime % 60;
      const runtimeFormatted = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
      safeHTML.push(`<p><span class="label">Runtime: </span> ${runtimeFormatted}</p>`);
    }



  if (data.genres?.length) {
    safeHTML.push(`<p><span class="label">Genres: </span> ${data.genres.join(", ")}</p>`);
  }

if (data.staff?.length) {
  const staffHTML = data.staff.map(s => {
    if (s.id) {
      return `<a href="/person/actor/${s.id}/" class="staff-member">${s.name} (${s.job})</a>`;
    }
    return `<span class="staff-member">${s.name} (${s.job})</span>`;
  }).join(", ");
  safeHTML.push(`<p><span class="label">Staff: </span> ${staffHTML}</p>`);
}

if (data.relations?.length) {
  const relationItems = data.relations.map(rel => {
    const year = rel.release_date ? ` (${new Date(rel.release_date).getFullYear()})` : "";
    const titleWithYear = `${rel.title}${year}`;

const coverImg = rel.poster
  ? `<div class="relation-hover-img-container">
       <img src="${rel.poster}" class="relation-hover-img" />
     </div>`
  : "";

    const linkHTML = rel.id
      ? `<a href="/tmdb/movie/${rel.id}/" target="_blank" rel="noopener">
           ${titleWithYear}
         </a>`
      : titleWithYear;

    return `<span class="relation-item">${linkHTML}${coverImg}</span>`;
  }).join(", ");

  safeHTML.push(`
    <span class="relation-list">
      <span class="label">Relations:</span> ${relationItems}
    </span>
  `);
}

if (data.trailers?.length) {
  const trailerEmbeds = data.trailers.map(trailer => {
    if (!trailer.youtube_id) return "";
    return `<iframe
              src="https://www.youtube.com/embed/${trailer.youtube_id}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`;
  }).join("");

  const container = document.getElementById("trailer-container");
  if (container) {
    const isSmall = localStorage.getItem('trailerSize') === 'small';
    container.innerHTML = `
      <div class="trailer-header">
        <h2>${data.trailers.length === 1 ? 'Trailer' : 'Trailers'}</h2>
        <button id="trailer-size-toggle" class="trailer-size-btn">Toggle Size</button>
      </div>
      <div class="trailer-grid${isSmall ? ' small' : ''}">${trailerEmbeds}</div>
    `;
    
    const toggleBtn = container.querySelector('#trailer-size-toggle');
    const grid = container.querySelector('.trailer-grid');
    toggleBtn.addEventListener('click', () => {
      grid.classList.toggle('small');
      localStorage.setItem('trailerSize', grid.classList.contains('small') ? 'small' : 'large');
    });
  }
}

// Render recommendations if available
if (data.recommendations?.length) {
  const recSection = document.querySelector('.recommendations-section');
  if (!recSection) {
    const mainSection = document.querySelector('.main-colored-section .detail-container');
    if (mainSection) {
      const recHTML = `
        <section class="recommendations-section">
          <h2>Recommendations</h2>
          <div class="recommendations-list">
            ${data.recommendations.map(rec => `
              <div class="recommendation">
                <a href="/tmdb/movie/${rec.id}/" title="${rec.title}">
                  <img src="https://image.tmdb.org/t/p/w185${rec.poster_path}" 
                       alt="${rec.title}" 
                       data-placeholder="/static/core/img/placeholder.png" 
                       onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                  <div class="card-title-overlay">
                    <p class="rec-title">${rec.title}</p>
                  </div>
                </a>
              </div>
            `).join('')}
          </div>
        </section>
      `;
      const placeholder = document.getElementById('dynamic-recommendations-placeholder');
          if (placeholder) {
            placeholder.outerHTML = recHTML;
          } else {
            mainSection.insertAdjacentHTML('beforeend', recHTML);
          }
    }
  }
}

    return safeHTML.join("\n");
  }

  if (mediaType === "tv") {

    if (data.vote_average !== undefined && data.vote_average !== null) {
      const score = Math.round(data.vote_average * 10) / 10;
      const percentage = (score / 10) * 100;
      safeHTML.push(`
        <div class="tmdb-score-container" style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 8px; background: rgba(245, 197, 24, 0.1); max-width: 12rem; border-right: 4px solid #f5c518; border-radius: 8px; border-left: 4px solid #f5c518;">
          <span style="font-weight: bold; color: #f5c518; font-size: 14px;">TMDB</span>
          <div style="background: #333; border-radius: 10px; width: 120px; height: 8px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #8b700d 0%, #f3ce48 50%, #f8e59e 100%); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
          </div>
          <span style="font-weight: bold; color: #f8e59e; font-size: 16px;">${score}/10</span>
        </div>
      `);
    }

    if (data.status) {
      safeHTML.push(`<p><span class="label">Status: </span> ${data.status}</p>`);
    }

    const parts = [];
    if (data.total_episodes) {
      const episodeWord = data.total_episodes === 1 ? 'episode' : 'episodes';
      parts.push(`${data.total_episodes} ${episodeWord}`);
    }
    if (data.episode_runtime) {
      parts.push(`${data.episode_runtime} minutes`);
    }
    
    let formatText = "";
    if (parts.length > 0) {
      formatText += ` ${parts.join(' × ')}`;
    }
    safeHTML.push(`<p><span class="label">Format: </span> ${formatText}</p>`);
    
if (data.next_episode_data && data.next_episode_data.date) {
  const dateObj = new Date(data.next_episode_data.date);
  const weekday = dateObj.toLocaleDateString("en-GB", { weekday: "long" });
  const fullDate = dateObj.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Create the season prefix if the season number exists
  let seasonPrefix = '';
  if (data.next_episode_data.season) {
    seasonPrefix = `(S${data.next_episode_data.season}) `;
  }
  
  safeHTML.push(
    `<p><span class="label">Next episode: </span> ${seasonPrefix}Episode ${data.next_episode_data.number} airs ${weekday} (${fullDate})</p>`
  );
}

if (data.last_episode_data && data.last_episode_data.date) {
  const dateObj = new Date(data.last_episode_data.date);
  const weekday = dateObj.toLocaleDateString("en-GB", { weekday: "long" });
  const fullDate = dateObj.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Create the season prefix if the season number exists
  let seasonPrefix = '';
  if (data.last_episode_data.season) {
    seasonPrefix = `(S${data.last_episode_data.season}) `;
  }
  
  safeHTML.push(
    `<p><span class="label">Last episode: </span> ${seasonPrefix}Episode ${data.last_episode_data.number} aired ${weekday} (${fullDate})</p>`
  );
}

    if (data.type) {
      safeHTML.push(`<p><span class="label">Type: </span> ${data.type}</p>`);
    }

    if (data.genres?.length) {
      safeHTML.push(`<p><span class="label">Genres:</span> ${data.genres.join(", ")}</p>`);
    }

if (data.homepage) {
  try {
    const urlObj = new URL(data.homepage);
    let hostname = urlObj.hostname.replace(/^www\./, ''); // remove 'www.'
    let label = hostname.split('.')[0]; // get the first part (e.g., sonypictures)

    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${label}</a> (${data.networks.join(", ")})</p>`
    );
  } catch (e) {
    // fallback in case URL parsing fails
    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${data.homepage}</a> (${data.networks.join(", ")})</p>`
    );
  }
}

if (data.staff?.length) {
  const staffHTML = data.staff.map(s => {
    if (s.id) {
      return `<a href="/person/actor/${s.id}/" class="staff-member">${s.name} (${s.job})</a>`;
    }
    return `<span class="staff-member">${s.name} (${s.job})</span>`;
  }).join(", ");
  safeHTML.push(`<p><span class="label">Staff: </span> ${staffHTML}</p>`);
}

if (data.trailers?.length) {
  const trailerEmbeds = data.trailers.map(trailer => {
    if (!trailer.youtube_id) return "";
    return `<iframe
              src="https://www.youtube.com/embed/${trailer.youtube_id}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`;
  }).join("");

  const container = document.getElementById("trailer-container");
  if (container) {
    const isSmall = localStorage.getItem('trailerSize') === 'small';
    container.innerHTML = `
      <div class="trailer-header">
        <h2>${data.trailers.length === 1 ? 'Trailer' : 'Trailers'}</h2>
        <button id="trailer-size-toggle" class="trailer-size-btn">Toggle Size</button>
      </div>
      <div class="trailer-grid${isSmall ? ' small' : ''}">${trailerEmbeds}</div>
    `;
    
    const toggleBtn = container.querySelector('#trailer-size-toggle');
    const grid = container.querySelector('.trailer-grid');
    toggleBtn.addEventListener('click', () => {
      grid.classList.toggle('small');
      localStorage.setItem('trailerSize', grid.classList.contains('small') ? 'small' : 'large');
    });
  }
}

// Render recommendations if available
if (data.recommendations?.length) {
  const recSection = document.querySelector('.recommendations-section');
  if (!recSection) {
    const mainSection = document.querySelector('.main-colored-section .detail-container');
    if (mainSection) {
      const recHTML = `
        <section class="recommendations-section">
          <h2>Recommendations</h2>
          <div class="recommendations-list">
            ${data.recommendations.map(rec => `
              <div class="recommendation">
                <a href="/tmdb/tv/${rec.id}/" title="${rec.title}">
                  <img src="https://image.tmdb.org/t/p/w185${rec.poster_path}" 
                       alt="${rec.title}" 
                       data-placeholder="/static/core/img/placeholder.png" 
                       onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                  <div class="card-title-overlay">
                    <p class="rec-title">${rec.title}</p>
                  </div>
                </a>
              </div>
            `).join('')}
          </div>
        </section>
      `;
      const placeholder = document.getElementById('dynamic-recommendations-placeholder');
          if (placeholder) {
            placeholder.outerHTML = recHTML;
          } else {
            mainSection.insertAdjacentHTML('beforeend', recHTML);
          }
    }
  }
}

    return safeHTML.join("\n");
  }

  if (mediaType === "anime" || mediaType === "manga") {

    if (data.averageScore) {
      const percentage = data.averageScore * 10;
      safeHTML.push(`
        <div class="anilist-score-container" style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 8px; background: rgba(2, 169, 255, 0.1); border-radius: 8px; max-width: 12rem; border-right: 4px solid #02a9ff; border-left: 4px solid #02a9ff;">
          <span style="font-weight: bold; color: #02a9ff; font-size: 14px;">AniList</span>
          <div style="background: #333; border-radius: 10px; width: 120px; height: 8px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #015d8b 0%, #02a9ff 50%, #98ddff 100%); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
          </div>
          <span style="font-weight: bold; color: #98ddff; font-size: 16px;">${data.averageScore}/10</span>
        </div>
      `);
    }

if (data.status) {
  const cleanStatus = data.status.replace(/_/g, ' ');
  const formattedStatus = cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1).toLowerCase();
  safeHTML.push(`<p><span class="label">Status:</span> ${formattedStatus}</p>`);
}

if (data.format) {
  let formatText = data.format;

  // Formats to keep as-is
  const specialFormats = ["TV", "OVA", "ONA"];
  if (specialFormats.includes(formatText)) {
    // leave as-is
  } else {
    // Replace underscores with spaces, capitalize every word
    formatText = formatText
      .toLowerCase()
      .split("_")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // Also handle MOVIE specifically if you want it as 'Movie'
  if (formatText.toLowerCase() === "movie") formatText = "Movie";

  // Add episode count and duration for anime
  if (mediaType === 'anime') {
    const parts = [];
    if (data.episodes) {
      const episodeWord = data.episodes === 1 ? 'episode' : 'episodes';
      parts.push(`${data.episodes} ${episodeWord}`);
    }
    if (data.duration) {
      parts.push(`${data.duration} minutes`);
    }
    if (parts.length > 0) {
      formatText += ` (${parts.join(' × ')})`;
    }
  }

  // Add chapter and volume count for manga
  if (mediaType === 'manga') {
    const parts = [];
    if (data.chapters) {
      const chapterWord = data.chapters === 1 ? 'chapter' : 'chapters';
      parts.push(`${data.chapters} ${chapterWord}`);
    }
    if (data.volumes) {
      const volumeWord = data.volumes === 1 ? 'volume' : 'volumes';
      parts.push(`${data.volumes} ${volumeWord}`);
    }
    if (parts.length > 0) {
      formatText += ` (${parts.join(' × ')})`;
    }
  }

  safeHTML.push(`<p><span class="label">Format:</span> ${formatText}</p>`);
}

if (data.next_airing && data.next_episode) {
  safeHTML.push(`<p><span class="label">Next episode: </span> Episode ${data.next_episode} airs ${data.next_airing}</p>`);
}

if (data.genres?.length) {
  safeHTML.push(`<p><span class="label">Genres: </span> ${data.genres.join(", ")}</p>`);
}

if (data.romaji_title) {
  safeHTML.push(`<p><span class="label">Romaji: </span> ${data.romaji_title}</p>`);
}

if (data.studios?.length) {
  safeHTML.push(`<p><span class="label">Studio:</span> ${data.studios.join(", ")}</p>`);
}

if (data.staff?.length) {
  const allowedRoles = [
    "Original Creator",
    "Original Story",
    "Original Character Design",
    "Character Design",
    "Chief Director",
    "Director",
    "Art Director",
    "Story & Art",
    "Story",
    "Art"
  ];

  const filteredStaff = data.staff.filter(s => {
    const match = s.match(/\(([^)]+)\)/); // first parentheses
    if (!match) return false;
    let role = match[1].trim();

    // remove any inner parentheses
    role = role.split("(")[0].trim();

    // exact match only
    return allowedRoles.includes(role);
  });

  if (filteredStaff.length) {
    safeHTML.push(`
      <p><span class="label">Staff:</span>
        ${filteredStaff.join(", ")}
      </p>
    `);
  }
}

if (data.external_links?.length) {
  const linkItems = data.external_links.map(link => {
    const label = link.language && link.language.toLowerCase() !== "english"
      ? `${link.site} (${link.language})`
      : link.site;
    return `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  safeHTML.push(`<p><span class="label">External Links:</span> ${linkItems.join(", ")}</p>`);
}

if (data.relations?.length) {
  const relationItems = data.relations.map(rel => {
const coverOverlay = rel.cover
  ? `<div class="relation-hover-img-container">
       <img src="${rel.cover}" class="relation-hover-img" />
       <div class="relation-hover-overlay">${rel.format ? rel.format.toLowerCase() : ""}</div>
     </div>`
  : "";


    const titleWithType = `${rel.title} (${rel.display_relation_type})`;

    const linkHTML = rel.id
      ? `<a href="/anilist/${rel.type.toLowerCase()}/${rel.id}/" target="_blank" rel="noopener">
           ${titleWithType}
         </a>`
      : titleWithType;

    return `<span class="relation-item">${linkHTML}${coverOverlay}</span>`;
  }).join(", ");

  safeHTML.push(`
    <span class="relation-list">
      <span class="label">Relations:</span> ${relationItems}
    </span>
  `);
}

if (data.trailers?.length) {
  const trailerEmbeds = data.trailers.map(trailer => {
    if (!trailer.youtube_id) return "";
    return `<iframe
              src="https://www.youtube.com/embed/${trailer.youtube_id}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`;
  }).join("");

  const container = document.getElementById("trailer-container");
  if (container) {
    const isSmall = localStorage.getItem('trailerSize') === 'small';
    container.innerHTML = `
      <div class="trailer-header">
        <h2>${data.trailers.length === 1 ? 'Trailer' : 'Trailers'}</h2>
        <button id="trailer-size-toggle" class="trailer-size-btn">Toggle Size</button>
      </div>
      <div class="trailer-grid${isSmall ? ' small' : ''}">${trailerEmbeds}</div>
    `;
    
    const toggleBtn = container.querySelector('#trailer-size-toggle');
    const grid = container.querySelector('.trailer-grid');
    toggleBtn.addEventListener('click', () => {
      grid.classList.toggle('small');
      localStorage.setItem('trailerSize', grid.classList.contains('small') ? 'small' : 'large');
    });
  }
}

    // Render recommendations if available
    if (data.recommendations?.length) {
      const apiRecSection = document.querySelector('.recommendations-section:not(.double-recs)');
      if (!apiRecSection) {
        const mainSection = document.querySelector('.main-colored-section .detail-container');
        if (mainSection) {
          const recHTML = `
            <section class="recommendations-section">
              <h2>Recommendations</h2>
              <div class="recommendations-list">
                ${data.recommendations.map(rec => `
                  <div class="recommendation">
                    <a href="/anilist/${rec.media_type || mediaType}/${rec.id}/" title="${rec.title}">
                      <img src="${rec.poster_path}" 
                           alt="${rec.title}" 
                           data-placeholder="/static/core/img/placeholder.png" 
                           onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                      <div class="card-title-overlay">
                        <p class="rec-title">${rec.title}</p>
                      </div>
                    </a>
                  </div>
                `).join('')}
              </div>
            </section>
          `;
          const placeholder = document.getElementById('dynamic-recommendations-placeholder');
          if (placeholder) {
            placeholder.outerHTML = recHTML;
          } else {
            mainSection.insertAdjacentHTML('beforeend', recHTML);
          }
        }
      }
    }    return safeHTML.join("\n");
  }

  if (mediaType === "game") {

    if (data.rating) {
      const percentage = data.rating * 10;
      safeHTML.push(`
        <div class="igdb-score-container" style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 8px; background: rgba(145, 71, 255, 0.1); border-radius: 8px; max-width: 12rem; border-right: 4px solid #9147ff; border-left: 4px solid #9147ff;">
          <span style="font-weight: bold; color: #9147ff; font-size: 14px;">IGDB</span>
          <div style="background: #333; border-radius: 10px; width: 120px; height: 8px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #4b12a0 0%, #9147ff 50%, #c9a6ff 100%); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
          </div>
          <span style="font-weight: bold; color: #c9a6ff; font-size: 16px;">${data.rating}/10</span>
        </div>
      `);
    }

    if (data.status) {
      safeHTML.push(`<p><span class="label">Status: </span> ${data.status}</p>`);
    }

    if (data.time_to_beat && Object.keys(data.time_to_beat).length > 0) {
      const ttb = data.time_to_beat;
      const parts = [];
      if (ttb.main_story) {
        const hourWord = ttb.main_story === 1 ? 'hour' : 'hours';
        parts.push(`${ttb.main_story}h (Main)`);
      }
      if (ttb.main_extras) {
        const hourWord = ttb.main_extras === 1 ? 'hour' : 'hours';
        parts.push(`${ttb.main_extras}h (+Extras)`);
      }
      if (ttb.completionist) {
        const hourWord = ttb.completionist === 1 ? 'hour' : 'hours';
        parts.push(`${ttb.completionist}h (100%)`);
      }
      if (parts.length > 0) {
        safeHTML.push(`<p><span class="label">Time to beat:</span> ${parts.join(' | ')}</p>`);
      }
    }

    if (data.genres?.length) {
      safeHTML.push(`<p><span class="label">Genres:</span> ${data.genres.join(", ")}</p>`);
    }

    if (data.involved_companies?.length) {
      const label = data.involved_companies.length === 1 ? 'Developer:' : 'Developers:';
      safeHTML.push(`<p><span class="label">${label}</span> ${data.involved_companies.join(", ")}</p>`);
    }

    if (data.platforms?.length) {
      safeHTML.push(`<p><span class="label">Platforms:</span> ${data.platforms.join(", ")}</p>`);
    }

if (data.trailers?.length) {
  const trailerEmbeds = data.trailers.map(trailer => {
    if (!trailer.youtube_id) return "";
    return `<iframe
              src="https://www.youtube.com/embed/${trailer.youtube_id}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>`;
  }).join("");

  const container = document.getElementById("trailer-container");
  if (container) {
    const isSmall = localStorage.getItem('trailerSize') === 'small';
    container.innerHTML = `
      <div class="trailer-header">
        <h2>${data.trailers.length === 1 ? 'Trailer' : 'Trailers'}</h2>
        <button id="trailer-size-toggle" class="trailer-size-btn">Toggle Size</button>
      </div>
      <div class="trailer-grid${isSmall ? ' small' : ''}">${trailerEmbeds}</div>
    `;
    
    const toggleBtn = container.querySelector('#trailer-size-toggle');
    const grid = container.querySelector('.trailer-grid');
    toggleBtn.addEventListener('click', () => {
      grid.classList.toggle('small');
      localStorage.setItem('trailerSize', grid.classList.contains('small') ? 'small' : 'large');
    });
  }
}

if (data.websites?.length) {
  const seen = new Set();

  const websiteLinks = data.websites
    .filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map(url => {
      try {
        const urlObj = new URL(url);
        const parts = urlObj.hostname.split(".");

        // Remove common subdomains like www, en, m, store, apps, etc.
        const filteredParts = parts.filter(part =>
          !["www", "en", "m", "store", "apps"].includes(part)
        );

        // Use the second-to-last part as label if domain has more than 2 parts
        let label = filteredParts.length >= 2
          ? filteredParts[filteredParts.length - 2]
          : filteredParts[0];

        // Capitalize first letter
        label = label.charAt(0).toUpperCase() + label.slice(1);

        return `<a href="${url}" target="_blank">${label}</a>`;
      } catch (e) {
        return `<a href="${url}" target="_blank">${url}</a>`;
      }
    })
    .join(", ");

  safeHTML.push(`<p><span class="label">External Links:</span> ${websiteLinks}</p>`);
}

if (data.expansions?.length) {
  const expansionItems = data.expansions.map(exp => {
    const coverOverlay = exp.cover
      ? `<div class="relation-hover-img-container"><img src="${exp.cover}" class="relation-hover-img" /></div>`
      : "";
    
    const linkHTML = exp.id
      ? `<a href="/igdb/game/${exp.id}/" target="_blank" rel="noopener noreferrer">${exp.name}</a>`
      : exp.name;
    
    return `<span class="relation-item">${linkHTML}${coverOverlay}</span>`;
  }).join(", ");
  
  safeHTML.push(`
    <span class="relation-list">
      <span class="label">Expansions:</span> ${expansionItems}
    </span>
  `);
}

if (data.dlcs?.length) {
  const dlcItems = data.dlcs.map(dlc => {
    const coverOverlay = dlc.cover
      ? `<div class="relation-hover-img-container"><img src="${dlc.cover}" class="relation-hover-img" /></div>`
      : "";
    
    const linkHTML = dlc.id
      ? `<a href="/igdb/game/${dlc.id}/" target="_blank" rel="noopener noreferrer">${dlc.name}</a>`
      : dlc.name;
    
    return `<span class="relation-item">${linkHTML}${coverOverlay}</span>`;
  }).join(", ");
  
  safeHTML.push(`
    <span class="relation-list">
      <span class="label">DLCs:</span> ${dlcItems}
    </span>
  `);
}

// Render recommendations if available
if (data.recommendations?.length) {
  const recSection = document.querySelector('.recommendations-section');
  if (!recSection) {
    const mainSection = document.querySelector('.main-colored-section .detail-container');
    if (mainSection) {
      const recHTML = `
        <section class="recommendations-section">
          <h2>Recommendations</h2>
          <div class="recommendations-list">
            ${data.recommendations.map(rec => `
              <div class="recommendation">
                <a href="/igdb/game/${rec.id}/" title="${rec.title}">
                  <img src="${rec.poster_path || '/static/core/img/placeholder.png'}" 
                       alt="${rec.title}" 
                       data-placeholder="/static/core/img/placeholder.png" 
                       onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                  <div class="card-title-overlay">
                    <p class="rec-title">${rec.title}</p>
                  </div>
                </a>
              </div>
            `).join('')}
          </div>
        </section>
      `;
      const placeholder = document.getElementById('dynamic-recommendations-placeholder');
          if (placeholder) {
            placeholder.outerHTML = recHTML;
          } else {
            mainSection.insertAdjacentHTML('beforeend', recHTML);
          }
    }
  }
}

    return safeHTML.join("\n");
  }

  if (mediaType === "music") {
    if (data.album_tracks?.length) {
      safeHTML.push(`<br><p><span class="label">Album tracks:</span></p>`);
      const trackItems = data.album_tracks.map(track => {
        const linkHTML = track.id
          ? `<a href="/musicbrainz/music/${track.id}/" target="_blank" rel="noopener noreferrer">${track.title}</a>`
          : track.title;
        return `<span class="relation-item">${linkHTML}</span>`;
      }).join(", ");
      safeHTML.push(`<span class="relation-list">${trackItems}</span><br>`);
    }

    if (data.artist_singles?.length) {
      safeHTML.push(`<p><span class="label">Artist singles:</span></p>`);
      const singleItems = data.artist_singles.map(single => {
        const date = single.date ? ` (${single.date.split('-')[0]})` : "";
        const linkHTML = single.id
          ? `<a href="/musicbrainz/music/${single.id}/" target="_blank" rel="noopener noreferrer">${single.title}${date}</a>`
          : `${single.title}${date}`;
        return `<span class="relation-item">${linkHTML}</span>`;
      }).join(", ");
      safeHTML.push(`<span class="relation-list">${singleItems}</span>`);
    }

    return safeHTML.join("\n");
  }

  return "<p>No extra information available for this media type.</p>";
}
// Overview read more functionality
document.addEventListener("DOMContentLoaded", function() {
  document.querySelectorAll('.overview-container').forEach(container => {
    const overview = container.querySelector('.overview');
    const btn = container.querySelector('.read-more-btn');
    
    if (!overview || !btn) return;
    
    // Check if text is actually truncated
    if (overview.scrollHeight <= overview.clientHeight) {
      btn.style.display = 'none';
    } else {
      btn.style.display = 'block';
    }
    
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      overview.style.webkitLineClamp = 'unset';
      overview.style.maxHeight = 'none';
      overview.style.overflow = 'visible';
      this.style.display = 'none';
    });
  });
});

// --- JOURNAL SECTION LOGIC ---
let editingLogId = null;
let logToDelete = null;
let appRatingMode = 'faces'; // Default fallback

// Formats score identically to the lists page
function rebuildCustomSelect(select) {
    const wrapper = select.parentElement;
    if (!wrapper || !wrapper.classList.contains('d-custom-select-wrapper')) return;
    
    let optionsDiv = wrapper.querySelector('.custom-options');
    if (optionsDiv) {
        optionsDiv.remove();
    }
    
    optionsDiv = document.createElement('div');
    optionsDiv.className = 'custom-options';
    
    Array.from(select.options).forEach(option => {
        const optDiv = document.createElement('div');
        optDiv.className = 'custom-option';
        optDiv.textContent = option.textContent;
        optDiv.dataset.value = option.value;
        optDiv.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            select.value = option.value;
            select.dispatchEvent(new Event('change'));
            
            // Dynamic query to ensure we modify the *current* options div
            const currentOptions = wrapper.querySelector('.custom-options');
            if(currentOptions) currentOptions.classList.remove('open');
            
            select.blur();
        });
        optionsDiv.appendChild(optDiv);
    });
    wrapper.appendChild(optionsDiv);

    if (!select.dataset.customSelectInitialized) {
        select.dataset.customSelectInitialized = "true";
        select.addEventListener('mousedown', function(e) {
            e.preventDefault();
            const currentOptions = wrapper.querySelector('.custom-options');
            if (!currentOptions) return;
            
            const isOpen = currentOptions.classList.contains('open');
            document.querySelectorAll('.custom-options').forEach(opt => opt.classList.remove('open'));
            
            if (!isOpen && !select.disabled) {
                currentOptions.classList.add('open');
                select.focus();
            } else {
                select.blur();
            }
        });
        
        select.addEventListener('blur', function() {
            setTimeout(() => {
                const currentOptions = wrapper.querySelector('.custom-options');
                if (currentOptions) currentOptions.classList.remove('open');
            }, 150);
        });
        
        select.addEventListener('change', function() {
            select.blur();
        });
    }
}

function getRatingHtml(rating) {
  if (!rating) return '';
  const rnum = Number(rating);
  if (isNaN(rnum)) return '';

  let normalized = rnum;
  if (appRatingMode === 'stars_5') {
    normalized = (rnum > 0 && rnum <= 5) ? (rnum * 20) : rnum;
  } else if (appRatingMode === 'scale_10') {
    normalized = rnum;
  }

  const rounded = Math.round(normalized);
  
  let color = '#f5c518';
  if (rnum <= 33) color = '#ff3b38';
  else if (rnum <= 66) color = '#f5c518';
  else color = '#4CAF50';

  if (appRatingMode === 'faces') {
    if (rounded <= 33) {
      return `<span class="card-rating" style="color: ${color};"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="frown" class="svg-inline--fa fa-frown fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm-80 128c-40.2 0-78 17.7-103.8 48.6-8.5 10.2-7.1 25.3 3.1 33.8 10.2 8.4 25.3 7.1 33.8-3.1 16.6-19.9 41-31.4 66.9-31.4s50.3 11.4 66.9 31.4c8.1 9.7 23.1 11.9 33.8 3.1 10.2-8.5 11.5-23.6 3.1-33.8C326 321.7 288.2 304 248 304z"></path></svg></span>`;
    } else if (rounded <= 66) {
      return `<span class="card-rating" style="color: ${color};"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="meh" class="svg-inline--fa fa-meh fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm8 144H160c-13.2 0-24 10.8-24 24s10.8 24 24 24h176c13.2 0 24-10.8 24-24s-10.8-24-24-24z"></path></svg></span>`;
    } else {
      return `<span class="card-rating" style="color: ${color};"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="smile" class="svg-inline--fa fa-smile fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg></span>`;
    }
  } else if (appRatingMode === 'stars_5') {
    let starsCount = 0;
    if (rnum > 0 && rnum <= 5) starsCount = Math.round(rnum);
    else starsCount = Math.round(normalized / 20);
    
    let starsHtml = '<span class="card-rating"><span class="star-rating">';
    for (let i = 1; i <= 5; i++) {
      if (i <= starsCount) {
        starsHtml += '<svg class="star-icon filled" viewBox="0 0 32 32" style="color:#f5c518;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
      } else {
        starsHtml += '<svg class="star-icon empty" viewBox="0 0 32 32" style="color:#444;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
      }
    }
    starsHtml += '</span></span>';
    return starsHtml;
  } else if (appRatingMode === 'scale_10') {
    let displayVal = rnum;
    if (rnum > 10) displayVal = Math.round(rnum / 10);
    else displayVal = 1;
    return `<span class="card-rating" style="color: ${color}; font-weight: bold;"><span class="rating-number">${displayVal}</span></span>`;
  } else if (appRatingMode === 'scale_100') {
    return `<span class="card-rating" style="color: ${color}; font-weight: bold;"><span class="rating-number">${Math.round(rnum)}</span></span>`;
  }
  return '';
}

// Prepare UI and Formatting on load
document.addEventListener('DOMContentLoaded', () => {
  const dbId = document.body.dataset.dbId;

  // Ask the backend exactly what rating system we are using!
  if (dbId) {
    fetch(`/get-item/${dbId}/`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.item.rating_mode) {
          appRatingMode = data.item.rating_mode;
        }
        
        setupLogRatingUI();

        // Format existing scores NOW that we know the mode
        document.querySelectorAll('.entry-score').forEach(el => {
            const score = el.dataset.score;
            el.innerHTML = getRatingHtml(score);
            
            const pill = el.closest('.score-pill');
            if (pill && score && appRatingMode !== 'stars_5') {
                const rnum = Number(score);
                if (!isNaN(rnum)) {
                    let color = '#f5c518';
                    if (rnum <= 33) color = '#ff3b38';
                    else if (rnum <= 66) color = '#f5c518';
                    else color = '#4CAF50';
                    pill.style.color = color;
                    pill.style.borderColor = color;
                }
            } else if (pill && appRatingMode === 'stars_5') {
                pill.style.color = '#f5c518';
                pill.style.borderColor = '#f5c518';
            }
        });
      })
      .catch(err => {
        console.error("Failed to fetch rating mode:", err);
        setupLogRatingUI();
        document.querySelectorAll('.entry-score').forEach(el => {
            const score = el.dataset.score;
            el.innerHTML = getRatingHtml(score);
            
            const pill = el.closest('.score-pill');
            if (pill && score && appRatingMode !== 'stars_5') {
                const rnum = Number(score);
                if (!isNaN(rnum)) {
                    let color = '#f5c518';
                    if (rnum <= 33) color = '#ff3b38';
                    else if (rnum <= 66) color = '#f5c518';
                    else color = '#4CAF50';
                    pill.style.color = color;
                    pill.style.borderColor = color;
                }
            } else if (pill && appRatingMode === 'stars_5') {
                pill.style.color = '#f5c518';
                pill.style.borderColor = '#f5c518';
            }
        });
      });
  }

  // Setup standalone UI dropdowns instantly
  document.querySelectorAll('.d-custom-select-wrapper select').forEach(select => {
      rebuildCustomSelect(select);
  });

  // Pluralize units correctly in the log cards
  document.querySelectorAll('.unit-label').forEach(el => {
      const unit = el.dataset.unit || 'Unit';
      const hasEnd = el.dataset.end !== '';
      let displayUnit = unit.charAt(0).toUpperCase() + unit.slice(1);
      if (hasEnd && !displayUnit.endsWith('s')) displayUnit += 's';
      el.textContent = displayUnit;
  });

  // Parse and render Markdown syntax safely
  document.querySelectorAll('.formatted-content').forEach(el => {
    if (el.id === 'journal-preview') return;
    let html = el.innerHTML;
    
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
    html = html.replace(/\[center\]([\s\S]*?)\[\/center\]/g, '<div style="text-align:center;">$1</div>');
    
    // Blockquotes handling <br> breaks correctly
    const parts = html.split('<br>');
    for (let i = 0; i < parts.length; i++) {
        let trimmed = parts[i].trim();
        if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
            parts[i] = '<blockquote style="border-left:3px solid var(--special-color); margin:0; padding-left:10px; color:var(--text-secondary);">' + trimmed.replace(/^(?:&gt;|>)\s?/, '') + '</blockquote>';
        }
    }
    html = parts.join('<br>');
    
    el.innerHTML = html;
  });
});

function populateDynamicUnits() {
    const mediaType = document.body.dataset.mediaType;
    const unitSelect = document.getElementById('log-progress-unit');
    let options = [];
    
    if (mediaType === 'movie') options = ['hour', 'minute'];
    else if (mediaType === 'tv') options = ['episode', 'season'];
    else if (mediaType === 'anime') options = ['episode'];
    else if (mediaType === 'manga') options = ['chapter', 'volume'];
    else if (mediaType === 'book') options = ['page'];
    else if (mediaType === 'game') options = ['hour', 'version'];
    else if (mediaType === 'music') options = ['minute'];
    else options = ['unit'];

    unitSelect.innerHTML = '';
    options.forEach(opt => {
        unitSelect.innerHTML += `<option value="${opt}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`;
    });

    // If there is only one option, style it to look like a static label
    if (options.length === 1) {
        unitSelect.classList.add('single-unit');
        unitSelect.disabled = true;
    } else {
        unitSelect.classList.remove('single-unit');
        unitSelect.disabled = false;
    }
    
    // Convert to styled custom select
    rebuildCustomSelect(unitSelect);
}

function setupLogRatingUI() {
  const facesContainer = document.getElementById('log-rating-faces');
  const dynamicContainer = document.getElementById('log-dynamic-rating');
  if (!facesContainer || !dynamicContainer) return;
  
  dynamicContainer.innerHTML = '';
  facesContainer.style.display = 'none';

  window.setLogRatingValue = function(val) {
    document.getElementById('log-score').value = val;
  };

  if (appRatingMode === 'faces') {
    facesContainer.style.display = 'flex';
    const faces = facesContainer.querySelectorAll('.face');
    faces.forEach(face => {
      face.onclick = () => {
        if (face.classList.contains('selected')) {
          faces.forEach(f => f.classList.remove('selected'));
          setLogRatingValue('');
        } else {
          setLogRatingValue(face.dataset.value);
          faces.forEach(f => f.classList.toggle('selected', f === face));
        }
      };
    });
  } else if (appRatingMode === 'stars_5') {
    const starDiv = document.createElement('div');
    starDiv.className = 'dynamic-rating-ui rating-stars';
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '★';
      star.title = `${i} star${i > 1 ? 's' : ''}`;
      star.dataset.value = i;
      star.onclick = () => {
        const currentlySelected = starDiv.querySelectorAll('.star.selected').length;
        if (currentlySelected === i) {
          starDiv.querySelectorAll('.star').forEach(s => s.classList.remove('selected'));
          setLogRatingValue('');
        } else {
          setLogRatingValue(i);
          starDiv.querySelectorAll('.star').forEach((s, idx) => {
            s.classList.toggle('selected', idx < i);
          });
        }
      };
      starDiv.appendChild(star);
    }
    dynamicContainer.appendChild(starDiv);
  } else if (appRatingMode === 'scale_10' || appRatingMode === 'scale_100') {
    const numDiv = document.createElement('div');
    numDiv.className = 'dynamic-rating-ui rating-number l-rating-number';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = appRatingMode === 'scale_10' ? 1 : 1;
    input.max = appRatingMode === 'scale_10' ? 10 : 100;
    input.placeholder = appRatingMode === 'scale_10' ? 'Score (1-10)' : 'Score (1-100)';
    input.id = 'log-score-input-visible';
    
    let lastValid = '';
    input.oninput = () => {
      let val = input.value;
      if (val === '') {
        setLogRatingValue('');
        return;
      }
      let min = parseInt(input.min);
      let max = parseInt(input.max);
      let valid = false;
      if (appRatingMode === 'scale_10') {
        valid = /^\d{1,2}$/.test(val) && Number(val) >= min && Number(val) <= max;
      } else {
        valid = /^\d{1,3}$/.test(val) && Number(val) >= min && Number(val) <= max;
      }
      
      if (valid) {
        lastValid = val;
        setLogRatingValue(Number(val));
      } else {
        input.value = lastValid;
        setLogRatingValue(lastValid ? Number(lastValid) : '');
      }
    };
    numDiv.appendChild(input);
    dynamicContainer.appendChild(numDiv);
  }
}

function updateLogRatingUI(internalScore) {
  const hiddenInput = document.getElementById('log-score');
  const rnum = Number(internalScore);
  
  if (!internalScore || isNaN(rnum)) {
    hiddenInput.value = '';
    if (appRatingMode === 'faces') {
        document.querySelectorAll('#log-rating-faces .face').forEach(f => {
            f.classList.remove('selected');
            f.style.color = '';
        });
    } else if (appRatingMode === 'stars_5') {
        document.querySelectorAll('#log-dynamic-rating .star').forEach(s => s.classList.remove('selected'));
    } else if (appRatingMode === 'scale_10' || appRatingMode === 'scale_100') {
        const inp = document.getElementById('log-score-input-visible');
        if (inp) {
            inp.value = '';
            inp.style.color = '';
            inp.style.borderColor = '';
        }
    }
    return;
  }
  
  let color = '#f5c518';
  if (rnum <= 33) color = '#ff3b38';
  else if (rnum <= 66) color = '#f5c518';
  else color = '#4CAF50';
  
  let displayVal = rnum;
  if (appRatingMode === 'faces') {
     hiddenInput.value = rnum;
     document.querySelectorAll('#log-rating-faces .face').forEach(f => {
         const isSelected = parseInt(f.dataset.value) === rnum;
         f.classList.toggle('selected', isSelected);
         if (isSelected) f.style.color = color;
         else f.style.color = '';
     });
  } else if (appRatingMode === 'stars_5') {
     displayVal = Math.round(rnum / 20);
     if (rnum > 0 && displayVal < 1) displayVal = 1;
     hiddenInput.value = displayVal;
     document.querySelectorAll('#log-dynamic-rating .star').forEach((s, idx) => {
         s.classList.toggle('selected', idx < displayVal);
     });
  } else if (appRatingMode === 'scale_10') {
     displayVal = Math.round(rnum / 10);
     if (rnum > 0 && displayVal < 1) displayVal = 1;
     hiddenInput.value = displayVal;
     const inp = document.getElementById('log-score-input-visible');
     if (inp) {
         inp.value = displayVal;
         inp.style.color = color;
         inp.style.borderColor = color;
     }
  } else if (appRatingMode === 'scale_100') {
     displayVal = Math.round(rnum);
     hiddenInput.value = displayVal;
     const inp = document.getElementById('log-score-input-visible');
     if (inp) {
         inp.value = displayVal;
         inp.style.color = color;
         inp.style.borderColor = color;
     }
  }
}

function expandComposer() {
  const composer = document.getElementById('journal-composer');
  if (composer.classList.contains('expanded')) return;

  composer.classList.remove('collapsed');
  composer.classList.add('expanded');
  
  populateDynamicUnits();

  // Default to logs mode if notes already exist and we aren't editing a specific item
  if (!editingLogId) {
      const rawNotes = document.getElementById('raw-notes-data');
      if (rawNotes) {
          setComposerMode('logs'); 
      } else {
          setComposerMode('notes');
      }
  }
  document.getElementById('journal-textarea').focus();
}

function collapseComposer() {
  document.getElementById('journal-composer').classList.add('collapsed');
  document.getElementById('journal-composer').classList.remove('expanded');
  
  // Clear drafts & resets
  window.draftNotes = undefined;
  window.draftLogs = undefined;
  editingLogId = null;
  document.getElementById('journal-textarea').value = '';
  document.getElementById('log-title').value = '';
  updateLogRatingUI(''); // Properly clear visual rating state
  document.getElementById('log-progress-unit').value = '';
  document.getElementById('log-progress-start').value = '';
  document.getElementById('log-progress-end').value = '';
  document.getElementById('log-spoiler').checked = false;
  document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
  
  setComposerTab('write');
  const hasNotes = !!document.getElementById('raw-notes-data');
  setComposerMode(hasNotes ? 'logs' : 'notes');
}

function setComposerTab(tab) {
  const writeBtn = document.querySelector('.j-tab-btn[data-tab="write"]');
  const previewBtn = document.querySelector('.j-tab-btn[data-tab="preview"]');
  const textarea = document.getElementById('journal-textarea');
  const previewArea = document.getElementById('journal-preview');
  const toolbar = document.getElementById('composer-toolbar');

  if (tab === 'write') {
    writeBtn.classList.add('active');
    previewBtn.classList.remove('active');
    textarea.style.display = 'block';
    toolbar.style.display = 'flex';
    previewArea.style.display = 'none';
    textarea.focus();
  } else {
    previewBtn.classList.add('active');
    writeBtn.classList.remove('active');
    textarea.style.display = 'none';
    toolbar.style.display = 'none';
    previewArea.style.display = 'block';
    
    // Markdown parser for preview
    let text = textarea.value
      .replace(/</g, '&lt;').replace(/>/g, '&gt;') // sanitize
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>')
      .replace(/\[center\]([\s\S]*?)\[\/center\]/g, '<div style="text-align:center;">$1</div>')
      .replace(/^(?:&gt;|>)\s?(.*?)$/gm, '<blockquote style="border-left:3px solid var(--special-color); margin:0; padding-left:10px; color:var(--text-secondary);">$1</blockquote>')
      .replace(/\n/g, '<br>');
      
    previewArea.innerHTML = text || '<span style="color:var(--text-overview)">Nothing to preview.</span>';
  }
}

function setComposerMode(mode) {
  const notesBtn = document.querySelector('.j-tab-btn[data-mode="notes"]');
  const logsBtn = document.querySelector('.j-tab-btn[data-mode="logs"]');
  const logFields = document.getElementById('log-extra-fields');
  const textarea = document.getElementById('journal-textarea');

  // Preserve drafts when swapping
  if (notesBtn.classList.contains('active')) {
      window.draftNotes = textarea.value;
  } else if (logsBtn.classList.contains('active')) {
      window.draftLogs = textarea.value;
  }

  if (mode === 'notes') {
    notesBtn.classList.add('active');
    logsBtn.classList.remove('active');
    logFields.style.display = 'none';
    
    const rawNotes = document.getElementById('raw-notes-data');
    if (window.draftNotes !== undefined) {
        textarea.value = window.draftNotes;
    } else if (rawNotes) {
        try {
            textarea.value = JSON.parse(rawNotes.textContent).notes;
        } catch (e) {
            textarea.value = rawNotes.textContent;
        }
        window.draftNotes = textarea.value;
    } else {
        textarea.value = '';
    }
  } else {
    logsBtn.classList.add('active');
    notesBtn.classList.remove('active');
    logFields.style.display = 'flex';
    
    textarea.value = window.draftLogs || '';
  }
}

function formatText(startTag, endTag) {
  const textarea = document.getElementById('journal-textarea');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selectedText = text.substring(start, end);
  
  const replacement = startTag + selectedText + endTag;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);
  
  // Restore cursor position
  textarea.focus();
  if (selectedText.length > 0) {
    textarea.selectionStart = start;
    textarea.selectionEnd = start + replacement.length;
  } else {
    textarea.selectionStart = textarea.selectionEnd = start + startTag.length;
  }
}

function editJournalEntry(type, id = null) {
  const composer = document.getElementById('journal-composer');
  composer.classList.remove('collapsed');
  composer.classList.add('expanded');
  
  populateDynamicUnits();

  if (type === 'notes') {
    editingLogId = null;
    const rawData = document.getElementById('raw-notes-data');
    let content = '';
    if (rawData) {
      try {
          content = JSON.parse(rawData.textContent).notes;
      } catch (e) {
          content = rawData.textContent;
      }
      window.draftNotes = content; // force override draft
    }
    setComposerMode('notes');
    // Safely inject text AFTER mode is set to prevent auto-overwriting
    document.getElementById('journal-textarea').value = content;
    // Switch to write tab in case it was left on preview
    setComposerTab('write');
  } else {
    editingLogId = id;
    const rawDataStr = document.getElementById('raw-log-' + id)?.textContent;
    let content = '';
    if (rawDataStr) {
      try {
        const data = JSON.parse(rawDataStr);
        content = data.content;
        window.draftLogs = content; // force override draft
        
        document.getElementById('log-title').value = data.title;
        document.getElementById('log-date').value = data.activity_date;
        updateLogRatingUI(data.score); // Properly set visual rating state
        document.getElementById('log-progress-unit').value = data.progress_unit || '';
        document.getElementById('log-progress-start').value = data.progress_start;
        document.getElementById('log-progress-end').value = data.progress_end;
        document.getElementById('log-spoiler').checked = data.is_spoiler;
      } catch (e) {
        console.error("Failed to parse log data", e);
      }
    }
    setComposerMode('logs');
    // Safely inject text AFTER mode is set to prevent auto-overwriting
    document.getElementById('journal-textarea').value = content;
    // Switch to write tab in case it was left on preview
    setComposerTab('write');
  }
  
  // Smooth scroll to the composer
  document.getElementById('journal-composer').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function saveJournalEntry() {
  const mode = document.querySelector('.j-tab-btn[data-mode="notes"]').classList.contains('active') ? 'notes' : 'logs';
  const content = document.getElementById('journal-textarea').value;
  const dbId = document.body.dataset.dbId;
  const saveBtn = document.getElementById('j-btn-save');
  
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  if (mode === 'notes') {
    // Save to the main MediaItem via edit-item endpoint
    fetch(`/edit-item/${dbId}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ notes: content }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        sessionStorage.setItem("refreshSuccess", "1");
        location.reload();
      } else {
        alert("Failed to save notes.");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    }).catch(err => {
      console.error(err);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    });
  } else {
    // Determine title defaulting logic
    let logTitle = document.getElementById('log-title').value.trim();
    if (!logTitle) {
        if (editingLogId) {
            // If editing an existing log, keep its original title
            const rawDataStr = document.getElementById('raw-log-' + editingLogId)?.textContent;
            if (rawDataStr) {
                const data = JSON.parse(rawDataStr);
                logTitle = data.title || "Log";
            } else {
                logTitle = "Log";
            }
        } else {
            // If creating a NEW log, count existing logs and add 1
            const existingLogsCount = document.querySelectorAll('.log-card').length;
            logTitle = `Log ${existingLogsCount + 1}`;
        }
    }

    // Save to Log model via the new API endpoint
    const payload = {
      action: "save",
      item_id: dbId,
      log_id: editingLogId,
      content: content,
      title: logTitle,
      activity_date: document.getElementById('log-date').value,
      score: document.getElementById('log-score').value,
      progress_unit: document.getElementById('log-progress-unit').value,
      progress_start: document.getElementById('log-progress-start').value,
      progress_end: document.getElementById('log-progress-end').value,
      is_spoiler: document.getElementById('log-spoiler').checked
    };

    fetch(`/api/manage-journal-log/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify(payload),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        sessionStorage.setItem("refreshSuccess", "1");
        location.reload();
      } else {
        alert("Failed to save log: " + (data.error || 'Unknown error'));
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    }).catch(err => {
      console.error(err);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    });
  }
}

function openDeleteLogModal(id) {
    logToDelete = id;
    document.getElementById('delete-log-modal').classList.remove('pc-modal-hidden');
}

function closeDeleteLogModal() {
    logToDelete = null;
    document.getElementById('delete-log-modal').classList.add('pc-modal-hidden');
}

document.getElementById('confirm-delete-log-btn')?.addEventListener('click', function() {
    if(!logToDelete) return;
    
    const dbId = document.body.dataset.dbId;
    const btn = this;
    btn.disabled = true;
    btn.textContent = "Deleting...";

    fetch(`/api/manage-journal-log/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({
        action: "delete",
        item_id: dbId,
        log_id: logToDelete
      }),
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        sessionStorage.setItem("refreshSuccess", "1");
        location.reload();
      } else {
        alert("Failed to delete log.");
        btn.disabled = false;
        btn.textContent = "Delete";
        closeDeleteLogModal();
      }
    }).catch(err => {
        console.error(err);
        btn.disabled = false;
        btn.textContent = "Delete";
        closeDeleteLogModal();
    });
});

// --- JOURNAL VIEW, SORT, & PAGINATION LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
  const sortSelect = document.getElementById('j-sort-select');
  const orderToggle = document.getElementById('j-order-toggle');
  const viewToggle = document.getElementById('j-view-toggle');
  const showMoreBtn = document.getElementById('j-show-more-btn');
  const list = document.getElementById('journal-entries-list');

  if (!sortSelect || !list) return; // Exit if not in list

  // 1. Initialize View (Grid/List)
  const savedView = localStorage.getItem('journalView') || 'list';
  window.journalExpanded = false;

  function applyView(viewType) {
      if (viewType === 'grid') {
          list.classList.add('grid-view');
          viewToggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>';
          viewToggle.title = "Switch to List View";
      } else {
          list.classList.remove('grid-view');
          viewToggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';
          viewToggle.title = "Switch to Grid View";
      }
  }
  applyView(savedView);

  viewToggle.addEventListener('click', () => {
      const isGrid = list.classList.contains('grid-view');
      const newView = isGrid ? 'list' : 'grid';
      localStorage.setItem('journalView', newView);
      applyView(newView);
  });

  // 2. Sorting & Pagination Logic
  function applySortAndVisibility() {
      const notesCard = list.querySelector('.notes-card');
      const logs = Array.from(list.querySelectorAll('.log-card'));
      const sortBy = sortSelect.value;
      const sortOrder = orderToggle.dataset.order;

      // Sort Logs in Memory
      logs.sort((a, b) => {
          let valA, valB;
          const rawA = document.getElementById('raw-log-' + a.dataset.id)?.textContent;
          const rawB = document.getElementById('raw-log-' + b.dataset.id)?.textContent;
          
          if (!rawA || !rawB) return 0;
          
          const dataA = JSON.parse(rawA);
          const dataB = JSON.parse(rawB);

          if (sortBy === 'activity_date') {
              valA = new Date(dataA.activity_date).getTime();
              valB = new Date(dataB.activity_date).getTime();
          } else if (sortBy === 'title') {
              valA = dataA.title.toLowerCase();
              valB = dataB.title.toLowerCase();
          } else if (sortBy === 'score') {
              valA = Number(dataA.score) || 0;
              valB = Number(dataB.score) || 0;
          }

          if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
          if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
          return 0;
      });

      // Re-append nicely to DOM
      if (notesCard) list.appendChild(notesCard);
      logs.forEach(log => list.appendChild(log));

      // Limit Visibility
      const limit = 4;
      const wrapper = document.getElementById('j-show-more-wrapper');
      
      if (logs.length <= limit) {
          if (wrapper) wrapper.style.display = 'none';
          logs.forEach(l => l.style.display = 'block');
      } else {
          if (wrapper) wrapper.style.display = 'block';
          logs.forEach((l, index) => {
              l.style.display = (window.journalExpanded || index < limit) ? 'block' : 'none';
          });
          if (showMoreBtn) {
              const remaining = logs.length - limit;
              showMoreBtn.textContent = window.journalExpanded ? 'Show Less' : `Show More (${remaining})`;
          }
      }
  }

  // Triggering the Sorting
  sortSelect.addEventListener('change', applySortAndVisibility);

  orderToggle.addEventListener('click', () => {
      const current = orderToggle.dataset.order;
      const newOrder = current === 'desc' ? 'asc' : 'desc';
      orderToggle.dataset.order = newOrder;
      
      const icon = orderToggle.querySelector('svg');
      if (newOrder === 'asc') {
          icon.style.transform = 'rotate(180deg)';
      } else {
          icon.style.transform = 'rotate(0deg)';
      }
      
      applySortAndVisibility();
  });

  if (showMoreBtn) {
      showMoreBtn.addEventListener('click', () => {
          window.journalExpanded = !window.journalExpanded;
          applySortAndVisibility();
      });
  }

  // Initial trigger to hide > 4 on page load
  applySortAndVisibility();
});

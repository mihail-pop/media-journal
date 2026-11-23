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
  
  const refreshNotification = showNotification('Refreshing...', 'warning');
  
  fetch("/refresh-item/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
    body: JSON.stringify({ id: sourceId, refresh_type: refreshType }),
  })
    .then(res => ApiFeedback.readResponse(res, document.body.dataset.source))
    .then(() => {
      if (refreshType === 'all' || refreshType === 'data') window.DetailsSections?.invalidate();
      sessionStorage.setItem("refreshSuccess", "1");
      setTimeout(() => window.location.reload(true));
    })
    .catch((error) => {
      // Re-enable buttons if request fails
      isRefreshing = false;
      if (settingsBtn) settingsBtn.disabled = false;
      refreshBtns.forEach(btn => btn.disabled = false);
      refreshNotification?.remove();
      ApiFeedback.notify(error, document.body.dataset.source);
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
    const data = await ApiFeedback.readResponse(response, 'igdb');
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
    if (generation === screenshotsGeneration) ApiFeedback.notify(error, 'igdb');
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
    .then(r => ApiFeedback.readResponse(r, 'igdb'))
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
    .catch(error => {
      if (generation !== screenshotsGeneration) return;
      hasMoreScreenshots = false;
      ApiFeedback.notify(error, 'igdb', { retry: () => {
        hasMoreScreenshots = true;
        loadMoreScreenshots();
      } });
    })
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
  const wasOpen = screenshotOverlay.classList.contains('active');

  if (!open && document.fullscreenElement === screenshotOverlay) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.warn('Could not exit screenshot fullscreen:', error);
    }
  }

  if (open) window.modalScrollLock.lock('screenshot-fullscreen');

  screenshotOverlay.classList.toggle('active', open);
  if (open) {
    fitScreenshotToViewer();
    showScreenshotControls();
  } else {
    screenshotCropShape = null;
    screenshotOverlay.classList.remove('crop-options-open');
    resetScreenshotZoom();
  }

  if (!open) {
    window.modalScrollLock.unlock('screenshot-fullscreen');
    if (wasOpen) fullscreenBtn?.focus({ preventScroll: true });
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

document.addEventListener('details-tab-change', event => {
  if (event.detail.previous === 'overview' && event.detail.current !== 'overview') stopScreenshotAutoplay();
});

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
  window.modalScrollLock.unlock('screenshot-delete');
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
  window.modalScrollLock.lock('screenshot-delete');
  screenshotDeletePanel.querySelector('.screenshot-delete-cancel').addEventListener('click', closeScreenshotDeletePanel);
  screenshotDeletePanel.querySelector('.screenshot-delete-more').addEventListener('click', () => {
    screenshotDeleteMode = true;
    window.modalScrollLock.unlock('screenshot-delete');
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

  // Handle cast member favorites
  document.addEventListener("change", function (e) {
    if (e.target.type === "checkbox" && e.target.closest(".cast-favorite") && !e.target.closest('.details-person-favorite')) {
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
  window.modalScrollLock.lock('screenshot-swap');
  function finish(confirmed) {
    if (!screenshotSwapPanel) return;
    screenshotSwapPanel.remove();
    screenshotSwapPanel = null;
    window.modalScrollLock.unlock('screenshot-swap');
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

  // Music section controls
  (() => {
    const section = document.querySelector('.music-section');
    const container = document.getElementById('music-videos-container');
    if (!section || !container) return;
    const autoplay = document.getElementById('music-autoplay-toggle');
    const sizeButton = document.getElementById('music-size-toggle');
    const addButton = document.getElementById('music-add-btn');
    const form = document.getElementById('music-add-form');
    const input = document.getElementById('music-youtube-url');
    const cancelButton = document.getElementById('music-cancel-btn');
    const sourceId = document.body.dataset.sourceId;
    let busy = false;
    let deletePanel = null;
    let deleteTarget = null;
    let deleteFocus = null;

    function youtubeId(value) {
      try {
        const url = new URL(value.includes('://') ? value : 'https://' + value);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        let id = '';
        if (host === 'youtu.be') id = url.pathname.split('/')[1];
        else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
          id = url.searchParams.get('v') || (/^\/(?:embed|shorts|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : '');
        }
        return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
      } catch (_) { return null; }
    }

    function wrappers() {
      return [...container.querySelectorAll('.music-video-wrapper')];
    }

    function updateControls() {
      section.querySelectorAll('button, input').forEach(control => { control.disabled = busy || !!deletePanel; });
      wrappers().forEach((wrapper, index, all) => {
        const up = wrapper.querySelector('.music-up-btn');
        const down = wrapper.querySelector('.music-down-btn');
        if (up) up.hidden = index === 0;
        if (down) down.hidden = index === all.length - 1;
        const play = wrapper.querySelector('.music-play-btn');
        if (play && !youtubeId(wrapper.dataset.url || '')) play.disabled = true;
      });
      deletePanel?.querySelectorAll('button').forEach(button => { button.disabled = busy; });
      const confirm = deletePanel?.querySelector('.screenshot-delete-confirm');
      if (confirm) confirm.textContent = busy ? 'Deleting…' : 'Delete';
    }

    function remember(key, value) {
      try { localStorage.setItem(key, value); } catch (_) {}
    }

    function updateSizeIcon() {
      const small = container.classList.contains('small');
      sizeButton.setAttribute('aria-pressed', String(small));
      // Use the same expand/collapse symbols as the music player's fullscreen control.
      sizeButton.querySelector('path').setAttribute('d', small
        ? 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z'
        : 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z');
    }
    updateSizeIcon();
    sizeButton.addEventListener('click', () => {
      const small = container.classList.toggle('small');
      updateSizeIcon();
      remember('musicVideoSize', small ? 'small' : 'large');
    });

    function updateAutoplay(enabled) {
      wrappers().forEach((wrapper, index) => {
        const iframe = wrapper.querySelector('iframe');
        const id = youtubeId(wrapper.dataset.url || '');
        if (!iframe || !id) return;
        const url = new URL(iframe.src);
        url.pathname = '/embed/' + id;
        url.searchParams.set('enablejsapi', '1');
        if (enabled && index === 0) url.searchParams.set('autoplay', '1');
        else url.searchParams.delete('autoplay');
        if (iframe.src !== url.href) iframe.src = url.href;
      });
    }

    try {
      autoplay.checked = localStorage.getItem('musicAutoplay') === 'true';
      localStorage.removeItem('musicHide');
    } catch (_) {}
    updateAutoplay(autoplay.checked);
    autoplay.addEventListener('change', () => {
      remember('musicAutoplay', String(autoplay.checked));
      updateAutoplay(autoplay.checked);
    });

    function closeForm() {
      if (busy || !form) return;
      form.hidden = true;
      input.value = '';
      addButton.hidden = false;
      addButton.focus({ preventScroll: true });
    }
    addButton?.addEventListener('click', () => {
      if (busy || deletePanel) return;
      addButton.hidden = true;
      form.hidden = false;
      input.focus({ preventScroll: true });
    });
    cancelButton?.addEventListener('click', closeForm);
    input?.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeForm();
      }
    });

    async function mutate(endpoint, payload, announce = true) {
      if (busy) return false;
      busy = true;
      updateControls();
      let succeeded = false;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
          body: JSON.stringify({ source_id: sourceId, ...payload }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) throw new Error(data?.error || 'The change could not be saved. Please try again.');
        succeeded = true;
        if (announce) {
          try { sessionStorage.setItem('refreshSuccess', '1'); } catch (_) {}
        }
        location.reload();
        return true;
      } catch (error) {
        const message = error.message || 'The change could not be saved. Please try again.';
        if (deletePanel) deletePanel.querySelector('.music-delete-message').textContent = message;
        else showNotification(message, 'warning', 5000);
        return false;
      } finally {
        if (!succeeded) {
          busy = false;
          updateControls();
        }
      }
    }

    form?.addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      const id = youtubeId(input.value.trim());
      if (!id) {
        showNotification('Enter a valid YouTube video URL.', 'warning', 5000);
        input.focus();
        return;
      }
      mutate('/api/add-music-video/', { url: 'https://www.youtube.com/watch?v=' + id });
    });

    function closeDelete() {
      if (busy || !deletePanel) return;
      deletePanel.remove();
      deletePanel = null;
      window.modalScrollLock.unlock('music-video-delete');
      deleteTarget = null;
      updateControls();
      deleteFocus?.focus({ preventScroll: true });
      deleteFocus = null;
    }

    function confirmDeletion(button, wrapper) {
      if (busy || deletePanel) return;
      deleteTarget = {
        video_id: Number(wrapper.dataset.videoRecordId),
        position: Number(wrapper.dataset.position),
      };
      deleteFocus = button;
      // Reuse the screenshot notification styling, with separate music-only state.
      deletePanel = document.createElement('section');
      deletePanel.className = 'screenshot-delete-panel music-delete-panel';
      deletePanel.setAttribute('role', 'dialog');
      deletePanel.setAttribute('aria-labelledby', 'music-delete-title');
      deletePanel.innerHTML = '<h3 id="music-delete-title">Are you sure?</h3>' +
        '<p class="music-delete-message" aria-live="polite">Deleting this video. It cannot be undone.</p>' +
        '<div class="screenshot-delete-actions">' +
        '<button type="button" class="music-delete-cancel">Cancel</button>' +
        '<button type="button" class="screenshot-delete-confirm">Delete</button></div>';
      document.body.appendChild(deletePanel);
      window.modalScrollLock.lock('music-video-delete');
      deletePanel.querySelector('.music-delete-cancel').addEventListener('click', closeDelete);
      deletePanel.querySelector('.screenshot-delete-confirm').addEventListener('click', () => {
        if (deleteTarget) mutate('/api/delete-music-video/', deleteTarget);
      });
      updateControls();
      deletePanel.querySelector('.music-delete-cancel').focus({ preventScroll: true });
    }

    document.addEventListener('keydown', event => {
      if (!deletePanel) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDelete();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const buttons = [...deletePanel.querySelectorAll('button:not(:disabled)')];
        if (buttons.length) buttons[(buttons.indexOf(document.activeElement) + 1) % buttons.length].focus();
      }
    }, true);

    function playInPlayer(wrapper) {
      if (typeof window.startCustomPlaylist !== 'function') {
        showNotification('The music player is unavailable. Please reload the page.', 'warning', 5000);
        return;
      }
      const itemId = Number(document.body.dataset.dbId);
      const videos = wrappers().filter(video => youtubeId(video.dataset.url || ''));
      const index = videos.indexOf(wrapper);
      if (index < 0) return;
      const playlist = videos.map(video => ({
        video_id: youtubeId(video.dataset.url),
        item_id: Number.isSafeInteger(itemId) && itemId > 0 ? itemId : null,
        source_id: sourceId,
        is_favorite: section.dataset.favorite === 'true',
        title: section.dataset.title || '',
        loop_queue: true,
      }));
      // Pause this section's embeds when handing playback to the persistent player.
      container.querySelectorAll('iframe').forEach(iframe => {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), new URL(iframe.src).origin);
      });
      window.startCustomPlaylist(playlist, index);
    }

    container.addEventListener('click', event => {
      const button = event.target.closest('button');
      const wrapper = button?.closest('.music-video-wrapper');
      if (!wrapper || button.disabled || busy || deletePanel) return;
      const position = Number(wrapper.dataset.position);
      const videoId = Number(wrapper.dataset.videoRecordId);
      if (button.classList.contains('music-play-btn')) {
        playInPlayer(wrapper);
      } else if (button.classList.contains('music-delete-btn')) {
        confirmDeletion(button, wrapper);
      } else if (button.classList.contains('music-cover-btn')) {
        mutate('/api/set-video-as-cover/', { position, video_id: videoId });
      } else if (button.classList.contains('music-up-btn') || button.classList.contains('music-down-btn')) {
        const all = wrappers();
        const index = all.indexOf(wrapper);
        const other = index + (button.classList.contains('music-up-btn') ? -1 : 1);
        if (other < 0 || other >= all.length) return;
        [all[index], all[other]] = [all[other], all[index]];
        mutate('/api/reorder-music-videos/', { video_ids: all.map(video => Number(video.dataset.videoRecordId)) }, false);
      }
    });
    updateControls();
  })();

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

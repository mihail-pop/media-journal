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

document.addEventListener("DOMContentLoaded", function () {
  const bg = document.querySelector('.screenshots-background');
  if (bg) {
    const total = parseInt(bg.dataset.totalScreenshots || 0);
    if (screenshotsData.length >= total) {
      hasMoreScreenshots = false;
    }
    
    const list = document.querySelector('.screenshots-list');
    if (list) {
      list.addEventListener('scroll', () => {
        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 200) {
          loadMoreScreenshots();
        }
      });
    }
  }
  
  // Hide navigation buttons if only one screenshot
  if (screenshotsData.length <= 1) {
    const rotator = document.querySelector('.screenshot-rotator');
    const overlay = document.querySelector('.screenshot-overlay');
    if (rotator) rotator.classList.add('single-screenshot');
    if (overlay) overlay.classList.add('single-screenshot');
  }
});

function loadMoreScreenshots() {
  if (isLoadingScreenshots || !hasMoreScreenshots) return;
  
  isLoadingScreenshots = true;
  const igdbId = document.querySelector('.screenshots-background').dataset.igdbId;
  const nextPage = screenshotsPage + 1;
  
  fetch(`/api/game_screenshots/?igdb_id=${igdbId}&page=${nextPage}`)
    .then(r => r.json())
    .then(data => {
      if (data.screenshots && data.screenshots.length > 0) {
        data.screenshots.forEach(s => {
          screenshotsData.push(s);
          const index = screenshotsData.length - 1;
          // Append to DOM
          const img = document.createElement('img');
          img.src = s.url;
          img.alt = `Screenshot ${screenshotsData.length}`;
          img.className = 'thumbnail';
          img.onclick = () => setScreenshot(index);
          document.querySelector('.screenshots-list').appendChild(img);
        });
        screenshotsPage = nextPage;
        hasMoreScreenshots = data.has_more;
      } else {
        hasMoreScreenshots = false;
      }
    })
    .finally(() => {
      isLoadingScreenshots = false;
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
  img.style.opacity = 1;
  if (overlayImg) overlayImg.style.opacity = 1;
  
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
  let newIndex = (currentIndex + direction + screenshotsData.length) % screenshotsData.length;
  
  // If we are near the end (within 5 items) and moving forward, try loading more
  if (direction > 0 && newIndex >= screenshotsData.length - 5) {
    loadMoreScreenshots();
  }
  
  updateScreenshot(newIndex);
}

function setScreenshot(index) {
  if (index >= 0 && index < screenshotsData.length) {
    updateScreenshot(index, false);
  }
}

function showArrows(container) {
  container.querySelector(".left").style.display = "block";
  container.querySelector(".right").style.display = "block";
}

function hideArrows(container) {
  container.querySelector(".left").style.display = "none";
  container.querySelector(".right").style.display = "none";
}

// Fullscreen functionality
const fullscreenBtn = document.getElementById("fullscreen-screenshot-btn");
const overlayFullscreenBtn = document.getElementById("overlay-fullscreen-btn");
const screenshotOverlay = document.getElementById("screenshot-overlay");

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", function() {
    screenshotOverlay.classList.add("active");
  });
}

if (overlayFullscreenBtn) {
  overlayFullscreenBtn.addEventListener("click", function() {
    screenshotOverlay.classList.remove("active");
  });
}

if (screenshotOverlay) {
  screenshotOverlay.addEventListener("click", function(e) {
    if (e.target === screenshotOverlay) {
      screenshotOverlay.classList.remove("active");
    }
  });
}

let deleteConfirm = false;
let isDeletingScreenshot = false;
let deleteTimeout = null;

function handleDeleteScreenshot(btn) {
  if (isDeletingScreenshot || btn.disabled) return;

  if (!deleteConfirm) {
    btn.textContent = "×";
    btn.style.color = "#ff3b38ff";
    btn.title = "Are you sure?";
    deleteConfirm = true;

    if (deleteTimeout) clearTimeout(deleteTimeout);

    deleteTimeout = setTimeout(() => {
      if (!isDeletingScreenshot) {
        deleteConfirm = false;
        const allDeleteBtns = document.querySelectorAll(".delete-screenshot-btn");
        allDeleteBtns.forEach(b => {
          b.textContent = "×";
          b.style.color = "";
          b.title = "Delete Screenshot";
        });
      }
    }, 2000);
  } else {
    if (deleteTimeout) {
      clearTimeout(deleteTimeout);
      deleteTimeout = null;
    }
    isDeletingScreenshot = true;
    const allDeleteBtns = document.querySelectorAll(".delete-screenshot-btn");
    allDeleteBtns.forEach(b => {
      b.disabled = true;
      b.style.opacity = "0.5";
      b.style.cursor = "wait";
    });

    const img = document.getElementById("screenshot-image");
    const screenshotUrl = img.src.replace(window.location.origin, "");
    const IGDB_ID = document.querySelector('.screenshots-background').dataset.igdbId;

    // If deleting will leave only 1 screenshot, refresh the page for consistency
    if (screenshotsData.length === 2) {
      const formData = new FormData();
      formData.append("igdb_id", IGDB_ID);
      formData.append("screenshot_url", screenshotUrl);

      fetch("/upload-game-screenshots/", {
        method: "POST",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "X-Action": "delete",
        },
        body: formData,
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          sessionStorage.setItem("refreshSuccess", "1");
          window.location.reload();
        } else {
          alert(data.message);
        }
      })
      .catch(err => {
        console.error(err);
        alert("Failed to delete screenshot.");
      })
      .finally(() => {
        isDeletingScreenshot = false;
        deleteConfirm = false;
        const allDeleteBtns = document.querySelectorAll(".delete-screenshot-btn");
        allDeleteBtns.forEach(b => {
          b.disabled = false;
          b.textContent = "×";
          b.style.color = "";
          b.title = "Delete Screenshot";
          b.style.opacity = "";
          b.style.cursor = "";
        });
      });
      return;
    }

    const nextIndex = currentIndex < screenshotsData.length - 1 ? currentIndex : Math.max(0, currentIndex - 1);
    
    const formData = new FormData();
    formData.append("igdb_id", IGDB_ID);
    formData.append("screenshot_url", screenshotUrl);

    fetch("/upload-game-screenshots/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "X-Action": "delete",
      },
      body: formData,
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        showNotification("Screenshot deleted successfully!", "success");

        // Capture scroll position before clearing
        const listContainer = document.querySelector('.screenshots-list');
        const savedScrollTop = listContainer ? listContainer.scrollTop : 0;

        // We want to maintain the same number of items to keep the scrollbar stable.
        // If we had 80 items, we want 80 items back (filling the gap of the deleted one).
        const targetLength = screenshotsData.length;

        screenshotsData.length = 0;
        if (data.screenshots && Array.isArray(data.screenshots)) {
          // Take only what fits in current view + fill the gap
          const newItems = data.screenshots.slice(0, targetLength);
          newItems.forEach(s => screenshotsData.push(s));
          
          // Update pagination state so 'load more' works correctly from this point
          hasMoreScreenshots = data.screenshots.length > targetLength;
          screenshotsPage = Math.ceil(targetLength / 40) || 1;
        }

        // Re-render thumbnails
        if (listContainer) {
          listContainer.innerHTML = '';
          screenshotsData.forEach((shot, i) => {
            const img = document.createElement('img');
            img.src = shot.url;
            img.alt = `Screenshot ${i + 1}`;
            img.className = 'thumbnail';
            img.onclick = () => setScreenshot(i);
            listContainer.appendChild(img);
          });

          // Restore scroll position immediately
          listContainer.scrollTop = savedScrollTop;
        }
        
        if (screenshotsData.length > 0) {
          // Adjust index if we deleted the last item
          if (currentIndex >= screenshotsData.length) {
            currentIndex = screenshotsData.length - 1;
          }
          // Update main image without auto-scrolling the list (false)
          updateScreenshot(currentIndex, false);
        } else {
          window.location.reload();
        }
      } else {
        alert(data.message);
      }
    })
    .catch(err => {
      console.error(err);
      alert("Failed to delete screenshot.");
    })
    .finally(() => {
      isDeletingScreenshot = false;
      deleteConfirm = false;
      const allDeleteBtns = document.querySelectorAll(".delete-screenshot-btn");
      allDeleteBtns.forEach(b => {
        b.disabled = false;
        b.textContent = "×";
        b.style.color = "";
        b.title = "Delete Screenshot";
        b.style.opacity = "";
        b.style.cursor = "";
      });
    });
  }
}

const deleteBtn = document.querySelector(".delete-screenshot-btn");
const overlayDeleteBtn = document.querySelector(".screenshot-overlay .delete-screenshot-btn");

if (deleteBtn) {
  deleteBtn.addEventListener("click", function() {
    handleDeleteScreenshot(this);
  });
}

if (overlayDeleteBtn) {
  overlayDeleteBtn.addEventListener("click", function() {
    handleDeleteScreenshot(this);
  });
}

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

let swapConfirm = false;

swapBtn?.addEventListener("click", function () {
  if (!swapConfirm) {
    // First click → ask for confirmation
    swapBtn.textContent = "Are you sure?";
    swapBtn.style.backgroundColor = "#e53935"; // red
    swapBtn.style.color = "white";
    swapBtn.title = "Are you sure you want to delete all the existing screenshots and replace them with new ones?";
    swapConfirm = true;

    // Reset if user doesn't confirm after 5 seconds
    setTimeout(() => {
      swapConfirm = false;
      swapBtn.textContent = "Swap";
      swapBtn.style.backgroundColor = ""; // default
      swapBtn.style.color = "";
      swapBtn.title = "";
    }, 5000);
  } else {
    // Second click → proceed
    swapConfirm = false;
    swapBtn.textContent = "Swap";
    swapBtn.style.backgroundColor = "";
    swapBtn.style.color = "";
    swapBtn.title = "";

    uploadFileInput.click(); // open file picker
  }
});

  // Screenshots Upload
  const uploadForm = document.getElementById("screenshot-upload-form");
  const addFileInput = document.getElementById("screenshot-add-file-input");
  const addForm = document.getElementById("screenshot-add-form");

  uploadFileInput?.addEventListener("change", async function () {
    const files = Array.from(uploadFileInput.files);
    if (!files.length) return;

    const igdbId = uploadForm.querySelector('input[name="igdb_id"]').value;
    const BATCH_SIZE = 20; // Upload 20 files at a time
    
    // Show progress notification
    const totalFiles = files.length;
    let uploadedFiles = 0;
    const notification = showNotification(`Uploading 0/${totalFiles} screenshots...`, "warning", 0);
    
    try {
      // Upload in batches
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const formData = new FormData();
        formData.append("igdb_id", igdbId);
        
        for (const file of batch) {
          formData.append("screenshots[]", file);
        }
        
        const action = i === 0 ? "replace" : "add"; // First batch replaces, rest add
        
        const response = await fetch("/upload-game-screenshots/", {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Action": action,
          },
          body: formData,
        });
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || "Upload failed");
        }
        
        uploadedFiles += batch.length;
        notification.textContent = `Uploading ${uploadedFiles}/${totalFiles} screenshots...`;
      }
      
      notification.remove();
      sessionStorage.setItem("refreshSuccess", "1");
      location.reload();
    } catch (error) {
      notification.remove();
      alert("Failed to upload screenshots: " + error.message);
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
  const staffHTML = data.staff.map(s => `<span class="staff-member">${s}</span>`).join(", ");
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
  const staffHTML = data.staff.map(s => `<span class="staff-member">${s}</span>`).join(", ");
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
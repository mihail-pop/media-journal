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

function refreshItem(itemId, refreshType = 'all') {
  const dropdown = document.getElementById('settingsDropdown');
  if (dropdown) dropdown.style.display = 'none';
  
  showNotification('Refreshing...', 'warning');
  
  fetch("/refresh-item/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
    body: JSON.stringify({ id: itemId, refresh_type: refreshType }),
  })
    .then((res) => {
      sessionStorage.setItem("refreshSuccess", "1");
      setTimeout(() => window.location.reload(true));
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

function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.textContent = message;
  const bgColor = type === "warning" ? "#FF9800" : "#4CAF50";
  notification.style.cssText = `
    position: fixed;
    top: 4rem;
    left: 50%;
    transform: translateX(-50%);
    background: ${bgColor};
    color: white;
    padding: 12px 24px;
    border-radius: 6px;
    z-index: 9999;
    font-weight: 500;
  `;
  document.body.appendChild(notification);
  const duration = type === "warning" ? 20000 : 2000;
  setTimeout(() => notification.remove(), duration);
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
          alert(data.error || "Failed to upload cover.");
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

function updateScreenshot(index) {
  if (index < 0 || index >= screenshotsData.length) return;
  
  const img = document.getElementById("screenshot-image");
  img.style.opacity = 0;

  // Remove old highlight
  document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
    thumb.classList.toggle('active-thumbnail', i === index);
  });

  currentIndex = index;
  img.src = screenshotsData[currentIndex].url;
  img.style.opacity = 1;
  
  // Center the active thumbnail
  const activeThumbnail = document.querySelector('.thumbnail.active-thumbnail');
  if (activeThumbnail) {
    activeThumbnail.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

function changeScreenshot(direction) {
  let newIndex = (currentIndex + direction + screenshotsData.length) % screenshotsData.length;
  updateScreenshot(newIndex);
}

function setScreenshot(index) {
  if (index >= 0 && index < screenshotsData.length) {
    updateScreenshot(index);
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

let deleteConfirm = false;
const deleteBtn = document.querySelector(".delete-screenshot-btn");

// Autoplay functionality
const autoplayBtn = document.getElementById("autoplay-screenshot-btn");
if (autoplayBtn) {
  autoplayBtn.addEventListener("click", function() {
    if (autoplayInterval) {
      clearInterval(autoplayInterval);
      autoplayInterval = null;
      autoplayBtn.classList.remove("active");
    } else {
      autoplayBtn.classList.add("active");
      autoplayInterval = setInterval(() => {
        changeScreenshot(1);
      }, 2000);
    }
  });
}

if (deleteBtn) { // only attach if it exists
  deleteBtn.addEventListener("click", function () {
    if (!deleteConfirm) {
      deleteBtn.textContent = "×";
      deleteBtn.style.color = "#ff3b38ff";
      deleteBtn.title = "Are you sure?";
      deleteConfirm = true;

      setTimeout(() => {
        deleteConfirm = false;
        deleteBtn.textContent = "×";
        deleteBtn.style.backgroundColor = "";
        deleteBtn.style.color = "";
        deleteBtn.title = "";
      }, 5000);
    } else {
      const img = document.getElementById("screenshot-image");
      const screenshotUrl = img.src.replace(window.location.origin, "");
      const IGDB_ID = document.querySelector('.screenshots-background').dataset.igdbId;

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
          // Remove from array and DOM
          screenshotsData.splice(currentIndex, 1);
          const thumbnails = document.querySelectorAll('.thumbnail');
          thumbnails[currentIndex].remove();
          
          // Re-attach click handlers to remaining thumbnails
          document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
            thumb.onclick = () => setScreenshot(i);
          });
          
          // Update to next screenshot
          if (screenshotsData.length > 0) {
            const newIndex = Math.min(nextIndex, screenshotsData.length - 1);
            updateScreenshot(newIndex);
            showNotification("Screenshot deleted successfully!", "success");
          } else {
            window.location.reload();
          }
        } else {
          alert(data.message);
        }
      });
      
      deleteConfirm = false;
      deleteBtn.textContent = "×";
      deleteBtn.style.color = "";
      deleteBtn.title = "";
    }
  });
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
      const itemId = refreshBtn ? refreshBtn.getAttribute('onclick').match(/'([^']+)'/)[1] : 
                    editBtn ? editBtn.dataset.id : null;
      
      if (itemId) {
        refreshItem(itemId);
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
                <p class="person-name">${person.name}</p>
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

  // Banner background
  const banner = document.querySelector(".banner-section");
  if (banner) {
    const url = banner.dataset.banner;
    banner.style.backgroundImage = `url("${url}")`;
  }


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
    const notification = showNotification(`Uploading 0/${totalFiles} screenshots...`, "warning");
    
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
    const notification = showNotification(`Adding 0/${totalFiles} screenshots...`, "warning");
    
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
              <p class="actor-name">${member.name}</p>
              <p class="character-name">${member.character}</p>
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
              <p class="actor-name">${member.name}</p>
              <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="${type}" data-id="${member.id || ''}">
                <input type="checkbox">
                <span class="heart"></span>
              </label>
            </a>
          `;
        } else {
          const nameHtml = (mediaType === 'anime' || mediaType === 'manga') ? 
            `<p class="actor-name">${member.name}</p>` : 
            `<p class="actor-name">${member.name}</p><p class="character-name">${member.character}</p>`;
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
                    <p class="actor-name">${member.name}</p>
                    <p class="character-name">${member.character}</p>
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
                    <p class="actor-name">${member.name}</p>
                    <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="${type}" data-id="${member.id || ''}">
                      <input type="checkbox">
                      <span class="heart"></span>
                    </label>
                  </a>
                `;
              } else {
                const nameHtml = (mediaType === 'anime' || mediaType === 'manga') ? 
                  `<p class="actor-name">${member.name}</p>` : 
                  `<p class="actor-name">${member.name}</p><p class="character-name">${member.character}</p>`;
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
  window.addEventListener('beforeunload', function() {
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

      const sourceId = document.body.dataset.itemId;
      
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
      const sourceId = document.body.dataset.itemId;
      
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
            alert(data.error || 'Failed to set cover');
          }
        })
        .catch(() => alert('Error setting cover'));
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
  
  // Delete video functionality
  if (musicVideosContainer) {
    musicVideosContainer.addEventListener('click', function(e) {
      if (e.target.classList.contains('music-delete-btn')) {
        const position = parseInt(e.target.dataset.position);
        const sourceId = document.body.dataset.itemId;

        if (confirm('Delete this video?')) {
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
            }
          })
          .catch(() => alert('Error deleting video'));
        }
      }
    });
  }
});

document.getElementById("more-info-btn").addEventListener("click", async function() {
  const btn = this;
  const container = document.getElementById("extra-info-container");
  const mediaType = document.body.dataset.mediaType; // e.g., "movie", "tv", "anime"
  const itemId = document.body.dataset.itemId;

  btn.disabled = true;
  btn.textContent = "Loading...";

  try {
    let url = `/api/get-extra-info/?media_type=${mediaType}&item_id=${itemId}`;
    
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
        <div style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 8px; background: rgba(245, 197, 24, 0.1); max-width: 12rem; border-radius: 8px; border-right: 4px solid #f5c518; border-left: 4px solid #f5c518;">
          <span style="font-weight: bold; color: #f5c518; font-size: 14px;">TMDB</span>
          <div style="background: #333; border-radius: 10px; width: 120px; height: 8px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #00ff00 100%); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
          </div>
          <span style="font-weight: bold; color: white; font-size: 16px;">${score}/10</span>
        </div>
      `);
    }

    if (runtime) {
      const hours = Math.floor(runtime / 60);
      const minutes = runtime % 60;
      const runtimeFormatted = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
      safeHTML.push(`<p> ${runtimeFormatted}</p>`);
    }

    if (data.status) {
      safeHTML.push(`<p><span class="label">Status: </span> ${data.status}</p>`);
    }

if (data.homepage) {
  try {
    const urlObj = new URL(data.homepage);
    let hostname = urlObj.hostname.replace(/^www\./, ''); // remove 'www.'
    let label = hostname.split('.')[0]; // get the first part (e.g., sonypictures)

    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${label}</a></p>`
    );
  } catch (e) {
    // fallback in case URL parsing fails
    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${data.homepage}</a></p>`
    );
  }
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
      ? `<a href="/tmdb/movie/${rel.id}/" target="_blank" rel="noopener noreferrer">
           ${titleWithYear}
         </a>`
      : titleWithYear;

    return `<span class="relation-item">${linkHTML}${coverImg}</span>`;
  }).join(", ");

  safeHTML.push(`
    <span class="label">Relations:</span>
    <span class="relation-list">${relationItems}</span>
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
    container.innerHTML = `
      <h2>Trailers</h2>
      <div class="trailer-grid">${trailerEmbeds}</div>
    `;
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
                  <p class="rec-title">${rec.title}</p>
                </a>
              </div>
            `).join('')}
          </div>
        </section>
      `;
      mainSection.insertAdjacentHTML('beforeend', recHTML);
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
        <div style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 8px; background: rgba(245, 197, 24, 0.1); max-width: 12rem; border-right: 4px solid #f5c518; border-radius: 8px; border-left: 4px solid #f5c518;">
          <span style="font-weight: bold; color: #f5c518; font-size: 14px;">TMDB</span>
          <div style="background: #333; border-radius: 10px; width: 120px; height: 8px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #00ff00 100%); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
          </div>
          <span style="font-weight: bold; color: white; font-size: 16px;">${score}/10</span>
        </div>
      `);
    }

    if (data.status) {
      safeHTML.push(`<p><span class="label">Status: </span> ${data.status}</p>`);
    }
    
if (data.next_episode_to_air) {
  const nextDate = new Date(data.next_episode_to_air).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  safeHTML.push(`<p><span class="label">Next episode to air: </span> ${nextDate}</p>`);
}

if (data.last_air_date) {
  const lastDate = new Date(data.last_air_date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  safeHTML.push(`<p><span class="label">Last air date: </span> ${lastDate}</p>`);
}

    if (data.type) {
      safeHTML.push(`<p><span class="label">Type: </span> ${data.type}</p>`);
    }

    if (data.networks?.length) {
      safeHTML.push(`<p><span class="label">Network: </span> ${data.networks.join(", ")}</p>`);
    }

if (data.homepage) {
  try {
    const urlObj = new URL(data.homepage);
    let hostname = urlObj.hostname.replace(/^www\./, ''); // remove 'www.'
    let label = hostname.split('.')[0]; // get the first part (e.g., sonypictures)

    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${label}</a></p>`
    );
  } catch (e) {
    // fallback in case URL parsing fails
    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${data.homepage}</a></p>`
    );
  }
}

    if (data.genres?.length) {
      safeHTML.push(`<p><span class="label">Genres:</span> ${data.genres.join(", ")}</p>`);
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
    container.innerHTML = `
      <h2>Trailers</h2>
      <div class="trailer-grid">${trailerEmbeds}</div>
    `;
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
                  <p class="rec-title">${rec.title}</p>
                </a>
              </div>
            `).join('')}
          </div>
        </section>
      `;
      mainSection.insertAdjacentHTML('beforeend', recHTML);
    }
  }
}

    return safeHTML.join("\n");
  }

  if (mediaType === "anime" || mediaType === "manga") {

    if (data.averageScore) {
      const percentage = data.averageScore * 10;
      safeHTML.push(`
        <div style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 8px; background: rgba(2, 169, 255, 0.1); border-radius: 8px; max-width: 12rem; border-right: 4px solid #02a9ff; border-left: 4px solid #02a9ff;">
          <span style="font-weight: bold; color: #02a9ff; font-size: 14px;">AniList</span>
          <div style="background: #333; border-radius: 10px; width: 120px; height: 8px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #00ff00 100%); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
          </div>
          <span style="font-weight: bold; color: white; font-size: 16px;">${data.averageScore}/10</span>
        </div>
      `);
    }

if (data.status) {
  const formattedStatus = data.status.charAt(0) + data.status.slice(1).toLowerCase();
  safeHTML.push(`<p><span class="label">Status:</span> ${formattedStatus}</p>`);
}

if (data.next_airing && data.next_episode) {
  safeHTML.push(`<p><span class="label">Next episode to air: </span> Episode ${data.next_episode} on ${data.next_airing}</p>`);
}

if (data.format) {
  let format = data.format;

  // Formats to keep as-is
  const specialFormats = ["TV", "OVA", "ONA"];
  if (specialFormats.includes(format)) {
    // leave as-is
  } else {
    // Replace underscores with spaces, capitalize every word
    format = format
      .toLowerCase()
      .split("_")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // Also handle MOVIE specifically if you want it as 'Movie'
  if (format.toLowerCase() === "movie") format = "Movie";

  safeHTML.push(`<p><span class="label">Format:</span> ${format}</p>`);
}

    if (data.studios?.length) {
      safeHTML.push(`<p><span class="label">Studio:</span> ${data.studios.join(", ")}</p>`);
    }
    
if (data.genres?.length) {
  safeHTML.push(`<p><span class="label">Genres: </span> ${data.genres.join(", ")}</p>`);
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
      ? `<a href="/mal/${rel.type.toLowerCase()}/${rel.id}/" target="_blank" rel="noopener noreferrer">
           ${titleWithType}
         </a>`
      : titleWithType;

    return `<span class="relation-item">${linkHTML}${coverOverlay}</span>`;
  }).join(", ");

  safeHTML.push(`
    <span class="label">Relations:</span>
    <span class="relation-list">${relationItems}</span>
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
    container.innerHTML = `
      <h2>Trailers</h2>
      <div class="trailer-grid">${trailerEmbeds}</div>
    `;
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
                    <a href="/mal/${mediaType}/${rec.id}/" title="${rec.title}">
                      <img src="${rec.poster_path}" 
                           alt="${rec.title}" 
                           data-placeholder="/static/core/img/placeholder.png" 
                           onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                      <p class="rec-title">${rec.title}</p>
                    </a>
                  </div>
                `).join('')}
              </div>
            </section>
          `;
          mainSection.insertAdjacentHTML('beforeend', recHTML);
        }
      }
    }    return safeHTML.join("\n");
  }

  if (mediaType === "game") {

    if (data.rating) {
      const percentage = data.rating * 10;
      safeHTML.push(`
        <div style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 8px; background: rgba(145, 71, 255, 0.1); border-radius: 8px; max-width: 12rem; border-right: 4px solid #9147ff; border-left: 4px solid #9147ff;">
          <span style="font-weight: bold; color: #9147ff; font-size: 14px;">IGDB</span>
          <div style="background: #333; border-radius: 10px; width: 120px; height: 8px; overflow: hidden;">
            <div style="background: linear-gradient(90deg, #ff4444 0%, #ffaa00 50%, #00ff00 100%); height: 100%; width: ${percentage}%; transition: width 0.3s;"></div>
          </div>
          <span style="font-weight: bold; color: white; font-size: 16px;">${data.rating}/10</span>
        </div>
      `);
    }

    if (data.platforms?.length) {
      safeHTML.push(`<p><span class="label">Platforms:</span> ${data.platforms.join(", ")}</p>`);
    }

    if (data.genres?.length) {
      safeHTML.push(`<p><span class="label">Genres:</span> ${data.genres.join(", ")}</p>`);
    }

    if (data.involved_companies?.length) {
      safeHTML.push(`<p><span class="label">Involved companies:</span> ${data.involved_companies.join(", ")}</p>`);
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
    container.innerHTML = `
      <h2>Trailers</h2>
      <div class="trailer-grid">${trailerEmbeds}</div>
    `;
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
                  <p class="rec-title">${rec.title}</p>
                </a>
              </div>
            `).join('')}
          </div>
        </section>
      `;
      mainSection.insertAdjacentHTML('beforeend', recHTML);
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
      safeHTML.push(`<span class="relation-list">${trackItems}</span><br><br>`);
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
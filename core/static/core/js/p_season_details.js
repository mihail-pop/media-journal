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

    showNotification('Refreshing...', 'warning');

    fetch('/refresh-item/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCookie('csrftoken'),
      },
      body: JSON.stringify({ id: itemId, refresh_type: refreshType }),
    })
      .then((res) => {
        sessionStorage.setItem('refreshSuccess', '1');
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
}

document.addEventListener("DOMContentLoaded", function() {
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
  
  const addBtn = document.getElementById("add-season-to-list-button");
  if (addBtn) {
    addBtn.addEventListener("click", function() {
      showNotification("Adding to your list...", "warning");
      
      const data = {
        tmdb_id: parseInt(addBtn.dataset.tmdbId),
        season_number: parseInt(addBtn.dataset.seasonNumber)
      };
      
      fetch("/api/add_season_to_list/", {
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
        .catch(() => alert("Failed to add season."));
    });
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
  
  // Episode read more functionality
  document.querySelectorAll('.episode-overview-container').forEach(container => {
    const overview = container.querySelector('.episode-overview');
    const btn = container.querySelector('.episode-read-more-btn');
    
    // Check if text is actually truncated
    if (overview.scrollHeight <= overview.clientHeight) {
      btn.style.display = 'none';
    }
    
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      overview.style.webkitLineClamp = 'unset';
      overview.style.overflow = 'visible';
      this.style.display = 'none';
    });
  });

  // Overview read more functionality
  document.querySelectorAll('.overview-container').forEach(container => {
    const overview = container.querySelector('.overview');
    const btn = container.querySelector('.read-more-btn');
    
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

  // Person search functionality
  const searchInput = document.getElementById("person-search-input");
  const searchToggleBtn = document.getElementById("search-toggle-btn");
  const resultsContainer = document.getElementById("person-search-results");

  const mediaType = document.body.dataset.mediaType;

  function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      resultsContainer.innerHTML = "";
      return;
    }

    const endpoint = "/api/actor_search/";

    fetch(`${endpoint}?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        resultsContainer.innerHTML = "";
        if (data.length === 0) {
          resultsContainer.innerHTML = "<p>No results found.</p>";
          return;
        }

        // Check favorite status for each person
        const personPromises = data.map(person => {
          return fetch(`/api/check_favorite_person/?name=${encodeURIComponent(person.name)}&type=actor`)
            .then(res => res.json())
            .then(result => ({ ...person, isFavorited: result.is_favorited }))
            .catch(() => ({ ...person, isFavorited: false }));
        });

        Promise.all(personPromises).then(personsWithStatus => {
          const fragment = document.createDocumentFragment();
          personsWithStatus.forEach((person) => {
            const card = document.createElement("div");
            card.className = "person-card";
            
            card.innerHTML = `
              ${person.id ? `<a href="/person/actor/${person.id}/" class="person-card-link">` : ''}
                <img src="${person.image || "/static/core/img/placeholder.png"}" alt="${person.name}">
                <p class="person-name">${person.name}</p>
              ${person.id ? '</a>' : ''}
              <label class="person-favorite" data-name="${person.name}" data-img="${person.image}" data-type="actor" data-id="${person.id || ''}">
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
          if (!data.status) {
            checkbox.checked = !checkbox.checked;
          }
        })
        .catch(() => {
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
      
      castData.forEach(member => {
        const castMember = document.createElement('div');
        
        if (member.id) {
          castMember.innerHTML = `
            <a href="/person/actor/${member.id}/" class="cast-member">
              <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                   alt="${member.name}" 
                   data-placeholder="/static/core/img/placeholder.png" 
                   onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
              <p class="actor-name">${member.name}</p>
              <p class="character-name">${member.character}</p>
              <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="actor" data-id="${member.id || ''}">
                <input type="checkbox">
                <span class="heart"></span>
              </label>
            </a>
          `;
        } else {
          castMember.innerHTML = `
            <div class="cast-member">
              <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                   alt="${member.name}" 
                   data-placeholder="/static/core/img/placeholder.png" 
                   onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
              <p class="actor-name">${member.name}</p>
              <p class="character-name">${member.character}</p>
              <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="actor" data-id="">
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
              
              if (member.id) {
                castMember.innerHTML = `
                  <a href="/person/actor/${member.id}/" class="cast-member">
                    <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                         alt="${member.name}" 
                         data-placeholder="/static/core/img/placeholder.png" 
                         onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                    <p class="actor-name">${member.name}</p>
                    <p class="character-name">${member.character}</p>
                    <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="actor" data-id="${member.id || ''}">
                      <input type="checkbox">
                      <span class="heart"></span>
                    </label>
                  </a>
                `;
              } else {
                castMember.innerHTML = `
                  <div class="cast-member">
                    <img src="${member.profile_path || '/static/core/img/placeholder.png'}" 
                         alt="${member.name}" 
                         data-placeholder="/static/core/img/placeholder.png" 
                         onerror="this.onerror=null;this.src=this.dataset.placeholder;" />
                    <p class="actor-name">${member.name}</p>
                    <p class="character-name">${member.character}</p>
                    <label class="cast-favorite" data-name="${member.name}" data-img="${member.profile_path || '/static/core/img/placeholder.png'}" data-type="actor" data-id="">
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
            }
          } else {
            scrollLoadingEnabled = false;
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
    const unitSelect = document.getElementById('log-progress-unit');
    let options = ['episode']; // Only episodes for seasons

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
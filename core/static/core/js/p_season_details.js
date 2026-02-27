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
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.style.display = 'none';

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
            if (banner) banner.style.backgroundImage = `url("${data.url}")`;
            showNotification('Banner uploaded successfully.', 'success');
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
            showNotification('Cover uploaded successfully.', 'success');
          } else {
            showNotification('Cover upload failed.', 'warning');
          }
        });
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

function showNotification(message, type) {
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

  // Banner background
  const banner = document.querySelector(".banner-section");
  if (banner && banner.dataset.banner) {
    banner.style.backgroundImage = `url("${banner.dataset.banner}")`;
  }
  
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
  window.addEventListener('beforeunload', function() {
    if (!document.activeElement || !document.activeElement.href || !document.activeElement.href.includes('/person/')) {
      sessionStorage.removeItem('loadedCastData');
      sessionStorage.removeItem('castCurrentPage');
      sessionStorage.removeItem('castScrollPosition');
    }
  });
});
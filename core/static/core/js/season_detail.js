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

function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 4rem;
    left: 50%;
    transform: translateX(-50%);
    background: #4CAF50;
    color: white;
    padding: 12px 24px;
    border-radius: 6px;
    z-index: 9999;
    font-weight: 500;
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2000);
}

document.addEventListener("DOMContentLoaded", function() {
  if (sessionStorage.getItem("refreshSuccess") === "1") {
    showNotification("Action has been done successfully!", "success");
    sessionStorage.removeItem("refreshSuccess");
  }

  // Banner background
  const banner = document.querySelector(".banner-section");
  if (banner && banner.dataset.banner) {
    banner.style.backgroundImage = `url("${banner.dataset.banner}")`;
  }
  
  const addBtn = document.getElementById("add-season-to-list-button");
  if (addBtn) {
    addBtn.addEventListener("click", function() {
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
  const searchBtn = document.getElementById("person-search-btn");
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

        data.forEach((person) => {
          const card = document.createElement("div");
          card.className = "person-card";
          card.innerHTML = `
            <img src="${person.image || "/static/core/img/placeholder.png"}" alt="${person.name}">
            <p class="person-name">${person.name}</p>
            <button class="favorite-btn" data-name="${person.name}" data-img="${person.image}" data-type="actor">⭐</button>
          `;
          resultsContainer.appendChild(card);
        });
      })
      .catch(() => {
        resultsContainer.innerHTML = "<p>Error fetching data.</p>";
      });
  }

  searchBtn?.addEventListener("click", performSearch);
  searchInput?.addEventListener("keyup", (e) => {
    if (e.key === "Enter") performSearch();
  });

  resultsContainer?.addEventListener("click", function (e) {
    if (e.target.classList.contains("favorite-btn")) {
      const btn = e.target;
      const name = btn.dataset.name;
      const image = btn.dataset.img;
      const type = btn.dataset.type;

      fetch("/api/toggle_favorite_person/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ name, image_url: image, type }),
      })
        .then((res) => res.json())
        .then((data) => {
          btn.textContent = data.status === "added" ? "✅" : "⭐";
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
});
document.addEventListener("DOMContentLoaded", function () {
  const bannerImg = document.getElementById("rotating-banner");
  const quoteBox = document.querySelector(".banner-quote");

  let bannerPool = [];
  let firstLoad = true;

  function initBannerRotator() {
    const cards = [...document.querySelectorAll(".card")];

    bannerPool = cards
      .map(card => {
        const bannerUrl = card.dataset.bannerUrl;
        const notes = card.dataset.notes?.trim();
        return bannerUrl && !bannerUrl.includes("placeholder")
          ? { bannerUrl, notes }
          : null;
      })
      .filter(Boolean);

    if (bannerPool.length === 0) return;

    updateBanner();
    setInterval(updateBanner, 30000); // rotate every 30 seconds
  }

  function updateBanner() {
    if (bannerPool.length === 0) return;

    const random = Math.floor(Math.random() * bannerPool.length);
    const { bannerUrl, notes } = bannerPool[random];

    if (firstLoad) {
      // Show banner immediately without fade
      bannerImg.src = bannerUrl;
      bannerImg.style.opacity = 1;

      if (quoteBox) {
        if (notes) {
          quoteBox.innerText = `“${notes}”\n\n~You`;
          quoteBox.style.display = "block";
          quoteBox.style.opacity = 1;
        } else {
          quoteBox.innerText = "";
          quoteBox.style.display = "none";
          quoteBox.style.opacity = 0;
        }
      }

      firstLoad = false;
      return;
    }

    // Fade out
    bannerImg.style.opacity = 0;
    if (quoteBox) quoteBox.style.opacity = 0;

    setTimeout(() => {
      bannerImg.src = bannerUrl;

      if (quoteBox) {
        if (notes) {
          quoteBox.innerText = `“${notes}”\n\n~You`;
          quoteBox.style.display = "block";
        } else {
          quoteBox.innerText = "";
          quoteBox.style.display = "none";
        }
        quoteBox.style.opacity = notes ? 1 : 0;
      }

      bannerImg.style.opacity = 1;
    }, 1000); // match CSS transition time
  }

  initBannerRotator();
});

function openFavoritesOverlay(category) {
  const id = `overlay-${slugify(category)}`;
  document.getElementById(id)?.classList.remove('hidden');
}

function closeFavoritesOverlay(categorySlug) {
  const id = `overlay-${categorySlug}`;
  document.getElementById(id)?.classList.add('hidden');
  location.reload();
}

// Helper to match Django's slugify (simplified version)
function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, '-');
}

  const notifButton = document.getElementById('notifications-button');
  const notifDropdown = document.getElementById('notifications-dropdown');

  notifButton.addEventListener('click', () => {
    const expanded = notifButton.getAttribute('aria-expanded') === 'true';
    notifButton.setAttribute('aria-expanded', String(!expanded));
    notifDropdown.hidden = expanded;  // toggle
  });

  // Dismiss notification handler
  document.querySelectorAll('.dismiss-notification').forEach(button => {
    button.addEventListener('click', function(event) {
      event.stopPropagation(); // prevent dropdown toggle
      const notifId = this.getAttribute('data-id');
      fetch(`/notifications/dismiss/${notifId}/`, {
        method: 'POST',
        headers: {
          'X-CSRFToken': getCookie("csrftoken"),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })
      .then(res => {
        if (res.ok) {
          const li = document.getElementById(`notification-${notifId}`);
          li.remove();

          // If no notifications left, show 'No notifications.'
          if (notifDropdown.querySelectorAll('li').length === 0) {
            notifDropdown.innerHTML = '<p class="no-notifications">No notifications.</p>';
            notifButton.classList.remove('has-notifications');
          }
        } else {
          alert('Failed to dismiss notification.');
        }
      });
    });
  });

  // Add or remove 'has-notifications' class to button depending on notifications count
  if (notifDropdown.querySelectorAll('li').length > 0) {
    notifButton.classList.add('has-notifications');
  }

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



  // Handle reorder button clicks inside a container (.card-grid)
function setupReorderButtons(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.card').forEach(card => {
const upBtn = card.querySelector('.move-up-btn');
const downBtn = card.querySelector('.move-down-btn');

    upBtn?.addEventListener('click', () => moveCard(card, container, -1));
    downBtn?.addEventListener('click', () => moveCard(card, container, 1));
  });
}

function moveCard(card, container, direction) {
  const cards = Array.from(container.children);
  const index = cards.indexOf(card);
  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= cards.length) return; // Can't move out of bounds

  // Swap card with the one in newIndex position
  container.insertBefore(card, direction === 1 ? cards[newIndex].nextSibling : cards[newIndex]);

  // After reorder, send updated order to backend
  saveNewOrder(container);
}

function saveNewOrder(container) {
  // Extract IDs from cards (you must add data-id="{{ person.id }}" in HTML)
  const ids = Array.from(container.children).map(card => card.dataset.id);
  console.log('Saving new order:', ids);

  // Send order to backend
  fetch('/api/favorite-persons/reorder/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCookie('csrftoken'),
    },
    body: JSON.stringify({ order: ids }),
  })
    .then(response => {
      if (!response.ok) throw new Error('Failed to save order');
      return response.json();
    })
    .then(data => {
      console.log('Order saved successfully', data);
    })
    .catch(error => {
      console.error('Error saving order:', error);
      alert('Error saving new order. Please try again.');
    });
}



// Initialize reorder buttons on page load for actors and characters
document.addEventListener('DOMContentLoaded', () => {
setupReorderButtons('actors-card-grid');
setupReorderButtons('characters-card-grid');
});


const toggleBtn = document.getElementById("toggle-activity-btn");
const advancedBtn = document.getElementById("advanced-activity-btn");
const hiddenActivities = document.querySelectorAll("#recent-activity-list .recent-activity-hidden");

toggleBtn?.addEventListener("click", () => {
  if (toggleBtn.dataset.state === "more") {
    hiddenActivities.forEach(el => el.classList.remove("recent-activity-hidden"));
    toggleBtn.textContent = "Show Less";
    toggleBtn.dataset.state = "less";
  } else {
    hiddenActivities.forEach(el => el.classList.add("recent-activity-hidden"));
    toggleBtn.textContent = "Show More";
    toggleBtn.dataset.state = "more";
  }
});

advancedBtn?.addEventListener("click", () => {
  window.location.href = "/history/";
});

document.querySelectorAll('.delete-person-btn').forEach(button => {
  button.addEventListener('click', function (e) {
    e.preventDefault();
    const card = this.closest('.card');
    const personId = card.dataset.id;
    const csrftoken = getCookie('csrftoken');

    if (confirm("Remove this person from favorites?")) {
      fetch(`/api/delete_favorite_person/${personId}/`, {
        method: 'DELETE',
        headers: {
          'X-CSRFToken': csrftoken,
        },
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          card.remove();
        } else {
          alert("Failed to delete.");
        }
      });
    }
  });
});

window.addEventListener("load", () => {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (!isMobile) return;  // only reload on phones

  // Only do this once per session so it doesn't loop forever
  if (!sessionStorage.getItem("statsReloaded")) {
    sessionStorage.setItem("statsReloaded", "yes");
    location.reload();
  }
});
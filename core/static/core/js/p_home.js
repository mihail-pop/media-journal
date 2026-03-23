document.addEventListener("DOMContentLoaded", function () {

  const bannerImg = document.getElementById("rotating-banner");
  const quoteBox = document.querySelector(".banner-quote");

  let bannerPool = [];
  let firstLoad = true;
  let lastBannerIndex = -1;

  function initBannerRotator() {
    const cards = [...document.querySelectorAll(".card")];

    bannerPool = cards
      .map(card => {
        const bannerUrl = card.dataset.bannerUrl;
        const notes = card.dataset.notes?.trim();
        const media_type = card.dataset.mediaType;
        return bannerUrl && !bannerUrl.includes("placeholder")
          ? { media_type,bannerUrl, notes: notes === "None" ? "" : notes }
          : null;
      })
      .filter(Boolean);

    if (bannerPool.length === 0) return;

    const currentSrc = bannerImg.getAttribute("src");
    if (firstLoad && currentSrc && !currentSrc.includes("placeholder.png")) {
        firstLoad = false; 
        // Start the timer for the NEXT rotation, but don't call updateBanner() now
        setInterval(updateBanner, 30000); 
        return; 
    }

    updateBanner();
    setInterval(updateBanner, 30000); // rotate every 30 seconds
  }

  function updateBanner() {
    if (bannerPool.length === 0) return;

    let random;
    if (bannerPool.length > 1) {
      do {
        random = Math.floor(Math.random() * bannerPool.length);
      } while (random === lastBannerIndex);
    } else {
      random = 0;
    }
    lastBannerIndex = random;

    const { media_type, bannerUrl, notes } = bannerPool[random];

    if (firstLoad) {
      // Show banner immediately without fade
      bannerImg.src = bannerUrl;
      bannerImg.style.opacity = 1;
      bannerImg.alt = media_type;

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
      bannerImg.alt = media_type;
      
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
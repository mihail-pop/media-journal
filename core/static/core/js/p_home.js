document.addEventListener("DOMContentLoaded", function () {

  const bannerImg = document.getElementById("rotating-banner");
  const quoteBox = document.querySelector(".banner-quote");

  const statsContainer = document.getElementById("stats-view-container");
  const collectionsContainer = document.getElementById("collections-view-container");
  
  if (statsContainer && collectionsContainer) {
    const savedView = localStorage.getItem("homeDashboardView") || "stats";
    
    // Initial Load Check
    if (savedView === "collections") {
      statsContainer.style.display = "none";
      collectionsContainer.style.display = "block";
    } else {
      statsContainer.style.display = "block";
      collectionsContainer.style.display = "none";
    }

    // Toggle to Collections
    document.querySelectorAll('.swap-to-collections').forEach(btn => {
      btn.addEventListener('click', () => {
        statsContainer.style.display = "none";
        collectionsContainer.style.display = "block";
        localStorage.setItem("homeDashboardView", "collections");
      });
    });

    // Toggle to Stats
    document.querySelectorAll('.swap-to-stats').forEach(btn => {
      btn.addEventListener('click', () => {
        statsContainer.style.display = "block";
        collectionsContainer.style.display = "none";
        localStorage.setItem("homeDashboardView", "stats");
      });
    });
  }

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

  // --- 1. DEFINE YOUR CUSTOM RELEASE NOTIFICATIONS HERE ---
  const SYSTEM_NOTIFICATIONS = [
    {
      id: "sys_1_24_refresh",
      html: "If you are updating from a release before v1.24.0 go to <a href='/settings/'>Settings > Refresh</a> to get genres and creators for all media items."
    },
    {
      id: "sys_1_24_stats",
      html: "On home page you can press on the 'Stats' title to swap to Collections."
    }
  ];

  // --- 2. INJECT ACTIVE SYSTEM NOTIFICATIONS ---
  let ul = notifDropdown.querySelector('ul');
  const noNotifs = notifDropdown.querySelector('.no-notifications');
  
  // Get dismissed notifications from the browser
  const dismissedSysNotifs = JSON.parse(localStorage.getItem('dismissedSysNotifs') || '[]');
  const activeSysNotifs = SYSTEM_NOTIFICATIONS.filter(n => !dismissedSysNotifs.includes(n.id));

  if (activeSysNotifs.length > 0) {
    if (noNotifs) noNotifs.remove();
    if (!ul) {
      ul = document.createElement('ul');
      notifDropdown.appendChild(ul);
    }
    
    // Add them to the top of the dropdown
    activeSysNotifs.forEach(notif => {
      const li = document.createElement('li');
      li.id = `notification-${notif.id}`;
      li.classList.add('system-notification');
      
      // Create a span container to hold the mixed text and HTML link
      const textContainer = document.createElement('span');
      textContainer.style.flexGrow = '1';
      textContainer.style.marginRight = '10px';
      textContainer.innerHTML = notif.html;
      
      const btn = document.createElement('button');
      btn.className = 'dismiss-notification';
      btn.setAttribute('data-id', notif.id);
      btn.setAttribute('aria-label', 'Dismiss notification');
      btn.textContent = '✕';
      
      li.appendChild(textContainer);
      li.appendChild(btn);
      ul.insertBefore(li, ul.firstChild);
    });
  }

  // --- 3. UI TOGGLE & EMPTY CHECK HELPER ---
  notifButton.addEventListener('click', () => {
    const expanded = notifButton.getAttribute('aria-expanded') === 'true';
    notifButton.setAttribute('aria-expanded', String(!expanded));
    notifDropdown.hidden = expanded;  
  });

  function checkEmptyNotifications() {
    if (notifDropdown.querySelectorAll('li').length === 0) {
      notifDropdown.innerHTML = '<p class="no-notifications">No notifications.</p>';
      notifButton.classList.remove('has-notifications');
    }
  }

  // --- 4. DISMISS HANDLER (Handles both DB and LocalStorage) ---
  notifDropdown.addEventListener('click', function(event) {
    if (event.target.classList.contains('dismiss-notification')) {
      event.stopPropagation(); // prevent dropdown from closing
      const notifId = event.target.getAttribute('data-id');

      // A. If it's a hardcoded system notification
      if (notifId.startsWith('sys_')) {
        const dismissed = JSON.parse(localStorage.getItem('dismissedSysNotifs') || '[]');
        if (!dismissed.includes(notifId)) {
          dismissed.push(notifId);
          localStorage.setItem('dismissedSysNotifs', JSON.stringify(dismissed));
        }
        
        const li = document.getElementById(`notification-${notifId}`);
        if (li) li.remove();
        checkEmptyNotifications();
        return;
      }

      // B. If it's a backend DB notification (seasons/sequels)
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
          if (li) li.remove();
          checkEmptyNotifications();
        } else {
          alert('Failed to dismiss notification.');
        }
      });
    }
  });

  // Add or remove 'has-notifications' styling depending on final count
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
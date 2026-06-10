document.addEventListener("DOMContentLoaded", function () {

  const bannerImg = document.getElementById("rotating-banner");
  const quoteBox = document.querySelector(".banner-quote");

  const statsContainer = document.getElementById("stats-view-container");
  const collectionsContainer = document.getElementById("collections-view-container");
  
  const activityContainer = document.getElementById("activity-view-container");
  const upcomingContainer = document.getElementById("upcoming-view-container");

  if (activityContainer && upcomingContainer) {
    const savedActView = localStorage.getItem("homeDashboardActivityView") || "activity";
    
    if (savedActView === "upcoming") {
      activityContainer.style.display = "none";
      upcomingContainer.style.display = "block";
    } else {
      activityContainer.style.display = "block";
      upcomingContainer.style.display = "none";
    }

    // Toggle to Upcoming
    document.querySelectorAll('.swap-to-upcoming').forEach(btn => {
      btn.addEventListener('click', () => {
        activityContainer.style.display = "none";
        upcomingContainer.style.display = "block";
        localStorage.setItem("homeDashboardActivityView", "upcoming");
        centerTodayTile();
      });
    });

    // Toggle to Activity
    document.querySelectorAll('.swap-to-activity').forEach(btn => {
      btn.addEventListener('click', () => {
        activityContainer.style.display = "block";
        upcomingContainer.style.display = "none";
        localStorage.setItem("homeDashboardActivityView", "activity");
      });
    });

    // Center the today tile on load if upcoming is active
    if (savedActView === "upcoming") {
        setTimeout(centerTodayTile, 100);
    }
  }

  function centerTodayTile() {
      const tilesContainer = document.querySelector('.upcoming-tiles-container');
      const todayTile = document.querySelector('.today-tile');
      
      if (tilesContainer && todayTile) {
          requestAnimationFrame(() => {
              const containerRect = tilesContainer.getBoundingClientRect();
              const tileRect = todayTile.getBoundingClientRect();
              
              const containerCenter = tilesContainer.clientWidth / 2;
              const tileCenter = todayTile.clientWidth / 2;
              
              // Calculate accurate absolute scroll position
              const scrollPos = tilesContainer.scrollLeft + (tileRect.left - containerRect.left) - containerCenter + tileCenter;
              
              tilesContainer.scrollTo({ left: scrollPos, behavior: 'smooth' });
          });
      }
  }

  // Convert vertical mouse wheel scrolling into horizontal scrolling for the tiles
  const tilesContainer = document.querySelector('.upcoming-tiles-container');
  if (tilesContainer) {
      tilesContainer.addEventListener('wheel', (e) => {
          if (e.deltaY !== 0) {
              e.preventDefault();
              // Scroll naturally based on the scroll wheel's native delta
              // This fixes the stuttering caused by overlapping 'smooth' animations
              tilesContainer.scrollLeft += e.deltaY;
          }
      }, { passive: false });
  }

  // --- Tooltip Logic for Upcoming Pills ---
  const body = document.body;
  const tooltip = document.createElement('div');
  tooltip.className = 'pill-global-tooltip';
  body.appendChild(tooltip);

  document.querySelectorAll('.home-event-pill').forEach(pill => {
      pill.addEventListener('mouseenter', (e) => {
          tooltip.innerHTML = pill.querySelector('.pill-tooltip-content').innerHTML;
          tooltip.dataset.mediaType = pill.dataset.mediaType;
          tooltip.style.display = 'flex';
          
          const rect = pill.getBoundingClientRect();
          // Position to the right of the pill
          tooltip.style.top = `${rect.top - 10}px`;
          let leftPos = rect.right + 10;
          
          // Prevent overflowing screen width
          if (leftPos + 250 > window.innerWidth) {
              leftPos = rect.left - 260; // Show on left instead
          }
          tooltip.style.left = `${leftPos}px`; 
      });
      pill.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
      });
  });
  
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
      id: "sys_1_25_refresh_movies",
      html: "If you are updating from a release before v1.26.0 go to <a href='/settings/'>Settings > Refresh</a> and do Refresh Movies to get Length/Runtime for your movies."
    },
    {
      id: "sys_1_25_shard",
      html: "I improved how images are stored to keep the app fast and stable in the long run. Please <a href='#' id='trigger-sharding-btn' style='font-weight:bold; color:#e91e63;'>click here to update your existing images</a>. (Do not close the page until it finishes)"
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
      textContainer.className = 'notification-text';
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

      // B. If it's a backend DB notification
      let fetchUrl = `/notifications/dismiss/${notifId}/`;
      
      // If it's a calendar event notification, use the calendar endpoint
      if (notifId.startsWith('cal_')) {
          const trueId = notifId.split('_')[1];
          fetchUrl = `/api/calendar/dismiss-notify/${trueId}/`;
      }

      fetch(fetchUrl, {
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

// Upcoming List toggle
const upcomingToggleBtn = document.getElementById("toggle-upcoming-btn");
const hiddenUpcoming = document.querySelectorAll("#upcoming-activity-list .upcoming-activity-hidden");

upcomingToggleBtn?.addEventListener("click", () => {
  if (upcomingToggleBtn.dataset.state === "more") {
    hiddenUpcoming.forEach(el => el.classList.remove("upcoming-activity-hidden"));
    upcomingToggleBtn.textContent = "Show Less";
    upcomingToggleBtn.dataset.state = "less";
  } else {
    hiddenUpcoming.forEach(el => el.classList.add("upcoming-activity-hidden"));
    upcomingToggleBtn.textContent = "Show More";
    upcomingToggleBtn.dataset.state = "more";
  }
});


// --- SHARDING MIGRATION LOGIC ---
document.body.addEventListener('click', function(e) {
  if (e.target.id === 'trigger-sharding-btn') {
      e.preventDefault();
      
      // 1. Create a dark loading overlay so the user can't click away
      const overlay = document.createElement('div');
      overlay.id = 'sharding-overlay';
      overlay.innerHTML = `
        <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; justify-content:center; align-items:center; flex-direction:column; color:white;">
          <div style="font-size:1.5rem; font-weight:bold; margin-bottom: 15px;">Migrating images to new architecture...</div>
          <div style="font-size:1.1rem;">Please do not close or refresh this page.</div>
          <div style="margin-top: 30px; border: 4px solid #f3f3f3; border-top: 4px solid #e91e63; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
        </div>
        <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
      `;
      document.body.appendChild(overlay);

      // 2. Trigger the API
      fetch('/api/shard_existing_images/', {
          method: 'POST',
          headers: {
              'X-CSRFToken': getCookie("csrftoken"),
              'Content-Type': 'application/json'
          }
      })
      .then(res => res.json())
      .then(data => {
          document.getElementById('sharding-overlay').remove();
          if (data.success) {
              alert("Migration complete! All your existing images are safely sharded.");
              // Automatically dismiss the notification
              const dismissed = JSON.parse(localStorage.getItem('dismissedSysNotifs') || '[]');
              if (!dismissed.includes("sys_1_25_shard")) {
                  dismissed.push("sys_1_25_shard");
                  localStorage.setItem('dismissedSysNotifs', JSON.stringify(dismissed));
              }
              const notifLi = document.getElementById('notification-sys_1_25_shard');
              if (notifLi) notifLi.remove();
              checkEmptyNotifications();
          } else {
              alert("An error occurred: " + data.error);
          }
      })
      .catch(err => {
          document.getElementById('sharding-overlay').remove();
          alert("A network error occurred. Check the server terminal logs.");
      });
  }
});
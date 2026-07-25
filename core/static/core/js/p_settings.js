// ----- CSRF Token Getter (must be global) -----
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
}

function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.textContent = message;
  const isMobile = window.matchMedia("(orientation: portrait)").matches;
  notification.style.cssText = `
    position: fixed;
    top: ${isMobile ? '5rem' : '4rem'};
    left: 50%;
    transform: translateX(-50%);
    background: #4CAF50;
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
  setTimeout(() => notification.remove(), 2000);
}

// ----- Rating Mode (Scoring System) -----
function saveRatingMode(value) {
  fetch("/update-rating-mode/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
    body: JSON.stringify({ rating_mode: value }),
  })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        showNotification("Scoring system updated!");
      } else {
        alert(res.error || "Failed to update scoring system.");
      }
    })
    .catch(err => {
      alert("Request failed.");
    });
}

document.addEventListener("DOMContentLoaded", function () {
  // ----- Custom Select for Rating Mode -----
  function setupCustomSelect() {
    const wrapper = document.querySelector('.custom-select-wrapper');
    if (!wrapper) return;

    const select = wrapper.querySelector('.custom-select');
    const trigger = select.querySelector('.custom-select-trigger');
    const options = select.querySelectorAll('.custom-option');
    const originalSelect = document.getElementById('rating-mode-select');

    trigger.addEventListener('click', () => {
      if (!select.classList.contains('open')) {
        const rect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        
        if (spaceBelow < 220 && rect.top > spaceBelow) {
          select.classList.add('drop-up');
        } else {
          select.classList.remove('drop-up');
        }
      }
      select.classList.toggle('open');
    });

    // Handle option click
    options.forEach(option => {
      option.addEventListener('click', () => {
        // Update original select
        originalSelect.value = option.dataset.value;

        // Update trigger
        trigger.innerHTML = option.innerHTML;
        const arrow = document.createElement('div');
        arrow.className = 'arrow';
        trigger.appendChild(arrow);

        // Update selected class
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        // Close dropdown
        select.classList.remove('open');

        // Auto-save
        saveRatingMode(option.dataset.value);
      });
    });

    // Close when clicking outside
    window.addEventListener('click', e => {
      if (!select.contains(e.target)) {
        select.classList.remove('open');
      }
    });

    // Set initial value from the original select
    const selectedValue = originalSelect.value;
    const initialOption = select.querySelector(`.custom-option[data-value="${selectedValue}"]`);
    if (initialOption) {
      trigger.innerHTML = initialOption.innerHTML;
      const arrow = document.createElement('div');
      arrow.className = 'arrow';
      trigger.appendChild(arrow);
      initialOption.classList.add('selected');
    }
  }
  setupCustomSelect();

  // ----- Custom Select for Font Family -----
  function setupFontCustomSelect() {
    const wrapper = document.getElementById('font-select-wrapper');
    if (!wrapper) return;

    const select = wrapper.querySelector('#font-custom-select');
    const trigger = select.querySelector('.custom-select-trigger');
    const options = select.querySelectorAll('.custom-option');
    const originalSelect = document.getElementById('font-family-select');

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!select.classList.contains('open')) {
        const rect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        
        if (spaceBelow < 220 && rect.top > spaceBelow) {
          select.classList.add('drop-up');
        } else {
          select.classList.remove('drop-up');
        }
      }
      select.classList.toggle('open');
    });

    // Handle option click
    options.forEach(option => {
      option.addEventListener('click', () => {
        const value = option.dataset.value;
        originalSelect.value = value;

        // Update trigger
        trigger.innerHTML = option.innerHTML;
        const arrow = document.createElement('div');
        arrow.className = 'arrow';
        trigger.appendChild(arrow);

        // Update selected class
        options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        // Close dropdown
        select.classList.remove('open');

        // Save preference and apply immediately
        localStorage.setItem('user-font', value);
        document.documentElement.setAttribute('data-font', value);
        showNotification("Font style updated!");
      });
    });

    // Close when clicking outside
    window.addEventListener('click', e => {
      if (!select.contains(e.target)) {
        select.classList.remove('open');
      }
    });

    // Set initial value from localStorage (handle legacy 'system' key)
    let savedFont = localStorage.getItem('user-font') || 'segoe';
    if (savedFont === 'system') savedFont = 'segoe';

    originalSelect.value = savedFont;
    const initialOption = select.querySelector(`.custom-option[data-value="${savedFont}"]`);
    if (initialOption) {
      trigger.innerHTML = initialOption.innerHTML;
      const arrow = document.createElement('div');
      arrow.className = 'arrow';
      trigger.appendChild(arrow);
      initialOption.classList.add('selected');
    }
  }
  setupFontCustomSelect();

  // ----- Navigation Buttons Logic -----
  const navForm = document.getElementById("nav-items-form");

  if (navForm) {
    let draggedItem = null;

    // Click to toggle visibility
    navForm.addEventListener('click', (e) => {
      const box = e.target.closest('.nav-item-box');
      if (box && !e.target.closest('.nav-item-checkbox')) {
        const checkbox = box.querySelector('.nav-item-checkbox');
        checkbox.checked = !checkbox.checked;
        box.classList.toggle('active', checkbox.checked);
        saveNavItems();
      }
    });

    // Drag and drop
    navForm.addEventListener('dragstart', (e) => {
      const box = e.target.closest('.nav-item-box');
      if (box) {
        draggedItem = box;
        setTimeout(() => box.classList.add('dragging'), 0);
      }
    });

    navForm.addEventListener('dragend', (e) => {
      const box = e.target.closest('.nav-item-box');
      if (box) {
        box.classList.remove('dragging');
        saveNavItems();
        draggedItem = null;
      }
    });

    navForm.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = getDragAfterElement(navForm, e.clientX);
      const dragging = navForm.querySelector('.dragging');
      if (dragging) {
        if (afterElement == null) {
          navForm.appendChild(dragging);
        } else {
          navForm.insertBefore(dragging, afterElement);
        }
      }
    });

    function getDragAfterElement(container, x) {
      const draggableElements = [...container.querySelectorAll('.nav-item-box:not(.dragging)')];
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function saveNavItems() {
      const boxes = document.querySelectorAll(".nav-item-box");
      const data = Array.from(boxes).map((box, index) => ({
        id: box.dataset.id,
        position: index + 1,
        visible: box.querySelector(".nav-item-checkbox").checked
      }));

      fetch("/update-nav-items/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ items: data }),
      })
        .then(res => res.json())
        .then(res => {
          if (res.success) {
            showNotification("Navigation buttons updated!");
            setTimeout(() => window.location.reload(true), 1000);
          } else {
            alert("Update failed.");
          }
        })
        .catch(err => {
          console.error("Error:", err);
          alert("Error updating items.");
        });
    }
  }

// ----- Details Sections Logic -----
  const detailsForm = document.getElementById("details-sections-form");

  if (detailsForm) {
    let draggedDetailsItem = null;

    detailsForm.addEventListener('click', (e) => {
      const box = e.target.closest('.details-section-box');
      if (box) {
        const checkbox = box.querySelector('.details-checkbox');
        checkbox.checked = !checkbox.checked;
        box.classList.toggle('active', checkbox.checked);
        saveDetailsSections();
      }
    });

    detailsForm.addEventListener('dragstart', (e) => {
      const box = e.target.closest('.details-section-box');
      if (box) {
        draggedDetailsItem = box;
        setTimeout(() => box.classList.add('dragging'), 0);
      }
    });

    detailsForm.addEventListener('dragend', (e) => {
      const box = e.target.closest('.details-section-box');
      if (box) {
        box.classList.remove('dragging');
        saveDetailsSections();
        draggedDetailsItem = null;
      }
    });

    detailsForm.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = getDragAfterDetailsElement(detailsForm, e.clientX, e.clientY);
      const dragging = detailsForm.querySelector('.dragging');
      if (dragging) {
        if (afterElement == null) {
          detailsForm.appendChild(dragging);
        } else {
          detailsForm.insertBefore(dragging, afterElement);
        }
      }
    });

    function getDragAfterDetailsElement(container, x, y) {
      const draggableElements = [...container.querySelectorAll('.details-section-box:not(.dragging)')];
      
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        // 2D grid calculation: checks if mouse Y is within the row of this specific box
        const inRow = y > box.top && y < box.bottom;
        if (inRow) {
          const offset = x - box.left - box.width / 2;
          if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
          }
        }
        return closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function saveDetailsSections() {
      const boxes = detailsForm.querySelectorAll(".details-section-box");
      const data = Array.from(boxes).map(box => ({
        id: box.dataset.id,
        name: box.querySelector(".details-name").textContent,
        visible: box.querySelector(".details-checkbox").checked
      }));

      fetch("/update-details-sections/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ sections: data }),
      })
        .then(res => res.json())
        .then(res => {
          if (res.success) {
            showNotification("Details sections updated!");
          } else {
            alert("Update failed.");
          }
        })
        .catch(err => {
          console.error("Error:", err);
          alert("Error updating sections.");
        });
    }
  }

  // ----- API Key Management -----
  document.querySelectorAll(".save-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const id = row.dataset.id;
      const keyName = row.querySelector(".key-name").value;
      const key1 = row.querySelector(".key-1").value;
      const key2 = row.querySelector(".key-2").value;

      const response = await fetch("/api/update_key/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ id, name: keyName, key_1: key1, key_2: key2 }),
      });

      const data = await response.json();
      alert(data.message || data.error);
    });
  });

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("tr");
      const id = row.dataset.id;

      const response = await fetch("/api/delete_key/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ id }),
      });

      const data = await response.json();
      alert(data.message || data.error);
      if (response.ok) {
        row.remove();
        // Show add row if it was hidden
        const addRow = document.getElementById('add-key-row');
        if (addRow) addRow.style.display = '';
      }
    });
  });

  const addKeyBtn = document.getElementById("add-key-btn");
  if (addKeyBtn) {
    addKeyBtn.addEventListener("click", async () => {
      const name = document.getElementById("new-name").value;
      const key1 = document.getElementById("new-key-1").value;
      const key2 = document.getElementById("new-key-2").value;

      if (!name) return alert("Please select an API name.");

      const response = await fetch("/api/add_key/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ name, key_1: key1, key_2: key2 }),
      });

      const data = await response.json();
      alert(data.message || data.error);
      if (response.ok) location.reload();
    });
  }

  // Password masking for API keys
  document.querySelectorAll('.api-key-input').forEach(input => {
    input.addEventListener('focus', function() {
      this.type = 'text';
    });
    input.addEventListener('blur', function() {
      this.type = 'password';
    });
  });
});

// ----- Backup Import/Export -----
function showProgressModal(title) {
  let modal = document.getElementById('backup-progress-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'backup-progress-modal';
    modal.className = 'backup-modal-overlay';
    modal.innerHTML = `
      <div class="backup-modal-content">
        <h3 id="backup-modal-title" style="margin-top: 0; margin-bottom: 1rem;">${title}</h3>
        <div style="background: rgba(255,255,255,0.1); height: 20px; border-radius: 10px; overflow: hidden; margin-bottom: 1rem; position: relative;">
          <div id="backup-progress-bar" class="progress-animated" style="width: 0%; height: 100%; background-color: #4CAF50; transition: width 0.3s ease;"></div>
        </div>
        <p id="backup-status-text" style="margin-bottom: 1.5rem; font-size: 0.9rem; opacity: 0.9;">Initializing...</p>
        <button id="backup-cancel-btn" style="background: #dc3545; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    document.getElementById('backup-modal-title').textContent = title;
    document.getElementById('backup-progress-bar').style.width = '0%';
    document.getElementById('backup-status-text').textContent = 'Initializing...';
  }

  modal.style.display = 'flex';
  void modal.offsetWidth; // Trigger reflow
  modal.classList.add('visible');

  const cancelBtn = document.getElementById('backup-cancel-btn');
  const progressBar = document.getElementById('backup-progress-bar');
  const statusText = document.getElementById('backup-status-text');
  let pollInterval = null;
  let currentTaskId = null;

  const closeModal = () => {
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 300);
    if (pollInterval) clearInterval(pollInterval);
  };

  cancelBtn.onclick = () => {
    if (currentTaskId) {
      fetch(`/backup/cancel/${currentTaskId}/`);
    }
    closeModal();
  };

  return {
    updateMessage: (msg) => {
      statusText.textContent = msg;
    },
    startPolling: (taskId, isDownload = true, successMsg = "Process completed successfully!") => {
      currentTaskId = taskId;
      pollInterval = setInterval(() => {
        fetch(`/backup/status/${taskId}/`)
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              clearInterval(pollInterval);
              alert("Error: " + data.error);
              closeModal();
              return;
            }

            progressBar.style.width = `${data.progress}%`;
            
            // Format: "Message... Details"
            const message = data.message || 'Processing';
            const details = data.details || '';
            statusText.textContent = `${message}... ${details}`;

            if (data.status === 'completed') {
              clearInterval(pollInterval);
              statusText.textContent = "Completed!";
              progressBar.style.width = '100%';
              
              setTimeout(() => {
                closeModal();
                if (isDownload) {
                  window.location.href = `/backup/download/${taskId}/`;
                } else {
                  showNotification(successMsg);
                  setTimeout(() => window.location.reload(), 1000);
                }
              }, 800);
            } else if (data.status === 'cancelled' || data.status === 'error') {
              clearInterval(pollInterval);
              closeModal();
              if (data.status === 'error') alert("Process failed: " + data.error);
            }
          })
          .catch(err => {
            console.error(err);
            clearInterval(pollInterval);
            closeModal();
          });
      }, 1000);
    },
    close: closeModal
  };
}

const downloadBtn = document.getElementById("download-backup-btn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    const modal = showProgressModal("Creating Backup");
    fetch("/backup/export/")
      .then(res => res.json())
      .then(data => {
        if (data.task_id) {
          modal.startPolling(data.task_id, true);
        } else {
          alert("Failed to start backup.");
          modal.close();
        }
      })
      .catch(err => {
        console.error(err);
        alert("Error starting backup.");
        modal.close();
      });
  });
}

const uploadBtn = document.getElementById("upload-backup-btn");
const uploadInput = document.getElementById("upload-backup-input");

if (uploadBtn && uploadInput) {
  uploadBtn.addEventListener("click", () => {
    uploadInput.click();
  });

  uploadInput.addEventListener("change", function () {
    const file = this.files[0];
    if (!file) return;

    const modal = showProgressModal("Restoring Backup");
    modal.updateMessage("Uploading backup file... Please wait.");

    const formData = new FormData();
    formData.append("backup_file", file);
    const csrftoken = getCookie("csrftoken");

    fetch("/backup/import/", {
      method: "POST",
      headers: {
        "X-CSRFToken": csrftoken,
      },
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.task_id) {
          modal.startPolling(data.task_id, false, "Backup restored successfully!");
        } else {
          alert(data.error || "Upload failed.");
          modal.close();
        }
      })
      .catch((err) => {
        console.error("Backup import failed:", err);
        alert("Backup import failed.");
        modal.close();
      })
      .finally(() => { uploadInput.value = ""; });
  });
}

// ----- Refresh Functionality -----
const refreshAllBtn = document.getElementById("refresh-all-btn");
if (refreshAllBtn) {
  refreshAllBtn.addEventListener("click", () => {
    startRefresh("all", "Refreshing All Items");
  });
}

document.querySelectorAll(".refresh-type-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const mediaType = e.target.closest('.refresh-type-btn').dataset.type;
    const displayType = mediaType === 'tvshows' ? 'TV Shows' : mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
    const title = `Refreshing ${displayType}`;
    startRefresh(mediaType, title);
  });
});

function startRefresh(mediaType, title) {
  // Extract which checkboxes the user has selected
  const selectedFields = Array.from(document.querySelectorAll('.refresh-field-checkbox:checked')).map(cb => cb.value);

  const modal = showProgressModal(title);
  modal.updateMessage("Initializing refresh... Please wait.");
  
  fetch("/settings/refresh-data/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
    body: JSON.stringify({ media_type: mediaType, fields: selectedFields }),
  })
    .then(res => res.json())
    .then(data => {
      if (data.task_id) {
        modal.startPolling(data.task_id, false, "Refresh completed successfully!");
      } else {
        alert(data.error || "Failed to start refresh.");
        modal.close();
      }
    })
    .catch(err => {
      console.error(err);
      alert("Error starting refresh.");
      modal.close();
    });
}

// ----- Tab Functionality & API Status Checks -----
const API_CONFIG = {
  tmdb: { name: "TMDB", desc: "Movies, TV" },
  anilist: { name: "AniList", desc: "Anime, Manga" },
  igdb: { name: "IGDB", desc: "Games" },
  openlib: { name: "OpenLibrary", desc: "Books" },
  musicbrainz: { name: "MusicBrainz", desc: "Music" }
};

const STATUS_CONFIG = {
  ok: { text: "Operational", class: "ok", color: "#10b981" },
  down: { text: "Down", class: "down", color: "#ef4444" },
  rate_limited: { text: "Rate Limited", class: "rate_limited", color: "#f59e0b" },
  missing_key: { text: "Missing Key", class: "missing_key", color: "#6b7280" },
  invalid_key: { text: "Invalid Key", class: "invalid_key", color: "#6b7280" },
  auth_error: { text: "Auth Error", class: "auth_error", color: "#ef4444" },
};

function renderApiStatuses(statuses) {
  const container = document.getElementById("api-status-container");
  container.innerHTML = "";
  
  for (const [key, config] of Object.entries(API_CONFIG)) {
      const statusKey = statuses[key] || "down";
      const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG["down"];
      
      const div = document.createElement("div");
      div.className = "api-status-item";
      div.innerHTML = `
          <div class="api-status-name">${config.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-primary); margin-top: -0.4rem;">${config.desc}</div>
          <div class="api-status-indicator" style="color: ${cfg.color}">
              <div class="status-dot ${cfg.class}"></div>
              ${cfg.text}
          </div>
      `;
      container.appendChild(div);
  }
}

function updateTimestampText(ms) {
  const d = new Date(ms);
  document.getElementById("api-status-timestamp").textContent = `Last checked: ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}`;
}

function checkApiStatusIfNeeded(force = false) {
  const container = document.getElementById("api-status-container");
  const timestampEl = document.getElementById("api-status-timestamp");
  
  const lastCheck = localStorage.getItem("apiStatusLastCheck");
  const cachedData = localStorage.getItem("apiStatusData");
  const now = Date.now();
  
  // 10 minutes cache (600,000 ms)
  if (!force && lastCheck && cachedData && (now - parseInt(lastCheck)) < 600000) {
      renderApiStatuses(JSON.parse(cachedData));
      updateTimestampText(parseInt(lastCheck));
      return;
  }
  
  // Show loading state
  container.innerHTML = '<div class="api-status-loading"><div class="spinner"></div><p style="margin-top:1rem; color: var(--text-secondary);">Pinging APIs...</p></div>';
  timestampEl.textContent = "Checking...";
  
  fetch("/api/status-check/")
    .then(res => res.json())
    .then(data => {
        localStorage.setItem("apiStatusLastCheck", now.toString());
        localStorage.setItem("apiStatusData", JSON.stringify(data.statuses));
        renderApiStatuses(data.statuses);
        updateTimestampText(now);
    })
    .catch(err => {
        container.innerHTML = '<div class="api-status-loading" style="color:#ef4444;">Failed to check API status.</div>';
        timestampEl.textContent = "Error";
    });
}

// Bind the Check Now button
document.getElementById("refresh-api-status-btn")?.addEventListener("click", () => {
  checkApiStatusIfNeeded(true);
});

// Tab Switcher
document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => {
    const tabId = button.dataset.tab;
    
    // Remove active class from all tabs and content
    document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
    
    // Add active class to clicked tab and corresponding content
    button.classList.add("active");
    document.getElementById(tabId).classList.add("active");

    // Trigger API check ONLY when the info tab opens
    if (tabId === "information") {
        checkApiStatusIfNeeded(false);
    }
  });
});

document.addEventListener("DOMContentLoaded", function() {
  function savePreferences() {
    const showDate = document.getElementById("show-date-field").checked;
    const showRepeats = document.getElementById("show-repeats-field").checked;
    const showCollections = document.getElementById("show-collections-field").checked;

    fetch("/settings/update_preferences/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({
        show_date_field: showDate,
        show_repeats_field: showRepeats,
        show_collections_field: showCollections,
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showNotification("Edit modal preferences updated!");
      } else {
        alert("Failed to save preferences.");
      }
    });
  }

  const dateField = document.getElementById("show-date-field");
  const repeatsField = document.getElementById("show-repeats-field");
  const collectionsField = document.getElementById("show-collections-field");

  function updateHoverTitle(checkbox, fieldName) {
    const label = checkbox.closest('.preference-toggle-label');
    if (label) {
      label.title = checkbox.checked ? `Hide ${fieldName} field` : `Show ${fieldName} field`;
    }
  }

  if (dateField) {
    dateField.addEventListener("change", function() {
      savePreferences();
      updateHoverTitle(this, "Activity Date");
    });
  }
  if (repeatsField) {
    repeatsField.addEventListener("change", function() {
      savePreferences();
      updateHoverTitle(this, "Repeats");
    });
  }
  if (collectionsField) {
    collectionsField.addEventListener("change", function() {
      savePreferences();
      updateHoverTitle(this, "Collections");
    });
  }
});

// Update tooltip text dynamically for checkboxes
document.addEventListener("DOMContentLoaded", function() {
  const checkboxes = document.querySelectorAll('.toggle-visible');
  
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      this.setAttribute('data-tooltip', this.checked ? 'Hide' : 'Show');
    });
  });

  // Version checking
  checkVersions();
});

function checkVersions() {
  fetch('/api/version_info/')
    .then(response => response.json())
    .then(data => {
      const currentVersionEl = document.getElementById('current-version');
      const latestVersionEl = document.getElementById('latest-version');
      
      currentVersionEl.innerHTML = `<a href="https://github.com/mihail-pop/media-journal/releases/tag/${data.current_version}" target="_blank" style="text-decoration: none;">${data.current_version}</a>`;
      latestVersionEl.innerHTML = `<a href="https://github.com/mihail-pop/media-journal/releases/tag/${data.latest_version}" target="_blank" style="text-decoration: none;">${data.latest_version}</a>`;
      
      const status = document.getElementById('update-status');
      if (data.current_version === data.latest_version) {
        status.innerHTML = '<a href="https://github.com/mihail-pop/media-journal/releases" target="_blank" style="color: #4CAF50; text-decoration: none;">✓ You have the latest version</a>';
      } else {
        status.innerHTML = '<a href="https://github.com/mihail-pop/media-journal/releases" target="_blank" style="color: #ff9800; text-decoration: none;">↻ Update available</a>';
      }
    })
    .catch(() => {
      document.getElementById('current-version').textContent = 'Unknown';
      document.getElementById('latest-version').textContent = 'Unable to check';
    });
}

// Theme switching functionality
document.addEventListener("DOMContentLoaded", function() {
  const themeOptions = document.querySelectorAll('.theme-option:not(.disabled)');
  
  themeOptions.forEach(option => {
    option.addEventListener('click', function() {
      const theme = this.dataset.theme;
      
      // Apply theme immediately
      document.documentElement.setAttribute('data-theme', theme);
      
      // Update active state
      themeOptions.forEach(opt => opt.classList.remove('active'));
      this.classList.add('active');
      
      // Save theme to backend
      fetch('/settings/update_theme/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken'),
        },
        body: JSON.stringify({ theme_mode: theme }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showNotification('Theme updated successfully!');
        } else {
          alert('Failed to update theme.');
        }
      })
      .catch(err => {
        alert('Request failed.');
      });
    });
  });
});

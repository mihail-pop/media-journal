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
const ratingModeForm = document.getElementById("rating-mode-form");
if (ratingModeForm) {
  ratingModeForm.addEventListener("submit", function(e) {
    e.preventDefault();
    const select = document.getElementById("rating-mode-select");
    const value = select.value;
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
          showNotification("Scoring system saved successfully!");
        } else {
          alert(res.error || "Failed to update scoring system.");
        }
      })
      .catch(err => {
        alert("Request failed.");
      });
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

    // Toggle dropdown
    trigger.addEventListener('click', () => {
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

  // ----- Navigation Buttons Logic -----
  const navForm = document.getElementById("nav-items-form");

  if (navForm) {
    function updateDOMOrder() {
      const rows = Array.from(document.querySelectorAll(".nav-item-row"));
      rows.forEach((row, index) => {
        row.dataset.position = index + 1;
      });
    }

    navForm.querySelectorAll(".move-up").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".nav-item-row");
        const prev = row.previousElementSibling;
        if (prev) {
          row.parentNode.insertBefore(row, prev);
          updateDOMOrder();
        }
      });
    });

    navForm.querySelectorAll(".move-down").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".nav-item-row");
        const next = row.nextElementSibling;
        if (next) {
          row.parentNode.insertBefore(next, row);
          updateDOMOrder();
        }
      });
    });

    navForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const rows = document.querySelectorAll(".nav-item-row");

      const data = Array.from(rows).map((row, index) => ({
        id: row.dataset.id,
        position: index + 1,
        visible: row.querySelector(".toggle-visible").checked
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
            setTimeout(() => window.location.reload(true));
          } else {
            alert("Update failed.");
          }
        })
        .catch(err => {
          console.error("Error:", err);
          alert("Error updating items.");
        });
    });

    updateDOMOrder();
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
      if (response.ok) row.remove();
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
    startPolling: (taskId, isDownload = true) => {
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
                  showNotification("Backup restored successfully!");
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
          modal.startPolling(data.task_id, false);
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

// ----- Tab Functionality -----
document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => {
    const tabId = button.dataset.tab;
    
    // Remove active class from all tabs and content
    document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
    
    // Add active class to clicked tab and corresponding content
    button.classList.add("active");
    document.getElementById(tabId).classList.add("active");
  });
});

document.addEventListener("DOMContentLoaded", function() {
  const preferencesForm = document.getElementById("preferences-form");
  if (preferencesForm) {
    preferencesForm.addEventListener("submit", function(e) {
      e.preventDefault();

      const showDate = document.getElementById("show-date-field").checked;
      const showRepeats = document.getElementById("show-repeats-field").checked;

      fetch("/settings/update_preferences/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({
          show_date_field: showDate,
          show_repeats_field: showRepeats,
        }),
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          showNotification("Edit modal preferences saved successfully!");
        } else {
          alert("Failed to save preferences.");
        }
      });
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

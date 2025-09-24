// ----- CSRF Token Getter (must be global) -----
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
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

  // ----- Backup Import/Export -----
function showSpinner(button) {
  const spinner = button.querySelector(".spinner");
  if (spinner) spinner.style.display = "inline-block";
}

function hideSpinner(button) {
  const spinner = button.querySelector(".spinner");
  if (spinner) spinner.style.display = "none";
}

const downloadBtn = document.getElementById("download-backup-btn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    showSpinner(downloadBtn);

    fetch("/backup/export/")
      .then((response) => {
        if (!response.ok) throw new Error("Download failed.");
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "backup.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showNotification("Backup downloaded successfully!");
      })
      .catch((err) => {
        console.error(err);
        alert("Backup download failed.");
      })
      .finally(() => {
        hideSpinner(downloadBtn);
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

    showSpinner(uploadBtn);

    const formData = new FormData();
    formData.append("backup_zip", file);
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
        if (data.message && !data.error) {
          showNotification("Backup loaded successfully!");
        } else {
          alert(data.error || "Import failed.");
        }
        window.location.reload();
      })
      .catch((err) => {
        console.error("Backup import failed:", err);
        alert("Backup import failed.");
      })
      .finally(() => {
        hideSpinner(uploadBtn);
        uploadInput.value = ""; // reset input
      });
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

  // ----- CSRF Token Getter -----
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(";").shift();
  }
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
      document.getElementById('current-version').textContent = data.current_version;
      document.getElementById('latest-version').textContent = data.latest_version;
      
      const status = document.getElementById('update-status');
      if (data.current_version === data.latest_version) {
        status.textContent = '✓ You have the latest version';
        status.style.color = '#4CAF50';
      } else {
        status.innerHTML = '<a href="https://github.com/mihail-pop/media-journal/releases" target="_blank" style="color: #ff9800; text-decoration: none;">⚠ Update available</a>';
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
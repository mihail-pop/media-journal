// ----- CSRF Token Getter (must be global) -----
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
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
            location.reload();
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
            location.reload();
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
        alert(data.message || data.error || "Import finished.");
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

  // ----- Collapsible Sections -----
  document.querySelectorAll(".collapsible").forEach(button => {
    button.addEventListener("click", () => {
      button.classList.toggle("active");
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
        } else {
          alert("Failed to save preferences.");
        }
      });
    });
  }
});
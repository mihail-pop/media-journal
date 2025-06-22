console.log("edit_modal.js loaded");
document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("edit-modal");
  const overlay = document.getElementById("edit-overlay");
  const editBtn = document.getElementById("edit-button");
  const closeBtn = document.getElementById("edit-close-btn");
  const form = document.getElementById("edit-form");

  const mediaType = form.dataset.mediaType;
  const itemId = form.dataset.itemId;

  function showField(id) {
    document.getElementById(id + "_group").style.display = "block";
  }
  function hideField(id) {
    document.getElementById(id + "_group").style.display = "none";
  }

  function updateFieldVisibility() {
    hideField("progress_main");
    hideField("total_main");
    hideField("progress_secondary");
    hideField("total_secondary");

    if (mediaType === "tv") {
      showField("progress_main");
      showField("total_main");
      showField("progress_secondary");
      showField("total_secondary");
    } else if (mediaType === "anime") {
      showField("progress_main");
      showField("total_main");
    } else if (mediaType === "game") {
      showField("progress_main");
      showField("progress_secondary");
    } else if (mediaType === "manga") {
      showField("progress_main");
      showField("total_main");
      showField("progress_secondary");
      showField("total_secondary");
    }
  }

  editBtn?.addEventListener("click", () => {
    modal.style.display = "block";
    overlay.style.display = "block";
    updateFieldVisibility();
  });

  closeBtn?.addEventListener("click", () => {
    modal.style.display = "none";
    overlay.style.display = "none";
  });

  overlay?.addEventListener("click", () => {
    modal.style.display = "none";
    overlay.style.display = "none";
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const data = Object.fromEntries(new FormData(form));
    fetch(`/edit-item/${itemId}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          location.reload();
        } else {
          alert("Failed to update item.");
        }
      })
      .catch(() => alert("Request failed."));
  });

  // FAVORITE CHECKBOX LOGIC
  const favForm = document.getElementById("favorite-form");
  if (favForm) {
    const favInput = favForm.querySelector('input[name="favorite"]');

    favInput.addEventListener("change", function () {
      const newStatus = favInput.checked;
       console.log("Favorite toggled:", newStatus);

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
            favInput.checked = !newStatus; // revert on failure
          } else { location.reload(); };
        })
        .catch(() => {
          alert("Request failed.");
          favInput.checked = !newStatus; // revert on error
        });
    });
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
});

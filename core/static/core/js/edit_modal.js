console.log("edit_modal.js loaded");

document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("edit-modal");
  const overlay = document.getElementById("edit-overlay");

  // Utility functions to show/hide fields by id suffix
  function showField(id) {
    const el = document.getElementById(id + "_group");
    if (el) el.style.display = "block";
  }
  function hideField(id) {
    const el = document.getElementById(id + "_group");
    if (el) el.style.display = "none";
  }

  function updateFieldVisibility(mediaType) {
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

  function populateForm(form, item) {
    form.dataset.mediaType = item.media_type;
    form.dataset.itemId = item.id;

    const statusSelect = form.querySelector('select[name="status"]');
    statusSelect.innerHTML = "";
    item.item_status_choices.forEach(choice => {
      const option = document.createElement("option");
      option.value = choice[0];
      option.textContent = choice[1];
      if (choice[0] === item.status) option.selected = true;
      statusSelect.appendChild(option);
    });

    const ratingSelect = form.querySelector('select[name="personal_rating"]');
    ratingSelect.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No rating";
    ratingSelect.appendChild(emptyOption);
    item.item_rating_choices.forEach(choice => {
      const option = document.createElement("option");
      option.value = choice[0];
      option.textContent = choice[1];
      if (choice[0] === item.personal_rating) option.selected = true;
      ratingSelect.appendChild(option);
    });

    form.querySelector('[name="notes"]').value = item.notes || "";
    form.querySelector('[name="progress_main"]').value = item.progress_main ?? "";
    form.querySelector('[name="total_main"]').value = item.total_main ?? "";
    form.querySelector('[name="progress_secondary"]').value = item.progress_secondary ?? "";
    form.querySelector('[name="total_secondary"]').value = item.total_secondary ?? "";

    const favInput = form.querySelector('input[name="favorite"]');
    if (favInput) favInput.checked = !!item.favorite;
  }

  // Handle clicks from list pages (cards)
  document.querySelectorAll(".edit-card-btn").forEach(button => {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      const card = button.closest(".card");
      const itemId = card.dataset.id;

      const form = document.getElementById("edit-form");
      if (!form) {
        console.error("Edit form not found");
        return;
      }

      fetch(`/get-item/${itemId}/`)
        .then(res => res.json())
        .then(data => {
          if (!data.success) return alert("Failed to load item");

          populateForm(form, data.item);
          updateFieldVisibility(data.item.media_type);
          modal.classList.remove("modal-hidden");
          overlay.classList.remove("modal-hidden");
        })
        .catch(() => alert("Failed to load item"));
    });
  });

  // Handle clicks from detail.html button
  const detailEditBtn = document.getElementById("edit-button");
  if (detailEditBtn) {
    detailEditBtn.addEventListener("click", function () {
      const itemId = detailEditBtn.dataset.id;
      const mediaType = detailEditBtn.dataset.mediaType;

      const form = document.getElementById("edit-form");
      if (!form) {
        console.error("Edit form not found");
        return;
      }

      fetch(`/get-item/${itemId}/`)
        .then(res => res.json())
        .then(data => {
          if (!data.success) return alert("Failed to load item");

          populateForm(form, data.item);
          updateFieldVisibility(mediaType);
          modal.classList.remove("modal-hidden");
          overlay.classList.remove("modal-hidden");
        })
        .catch(() => alert("Failed to load item"));
    });
  }

  // Modal close handlers
  document.getElementById("edit-close-btn")?.addEventListener("click", () => {
    modal.classList.add("modal-hidden");
    overlay.classList.add("modal-hidden");
  });

  overlay?.addEventListener("click", () => {
    modal.classList.add("modal-hidden");
    overlay.classList.add("modal-hidden");
  });

  // Submit form
  const form = document.getElementById("edit-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      const itemId = form.dataset.itemId;
      const data = Object.fromEntries(new FormData(form));

      fetch(`/edit-item/${itemId}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(data),
      })
        .then(res => res.json())
        .then(res => {
          if (res.success) {
            location.reload();
          } else {
            alert("Failed to update item.");
          }
        })
        .catch(() => alert("Request failed."));
    });

    // Favorite checkbox live update (optional)
    const favInput = form.querySelector('input[name="favorite"]');
    if (favInput) {
      favInput.addEventListener("change", function () {
        const itemId = form.dataset.itemId;
        const newStatus = favInput.checked;

        fetch(`/edit-item/${itemId}/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
          },
          body: JSON.stringify({ favorite: newStatus }),
        })
          .then(res => res.json())
          .then(res => {
            if (!res.success) {
              alert("Failed to update favorite.");
              favInput.checked = !newStatus;
            } else {
              location.reload();
            }
          })
          .catch(() => {
            alert("Request failed.");
            favInput.checked = !newStatus;
          });
      });
    }
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

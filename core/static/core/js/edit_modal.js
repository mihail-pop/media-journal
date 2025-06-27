console.log("edit_modal.js loaded");

document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("edit-modal");
  const overlay = document.getElementById("edit-overlay");

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
    hideField("progress_secondary");

    const mainLabel = document.getElementById("progress_main_label");
    const secondaryLabel = document.getElementById("progress_secondary_label");

    if (mediaType === "tv") {
      showField("progress_main");
      showField("progress_secondary");
      if (mainLabel) mainLabel.textContent = "Episode Progress";
      if (secondaryLabel) secondaryLabel.textContent = "Season Progress";
    } else if (mediaType === "anime") {
      showField("progress_main");
      if (mainLabel) mainLabel.textContent = "Episode Progress";
    } else if (mediaType === "game") {
      showField("progress_main");
      showField("progress_secondary");
      if (mainLabel) mainLabel.textContent = "Hours Played";
      if (secondaryLabel) secondaryLabel.textContent = "Year Finished";
    } else if (mediaType === "manga") {
      showField("progress_main");
      showField("progress_secondary");
      if (mainLabel) mainLabel.textContent = "Chapter Progress";
      if (secondaryLabel) secondaryLabel.textContent = "Volume Progress";
    }
  }

function updateTotalDisplays(item) {
  const mainTotalDisplay = document.getElementById("progress_main_total_display");
  const secondaryTotalDisplay = document.getElementById("progress_secondary_total_display");

  // Define units for main and secondary progress per media type
  const units = {
    tv: { main: "episodes", secondary: "seasons" },
    anime: { main: "episodes", secondary: "" },
    game: { main: "hours", secondary: "years" },
    manga: { main: "chapters", secondary: "volumes" },
  };

  const mediaType = item.media_type;
  const mainUnit = units[mediaType]?.main || "";
  const secondaryUnit = units[mediaType]?.secondary || "";

  if (mainTotalDisplay) {
    if (item.total_main !== null && item.total_main !== undefined && item.total_main !== "") {
      mainTotalDisplay.textContent = `/ ${item.total_main} ${mainUnit}`;
    } else {
      mainTotalDisplay.textContent = "";
    }
  }

  if (secondaryTotalDisplay) {
    if (item.total_secondary !== null && item.total_secondary !== undefined && item.total_secondary !== "") {
      secondaryTotalDisplay.textContent = `/ ${item.total_secondary} ${secondaryUnit}`;
    } else {
      secondaryTotalDisplay.textContent = "";
    }
  }
}

  function populateForm(form, item) {
    console.log("Populating form with item:", item);
    form.dataset.mediaType = item.media_type;
    form.dataset.itemId = item.id;
    const totalMainInput = form.querySelector('input[name="total_main"]');
if (totalMainInput) totalMainInput.value = item.total_main ?? "";

const totalSecondaryInput = form.querySelector('input[name="total_secondary"]');
if (totalSecondaryInput) totalSecondaryInput.value = item.total_secondary ?? "";

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

// Build the options dynamically (keep this as is)
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

// Now sync the face buttons with the select's value
const faces = form.querySelectorAll('.rating-faces .face');

function updateFacesFromSelect() {
  faces.forEach(face => {
    if (face.dataset.value === ratingSelect.value) {
      face.classList.add('selected');
    } else {
      face.classList.remove('selected');
    }
  });
}

faces.forEach(face => {
  face.addEventListener('click', () => {
    ratingSelect.value = face.dataset.value;
    updateFacesFromSelect();
  });
});

// call once after options built and select value set
updateFacesFromSelect();

    form.querySelector('[name="notes"]').value = item.notes || "";
    form.querySelector('[name="progress_main"]').value = item.progress_main ?? "";
    form.querySelector('[name="progress_secondary"]').value = item.progress_secondary ?? "";

    const favInput = form.querySelector('input[name="favorite"]');
    if (favInput) favInput.checked = !!item.favorite;

    updateFieldVisibility(item.media_type);
    updateTotalDisplays(item);
  }

  // Card edit button click
  document.querySelectorAll(".edit-card-btn").forEach(button => {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      const card = button.closest(".card");
      const itemId = card.dataset.id;
      const mediaType = card.dataset.mediaType;
      const coverUrl = card.dataset.coverUrl;
      const bannerUrl = card.dataset.bannerUrl;

      const modal = document.getElementById('edit-modal');
      const banner = modal.querySelector('.modal-banner');
      const cover = modal.querySelector('.modal-cover img');
      const title = card.dataset.title;

const titleElement = modal.querySelector('.modal-title');
if (titleElement && title) {
  titleElement.textContent = title;
}
      const form = document.getElementById("edit-form");
      if (!form) return console.error("Edit form not found");
          // Set cover image
    if (cover && coverUrl) {
      cover.src = coverUrl;
    }

    // Set banner background via data attribute + CSS
    if (banner && bannerUrl) {
      banner.dataset.banner = bannerUrl;
      banner.style.backgroundImage = `url("${bannerUrl}")`;
    }
      console.log("Fetching item for ID:", itemId);
      fetch(`/get-item/${itemId}/`)
        .then(res => res.json())
        .then(data => {
          if (!data.success) return alert("Failed to load item");
          console.log("Fetched item data:", data.item);
          populateForm(form, data.item);
          modal.classList.remove("modal-hidden");
          overlay.classList.remove("modal-hidden");
        })
        .catch(err => {
          console.error("Fetch error:", err);
          alert("Failed to load item");
        });
    });
  });

  // List view edit button click
document.querySelectorAll("#list-view .edit-card-btn").forEach(button => {
  button.addEventListener("click", function (e) {
    e.preventDefault();
    const row = button.closest(".list-row");
    const itemId = row.dataset.id;
    const mediaType = row.dataset.mediaType;
    const coverUrl = row.dataset.coverUrl;
    const bannerUrl = row.dataset.bannerUrl;
    const title = row.dataset.title;

    const modal = document.getElementById('edit-modal');
    const banner = modal.querySelector('.modal-banner');
    const cover = modal.querySelector('.modal-cover img');
    const titleElement = modal.querySelector('.modal-title');

    if (titleElement && title) {
      titleElement.textContent = title;
    }

    if (cover && coverUrl) {
      cover.src = coverUrl;
    }

    if (banner && bannerUrl) {
      banner.dataset.banner = bannerUrl;
      banner.style.backgroundImage = `url("${bannerUrl}")`;
    }

    const form = document.getElementById("edit-form");
    if (!form) return console.error("Edit form not found");

    fetch(`/get-item/${itemId}/`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) return alert("Failed to load item");
        populateForm(form, data.item);
        modal.classList.remove("modal-hidden");
        overlay.classList.remove("modal-hidden");
      })
      .catch(err => {
        console.error("Fetch error:", err);
        alert("Failed to load item");
      });
  });
});

  // Detail page edit button click
  const detailEditBtn = document.getElementById("edit-button");
  if (detailEditBtn) {
    detailEditBtn.addEventListener("click", function () {
      const itemId = detailEditBtn.dataset.id;

      const form = document.getElementById("edit-form");
      if (!form) return console.error("Edit form not found");

      console.log("Fetching item from detail page:", itemId);
      fetch(`/get-item/${itemId}/`)
        .then(res => res.json())
        .then(data => {
          if (!data.success) return alert("Failed to load item");
          console.log("Fetched item data:", data.item);
          populateForm(form, data.item);
          modal.classList.remove("modal-hidden");
          overlay.classList.remove("modal-hidden");
        })
        .catch(err => {
          console.error("Fetch error:", err);
          alert("Failed to load item");
        });
    });
  }

  // Modal close
  document.getElementById("edit-close-btn")?.addEventListener("click", () => {
    console.log("Closing modal (button)");
    modal.classList.add("modal-hidden");
    overlay.classList.add("modal-hidden");
  });

  overlay?.addEventListener("click", () => {
    console.log("Closing modal (overlay click)");
    modal.classList.add("modal-hidden");
    overlay.classList.add("modal-hidden");
  });
  
document.getElementById("edit-delete-btn")?.addEventListener("click", function () {
  if (!confirm("Are you sure you want to delete this item? This action cannot be undone.")) return;

  const itemId = form.dataset.itemId;

  fetch(`/delete-item/${itemId}/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    }
  })
  .then(res => res.json())
  .then(res => {
    if (res.success) {
      alert("Item deleted.");
      window.location.reload();
    } else {
      alert("Failed to delete item.");
    }
  })
  .catch(err => {
    console.error("Delete request failed:", err);
    alert("Delete failed.");
  });
});


  // Submit form
  const form = document.getElementById("edit-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      console.log("Form submitted");

      const itemId = form.dataset.itemId;
      if (!itemId) {
        console.error("Missing item ID on form");
        return;
      }

      const formData = Object.fromEntries(new FormData(form));
      console.log("Data to send:", formData);

      fetch(`/edit-item/${itemId}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(formData),
      })
        .then(res => res.json())
        .then(res => {
          console.log("Server response:", res);
          if (res.success) {
            location.reload();
          } else {
            alert("Failed to update item.");
          }
        })
        .catch(err => {
          console.error("Request failed:", err);
          alert("Request failed.");
        });
    });

    // Favorite checkbox update
    const favInput = form.querySelector('input[name="favorite"]');
    if (favInput) {
      favInput.addEventListener("change", function () {
        const itemId = form.dataset.itemId;
        const newStatus = favInput.checked;
        console.log("Toggling favorite:", newStatus);

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
            console.log("Favorite update response:", res);
            if (!res.success) {
              alert("Failed to update favorite.");
              favInput.checked = !newStatus;
            } else {
              // location.reload();
            }
          })
          .catch(err => {
            console.error("Favorite update failed:", err);
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

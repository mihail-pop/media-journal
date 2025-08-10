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
      if (mainLabel) mainLabel.textContent = "Hours Played";
    } else if (mediaType === "manga") {
      showField("progress_main");
      showField("progress_secondary");
      if (mainLabel) mainLabel.textContent = "Chapter Progress";
      if (secondaryLabel) secondaryLabel.textContent = "Volume Progress";
    } else if (mediaType === "book") {
      showField("progress_main");
      if (mainLabel) mainLabel.textContent = "Pages Read";
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
    book: { main: "pages", secondary: "" },
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
    form.dataset.mediaType = item.media_type;
    form.dataset.itemId = item.id;
    form.dataset.ratingMode = item.rating_mode;
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

    // --- RATING UI ---
    const ratingSelect = form.querySelector('select[name="personal_rating"]');
    ratingSelect.innerHTML = "";
    // Always keep a blank option for 'no rating'
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No rating";
    ratingSelect.appendChild(emptyOption);

    // Remove any previous dynamic rating UI
    let ratingUi = form.querySelector('.dynamic-rating-ui');
    if (ratingUi) ratingUi.remove();

    // Helper to set select value and trigger change
    function setRatingValue(val) {
      ratingSelect.value = val;
      ratingSelect.dispatchEvent(new Event('change'));
    }

    // Faces mode
    const ratingFaces = form.querySelector('.rating-faces');
    if (item.rating_mode === 'faces') {
      // Add options for faces (1, 50, 100)
      [1, 50, 100].forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val === 1 ? 'Bad' : val === 50 ? 'Neutral' : 'Good';
        if (val === item.personal_rating) opt.selected = true;
        ratingSelect.appendChild(opt);
      });
      // Show face buttons
      let faces = form.querySelectorAll('.rating-faces .face');
      faces.forEach(face => {
        face.style.display = '';
        face.classList.remove('selected');
        if (parseInt(face.dataset.value) === item.personal_rating) face.classList.add('selected');
        face.onclick = () => {
          setRatingValue(face.dataset.value);
          faces.forEach(f => f.classList.toggle('selected', f === face));
        };
      });
      // Show the container
      if (ratingFaces) ratingFaces.classList.remove('modal-hidden');
      // Hide other rating UIs if present
      // (none for faces)
    }
    // 5-star mode
    else if (item.rating_mode === 'stars_5') {
      // Hide face buttons
      form.querySelectorAll('.rating-faces .face').forEach(face => face.style.display = 'none');
      if (ratingFaces) ratingFaces.classList.add('modal-hidden');
      // Build 5 stars
      const starDiv = document.createElement('div');
      starDiv.className = 'dynamic-rating-ui rating-stars';
      for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        star.title = `${i} star${i > 1 ? 's' : ''}`;
        star.dataset.value = i;
        if (item.personal_rating === i) star.classList.add('selected');
        star.onclick = () => {
          setRatingValue(i);
          // Highlight stars up to selected
          starDiv.querySelectorAll('.star').forEach((s, idx) => {
            s.classList.toggle('selected', idx < i);
          });
        };
        starDiv.appendChild(star);
      }
      // Set initial highlight
      if (item.personal_rating) {
        starDiv.querySelectorAll('.star').forEach((s, idx) => {
          s.classList.toggle('selected', idx < item.personal_rating);
        });
      }
      // Insert after hidden select
      ratingSelect.parentNode.insertBefore(starDiv, ratingSelect.nextSibling);
      // Ensure select has the current value as an option (robust string check, allow 0)
      if (item.personal_rating !== undefined && item.personal_rating !== null && item.personal_rating !== "") {
        let found = false;
        for (let i = 0; i < ratingSelect.options.length; i++) {
          if (ratingSelect.options[i].value == String(item.personal_rating)) {
            found = true;
            break;
          }
        }
        if (!found) {
          const opt = document.createElement('option');
          opt.value = item.personal_rating;
          opt.textContent = `${item.personal_rating} star${item.personal_rating > 1 ? 's' : ''}`;
          opt.selected = true;
          ratingSelect.appendChild(opt);
        }
        ratingSelect.value = item.personal_rating;
      }
    }
    // 1-10 or 1-100 scale
    else if (item.rating_mode === 'scale_10' || item.rating_mode === 'scale_100') {
      // Hide face buttons
      form.querySelectorAll('.rating-faces .face').forEach(face => face.style.display = 'none');
      if (ratingFaces) ratingFaces.classList.add('modal-hidden');
      // Numeric input
      const numDiv = document.createElement('div');
      numDiv.className = 'dynamic-rating-ui rating-number';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = item.rating_mode === 'scale_10' ? 1 : 1;
      input.max = item.rating_mode === 'scale_10' ? 10 : 100;
      input.value = item.personal_rating || '';
      input.placeholder = item.rating_mode === 'scale_10' ? '1-10' : '1-100';
      // Store last valid value
      let lastValid = (item.personal_rating && !isNaN(item.personal_rating)) ? String(item.personal_rating) : '';
      input.oninput = () => {
        let val = input.value;
        let min = parseInt(input.min);
        let max = parseInt(input.max);
        // Allow clearing the field
        if (val === '') {
          setRatingValue('');
          return;
        }
        let valid = false;
        if (item.rating_mode === 'scale_10') {
          valid = /^\d{1,2}$/.test(val) && Number(val) >= min && Number(val) <= max;
        } else if (item.rating_mode === 'scale_100') {
          valid = /^\d{1,3}$/.test(val) && Number(val) >= min && Number(val) <= max;
        }
        if (valid) {
          lastValid = val;
          setRatingValue(Number(val));
        } else {
          // revert to last valid value only if not clearing
          input.value = lastValid;
          setRatingValue(lastValid ? Number(lastValid) : '');
        }
      };
      numDiv.appendChild(input);
      ratingSelect.parentNode.insertBefore(numDiv, ratingSelect.nextSibling);
      // Ensure select has the current value as an option (robust string check, allow 0)
      if (item.personal_rating !== undefined && item.personal_rating !== null && item.personal_rating !== "") {
        let found = false;
        for (let i = 0; i < ratingSelect.options.length; i++) {
          if (ratingSelect.options[i].value == String(item.personal_rating)) {
            found = true;
            break;
          }
        }
        if (!found) {
          const opt = document.createElement('option');
          opt.value = item.personal_rating;
          opt.textContent = item.personal_rating;
          opt.selected = true;
          ratingSelect.appendChild(opt);
        }
        ratingSelect.value = item.personal_rating;
      }
    }
    // fallback: hide all rating UIs
    else {
      form.querySelectorAll('.rating-faces .face').forEach(face => face.style.display = 'none');
      if (ratingFaces) ratingFaces.classList.add('modal-hidden');
    }

    // Always call change event to sync UI
    ratingSelect.dispatchEvent(new Event('change'));



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
      // --- Always sync custom rating UI to select before serializing form ---
      const ratingSelect = form.querySelector('select[name="personal_rating"]');

      e.preventDefault();

      const itemId = form.dataset.itemId;
      if (!itemId) {
        console.error("Missing item ID on form");
        return;
      }


      // If stars UI is present, get selected star value
      const starsDiv = form.querySelector('.rating-stars');
      let customRatingHandled = false;
      if (starsDiv) {
        const stars = Array.from(starsDiv.querySelectorAll('.star'));
        let selectedStars = 0;
        for (let i = 0; i < stars.length; i++) {
          if (stars[i].classList.contains('selected')) selectedStars++;
        }
        if (selectedStars > 0) {
          // Ensure select has this value as an option
          let found = false;
          for (let i = 0; i < ratingSelect.options.length; i++) {
            if (ratingSelect.options[i].value == String(selectedStars)) {
              found = true;
              break;
            }
          }
          if (!found) {
            const opt = document.createElement('option');
            opt.value = selectedStars;
            opt.textContent = `${selectedStars} star${selectedStars > 1 ? 's' : ''}`;
            opt.selected = true;
            ratingSelect.appendChild(opt);
          }
          ratingSelect.value = selectedStars;
        } else {
          ratingSelect.value = '';
        }
        customRatingHandled = true;
      }
      // If number input UI is present, get its value
      const numberDiv = form.querySelector('.rating-number');
      if (numberDiv) {
        const numInput = numberDiv.querySelector('input[type="number"]');
        if (numInput) {
          if (numInput.value !== '') {
            // Ensure select has this value as an option
            let found = false;
            for (let i = 0; i < ratingSelect.options.length; i++) {
              if (ratingSelect.options[i].value == String(numInput.value)) {
                found = true;
                break;
              }
            }
            if (!found) {
              const opt = document.createElement('option');
              opt.value = numInput.value;
              opt.textContent = numInput.value;
              opt.selected = true;
              ratingSelect.appendChild(opt);
            }
            ratingSelect.value = numInput.value;
          } else {
            ratingSelect.value = '';
          }
        }
        customRatingHandled = true;
      }
      // For faces, the select is already set by UI logic
      // Make sure the select is not disabled
      ratingSelect.disabled = false;

      // Only use fallback if no custom UI handled the value
      // For faces mode, do NOT auto-select 1 (bad) if nothing is chosen
      if (!customRatingHandled && !ratingSelect.value) {
        const ratingMode = form.dataset.ratingMode || (window.currentRatingMode || null);
        if (ratingMode !== 'faces') {
          for (let i = 0; i < ratingSelect.options.length; i++) {
            if (ratingSelect.options[i].value !== "") {
              ratingSelect.value = ratingSelect.options[i].value;
              break;
            }
          }
        }
        // else: leave as blank for faces mode
      }


      const formData = Object.fromEntries(new FormData(form));
      // Debug: log the value being sent for personal_rating
      console.log("[DEBUG] Submitting personal_rating:", formData.personal_rating, "(all formData:", formData, ")");

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

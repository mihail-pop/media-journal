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

function refreshItem(itemId) {
  fetch("/refresh-item/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCookie("csrftoken"),
    },
    body: JSON.stringify({ id: itemId }),
  })
    .then((res) => res.json())
    .then((data) => {
      const banner = document.getElementById("detail-banner");
      if (banner) {
        const url = banner.src.split("?")[0];
        banner.src = url + "?t=" + new Date().getTime();
      }
      setTimeout(() => window.location.reload(true), 1000);
    });
}

function openBannerUpload(source, id) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg";
  input.style.display = "none";

  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("banner", file);
    formData.append("source", source);
    formData.append("id", id);

    fetch("/upload-banner/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.url) {
          const banner = document.getElementById("detail-banner");
          if (banner) {
            const timestamp = new Date().getTime();
            banner.src = data.url + "?t=" + timestamp;
            setTimeout(() => window.location.reload(true), 1000);
          }
        } else {
          alert(data.error || "Failed to upload banner.");
        }
      });
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

function openCoverUpload(source, id) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg";
  input.style.display = "none";

  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("cover", file);
    formData.append("source", source);
    formData.append("id", id);

    fetch("/upload-cover/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.url) {
          const cover = document.getElementById("detail-cover");
          if (cover) {
            const timestamp = new Date().getTime();
            cover.src = data.url + "?t=" + timestamp;
            setTimeout(() => window.location.reload(true), 1000);
          }
        } else {
          alert(data.error || "Failed to upload cover.");
        }
      });
  };

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

const screenshotsData = JSON.parse(document.getElementById("screenshots-data").textContent);
let currentIndex = 0;

function changeScreenshot(direction) {
  const img = document.getElementById("screenshot-image");
  img.style.opacity = 0;

  setTimeout(() => {
    currentIndex = (currentIndex + direction + screenshotsData.length) % screenshotsData.length;
    img.src = screenshotsData[currentIndex].url;
    img.style.opacity = 1;
  }, 200);
}

function showArrows(container) {
  container.querySelector(".left").style.display = "block";
  container.querySelector(".right").style.display = "block";
}

function hideArrows(container) {
  container.querySelector(".left").style.display = "none";
  container.querySelector(".right").style.display = "none";
}

document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("person-search-input");
  const searchBtn = document.getElementById("person-search-btn");
  const resultsContainer = document.getElementById("person-search-results");

  const mediaType = document.body.dataset.mediaType;

  function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      resultsContainer.innerHTML = "";
      return;
    }

    const endpoint =
      mediaType === "anime" || mediaType === "manga"
        ? "/api/character_search/"
        : "/api/actor_search/";

    fetch(`${endpoint}?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        resultsContainer.innerHTML = "";
        if (data.length === 0) {
          resultsContainer.innerHTML = "<p>No results found.</p>";
          return;
        }

        data.forEach((person) => {
          const card = document.createElement("div");
          card.className = "person-card";
          card.innerHTML = `
            <img src="${person.image || "/static/core/img/placeholder.png"}" alt="${person.name}">
            <p class="person-name">${person.name}</p>
            <button class="favorite-btn" data-name="${person.name}" data-img="${person.image}" data-type="${
            mediaType === "anime" || mediaType === "manga" ? "character" : "actor"
          }">⭐</button>
          `;
          resultsContainer.appendChild(card);
        });
      })
      .catch(() => {
        resultsContainer.innerHTML = "<p>Error fetching data.</p>";
      });
  }

  searchBtn?.addEventListener("click", performSearch);
  searchInput?.addEventListener("keyup", (e) => {
    if (e.key === "Enter") performSearch();
  });

  resultsContainer?.addEventListener("click", function (e) {
    if (e.target.classList.contains("favorite-btn")) {
      const btn = e.target;
      const name = btn.dataset.name;
      const image = btn.dataset.img;
      const type = btn.dataset.type;

      fetch("/api/toggle_favorite_person/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ name, image_url: image, type }),
      })
        .then((res) => res.json())
        .then((data) => {
          btn.textContent = data.status === "added" ? "✅" : "⭐";
        });
    }
  });

  // Banner background
  const banner = document.querySelector(".banner-section");
  if (banner) {
    const url = banner.dataset.banner;
    banner.style.backgroundImage = `url("${url}")`;
  }

  // Screenshots Upload
  const uploadFileInput = document.getElementById("screenshot-file-input");
  const uploadForm = document.getElementById("screenshot-upload-form");
  const addFileInput = document.getElementById("screenshot-add-file-input");
  const addForm = document.getElementById("screenshot-add-form");

  uploadFileInput?.addEventListener("change", function () {
    const files = uploadFileInput.files;
    if (!files.length) return;

    const formData = new FormData();
    formData.append("igdb_id", uploadForm.querySelector('input[name="igdb_id"]').value);
    for (let i = 0; i < files.length; i++) {
      formData.append("screenshots[]", files[i]);
    }

    fetch("/upload-game-screenshots/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "X-Action": "replace",
      },
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) location.reload();
        else alert("Failed to upload screenshots: " + data.message);
      })
      .catch(() => alert("An error occurred while uploading screenshots."));
  });

  addFileInput?.addEventListener("change", function () {
    const files = addFileInput.files;
    if (!files.length) return;

    const formData = new FormData();
    formData.append("igdb_id", addForm.querySelector('input[name="igdb_id"]').value);
    for (let i = 0; i < files.length; i++) {
      formData.append("screenshots[]", files[i]);
    }

    fetch("/upload-game-screenshots/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "X-Action": "add",
      },
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) location.reload();
        else alert("Failed to add screenshots: " + data.message);
      })
      .catch(() => alert("An error occurred while adding screenshots."));
  });

  // Add to list
  const addBtn = document.getElementById("add-to-list-button");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      const data = {
        source: addBtn.dataset.source,
        source_id: addBtn.dataset.sourceId,
        media_type: addBtn.dataset.mediaType,
        title: addBtn.dataset.title,
        cover_url: addBtn.dataset.coverUrl,
      };
      console.log("Sending:", data);
      fetch("/api/add_to_list/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify(data),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.message) {
            sessionStorage.setItem("openEditModal", "true");
            location.reload();
          } else if (data.error) {
            alert("Error: " + data.error);
          }
        })
        .catch(() => alert("Failed to add item."));
    });
  }

  // Auto-open edit modal
  if (sessionStorage.getItem("openEditModal")) {
    sessionStorage.removeItem("openEditModal");
    const editButton = document.getElementById("edit-button");
    editButton?.click();
  }

  // Favorite toggle
  const favForm = document.getElementById("favorite-form");
  if (favForm) {
    const favInput = favForm.querySelector('input[name="favorite"]');
    const itemId = favForm.dataset.itemId;

    favInput?.addEventListener("change", function () {
      const newStatus = favInput.checked;

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
            favInput.checked = !newStatus;
          }
        })
        .catch(() => {
          alert("Request failed.");
          favInput.checked = !newStatus;
        });
    });
  }
});
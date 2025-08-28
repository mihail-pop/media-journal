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

function updateScreenshot(index) {
  const img = document.getElementById("screenshot-image");
  img.style.opacity = 0;

  // Remove old highlight
  document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
    thumb.classList.toggle('active-thumbnail', i === index);
  });

  setTimeout(() => {
    currentIndex = index;
    img.src = screenshotsData[currentIndex].url;
    img.style.opacity = 1;
  }, 200);
}

function changeScreenshot(direction) {
  let newIndex = (currentIndex + direction + screenshotsData.length) % screenshotsData.length;
  updateScreenshot(newIndex);
}

function setScreenshot(index) {
  updateScreenshot(index);
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

document.getElementById("more-info-btn").addEventListener("click", async function() {
  const btn = this;
  const container = document.getElementById("extra-info-container");
  const mediaType = document.body.dataset.mediaType; // e.g., "movie", "tv", "anime"
  const itemId = document.body.dataset.itemId;

  btn.disabled = true;
  btn.textContent = "Loading...";

  try {
    const response = await fetch(`/api/get-extra-info/?media_type=${mediaType}&item_id=${itemId}`);
    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();

    // Render the data as HTML in the container (you'll write this function)
    container.innerHTML = renderExtraInfo(mediaType, data);

    btn.style.display = "none"; // Hide button after successful fetch
  } catch (error) {
    container.innerHTML = `<p style="color:red;">Failed to load extra information.</p>`;
    btn.disabled = false;
    btn.textContent = "More information";
    console.error(error);
  }
});

// Helper function to render the extra info HTML per media type
function renderExtraInfo(mediaType, data) {
  console.log("Extra info received:", data);
  if (!data) return "<p>No extra information available.</p>";

  const safeHTML = [];

  if (mediaType === "movie") {
    const runtime = data.runtime;

    if (data.vote_average !== undefined && data.vote_average !== null) {
      safeHTML.push(`<p>⭐${data.vote_average}/10 TMDB</p>`);
    }

    if (runtime) {
      const hours = Math.floor(runtime / 60);
      const minutes = runtime % 60;
      const runtimeFormatted = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
      safeHTML.push(`<p> ${runtimeFormatted}</p>`);
    }

    if (data.status) {
      safeHTML.push(`<p><span class="label">Status: </span> ${data.status}</p>`);
    }

if (data.homepage) {
  try {
    const urlObj = new URL(data.homepage);
    let hostname = urlObj.hostname.replace(/^www\./, ''); // remove 'www.'
    let label = hostname.split('.')[0]; // get the first part (e.g., sonypictures)

    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${label}</a></p>`
    );
  } catch (e) {
    // fallback in case URL parsing fails
    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${data.homepage}</a></p>`
    );
  }
}

  if (data.genres?.length) {
    safeHTML.push(`<p><span class="label">Genres: </span> ${data.genres.join(", ")}</p>`);
  }

if (data.staff?.length) {
  const staffHTML = data.staff.map(s => `<span class="staff-member">${s}</span>`).join(", ");
  safeHTML.push(`<p><span class="label">Staff: </span> ${staffHTML}</p>`);
}

if (data.relations?.length) {
  const relationItems = data.relations.map(rel => {
    const year = rel.release_date ? ` (${new Date(rel.release_date).getFullYear()})` : "";
    const titleWithYear = `${rel.title}${year}`;

const coverImg = rel.poster
  ? `<div class="relation-hover-img-container">
       <img src="${rel.poster}" class="relation-hover-img" />
     </div>`
  : "";

    const linkHTML = rel.id
      ? `<a href="/tmdb/movie/${rel.id}/" target="_blank" rel="noopener noreferrer">
           ${titleWithYear}
         </a>`
      : titleWithYear;

    return `<span class="relation-item">${linkHTML}${coverImg}</span>`;
  }).join(", ");

  safeHTML.push(`
    <span class="label">Relations:</span>
    <span class="relation-list">${relationItems}</span>
  `);
}

if (data.trailers?.length) {
  const trailerEmbeds = data.trailers.map(trailer => {
    if (!trailer.youtube_id) return "";
    return `<iframe
              src="https://www.youtube.com/embed/${trailer.youtube_id}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>`;
  }).join("");

  const container = document.getElementById("trailer-container");
  if (container) {
    container.innerHTML = `
      <h2>Trailers</h2>
      <div class="trailer-grid">${trailerEmbeds}</div>
    `;
  }
}



    return safeHTML.join("\n");
  }

  if (mediaType === "tv") {

    if (data.vote_average !== undefined && data.vote_average !== null) {
      safeHTML.push(`<p>⭐${data.vote_average}/10 TMDB</p>`);
    }

    if (data.status) {
      safeHTML.push(`<p><span class="label">Status: </span> ${data.status}</p>`);
    }
    
if (data.next_episode_to_air) {
  const nextDate = new Date(data.next_episode_to_air).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  safeHTML.push(`<p><span class="label">Next episode to air: </span> ${nextDate}</p>`);
}

if (data.last_air_date) {
  const lastDate = new Date(data.last_air_date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  safeHTML.push(`<p><span class="label">Last air date: </span> ${lastDate}</p>`);
}

    if (data.type) {
      safeHTML.push(`<p><span class="label">Type: </span> ${data.type}</p>`);
    }

    if (data.networks?.length) {
      safeHTML.push(`<p><span class="label">Network: </span> ${data.networks.join(", ")}</p>`);
    }

if (data.homepage) {
  try {
    const urlObj = new URL(data.homepage);
    let hostname = urlObj.hostname.replace(/^www\./, ''); // remove 'www.'
    let label = hostname.split('.')[0]; // get the first part (e.g., sonypictures)

    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${label}</a></p>`
    );
  } catch (e) {
    // fallback in case URL parsing fails
    safeHTML.push(
      `<p><span class="label">Available on: </span> <a href="${data.homepage}" target="_blank">${data.homepage}</a></p>`
    );
  }
}

    if (data.genres?.length) {
      safeHTML.push(`<p><span class="label">Genres:</span> ${data.genres.join(", ")}</p>`);
    }

if (data.staff?.length) {
  const staffHTML = data.staff.map(s => `<span class="staff-member">${s}</span>`).join(", ");
  safeHTML.push(`<p><span class="label">Staff: </span> ${staffHTML}</p>`);
}

if (data.trailers?.length) {
  const trailerEmbeds = data.trailers.map(trailer => {
    if (!trailer.youtube_id) return "";
    return `<iframe
              src="https://www.youtube.com/embed/${trailer.youtube_id}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>`;
  }).join("");

  const container = document.getElementById("trailer-container");
  if (container) {
    container.innerHTML = `
      <h2>Trailers</h2>
      <div class="trailer-grid">${trailerEmbeds}</div>
    `;
  }
}
    return safeHTML.join("\n");
  }

  if (mediaType === "anime" || mediaType === "manga") {

    if (data.averageScore) {
      safeHTML.push(`<p>⭐${data.averageScore}/10 AniList</p>`);
    }

if (data.status) {
  const formattedStatus = data.status.charAt(0) + data.status.slice(1).toLowerCase();
  safeHTML.push(`<p><span class="label">Status:</span> ${formattedStatus}</p>`);
}

if (data.next_airing && data.next_episode) {
  safeHTML.push(`<p><span class="label">Next episode to air: </span> Episode ${data.next_episode} on ${data.next_airing}</p>`);
}

if (data.format) {
  let format = data.format;

  // Formats to keep as-is
  const specialFormats = ["TV", "OVA", "ONA"];
  if (specialFormats.includes(format)) {
    // leave as-is
  } else {
    // Replace underscores with spaces, capitalize every word
    format = format
      .toLowerCase()
      .split("_")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // Also handle MOVIE specifically if you want it as 'Movie'
  if (format.toLowerCase() === "movie") format = "Movie";

  safeHTML.push(`<p><span class="label">Format:</span> ${format}</p>`);
}

    if (data.studios?.length) {
      safeHTML.push(`<p><span class="label">Studio:</span> ${data.studios.join(", ")}</p>`);
    }
    
if (data.genres?.length) {
  safeHTML.push(`<p><span class="label">Genres: </span> ${data.genres.join(", ")}</p>`);
}

if (data.staff?.length) {
  const allowedRoles = [
    "Original Creator",
    "Original Story",
    "Original Character Design",
    "Character Design",
    "Chief Director",
    "Director",
    "Art Director",
    "Story & Art",
    "Story",
    "Art"
  ];

  const filteredStaff = data.staff.filter(s => {
    const match = s.match(/\(([^)]+)\)/); // first parentheses
    if (!match) return false;
    let role = match[1].trim();

    // remove any inner parentheses
    role = role.split("(")[0].trim();

    // exact match only
    return allowedRoles.includes(role);
  });

  if (filteredStaff.length) {
    safeHTML.push(`
      <p><span class="label">Staff:</span>
        ${filteredStaff.join(", ")}
      </p>
    `);
  }
}

if (data.external_links?.length) {
  const linkItems = data.external_links.map(link => {
    const label = link.language && link.language.toLowerCase() !== "english"
      ? `${link.site} (${link.language})`
      : link.site;
    return `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  safeHTML.push(`<p><span class="label">External Links:</span> ${linkItems.join(", ")}</p>`);
}

if (data.relations?.length) {
  const relationItems = data.relations.map(rel => {
const coverOverlay = rel.cover
  ? `<div class="relation-hover-img-container">
       <img src="${rel.cover}" class="relation-hover-img" />
       <div class="relation-hover-overlay">${rel.format ? rel.format.toLowerCase() : ""}</div>
     </div>`
  : "";


    const titleWithType = `${rel.title} (${rel.display_relation_type})`;

    const linkHTML = rel.id
      ? `<a href="/mal/${rel.type.toLowerCase()}/${rel.id}/" target="_blank" rel="noopener noreferrer">
           ${titleWithType}
         </a>`
      : titleWithType;

    return `<span class="relation-item">${linkHTML}${coverOverlay}</span>`;
  }).join(", ");

  safeHTML.push(`
    <span class="label">Relations:</span>
    <span class="relation-list">${relationItems}</span>
  `);
}

if (data.trailers?.length) {
  const trailerEmbeds = data.trailers.map(trailer => {
    if (!trailer.youtube_id) return "";
    return `<iframe
              src="https://www.youtube.com/embed/${trailer.youtube_id}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>`;
  }).join("");

  const container = document.getElementById("trailer-container");
  if (container) {
    container.innerHTML = `
      <h2>Trailers</h2>
      <div class="trailer-grid">${trailerEmbeds}</div>
    `;
  }
}

    return safeHTML.join("\n");
  }

  if (mediaType === "game") {

    if (data.rating) {
      safeHTML.push(`<p>⭐${data.rating}/10 IGDB</p>`);
    }

    if (data.platforms?.length) {
      safeHTML.push(`<p><span class="label">Platforms:</span> ${data.platforms.join(", ")}</p>`);
    }

    if (data.genres?.length) {
      safeHTML.push(`<p><span class="label">Genres:</span> ${data.genres.join(", ")}</p>`);
    }

    if (data.involved_companies?.length) {
      safeHTML.push(`<p><span class="label">Involved companies:</span> ${data.involved_companies.join(", ")}</p>`);
    }

if (data.trailers?.length) {
  const trailerEmbeds = data.trailers.map(trailer => {
    if (!trailer.youtube_id) return "";
    return `<iframe
              src="https://www.youtube.com/embed/${trailer.youtube_id}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>`;
  }).join("");

  const container = document.getElementById("trailer-container");
  if (container) {
    container.innerHTML = `
      <h2>Trailers</h2>
      <div class="trailer-grid">${trailerEmbeds}</div>
    `;
  }
}

if (data.websites?.length) {
  const seen = new Set();

  const websiteLinks = data.websites
    .filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map(url => {
      try {
        const urlObj = new URL(url);
        const parts = urlObj.hostname.split(".");

        // Remove common subdomains like www, en, m, store, apps, etc.
        const filteredParts = parts.filter(part =>
          !["www", "en", "m", "store", "apps"].includes(part)
        );

        // Use the second-to-last part as label if domain has more than 2 parts
        let label = filteredParts.length >= 2
          ? filteredParts[filteredParts.length - 2]
          : filteredParts[0];

        // Capitalize first letter
        label = label.charAt(0).toUpperCase() + label.slice(1);

        return `<a href="${url}" target="_blank">${label}</a>`;
      } catch (e) {
        return `<a href="${url}" target="_blank">${url}</a>`;
      }
    })
    .join(", ");

  safeHTML.push(`<p><span class="label">External Links:</span> ${websiteLinks}</p>`);
}

    return safeHTML.join("\n");
  }

  return "<p>No extra information available for this media type.</p>";
}

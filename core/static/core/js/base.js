document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("search-overlay");
  const overlaySearchInput = document.getElementById("overlay-search-input");
  const resultsContainer = document.getElementById("search-results");
  const liveSearchToggle = document.getElementById("live-search-toggle");
  const liveSearchButton = document.getElementById("live-search-button");
  const openSearchBtn = document.getElementById("search-open-btn");
  const pageType = document.body.dataset.pageType;

  if (openSearchBtn) {
    openSearchBtn.addEventListener("click", () => {
      overlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      overlaySearchInput.value = "";
      overlaySearchInput.focus();
    });
  }

  // Initialize live search state from sessionStorage
  const savedLiveSearchState = sessionStorage.getItem("liveSearchEnabled") === "true";
  if (liveSearchToggle && liveSearchButton) {
    liveSearchToggle.checked = savedLiveSearchState;
    liveSearchButton.classList.toggle("active", savedLiveSearchState);
  }

  if (liveSearchButton) {
    liveSearchButton.addEventListener("click", () => {
      liveSearchToggle.checked = !liveSearchToggle.checked;
      liveSearchButton.classList.toggle("active", liveSearchToggle.checked);
      sessionStorage.setItem("liveSearchEnabled", liveSearchToggle.checked);
    });
  }

  function debounce(func, wait = 300) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const apiEndpoints = {
    movie: "/api/tmdb_search/",
    tv: "/api/tmdb_search/",
    anime: "/api/mal_search/",
    manga: "/api/mal_search/",
    game: "/api/igdb_search/",
    book: "/api/openlib_search/",
    music: "/api/musicbrainz_search/",
  };

  async function doSearch(query) {
    if (!query.trim()) {
      resultsContainer.innerHTML = "";
      overlay.classList.add("hidden");
      document.body.style.overflow = "";
      return;
    }

    const endpoint = apiEndpoints[pageType] || "/api/tmdb_search/";

    try {
      const params = new URLSearchParams();
      params.append("q", query);
      if (["anime", "manga", "movie", "tv", "book", "music"].includes(pageType)) {
        params.append("type", pageType);
      }

      const url = endpoint + "?" + params.toString();
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network error");

      const data = await response.json();
      if (!data.results || data.results.length === 0) {
        resultsContainer.innerHTML = "<div style='color:#eee; text-align:center;'>No results found</div>";
        overlay.classList.remove("hidden");
        return;
      }

      const cardsHtml = data.results.map(item => {
        const title = item.title || item.name || "Untitled";
        let poster = "/static/core/img/placeholder.png";

        if ((pageType === "movie" || pageType === "tv") && item.poster_path) {
          poster = `https://image.tmdb.org/t/p/w200${item.poster_path}`;
        } else if (item.poster_path) {
          poster = item.poster_path;
        }

  const prefix =
    pageType === "anime" || pageType === "manga" ? "mal" :
    pageType === "game" ? "igdb" :
    pageType === "book" ? "openlib" :
    pageType === "music" ? "musicbrainz" :
    "tmdb";

        return `
          <div class="search-card">
            <a href="/${prefix}/${pageType}/${item.id}" class="card-link">
              <img src="${poster}" alt="${title}" />
              <div class="search-card-title">${title}</div>
            </a>
          </div>`;
      }).join("");

      resultsContainer.innerHTML = `<div class="search-card-grid">${cardsHtml}</div>`;
      overlay.classList.remove("hidden");
      overlaySearchInput.focus();

    } catch (error) {
      resultsContainer.innerHTML = `<div style="color:#eee; text-align:center;">Error fetching results</div>`;
      overlay.classList.remove("hidden");
      console.error("Search error:", error);
    }
  }

  const liveSearchHandler = debounce(e => {
    doSearch(e.target.value);
  });

  overlaySearchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      doSearch(e.target.value);
    }
  });

  overlaySearchInput.addEventListener("input", e => {
    if (liveSearchToggle && liveSearchToggle.checked) {
      liveSearchHandler(e);
    } else {
      resultsContainer.innerHTML = "";
    }
  });

  // Close overlay if clicked outside panel
  overlay.addEventListener("click", e => {
    if (e.target === overlay) {
      overlay.classList.add("hidden");
      document.body.style.overflow = "";
      resultsContainer.innerHTML = "";
    }
  });

  // Close overlay on Escape key
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      overlay.classList.add("hidden");
      document.body.style.overflow = "";
      resultsContainer.innerHTML = "";
    }
  });

  // Prevent page scrolling when overlay is open and redirect to search results
  overlay.addEventListener("wheel", e => {
    e.preventDefault();
    const searchGrid = resultsContainer.querySelector(".search-card-grid");
    if (searchGrid) {
      searchGrid.scrollTop += e.deltaY;
    }
  }, { passive: false });
});
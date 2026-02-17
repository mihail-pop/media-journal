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

  // === MODIFIED SECTION: Dynamic Debounce ===
  const debounceDelay = pageType === "game" ? 500 : 300;

  const liveSearchHandler = debounce(e => {
    doSearch(e.target.value);
  }, debounceDelay);
  // === END MODIFIED SECTION ===

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
      resultsContainer.innerHTML = "";
    }
  });

  // Close overlay on Escape key
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      overlay.classList.add("hidden");
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

  // === HEADER MOBILE TOGGLE ===
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  
  if (isTouch && isPortrait) {
    const header = document.querySelector("header");
    const navCenter = document.querySelector(".nav-center");
    const searchBtn = document.getElementById("search-open-btn");
    const settingsLink = document.querySelector('.nav-right a[href="/settings"]');

    if (header) {
      // Create header menu popup
      const headerMenuPopup = document.createElement("div");
      headerMenuPopup.className = "header-menu-popup";
      headerMenuPopup.id = "header-menu-popup";

      // Create 3x3 grid of buttons
      const buttons = [];

      // Collect nav-center links
      if (navCenter) {
        const centerLinks = navCenter.querySelectorAll("a");
        centerLinks.forEach(link => {
          buttons.push({
            text: link.textContent.trim(),
            href: link.href,
            isLink: true,
          });
        });
      }

      // Add search button
      if (searchBtn) {
        buttons.push({
          text: "Search",
          isSearch: true,
        });
      }

      // Add settings link
      if (settingsLink) {
        buttons.push({
          text: "Settings",
          href: settingsLink.href,
          isLink: true,
        });
      }

      // Build grid HTML
      let gridHtml = '<div class="header-menu-grid">';
      buttons.forEach((btn, idx) => {
        if (btn.isSearch) {
          gridHtml += `<button class="header-menu-btn header-menu-search-btn" data-index="${idx}">${btn.text}</button>`;
        } else if (btn.isLink) {
          gridHtml += `<a href="${btn.href}" class="header-menu-btn header-menu-link-btn">${btn.text}</a>`;
        }
      });
      gridHtml += "</div>";

      headerMenuPopup.innerHTML = gridHtml;
      document.body.appendChild(headerMenuPopup);

      // Create toggle button
      const headerToggleBtn = document.createElement("button");
      headerToggleBtn.className = "header-toggle-btn";
      headerToggleBtn.innerHTML = "⋯";
      headerToggleBtn.setAttribute("aria-label", "Menu");

      headerToggleBtn.addEventListener("click", () => {
        headerMenuPopup.classList.toggle("header-menu-visible");
      });

      document.body.appendChild(headerToggleBtn);

      // Close menu on search button click
      const searchMenuBtn = headerMenuPopup.querySelector(".header-menu-search-btn");
      if (searchMenuBtn) {
        searchMenuBtn.addEventListener("click", () => {
          headerMenuPopup.classList.remove("header-menu-visible");
          if (openSearchBtn) {
            openSearchBtn.click();
          }
        });
      }

      // Close menu when clicking outside
      document.addEventListener("click", (e) => {
        if (
          !headerToggleBtn.contains(e.target) &&
          !headerMenuPopup.contains(e.target)
        ) {
          headerMenuPopup.classList.remove("header-menu-visible");
        }
      });

      // Close menu on Escape key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          headerMenuPopup.classList.remove("header-menu-visible");
        }
      });
    }
  }
});
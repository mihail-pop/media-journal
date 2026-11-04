(() => {
  let initialAdultContentVersion;
  try { initialAdultContentVersion = localStorage.getItem('adult-content-preference-version'); }
  catch (error) { return; }
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    try {
      if (localStorage.getItem('adult-content-preference-version') !== initialAdultContentVersion) window.location.reload();
    } catch (error) { /* Normal navigation still uses the saved server preference. */ }
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  const more = document.querySelector('.nav-more');
  if (!more) return;
  const toggle = more.querySelector('.nav-more-toggle');
  const menu = more.querySelector('.nav-more-menu');
  const setOpen = open => {
    more.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    menu.inert = !open;
  };
  more.addEventListener('mouseenter', () => setOpen(true));
  more.addEventListener('mouseleave', () => setOpen(false));
  toggle.addEventListener('click', event => {
    // A mouse click after hovering should keep the menu open.
    setOpen(event.detail > 0 && window.matchMedia('(hover: hover)').matches
      ? true : !more.classList.contains('is-open'));
  });
  more.addEventListener('focusout', event => {
    if (!more.contains(event.relatedTarget)) setOpen(false);
  });
  more.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!more.contains(event.target)) setOpen(false);
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("search-overlay");
  const overlaySearchInput = document.getElementById("overlay-search-input");
  const resultsContainer = document.getElementById("search-results");
  const openSearchBtn = document.getElementById("search-open-btn");
  const mediaSelect = document.getElementById('search-media-select');
  const mediaToggle = document.getElementById('search-media-toggle');
  const mediaLabel = document.getElementById('search-media-label');
  const mediaOptions = document.getElementById('search-media-options');
  const optionButtons = [...mediaOptions.querySelectorAll('.search-media-option')];
  const searchControls = overlay.querySelector('.overlay-search-input-wrapper');
  function updateSearchResultsSize() {
    const frame = resultsContainer.querySelector('.search-results-frame');
    if (!frame || overlay.dataset.searchType === 'music') return;
    const grid = frame.querySelector('.search-card-grid');
    const style = getComputedStyle(grid);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap);
    const scrollbar = grid.offsetWidth - grid.clientWidth;
    const maxWidth = parseFloat(getComputedStyle(frame).maxWidth);
    const fullWidth = Math.min(document.getElementById('search-results-panel').clientWidth, maxWidth);
    const maxColumns = window.matchMedia('(orientation: portrait)').matches ? 3 : 6;
    const columns = Math.min(maxColumns, Number(frame.dataset.resultCount));
    const cardWidth = Math.max(0, Math.floor((fullWidth - padding - scrollbar - gap * (maxColumns - 1)) / maxColumns * 100) / 100);
    frame.style.setProperty('--search-result-columns', columns);
    frame.style.setProperty('--search-card-width', `${cardWidth}px`);
    frame.style.setProperty('--search-natural-width', `${Math.ceil(columns * cardWidth + gap * (columns - 1) + padding + scrollbar)}px`);
  }
  const updateSearchControlsWidth = () => {
    overlay.style.setProperty('--search-controls-width', `${searchControls.offsetWidth}px`);
    updateSearchResultsSize();
  };
  new ResizeObserver(updateSearchControlsWidth).observe(searchControls);
  updateSearchControlsWidth();
  window.addEventListener('resize', updateSearchResultsSize);
  const availableTypes = new Set(optionButtons.map(button => button.dataset.type));
  const apiEndpoints = {
    movie: '/api/tmdb_search/', tv: '/api/tmdb_search/',
    anime: '/api/anilist_search/', manga: '/api/anilist_search/',
    game: '/api/igdb_search/', book: '/api/openlib_search/', music: '/api/musicbrainz_search/',
  };
  const aliases = { movies: 'movie', tvshows: 'tv', games: 'game', books: 'book' };
  const normalizeType = value => aliases[value] || value;
  const pageMediaType = [document.body.dataset.pageType, document.body.dataset.mediaType]
    .map(normalizeType).find(type => Object.hasOwn(apiEndpoints, type));
  let selectedType = availableTypes.has(pageMediaType) ? pageMediaType : optionButtons[0]?.dataset.type;
  try {
    if (pageMediaType) localStorage.setItem('lastMediaPageType', pageMediaType);
    else {
      const saved = localStorage.getItem('lastMediaPageType');
      if (availableTypes.has(saved)) selectedType = saved;
    }
  } catch (error) { /* Search still works without browser storage. */ }

  let searchRevision = 0;
  let searchController = null;
  let liveSearchTimer;
  function cancelSearch() {
    searchRevision++;
    searchController?.abort();
    clearTimeout(liveSearchTimer);
  }

  let liveSearchPreferences = {};
  try {
    liveSearchPreferences = JSON.parse(document.getElementById('live-search-preferences').textContent);
  } catch (error) { /* Keep manual search available if preferences cannot be read. */ }
  function isLiveSearchEnabled() { return liveSearchPreferences[selectedType] === true; }
  window.addEventListener('live-search-settings-updated', event => {
    liveSearchPreferences = event.detail;
    cancelSearch();
  });

  function setMediaOptionsOpen(open) {
    mediaOptions.hidden = !open;
    mediaSelect.classList.toggle('is-open', open);
    mediaToggle.setAttribute('aria-expanded', String(open));
  }

  function updateMediaSelection() {
    overlay.dataset.searchType = selectedType || '';
    mediaToggle.disabled = !selectedType;
    overlaySearchInput.disabled = !selectedType;
    if (!selectedType) mediaLabel.textContent = 'No media';
    optionButtons.forEach(button => {
      const selected = button.dataset.type === selectedType;
      button.setAttribute('aria-pressed', String(selected));
      if (selected) mediaLabel.textContent = button.textContent;
    });
  }
  updateMediaSelection();

  mediaSelect.addEventListener('mouseenter', () => {
    if (selectedType && window.matchMedia('(hover: hover)').matches) setMediaOptionsOpen(true);
  });
  mediaSelect.addEventListener('mouseleave', () => {
    if (window.matchMedia('(hover: hover)').matches) setMediaOptionsOpen(false);
  });
  mediaToggle.addEventListener('click', event => {
    setMediaOptionsOpen(event.detail > 0 && window.matchMedia('(hover: hover)').matches
      ? true : mediaOptions.hidden);
  });
  optionButtons.forEach(button => button.addEventListener('click', () => {
    cancelSearch();
    selectedType = button.dataset.type;
    updateMediaSelection();
    resultsContainer.replaceChildren();
    setMediaOptionsOpen(false);
    overlaySearchInput.focus();
    if (isLiveSearchEnabled()) scheduleLiveSearch();
  }));
  document.addEventListener('click', event => {
    if (!mediaSelect.contains(event.target)) setMediaOptionsOpen(false);
  });

  openSearchBtn?.addEventListener('click', () => {
    cancelSearch();
    overlay.classList.remove('hidden');
    overlaySearchInput.value = '';
    resultsContainer.replaceChildren();
    setMediaOptionsOpen(false);
    overlaySearchInput.focus();
  });

  function showSearchMessage(message) {
    const text = document.createElement('div');
    text.className = 'search-message';
    text.textContent = message;
    resultsContainer.replaceChildren(text);
  }

  async function doSearch(query) {
    cancelSearch();
    if (!query.trim() || !selectedType) {
      resultsContainer.replaceChildren();
      return;
    }
    const type = selectedType;
    const revision = searchRevision;
    searchController = new AbortController();
    try {
      const params = new URLSearchParams({ q: query, type });
      const response = await fetch(`${apiEndpoints[type]}?${params}`, { signal: searchController.signal });
      if (!response.ok) throw new Error('Network error');
      const data = await response.json();
      if (revision !== searchRevision) return;
      if (!data.results?.length) {
        showSearchMessage('No results found');
        return;
      }
      const grid = document.createElement('div');
      grid.className = 'search-card-grid';
      data.results.forEach(item => {
        const title = item.title || item.name || 'Untitled';
        let poster = '/static/core/img/placeholder.png';
        if ((type === 'movie' || type === 'tv') && item.poster_path) {
          poster = `https://image.tmdb.org/t/p/w200${item.poster_path}`;
        } else if (item.poster_path) poster = item.poster_path;
        const prefix = item.source || ({ game: 'igdb', book: 'openlib', music: 'musicbrainz', anime: 'anilist', manga: 'anilist' }[type] || 'tmdb');
        const card = document.createElement('div');
        card.className = 'search-card';
        const link = document.createElement('a');
        link.className = 'card-link';
        link.href = `/${prefix}/${type}/${item.id}`;
        const image = document.createElement('img');
        image.src = poster;
        image.alt = title;
        const label = document.createElement('div');
        label.className = 'search-card-title';
        label.textContent = title;
        link.append(image, label);
        if (type === 'music' && item.year) {
          const year = document.createElement('div');
          year.className = 'search-card-year';
          year.textContent = item.year;
          link.appendChild(year);
        }
        card.appendChild(link);
        grid.appendChild(card);
      });
      const frame = document.createElement('div');
      frame.className = 'search-results-frame';
      if (type !== 'music') {
        frame.dataset.resultCount = data.results.length;
        frame.style.setProperty('--search-result-columns', Math.min(6, data.results.length));
      }
      frame.appendChild(grid);
      resultsContainer.replaceChildren(frame);
      updateSearchResultsSize();
    } catch (error) {
      if (error.name === 'AbortError' || revision !== searchRevision) return;
      showSearchMessage('Error fetching results');
      console.error('Search error:', error);
    }
  }

  function scheduleLiveSearch() {
    clearTimeout(liveSearchTimer);
    if (overlaySearchInput.value.trim().length < 3) return;
    const delay = selectedType === 'game' ? 750 : ['movie', 'tv'].includes(selectedType) ? 300 : 800;
    liveSearchTimer = setTimeout(() => doSearch(overlaySearchInput.value), delay);
  }
  overlaySearchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setMediaOptionsOpen(false);
      doSearch(overlaySearchInput.value);
    }
  });
  overlaySearchInput.addEventListener('input', () => {
    cancelSearch();
    resultsContainer.replaceChildren();
    if (isLiveSearchEnabled()) scheduleLiveSearch();
  });

  function closeSearch() {
    cancelSearch();
    setMediaOptionsOpen(false);
    overlay.classList.add('hidden');
    resultsContainer.replaceChildren();
  }
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeSearch();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || overlay.classList.contains('hidden')) return;
    if (!mediaOptions.hidden) {
      setMediaOptionsOpen(false);
      mediaToggle.focus();
    } else closeSearch();
  });

  // Keep wheel scrolling inside search results; the media options scroll normally.
  overlay.addEventListener('wheel', event => {
    if (event.target.closest('.search-media-options')) return;
    event.preventDefault();
    const grid = resultsContainer.querySelector('.search-card-grid');
    if (grid) grid.scrollTop += event.deltaY;
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

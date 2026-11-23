document.addEventListener('DOMContentLoaded', () => {
  
  let currentPage = 1;
  const initialTypeBtn = document.querySelector('.type-btn.active');
  let currentType = initialTypeBtn ? initialTypeBtn.dataset.type : 'movie';
  let isLoading = false;
  let hasMorePages = true;
  let failedPage = null;
  const apiErrorBox = document.getElementById('discover-api-error');
  let pageCache = new Map();
  const renderedTmdbItems = new Set();
  const cardStates = new WeakMap();
  
  const cardGrid = document.getElementById('card-view');

  const searchInput = document.getElementById('search-input');
  
  // Filter elements
  const typeButtons = document.querySelectorAll('.type-btn');
  const tmdbFilters = document.getElementById('tmdb-filters');
  const anilistFilters = document.getElementById('anilist-filters');
  const igdbFilters = document.getElementById('igdb-filters');
  const openlibFilters = document.getElementById('openlib-filters');
  const musicbrainzFilters = document.getElementById('musicbrainz-filters');
  
  const filterSections = {
    movie: tmdbFilters, tv: tmdbFilters,
    anime: anilistFilters, manga: anilistFilters,
    game: igdbFilters, book: openlibFilters, music: musicbrainzFilters,
  };
  const yearInputIds = {
    movie: 'tmdb-year-input', tv: 'tmdb-year-input',
    anime: 'season-year-input', manga: 'season-year-input',
    game: 'igdb-year-input', book: 'openlib-year-input', music: 'musicbrainz-year-input',
  };
  const freeToPlayButton = document.getElementById('igdb-free-to-play');

  function getActiveFilters() {
    const filters = { type: currentType, page: currentPage };
    if (searchInput.value.trim()) filters.q = searchInput.value.trim();

    const section = filterSections[currentType];
    const activeSort = section.querySelector('.sort-btn.active');
    if (activeSort) filters.sort = activeSort.dataset.sort;

    section.querySelectorAll('.custom-select-trigger[data-param]').forEach(trigger => {
      if (currentType === 'manga' && trigger.dataset.param === 'season') return;
      if (trigger.dataset.value) filters[trigger.dataset.param] = trigger.dataset.value;
    });

    const yearInput = document.getElementById(yearInputIds[currentType]);
    if (yearInput?.value && yearInput.closest('.year-filter').style.display !== 'none') {
      filters.year = yearInput.value;
    }
    if (currentType === 'game' && freeToPlayButton.getAttribute('aria-checked') === 'true') {
      filters.free_to_play = 'true';
    }
    return filters;
  }

  function updateURL() {
    const params = new URLSearchParams();
    const filters = getActiveFilters();
    
    Object.keys(filters).forEach(key => {
      if (filters[key] && key !== 'page') {
        params.set(key, filters[key]);
      }
    });
    
    if (currentPage > 1) params.set('page', currentPage);
    
    const newURL = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({ scrollPosition: window.scrollY }, '', newURL);
  }
  
  function setDropdownValue(trigger, value) {
    const options = [...trigger.closest('.custom-select-wrapper').querySelectorAll('.custom-option')];
    const option = options.find(option => option.dataset.value === value && (
      !option.dataset.for || option.dataset.for === 'all' || option.dataset.for === currentType
    )) || options.find(option => option.dataset.value === '');
    trigger.dataset.value = option.dataset.value;
    trigger.textContent = option.textContent;
    options.forEach(item => item.classList.toggle('selected', item === option));
  }

  function updateYearVisibility() {
    const rules = [
      ['tmdb-year-input', tmdbFilters.querySelector('.sort-btn.active')?.dataset.sort === 'popularity.desc'],
      ['season-year-input', document.getElementById('anilist-status-select').dataset.value !== 'NOT_YET_RELEASED'],
      ['igdb-year-input', igdbFilters.querySelector('.sort-btn.active')?.dataset.sort !== 'hypes'],
    ];
    rules.forEach(([id, visible]) => {
      const input = document.getElementById(id);
      input.closest('.year-filter').style.display = visible ? 'block' : 'none';
      if (!visible) input.value = '';
    });
  }

  function restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const urlType = params.get('type');
    if (Object.hasOwn(filterSections, urlType)) currentType = urlType;
    typeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.type === currentType));
    searchInput.value = params.get('q') || '';
    const page = Number(params.get('page'));
    currentPage = Number.isInteger(page) && page > 0 ? page : 1;

    const section = filterSections[currentType];
    const sort = params.get('sort');
    const sortButton = [...section.querySelectorAll('.sort-btn')].find(btn => btn.dataset.sort === sort);
    if (sortButton) {
      section.querySelectorAll('.sort-btn').forEach(btn => btn.classList.toggle('active', btn === sortButton));
    }
    section.querySelectorAll('.custom-select-trigger[data-param]').forEach(trigger => {
      setDropdownValue(trigger, params.get(trigger.dataset.param) || '');
    });
    const year = params.get('year') || '';
    document.getElementById(yearInputIds[currentType]).value = /^\d{4}$/.test(year) ? year : '';
    freeToPlayButton.setAttribute('aria-checked', currentType === 'game' && params.get('free_to_play') === 'true' ? 'true' : 'false');
    showFilterSection(currentType);
  }

  function resetFilters() {
    new Set(Object.values(filterSections)).forEach(section => {
      section.querySelectorAll('.sort-btn').forEach((btn, index) => btn.classList.toggle('active', index === 0));
    });
    document.querySelectorAll('.year-filter input').forEach(input => { input.value = ''; });
    document.querySelectorAll('.custom-select-trigger').forEach(trigger => setDropdownValue(trigger, ''));
    freeToPlayButton.setAttribute('aria-checked', 'false');
    closeDropdowns();
    updateYearVisibility();
  }

  function showFilterSection(type) {
    new Set(Object.values(filterSections)).forEach(section => { section.style.display = 'none'; });
    filterSections[type].style.display = 'block';
    document.querySelectorAll('#tmdb-filters .custom-option[data-for]').forEach(option => {
      option.style.display = option.dataset.for === type || option.dataset.for === 'all' ? '' : 'none';
    });
    document.getElementById('anime-season-group').style.display = type === 'anime' ? 'block' : 'none';
    updateYearVisibility();
  }

  function renderSavedState(card, saved) {
    const state = cardStates.get(card);
    const btn = card.querySelector('.add-to-list-btn');
    state.saved = saved;
    btn.classList.toggle('in-list', saved);
    btn.classList.toggle('not-in-list', !saved);
    btn.disabled = saved;
    if (saved) btn.textContent = '✓';
    else {
      const symbol = document.createElement('span');
      symbol.className = 'discover-add-symbol';
      symbol.textContent = '+';
      btn.replaceChildren(symbol);
    }
    btn.style.display = !saved && card.matches(':hover') ? 'block' : 'none';
  }

  function refreshCardState(card) {
    const state = cardStates.get(card);
    if (state.saving) return;
    if (state.checking) return state.checking;
    const btn = card.querySelector('.add-to-list-btn');
    const version = state.version;
    btn.disabled = true;
    let request;
    request = (async () => {
      try {
        const params = new URLSearchParams({ source: state.item.source || getSourceFromMediaType(state.item.media_type), source_id: state.item.id });
        if (state.item.mal_id) params.set('mal_id', state.item.mal_id);
        const response = await fetch('/api/check_in_list/?' + params, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || typeof data.in_list !== 'boolean') throw new Error('Invalid saved state.');
        // A previous read must not overwrite a newer Add or Back action.
        if (state.version !== version) return;
        state.stale = false;
        renderSavedState(card, data.in_list);
      } catch (_) {
        if (state.version === version) btn.disabled = state.saved;
      } finally {
        if (state.checking === request) state.checking = null;
      }
    })();
    state.checking = request;
    return request;
  }

  function bindCard(card, item, check = true) {
    const btn = card.querySelector('.add-to-list-btn');
    const saved = btn.classList.contains('in-list') || btn.textContent.trim() === '✓';
    cardStates.set(card, { item, key: [item.source || getSourceFromMediaType(item.media_type), item.media_type, item.id].join(':'),
      saved, stale: true, version: 0, checking: null, saving: false, timer: null });
    btn.style.removeProperty('background');
    renderSavedState(card, saved);
    card.addEventListener('mouseenter', event => {
      const state = cardStates.get(card);
      if (state.stale) refreshCardState(card);
      if (!btn.classList.contains('in-list')) btn.style.display = 'block';
      showTooltip(event, item);
    });
    card.addEventListener('mouseleave', () => { btn.style.display = 'none'; hideTooltip(); });
    if (check) refreshCardState(card);
  }

  function refreshReturnedCards() {
    const visited = window.history.state?.viewedItem;
    for (const card of cardGrid.querySelectorAll('.card')) {
      const state = cardStates.get(card);
      if (!state) continue;
      clearTimeout(state.timer);
      state.timer = null;
      state.version++;
      state.checking = null;
      state.saving = false;
      state.stale = true;
      renderSavedState(card, state.saved);
      const rect = card.getBoundingClientRect();
      // Recheck the visited item immediately, and other cards only as needed.
      if (visited ? state.key === visited : rect.bottom > 0 && rect.top < window.innerHeight) refreshCardState(card);
    }
  }

  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-type', item.media_type); // Sets "movie", "tv", "music", "book", etc.
    
    let linkUrl = '#';

    const sourcePrefix = item.source || (
      item.media_type === 'game' ? 'igdb' :
      item.media_type === 'book' ? 'openlib' :
      item.media_type === 'music' ? 'musicbrainz' :
      item.media_type === 'movie' || item.media_type === 'tv' ? 'tmdb' : 
      'mal'
    );
    
    if (item.media_type === 'movie' || item.media_type === 'tv') {
      linkUrl = `/tmdb/${item.media_type}/${item.id}/`;
    } else if (item.media_type === 'anime' || item.media_type === 'manga') {
      linkUrl = `/${sourcePrefix}/${item.media_type}/${item.id}/`;
    } else if (item.media_type === 'game') {
      linkUrl = `/igdb/game/${item.id}/`;
    } else if (item.media_type === 'book') {
      linkUrl = `/openlib/book/${item.id}/`;
    } else if (item.media_type === 'music') {
      linkUrl = `/musicbrainz/music/${item.id}/`;
    }
    
    const posterUrl = item.poster_path || '/static/core/img/placeholder.png';
    
    card.innerHTML = `
      <a href="${linkUrl}" class="card-link">
        <img src="${posterUrl}" onerror="this.src='/static/core/img/placeholder.png'" alt="${item.title}" loading="lazy">
        <!-- Button is now inside the link, making its position relative to the image -->
        <button class="add-to-list-btn" data-id="${item.id}" data-type="${item.media_type}" data-title="${item.title}" data-poster="${posterUrl}" data-item="${encodeURIComponent(JSON.stringify(item))}" style="display: none;"><span class="discover-add-symbol">+</span></button>
      </a>
      <div class="card-title">${item.title}</div>
    `;
    
    bindCard(card, item);

    return card;
  }
  
  function showTooltip(e, item) {
    hideTooltip(); // Remove any existing tooltip
    
    const tooltip = document.createElement('div');
    tooltip.className = 'hover-tooltip';
    
    // Add backdrop/banner image if available
    let content = '<div class="tooltip-surface">';
    if (item.backdrop_path) {
      content += '<div class="tooltip-backdrop"></div>';
    }
    
    content += `<div class="tooltip-content">`;
    content += `<h3>${item.title}</h3>`;
    
    if (item.score) {
      content += `<div class="tooltip-score">★ ${item.score}/10</div>`;
    }
    
    if (item.release_date) {
      const date = new Date(item.release_date);
      const formatted = date.toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      });
      content += `<div class="tooltip-date">${formatted}</div>`;
    }
    
    if (item.genres && item.genres.length > 0) {
      content += `<div class="tooltip-genres">${item.genres.slice(0, 3).join(', ')}</div>`;
    }
    
    if (item.next_airing) {
      // Create a prefix for the season number, default to empty string
      let seasonPrefix = '';
  
      // Check if a season number exists in the data (TMDb TV shows will have this, AniList anime won't)
      if (item.next_episode && item.next_episode.season) {
        seasonPrefix = `(S${item.next_episode.season}) `;
      }
  
      content += `<div class="tooltip-next">${seasonPrefix}Episode ${item.next_episode.episode} airs ${item.next_airing}</div>`;
    }
    
    if (item.overview) {
      const shortOverview = item.overview.length > 200 ? item.overview.substring(0, 200) + '...' : item.overview;
      content += `<div class="tooltip-overview">${shortOverview}</div>`;
    }
    
    content += `</div></div>`;
    
    tooltip.innerHTML = content;
    const backdrop = tooltip.querySelector('.tooltip-backdrop');
    if (backdrop) backdrop.style.setProperty('--tooltip-backdrop-image', `url(${JSON.stringify(item.backdrop_path)})`);
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = e.target.closest('.card').getBoundingClientRect();
    tooltip.style.left = (rect.right + 10) + 'px';
    tooltip.style.top = (rect.top - 2) + 'px';
  }
  
  function hideTooltip() {
    const existing = document.querySelector('.hover-tooltip');
    if (existing) {
      existing.remove();
    }
  }
  
  async function loadContent(reset = false) {
    if (isLoading) return;
    
    isLoading = true;
    
    
    if (reset) {
      failedPage = null;
      apiErrorBox.hidden = true;
      currentPage = 1;
      cardGrid.innerHTML = '';
      hasMorePages = true;
      pageCache.clear(); // Clear cache on filter change
      renderedTmdbItems.clear();
      
      // Load 2 pages initially
      await loadPage(1);
      if (failedPage === null) currentPage = 2;
      if (hasMorePages && failedPage === null) {
        await loadPage(2);
        if (failedPage === null) currentPage = 3;
      }
    } else {
      // Load single page for subsequent loads
      await loadPage(currentPage);
      if (failedPage === null) currentPage++;
    }
    
    updateURL();
    
    // Continue over fully filtered pages when there are no cards to scroll yet.
    while (hasMorePages && cardGrid.children.length === 0) {
      await loadPage(currentPage);
      if (failedPage === null) currentPage++;
    }

    isLoading = false;
    

  }
  
  function appendDiscoverResults(items) {
    items.forEach(item => {
      // TMDB pages can overlap; keep each movie or show visible only once.
      const key = `${item.media_type}:${item.id}`;
      if (item.source === 'tmdb' && renderedTmdbItems.has(key)) return;

      const card = createCard(item);
      cardGrid.appendChild(card);
      if (item.source === 'tmdb') renderedTmdbItems.add(key);
    });
  }

  function hasMoreResults(data) {
    if (data.hasMore !== undefined) return data.hasMore;
    // A short page can still have more results after it; stop on an empty page.
    return data.results.length > 0;
  }

  async function loadPage(page) {
    apiErrorBox.hidden = true;
    failedPage = null;
    const filters = { ...getActiveFilters(), page };
    const cacheKey = JSON.stringify(filters);
    
    // Check cache first
    if (pageCache.has(cacheKey)) {
      const cachedData = pageCache.get(cacheKey);
      appendDiscoverResults(cachedData.results);
      hasMorePages = hasMoreResults(cachedData);
      return;
    }
    
    const params = new URLSearchParams(filters);
    
    try {
      const response = await fetch(`/discover/api/?${params}`);
      const data = await ApiFeedback.readResponse(response, currentType);
      
      // Cache the data
      pageCache.set(cacheKey, data);
      
      appendDiscoverResults(data.results);
      
      hasMorePages = hasMoreResults(data);
      
    } catch (error) {
      failedPage = page;
      hasMorePages = false;
      apiErrorBox.hidden = false;
      ApiFeedback.render(apiErrorBox, error, currentType, { retry: async () => {
        if (isLoading || failedPage === null) return;
        const retryPage = failedPage;
        isLoading = true;
        try {
          await loadPage(retryPage);
          if (failedPage === null) {
            currentPage = retryPage + 1;
            updateURL();
          }
        } finally { isLoading = false; }
        if (failedPage === null && hasMorePages && cardGrid.children.length === 0) await loadContent(false);
      } });
    }
  }
  
  // Event listeners
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isLoading) return; // Prevent clicking while loading
      
      typeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      
      // Clear search input on section change
      searchInput.value = '';
      
      // Reset all filters when switching media types
      resetFilters();
      
      showFilterSection(currentType);
      loadContent(true);
    });
  });
  
  // Filter button handlers
  document.addEventListener('click', (e) => {
    if (e.target.matches('.sort-btn')) {
      if (isLoading) return;
      const group = e.target.closest('.filter-group');
      group.querySelectorAll('.sort-btn').forEach(btn => btn.classList.toggle('active', btn === e.target));
      updateYearVisibility();
      loadContent(true);
    }

    // Add to list button handler
    if (e.target.matches('.add-to-list-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      const btn = e.target;
      
      const rawItem = JSON.parse(decodeURIComponent(btn.dataset.item));
      
      const payload = {
        source: rawItem.source,
        source_id: rawItem.id,
        media_type: rawItem.media_type,
        title: rawItem.title,
        cover_url: rawItem.poster_path
      };

      if (rawItem.mal_id) {
        payload.mal_id = rawItem.mal_id;
      }
      
      addToList(payload, btn);
    }
  });
  
  // Input handlers
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadContent(true), 500);
  });
  
  document.querySelectorAll('#season-year-input, #tmdb-year-input, #igdb-year-input, #openlib-year-input, #musicbrainz-year-input').forEach(input => {
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
      
      clearTimeout(searchTimeout);
      if (e.target.value.length === 4 || e.target.value.length === 0) {
        searchTimeout = setTimeout(() => loadContent(true), 500);
      }
    });
  });
  
  // Single-selection dropdowns share the same open/close behavior.
  function closeDropdowns() {
    document.querySelectorAll('.custom-options.open').forEach(list => list.classList.remove('open'));
    document.querySelectorAll('.custom-select-trigger').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
  }

  document.querySelectorAll('.custom-select-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = trigger.getAttribute('aria-expanded') !== 'true';
      closeDropdowns();
      if (!opening) return;
      const wrapper = trigger.closest('.custom-select-wrapper');
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      wrapper.classList.toggle('drop-up', spaceBelow < 220 && rect.top > spaceBelow);
      wrapper.querySelector('.custom-options').classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    });
  });

  document.querySelectorAll('.custom-option').forEach(option => {
    option.addEventListener('click', () => {
      if (isLoading) return;
      const trigger = option.closest('.custom-select-wrapper').querySelector('.custom-select-trigger');
      setDropdownValue(trigger, option.dataset.value);
      closeDropdowns();
      updateYearVisibility();
      loadContent(true);
    });
  });

  freeToPlayButton.addEventListener('click', () => {
    if (isLoading) return;
    const selected = freeToPlayButton.getAttribute('aria-checked') === 'true';
    freeToPlayButton.setAttribute('aria-checked', String(!selected));
    loadContent(true);
  });

  document.addEventListener('click', closeDropdowns);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const trigger = document.querySelector('.custom-select-trigger[aria-expanded="true"]');
      closeDropdowns();
      trigger?.focus();
    }
  });

  // Infinite scroll
  window.addEventListener('scroll', () => {
    const cardGridRect = cardGrid.getBoundingClientRect();
    const cardGridBottom = cardGridRect.bottom;
    const viewportHeight = window.innerHeight;
    
    if (cardGridBottom <= viewportHeight + 400) {
      if (hasMorePages && !isLoading) {
        loadContent();
      }
    }
  });
  
  // Helper function to get source from media type
  function getSourceFromMediaType(mediaType) {
    if (mediaType === 'movie' || mediaType === 'tv') {
      return 'tmdb';
    } else if (mediaType === 'anime' || mediaType === 'manga') {
      return 'mal';
    } else if (mediaType === 'game') {
      return 'igdb';
    } else if (mediaType === 'book') {
      return 'openlib';
    } else if (mediaType === 'music') {
      return 'musicbrainz';
    }
    return '';
  }
  
  // Add to list function
  async function addToList(itemData, btn) {
    const card = btn.closest('.card');
    const state = cardStates.get(card);
    if (btn.disabled || state.saving) return;
    const version = ++state.version;
    state.saving = true;
    const originalContent = [...btn.childNodes];
    btn.textContent = '...';
    btn.disabled = true;
    
    try {
      const response = await fetch('/api/add_to_list/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': document.querySelector('input[name=csrfmiddlewaretoken]').value
        },
        body: JSON.stringify(itemData)
      });
      
      const data = await ApiFeedback.readResponse(response, itemData.source);
      if (state.version !== version) return;
      
      if (response.ok && (data.success || data.message)) {
        btn.textContent = '✓';
        state.saved = true;
        state.stale = false;
        state.timer = setTimeout(() => {
          state.saving = false;
          state.timer = null;
          renderSavedState(card, true);
        }, 1000);
      } else {
        state.saving = false;
        btn.replaceChildren(...originalContent);
        btn.disabled = false;
        ApiFeedback.notify({ error: data.error || 'Failed to add item.' }, itemData.source);
      }
    } catch (error) {
      if (state.version !== version) return;
      state.saving = false;
      btn.replaceChildren(...originalContent);
      btn.disabled = false;
      ApiFeedback.notify(error, itemData.source);
    }
  }
  
  // Store page state before navigation
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.target.closest('.add-to-list-btn')) return;
    if (e.target.closest('.card-link')) {
      const state = cardStates.get(e.target.closest('.card'));
      window.history.replaceState({
        html: cardGrid.innerHTML,
        currentPage: currentPage,
        hasMorePages: failedPage !== null ? true : hasMorePages,
        failedPage: failedPage,
        viewedItem: state?.key,
        scrollPosition: window.scrollY
      }, '', window.location.href);
    }
  });
  
  window.addEventListener('popstate', (e) => {
    if (e.state?.scrollPosition !== undefined) {
      setTimeout(() => window.scrollTo(0, e.state.scrollPosition), 100);
    }
  });

  window.addEventListener('pageshow', event => {
    if (event.persisted) { hideTooltip(); refreshReturnedCards(); }
  });
  
  // Initial load
  async function initialize() {
    restoreFromURL();
    showFilterSection(currentType);
    
    const state = window.history.state;
    if (state?.html) {
      cardGrid.innerHTML = state.html;
      currentPage = state.currentPage;
      hasMorePages = state.hasMorePages;
      // A failed page is retried after Back, never restored as a real end.
      if (state.failedPage) currentPage = state.failedPage;
      
      cardGrid.querySelectorAll('.card').forEach(card => {
        const btn = card.querySelector('.add-to-list-btn');
        const itemData = JSON.parse(decodeURIComponent(btn.dataset.item));
        if (itemData.source === 'tmdb') renderedTmdbItems.add(`${itemData.media_type}:${itemData.id}`);
        bindCard(card, itemData, false);
      });
      refreshReturnedCards();

      window.scrollTo(0, state.scrollPosition);
    } else if (currentPage > 1) {
      cardGrid.innerHTML = '';
      hasMorePages = true;
      isLoading = true;
      
      const targetPage = currentPage;
      currentPage = 1;
      for (let i = 1; i <= targetPage; i++) {
        await loadPage(i);
        if (failedPage !== null) break;
        currentPage = i + 1;
      }
      
      isLoading = false;
    } else {
      loadContent(true);
    }
  }
  
  window.addEventListener('scroll', hideTooltip);
  
  initialize();

  // === MOBILE SIDEBAR TOGGLE ===
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  if (isTouch && isPortrait) {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sidebar-toggle-btn';
    toggleBtn.innerHTML = '☰';
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar-visible');
    });
    document.querySelector('.list-page-container').prepend(toggleBtn);

    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
      if (!toggleBtn.contains(e.target) && !sidebar.contains(e.target)) {
        sidebar.classList.remove('sidebar-visible');
      }
    });

    // Close sidebar on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        sidebar.classList.remove('sidebar-visible');
      }
    });
  }
});

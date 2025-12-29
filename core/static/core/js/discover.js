document.addEventListener('DOMContentLoaded', () => {
  
  let currentPage = 1;
  let currentType = 'movie';
  let isLoading = false;
  let hasMorePages = true;
  let pageCache = new Map();
  
  const cardGrid = document.getElementById('card-view');
  const loadingDiv = document.getElementById('loading');

  const searchInput = document.getElementById('search-input');
  
  // Filter elements
  const typeButtons = document.querySelectorAll('.type-btn');
  const tmdbFilters = document.getElementById('tmdb-filters');
  const anilistFilters = document.getElementById('anilist-filters');
  const igdbFilters = document.getElementById('igdb-filters');
  
  function getActiveFilters() {
    const filters = { type: currentType, page: currentPage };
    
    // Search query
    if (searchInput.value.trim()) {
      filters.q = searchInput.value.trim();
    }
    
    // Type-specific filters
    if (currentType === 'movie' || currentType === 'tv') {
      const activeSort = document.querySelector('#tmdb-filters .sort-btn.active');
      if (activeSort) filters.sort = activeSort.dataset.sort;
      
      const yearInput = document.getElementById('tmdb-year-input');
      if (yearInput && yearInput.value) filters.year = yearInput.value;
      
    } else if (currentType === 'anime' || currentType === 'manga') {
      const activeSort = document.querySelector('#anilist-filters .sort-btn.active');
      if (activeSort) filters.sort = activeSort.dataset.sort;
      
      const activeSeason = document.querySelector('#anilist-filters .season-btn.active');
      if (activeSeason) filters.season = activeSeason.dataset.season;
      
      const seasonYearInput = document.getElementById('season-year-input');
      if (seasonYearInput.value) filters.year = seasonYearInput.value;
      
      const activeStatus = document.querySelector('#anilist-filters .status-btn.active');
      if (activeStatus) filters.status = activeStatus.dataset.status;
      
    } else if (currentType === 'game') {
      const activeSort = document.querySelector('#igdb-filters .sort-btn.active');
      if (activeSort) filters.sort = activeSort.dataset.sort;
      
      const gameYearInput = document.getElementById('game-year-input');
      if (gameYearInput.value) filters.year = gameYearInput.value;
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
  
  function restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    // Restore type
    const urlType = params.get('type');
    if (urlType && ['movie', 'tv', 'anime', 'manga', 'game'].includes(urlType)) {
      currentType = urlType;
      typeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === currentType);
      });
      showFilterSection(currentType);
    }
    
    // Restore search
    const query = params.get('q');
    if (query) searchInput.value = query;
    
    // Restore page
    const page = params.get('page');
    if (page) currentPage = parseInt(page);
    
    // Restore type-specific filters
    if (currentType === 'movie' || currentType === 'tv') {
      const sort = params.get('sort');
      if (sort) {
        document.querySelectorAll('#tmdb-filters .sort-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.sort === sort);
        });
      }
      
      const year = params.get('year');
      if (year) {
        const yearInput = document.getElementById('tmdb-year-input');
        if (yearInput) yearInput.value = year;
      }
      
      // Show year filter if Popular is selected
      const activeSort = document.querySelector('#tmdb-filters .sort-btn.active');
      if (activeSort && activeSort.dataset.sort === 'popularity.desc') {
        const yearInput = document.getElementById('tmdb-year-input');
        if (yearInput) {
          yearInput.closest('.filter-group').style.display = 'block';
        }
      }
      
    } else if (currentType === 'anime' || currentType === 'manga') {
      const sort = params.get('sort');
      if (sort) {
        document.querySelectorAll('#anilist-filters .sort-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.sort === sort);
        });
      }
      
      const season = params.get('season');
      if (season) {
        document.querySelectorAll('#anilist-filters .season-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.season === season);
        });
      }
      
      const year = params.get('year');
      if (year) document.getElementById('season-year-input').value = year;
      
      const status = params.get('status');
      if (status) {
        document.querySelectorAll('#anilist-filters .status-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.status === status);
        });
      }
      
    } else if (currentType === 'game') {
      const sort = params.get('sort');
      if (sort) {
        document.querySelectorAll('#igdb-filters .sort-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.sort === sort);
        });
      }
      
      const year = params.get('year');
      if (year) document.getElementById('game-year-input').value = year;
    }
  }
  
  function resetFilters() {
    // Reset all filter buttons to default state
    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.sort === 'trending' || btn.dataset.sort === 'TRENDING_DESC' || btn.dataset.sort === 'popularity') {
        btn.classList.add('active');
      }
    });
    
    // Clear all other filter buttons
    document.querySelectorAll('.season-btn, .status-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Clear all year inputs
    document.querySelectorAll('#season-year-input, #game-year-input, #tmdb-year-input').forEach(input => {
      input.value = '';
    });
    
    // Hide year filter groups
    const tmdbYearGroup = document.getElementById('tmdb-year-input')?.closest('.filter-group');
    if (tmdbYearGroup) tmdbYearGroup.style.display = 'none';
  }
  
  function showFilterSection(type) {
    tmdbFilters.style.display = 'none';
    anilistFilters.style.display = 'none';
    igdbFilters.style.display = 'none';
    
    if (type === 'movie' || type === 'tv') {
      tmdbFilters.style.display = 'block';
    } else if (type === 'anime' || type === 'manga') {
      anilistFilters.style.display = 'block';
    } else if (type === 'game') {
      igdbFilters.style.display = 'block';
    }
  }
  
  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    
    let linkUrl = '#';
    if (item.media_type === 'movie' || item.media_type === 'tv') {
      linkUrl = `/tmdb/${item.media_type}/${item.id}/`;
    } else if (item.media_type === 'anime' || item.media_type === 'manga') {
      linkUrl = `/mal/${item.media_type}/${item.id}/`;
    } else if (item.media_type === 'game') {
      linkUrl = `/igdb/game/${item.id}/`;
    }
    
    const posterUrl = item.poster_path || '/static/core/img/placeholder.png';
    
    card.innerHTML = `
      <a href="${linkUrl}" class="card-link">
        <img src="${posterUrl}" alt="${item.title}" loading="lazy">
      </a>
      <div class="card-title">${item.title}</div>
      <button class="add-to-list-btn" data-id="${item.id}" data-type="${item.media_type}" data-title="${item.title}" data-poster="${posterUrl}" data-item="${encodeURIComponent(JSON.stringify(item))}" style="display: none;">+</button>
    `;
    
    // Add hover events
    card.addEventListener('mouseenter', async (e) => {
      const btn = card.querySelector('.add-to-list-btn');
      const source = getSourceFromMediaType(item.media_type);
      
      // Check if item is in list
      try {
        const response = await fetch(`/api/check_in_list/?source=${source}&source_id=${item.id}`);
        const data = await response.json();
        
        if (!data.in_list) {
          btn.style.display = 'block';
        }
      } catch (error) {
        btn.style.display = 'block';
      }
      
      // Show tooltip
      showTooltip(e, item);
    });
    
    card.addEventListener('mouseleave', () => {
      const btn = card.querySelector('.add-to-list-btn');
      btn.style.display = 'none';
      hideTooltip();
    });
    
    return card;
  }
  
  function showTooltip(e, item) {
    hideTooltip(); // Remove any existing tooltip
    
    const tooltip = document.createElement('div');
    tooltip.className = 'hover-tooltip';
    
    // Add backdrop/banner image if available
    let content = '';
    if (item.backdrop_path) {
      content += `<div class="tooltip-backdrop" style="background-image: url('${item.backdrop_path}');"></div>`;
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
      content += `<div class="tooltip-next">Next: ${item.next_airing}</div>`;
    }
    
    if (item.overview) {
      const shortOverview = item.overview.length > 200 ? item.overview.substring(0, 200) + '...' : item.overview;
      content += `<div class="tooltip-overview">${shortOverview}</div>`;
    }
    
    content += `</div>`;
    
    tooltip.innerHTML = content;
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = e.target.closest('.card').getBoundingClientRect();
    tooltip.style.left = (rect.right + 10) + 'px';
    tooltip.style.top = rect.top + 'px';
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
    
    // Delay showing loading indicator
    const loadingTimeout = setTimeout(() => {
      loadingDiv.style.display = 'block';
    }, 3000);
    
    if (reset) {
      currentPage = 1;
      cardGrid.innerHTML = '';
      hasMorePages = true;
      pageCache.clear(); // Clear cache on filter change
      
      // Load 2 pages initially
      await loadPage(1);
      currentPage = 2;
      if (hasMorePages) {
        await loadPage(2);
        currentPage = 3;
      }
    } else {
      // Load single page for subsequent loads
      await loadPage(currentPage);
      currentPage++;
    }
    
    updateURL();
    
    isLoading = false;
    clearTimeout(loadingTimeout);
    loadingDiv.style.display = 'none';
    

  }
  
  async function loadPage(page) {
    const filters = { ...getActiveFilters(), page };
    const cacheKey = JSON.stringify(filters);
    
    // Check cache first
    if (pageCache.has(cacheKey)) {
      const cachedData = pageCache.get(cacheKey);
      cachedData.results.forEach(item => {
        const card = createCard(item);
        cardGrid.appendChild(card);
      });
      hasMorePages = cachedData.results.length === 20;
      return;
    }
    
    const params = new URLSearchParams(filters);
    
    try {
      const response = await fetch(`/discover/api/?${params}`);
      const data = await response.json();
      
      if (data.error) {
        console.error('API Error:', data.error);
        return;
      }
      
      // Cache the data
      pageCache.set(cacheKey, data);
      
      data.results.forEach(item => {
        const card = createCard(item);
        cardGrid.appendChild(card);
      });
      
      hasMorePages = data.hasMore !== undefined ? data.hasMore : data.results.length === 20;
      
    } catch (error) {
      console.error('Fetch error:', error);
      hasMorePages = false;
    }
  }
  
  // Event listeners
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isLoading) return; // Prevent clicking while loading
      
      typeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      
      // Reset all filters when switching media types
      resetFilters();
      
      showFilterSection(currentType);
      loadContent(true);
    });
  });
  
  // Filter button handlers
  document.addEventListener('click', (e) => {
    if (e.target.matches('.sort-btn, .season-btn, .status-btn')) {
      if (isLoading) return; // Prevent clicking while loading
      
      console.log('Filter button clicked:', e.target.className, e.target.dataset);
      const group = e.target.closest('.filter-group');
      group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      // Load content first to ensure it always happens
      loadContent(true);
      
      // Hide year filter when "Upcoming" status is selected
      if (e.target.matches('.status-btn') && e.target.dataset.status === 'NOT_YET_RELEASED') {
        const yearInput = document.getElementById('season-year-input');
        if (yearInput && yearInput.closest('.filter-group')) {
          yearInput.value = '';
          yearInput.closest('.filter-group').style.display = 'none';
        }
      } else if (e.target.matches('.status-btn')) {
        const yearInput = document.getElementById('season-year-input');
        if (yearInput && yearInput.closest('.filter-group')) {
          yearInput.closest('.filter-group').style.display = 'block';
        }
      }
      
      // Show/hide year filter for TMDB based on sort selection
      if (e.target.matches('.sort-btn') && e.target.closest('#tmdb-filters')) {
        const yearInput = document.getElementById('tmdb-year-input');
        if (yearInput && yearInput.closest('.filter-group')) {
          if (e.target.dataset.sort === 'popularity.desc') {
            yearInput.closest('.filter-group').style.display = 'block';
          } else {
            yearInput.value = '';
            yearInput.closest('.filter-group').style.display = 'none';
          }
        }
      }
    }
    
    // Add to list button handler
    if (e.target.matches('.add-to-list-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      const btn = e.target;
      const itemData = {
        source_id: btn.dataset.id,
        media_type: btn.dataset.type,
        source: getSourceFromMediaType(btn.dataset.type)
      };
      
      addToList(itemData, btn);
    }
  });
  
  // Input handlers
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadContent(true), 500);
  });
  
  document.querySelectorAll('#season-year-input, #game-year-input, #tmdb-year-input').forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadContent(true), 500);
    });
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
    }
    return '';
  }
  
  // Add to list function
  async function addToList(itemData, btn) {
    const originalText = btn.textContent;
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
      
      const data = await response.json();
      
      if (response.ok && (data.success || data.message)) {
        btn.textContent = '✓';
        btn.style.background = 'rgba(40, 167, 69, 0.8)';
        setTimeout(() => {
          btn.style.display = 'none';
        }, 1000);
      } else {
        btn.textContent = originalText;
        btn.disabled = false;
        alert(data.error || 'Failed to add item');
      }
    } catch (error) {
      btn.textContent = originalText;
      btn.disabled = false;
      alert('Network error occurred');
    }
  }
  
  // Store page state before navigation
  document.addEventListener('click', (e) => {
    if (e.target.closest('.card-link')) {
      window.history.replaceState({
        html: cardGrid.innerHTML,
        currentPage: currentPage,
        hasMorePages: hasMorePages,
        scrollPosition: window.scrollY
      }, '', window.location.href);
    }
  });
  
  window.addEventListener('popstate', (e) => {
    if (e.state?.scrollPosition !== undefined) {
      setTimeout(() => window.scrollTo(0, e.state.scrollPosition), 100);
    }
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
      
      // Re-attach event listeners
      cardGrid.querySelectorAll('.card').forEach(card => {
        const btn = card.querySelector('.add-to-list-btn');
        const itemData = JSON.parse(decodeURIComponent(btn.dataset.item));
        
        card.addEventListener('mouseenter', async (e) => {
          const source = getSourceFromMediaType(itemData.media_type);
          try {
            const response = await fetch(`/api/check_in_list/?source=${source}&source_id=${itemData.id}`);
            const data = await response.json();
            if (!data.in_list) btn.style.display = 'block';
          } catch {
            btn.style.display = 'block';
          }
          showTooltip(e, itemData);
        });
        
        card.addEventListener('mouseleave', () => {
          btn.style.display = 'none';
          hideTooltip();
        });
      });
      
      window.scrollTo(0, state.scrollPosition);
    } else if (currentPage > 1) {
      cardGrid.innerHTML = '';
      hasMorePages = true;
      isLoading = true;
      
      for (let i = 1; i <= currentPage; i++) {
        await loadPage(i);
      }
      currentPage++;
      
      isLoading = false;
    } else {
      loadContent(true);
    }
  }
  
  window.addEventListener('scroll', hideTooltip);
  
  initialize();

  // === MOBILE SIDEBAR TOGGLE ===
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
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
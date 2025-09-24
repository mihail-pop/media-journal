document.addEventListener('DOMContentLoaded', () => {
  
  let currentPage = 1;
  let currentType = 'movie';
  let isLoading = false;
  let hasMorePages = true;
  
  const cardGrid = document.getElementById('card-view');
  const loadingDiv = document.getElementById('loading');
  const loadMoreDiv = document.getElementById('load-more');
  const loadMoreBtn = document.getElementById('load-more-btn');
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
      
      const yearInput = document.getElementById('year-input');
      if (yearInput.value) filters.year = yearInput.value;
      
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
      <button class="add-to-list-btn" data-id="${item.id}" data-type="${item.media_type}" data-title="${item.title}" data-poster="${posterUrl}" style="display: none;">+</button>
    `;
    
    // Add hover event to check if item is in list
    card.addEventListener('mouseenter', async () => {
      const btn = card.querySelector('.add-to-list-btn');
      const source = getSourceFromMediaType(item.media_type);
      
      try {
        const response = await fetch(`/api/check_in_list/?source=${source}&source_id=${item.id}`);
        const data = await response.json();
        
        if (!data.in_list) {
          btn.style.display = 'block';
        }
      } catch (error) {
        // If check fails, show button anyway
        btn.style.display = 'block';
      }
    });
    
    card.addEventListener('mouseleave', () => {
      const btn = card.querySelector('.add-to-list-btn');
      btn.style.display = 'none';
    });
    
    return card;
  }
  
  async function loadContent(reset = false) {
    if (isLoading) return;
    
    isLoading = true;
    loadingDiv.style.display = 'block';
    loadMoreDiv.style.display = 'none';
    
    if (reset) {
      currentPage = 1;
      cardGrid.innerHTML = '';
      hasMorePages = true;
      
      // Load 2 pages initially
      await loadPage(1);
      if (hasMorePages) {
        await loadPage(2);
      }
      currentPage = 3;
    } else {
      // Load single page for subsequent loads
      await loadPage(currentPage);
      currentPage++;
    }
    
    isLoading = false;
    loadingDiv.style.display = 'none';
    
    if (hasMorePages) {
      loadMoreDiv.style.display = 'block';
    }
  }
  
  async function loadPage(page) {
    const filters = { ...getActiveFilters(), page };
    const params = new URLSearchParams(filters);
    
    try {
      const response = await fetch(`/discover/api/?${params}`);
      const data = await response.json();
      
      if (data.error) {
        console.error('API Error:', data.error);
        return;
      }
      
      data.results.forEach(item => {
        const card = createCard(item);
        cardGrid.appendChild(card);
      });
      
      hasMorePages = data.results.length === 20;
      
    } catch (error) {
      console.error('Fetch error:', error);
      hasMorePages = false;
    }
  }
  
  // Event listeners
  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      typeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentType = btn.dataset.type;
      showFilterSection(currentType);
      loadContent(true);
    });
  });
  
  // Filter button handlers
  document.addEventListener('click', (e) => {
    if (e.target.matches('.sort-btn, .season-btn, .status-btn')) {
      const group = e.target.closest('.filter-group');
      group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      loadContent(true);
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
  
  document.querySelectorAll('#year-input, #season-year-input, #game-year-input').forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadContent(true), 500);
    });
  });
  
  loadMoreBtn.addEventListener('click', () => {
    if (hasMorePages) loadContent();
  });
  
  // Infinite scroll
  window.addEventListener('scroll', () => {
    const cardGridRect = cardGrid.getBoundingClientRect();
    const cardGridBottom = cardGridRect.bottom;
    const viewportHeight = window.innerHeight;
    
    if (cardGridBottom <= viewportHeight + 10) {
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
  
  // Initial load
  showFilterSection(currentType);
  loadContent(true);
});
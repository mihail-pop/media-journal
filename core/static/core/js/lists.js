document.addEventListener("DOMContentLoaded", function () {

  const cardView = document.getElementById("card-view");
  const listView = document.getElementById("list-view");
  const loadingIndicator = document.getElementById("loading-indicator");

  const cardBtn = document.getElementById("card-view-btn");
  const listBtn = document.getElementById("list-view-btn");

  const filterButtons = document.querySelectorAll(".filter-btn");
  const typeFilterButtons = document.querySelectorAll(".type-filter-btn");
  const sortButtons = document.querySelectorAll(".sort-btn");
  const searchInput = document.getElementById("search-input");

  const bannerImg = document.getElementById("rotating-banner");
  let bannerPool = [];

  const mediaType = document.body.dataset.mediaType || "default";
  const filterKey = `listFilterStatus_${mediaType}`;
  const viewKey = `listViewType_${mediaType}`;
  const typeKey = `listTypeFilter_${mediaType}`;
  const sortKey = `listSort_${mediaType}`;
  const sortOrderKey = `listSortOrder_${mediaType}`;

  // === PAGINATION STATE ===
  let currentPage = 1;
  let isLoading = false;
  let hasMore = true;
  let allItems = [];
  let ratingMode = 'faces';

  // === FILTER STATE ===
  let currentStatus = sessionStorage.getItem(filterKey) || "all";
  let currentSearch = "";
  let currentView = sessionStorage.getItem(viewKey) || "card";
  let currentType = localStorage.getItem(typeKey) || "both";
  let currentSort = localStorage.getItem(sortKey) || "rating";
  let currentSortOrder = localStorage.getItem(sortOrderKey) || "desc";
  
const statusLabelsMap = {
  movies: {
    ongoing: "Watching",
    on_hold: "Paused",
    completed: "Completed",
    planned: "Planned",
    dropped: "Dropped",
  },
  tvshows: {
    ongoing: "Watching",
    on_hold: "Paused",
    completed: "Completed",
    planned: "Planned",
    dropped: "Dropped",
  },
  anime: {
    ongoing: "Watching",
    on_hold: "Paused",
    completed: "Completed",
    planned: "Planned",
    dropped: "Dropped",
  },
  manga: {
    ongoing: "Reading",
    on_hold: "Paused",
    completed: "Completed",
    planned: "Planned",
    dropped: "Dropped",
  },
  games: {
    ongoing: "Playing",
    on_hold: "Paused",
    completed: "Completed",
    planned: "Planned",
    dropped: "Dropped",
  },
  books: {
    ongoing: "Reading",
    on_hold: "Paused",
    completed: "Completed",
    planned: "Planned",
    dropped: "Dropped",
  },
  music: {
    ongoing: "Listening",
    on_hold: "Paused",
    completed: "Completed",
    planned: "Planned",
    dropped: "Dropped",
  },
};

  const hasTypeButtons = document.querySelectorAll(".type-filter-btn").length > 0;
  if (!hasTypeButtons && currentType !== "both") {
    currentType = "both";
    localStorage.setItem(typeKey, currentType);
  }

  // Get rating mode from body data attribute
  const bodyElement = document.querySelector('body');
  if (bodyElement && bodyElement.dataset.ratingMode) {
    ratingMode = bodyElement.dataset.ratingMode;
  } else {
    // Fallback: try to detect from existing elements
    const existingRating = document.querySelector('.card-rating');
    if (existingRating) {
      if (existingRating.querySelector('svg[data-icon="smile"]')) ratingMode = 'faces';
      else if (existingRating.querySelector('.star-rating')) ratingMode = 'stars_5';
      else if (existingRating.querySelector('.rating-number')) {
        const text = existingRating.textContent;
        ratingMode = text.includes('.') ? 'scale_10' : 'scale_100';
      }
    }
  }

  // === API FUNCTIONS ===
  async function loadItems(page = 1, reset = false) {
    if (isLoading || (!hasMore && !reset)) return;
    
    isLoading = true;
    
    // Only show loading indicator after 200ms delay
    const loadingTimeout = setTimeout(() => {
      loadingIndicator.style.display = 'block';
    }, 200);
    
    try {
      const params = new URLSearchParams({
        page: page,
        status: currentStatus,
        search: currentSearch,
        sort_by: currentSort,
        sort_order: currentSortOrder
      });
      
      // Add type filter for TV shows
      if (mediaType === 'tvshows') {
        params.append('type', currentType);
      }
      
      const response = await fetch(`/api/${mediaType}/?${params}`);
      const data = await response.json();
      
      if (reset) {
        allItems = data.items;
        currentPage = 1;
      } else {
        allItems = [...allItems, ...data.items];
      }
      
      hasMore = data.has_more;
      currentPage = data.page;
      
      renderItems();
      
    } catch (error) {
      console.error('Error loading items:', error);
    } finally {
      clearTimeout(loadingTimeout);
      isLoading = false;
      loadingIndicator.style.display = 'none';
    }
  }

  function renderItems() {
    const isCardView = currentView === 'card';
    const container = isCardView ? cardView : listView;
    
    // Group items by status
    const groupedItems = {};
    allItems.forEach(item => {
      if (!groupedItems[item.status]) {
        groupedItems[item.status] = [];
      }
      groupedItems[item.status].push(item);
    });
    
    container.innerHTML = '';
    
    // Render each status group
    Object.entries(groupedItems).forEach(([status, items]) => {
      if (items.length === 0) return;
      
      const statusGroup = document.createElement('div');
      statusGroup.className = 'status-group';
      statusGroup.dataset.status = status;
      
      const header = document.createElement('h2');
      header.className = 'status-header';
      const labels = statusLabelsMap[mediaType] || {};
      header.textContent = labels[status] || status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      statusGroup.appendChild(header);
      
      if (isCardView) {
        const cardGrid = document.createElement('div');
        cardGrid.className = 'card-grid';
        
        items.forEach(item => {
          cardGrid.appendChild(createCardElement(item));
        });
        
        statusGroup.appendChild(cardGrid);
      } else {
        const table = document.createElement('table');
        let tableHeaders;
        if (mediaType === 'tvshows') {
          tableHeaders = `<thead>
            <tr>
              <th>Title</th>
              <th>Rating</th>
              <th>Date</th>
              <th>Episodes</th>
              <th>Seasons</th>
            </tr>
          </thead>`;
        } else if (mediaType === 'anime') {
          tableHeaders = `<thead>
            <tr>
              <th>Title</th>
              <th>Rating</th>
              <th>Date</th>
              <th>Episodes</th>
            </tr>
          </thead>`;
        } else if (mediaType === 'manga') {
          tableHeaders = `<thead>
            <tr>
              <th>Title</th>
              <th>Rating</th>
              <th>Date</th>
              <th>Chapters</th>
              <th>Volumes</th>
            </tr>
          </thead>`;
        } else if (mediaType === 'games') {
          tableHeaders = `<thead>
            <tr>
              <th>Title</th>
              <th>Rating</th>
              <th>Date</th>
              <th>Hours</th>
            </tr>
          </thead>`;
        } else if (mediaType === 'books') {
          tableHeaders = `<thead>
            <tr>
              <th>Title</th>
              <th>Rating</th>
              <th>Date</th>
              <th>Pages</th>
            </tr>
          </thead>`;
        } else {
          tableHeaders = `<thead>
            <tr>
              <th>Title</th>
              <th>Rating</th>
              <th>Date</th>
            </tr>
          </thead>`;
        }
        
        table.innerHTML = `${tableHeaders}<tbody></tbody>`;
        
        const tbody = table.querySelector('tbody');
        items.forEach(item => {
          tbody.appendChild(createListRowElement(item));
        });
        
        statusGroup.appendChild(table);
      }
      
      container.appendChild(statusGroup);
    });
  }

  function createCardElement(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    card.dataset.mediaType = item.media_type;
    card.dataset.status = item.status;
    card.dataset.personalRating = item.personal_rating || '0';
    card.dataset.title = item.title;
    card.dataset.coverUrl = item.cover_url;
    card.dataset.bannerUrl = item.banner_url;
    card.dataset.notes = item.notes || '';
    card.dataset.sourceId = item.source_id;
    
    const ratingHtml = getRatingHtml(item.personal_rating);
    const progressHtml = getProgressHtml(item);
    const linkUrl = getLinkUrl(item);
    const repeatHtml = item.repeats > 0 ? `<div class="repeat-indicator"><span class="repeat-count">${item.repeats}</span><svg class="repeat-icon" viewBox="0 0 512 512"><path fill="currentColor" d="M256.455 8c66.269.119 126.437 26.233 170.859 68.685l35.715-35.715C478.149 25.851 504 36.559 504 57.941V192c0 13.255-10.745 24-24 24H345.941c-21.382 0-32.09-25.851-16.971-40.971l41.75-41.75c-30.864-28.899-70.801-44.907-113.23-45.273-92.398-.798-170.283 73.977-169.484 169.442C88.764 348.009 162.184 424 256 424c41.127 0 79.997-14.678 110.629-41.556 4.743-4.161 11.906-3.908 16.368.553l39.662 39.662c4.872 4.872 4.631 12.815-.482 17.433C378.202 479.813 319.926 504 256 504 119.034 504 8.001 392.967 8 256.002 7.999 119.193 119.646 7.755 256.455 8z"/></svg></div>` : '';
    
    card.innerHTML = `
      <a href="${linkUrl}" class="card-link">
        <div class="card-image">
          <img src="${item.cover_url}" alt="${item.title}" loading="lazy">
          ${repeatHtml}
        </div>
        <div class="card-title-overlay">
          <span class="card-title">${item.title}</span>
          <div class="card-meta-row">
            ${progressHtml}
            ${ratingHtml}
          </div>
        </div>
      </a>
      <button class="edit-card-btn">⋯</button>
    `;
    
    return card;
  }

  function createListRowElement(item) {
    const row = document.createElement('tr');
    row.className = 'list-row';
    row.dataset.id = item.id;
    row.dataset.mediaType = item.media_type;
    row.dataset.status = item.status;
    row.dataset.personalRating = item.personal_rating || '0';
    row.dataset.title = item.title;
    row.dataset.coverUrl = item.cover_url;
    row.dataset.bannerUrl = item.banner_url;
    row.dataset.notes = item.notes || '';
    row.dataset.sourceId = item.source_id;
    
    const ratingHtml = getRatingHtml(item.personal_rating);
    const linkUrl = getLinkUrl(item);
    const episodesHtml = getEpisodesHtml(item);
    const seasonsHtml = getSeasonsHtml(item);
    
    let tableHtml = `
      <td>
        <a href="${linkUrl}">
          ${item.title}
          <button class="edit-card-btn">⋯</button>
        </a>
      </td>
      <td>${ratingHtml}</td>
    `;
    
    // Add date column for all media types except books which also get date
    if (mediaType === 'movies' || mediaType === 'tvshows' || mediaType === 'anime' || mediaType === 'manga' || mediaType === 'games' || mediaType === 'books' || mediaType === 'music') {
      const dateFormatted = new Date(item.date_added || Date.now()).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      tableHtml += `<td>${dateFormatted}</td>`;
    } else {
      tableHtml += `<td>${item.get_status_display}</td>`;
    }
    
    // Add episodes and seasons columns for TV shows
    if (mediaType === 'tvshows') {
      tableHtml += `
        <td style="text-align: center;">${episodesHtml}</td>
        <td>${seasonsHtml}</td>
      `;
    } else if (mediaType === 'anime') {
      tableHtml += `
        <td style="text-align: center;">${episodesHtml}</td>
      `;
    } else if (mediaType === 'manga') {
      tableHtml += `
        <td style="text-align: center;">${episodesHtml}</td>
        <td>${seasonsHtml}</td>
      `;
    } else if (mediaType === 'games') {
      tableHtml += `
        <td style="text-align: center;">${episodesHtml}</td>
      `;
    } else if (mediaType === 'books') {
      tableHtml += `
        <td style="text-align: center;">${episodesHtml}</td>
      `;
    }
    
    row.innerHTML = tableHtml;
    return row;
  }

  function getRatingHtml(rating) {
    if (!rating) return '';
    
    const rounded = Math.round(rating);
    
    if (ratingMode === 'faces') {
      if (rounded <= 33) {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="frown" class="svg-inline--fa fa-frown fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm-80 128c-40.2 0-78 17.7-103.8 48.6-8.5 10.2-7.1 25.3 3.1 33.8 10.2 8.4 25.3 7.1 33.8-3.1 16.6-19.9 41-31.4 66.9-31.4s50.3 11.4 66.9 31.4c8.1 9.7 23.1 11.9 33.8 3.1 10.2-8.5 11.5-23.6 3.1-33.8C326 321.7 288.2 304 248 304z"></path></svg></span>';
      } else if (rounded <= 66) {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="meh" class="svg-inline--fa fa-meh fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm8 144H160c-13.2 0-24 10.8-24 24s10.8 24 24 24h176c13.2 0 24-10.8 24-24s-10.8-24-24-24z"></path></svg></span>';
      } else {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="smile" class="svg-inline--fa fa-smile fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg></span>';
      }
    } else if (ratingMode === 'stars_5') {
      const stars = Math.round(rating / 20);
      let starsHtml = '<span class="card-rating"><span class="star-rating">';
      for (let i = 1; i <= 5; i++) {
        if (i <= stars) {
          starsHtml += '<svg class="star-icon filled" viewBox="0 0 32 32" style="color:gold;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
        } else {
          starsHtml += '<svg class="star-icon empty" viewBox="0 0 32 32" style="color:#444;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
        }
      }
      starsHtml += '</span></span>';
      return starsHtml;
    } else if (ratingMode === 'scale_10') {
      return `<span class="card-rating"><span class="rating-number">${Math.round(rating / 10)}</span></span>`;
    } else if (ratingMode === 'scale_100') {
      return `<span class="card-rating"><span class="rating-number">${Math.round(rating)}</span></span>`;
    }
    
    return '';
  }

  function getProgressHtml(item) {
    if (!item.progress_main) return '';
    
    if (item.progress_main === item.total_main) {
      return `<div class="card-progress">${item.progress_main}</div>`;
    } else {
      const total = item.total_main ? `/${item.total_main}` : '';
      return `<div class="card-progress">${item.progress_main}${total}</div>`;
    }
  }

  function getEpisodesHtml(item) {
    if (!item.progress_main) return '';
    
    if (item.progress_main === item.total_main) {
      return item.progress_main;
    } else {
      const total = item.total_main ? ` / ${item.total_main}` : '';
      return `${item.progress_main}${total}`;
    }
  }

  function getSeasonsHtml(item) {
    if (!item.progress_secondary) return '';
    
    if (item.progress_secondary === item.total_secondary) {
      return item.progress_secondary;
    } else {
      const total = item.total_secondary ? ` / ${item.total_secondary}` : '';
      return `${item.progress_secondary}${total}`;
    }
  }

  function getLinkUrl(item) {
    if (item.media_type === 'tv' && item.source_id.includes('_s')) {
      const parts = item.source_id.split('_s');
      return `/tmdb/season/${parts[0]}/${parts[1]}/`;
    } else if (item.media_type === 'anime' || item.media_type === 'manga') {
      return `/mal/${item.media_type}/${item.source_id}/`;
    } else if (item.media_type === 'game') {
      return `/igdb/game/${item.source_id}/`;
    } else if (item.media_type === 'book') {
      return `/openlib/book/${item.source_id}/`;
    } else if (item.media_type === 'music') {
      return `/musicbrainz/music/${item.source_id}/`;
    } else {
      return `/tmdb/${item.media_type}/${item.source_id}/`;
    }
  }

  async function loadAllBanners() {
    try {
      const response = await fetch(`/api/${mediaType}/banners/`);
      const data = await response.json();
      bannerPool = data.banners || [];
      if (bannerPool.length > 0) {
        initBannerRotator();
      }
    } catch (error) {
      console.error('Error loading banners:', error);
    }
  }

  // === Set active filter buttons ===
  const matchingBtn = document.querySelector(`.filter-btn[data-filter="${currentStatus}"]`);
  if (matchingBtn) {
    filterButtons.forEach(b => b.classList.remove("active"));
    matchingBtn.classList.add("active");
  }
  

  
// === Set active sort button ===
function updateSortButtons() {
  sortButtons.forEach(btn => {
    const sortType = btn.dataset.sort;
    if (sortType === currentSort) {
      btn.classList.add('active');
      
      // Use responsive arrows
      const arrow = getArrow(currentSortOrder === 'asc');
      btn.textContent = btn.textContent.split(' ')[0] + arrow;
      
      // Set hover tooltip
      let tooltip = '';
      if (sortType === 'title') {
        tooltip = currentSortOrder === 'asc' ? 'A-Z' : 'Z-A';
      } else if (sortType === 'rating') {
        tooltip = currentSortOrder === 'asc' ? '1-9' : '9-1';
      } else if (sortType === 'date') {
        tooltip = currentSortOrder === 'asc' ? 'Old-New' : 'New-Old';
      } else if (sortType === 'hours') {
        tooltip = currentSortOrder === 'asc' ? 'Low-High' : 'High-Low';
      } else if (sortType === 'pages') {
        tooltip = currentSortOrder === 'asc' ? 'Low-High' : 'High-Low';
      }
      btn.title = tooltip;
    } else {
      btn.classList.remove('active');
      btn.textContent = btn.textContent.split(' ')[0];
      btn.removeAttribute('title');
    }
  });
}

// Responsive arrow function
function getArrow(isAscending) {
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  return isAscending ? (isPortrait ? ' ▲' : ' ⮝') : (isPortrait ? ' ▼' : ' ⮟');
}

updateSortButtons();
  
  if (hasTypeButtons) {
    const matchingTypeBtn = document.querySelector(`.type-filter-btn[data-type="${currentType}"]`);
    if (matchingTypeBtn) {
      typeFilterButtons.forEach(b => b.classList.remove("active"));
      matchingTypeBtn.classList.add("active");
    }
  }

  // === Show the correct view immediately ===
  if (currentView === "card") {
    cardBtn.classList.add("active");
    listBtn.classList.remove("active");
    cardView.style.display = "block";
    listView.style.display = "none";
  } else {
    listBtn.classList.add("active");
    cardBtn.classList.remove("active");
    listView.style.display = "block";
    cardView.style.display = "none";
  }

  // === VIEW TOGGLE ===
  cardBtn.addEventListener("click", () => {
    cardBtn.classList.add("active");
    listBtn.classList.remove("active");
    cardView.style.display = "block";
    listView.style.display = "none";
    currentView = "card";
    sessionStorage.setItem(viewKey, currentView);
    renderItems();
  });

  listBtn.addEventListener("click", () => {
    listBtn.classList.add("active");
    cardBtn.classList.remove("active");
    listView.style.display = "block";
    cardView.style.display = "none";
    currentView = "list";
    sessionStorage.setItem(viewKey, currentView);
    renderItems();
  });

  // === TYPE FILTER BUTTONS ===
  typeFilterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeFilterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      localStorage.setItem(typeKey, currentType);
      resetAndLoad();
    });
  });

  // === STATUS FILTER BUTTONS ===
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatus = btn.dataset.filter;
      sessionStorage.setItem(filterKey, currentStatus);
      updateStatusContainer();
      resetAndLoad();
    });
  });
  
  // === SORT BUTTONS ===
  sortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const sortType = btn.dataset.sort;
      
      if (currentSort === sortType) {
        // Toggle order for same sort type
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        // New sort type
        currentSort = sortType;
        currentSortOrder = sortType === 'rating' ? 'desc' : 'asc';
      }
      
      localStorage.setItem(sortKey, currentSort);
      localStorage.setItem(sortOrderKey, currentSortOrder);
      updateSortButtons();
      resetAndLoad();
    });
  });

  // === SEARCH INPUT ===
  let searchTimeout;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = searchInput.value.trim();
      resetAndLoad();
    }, 300);
  });

  function resetAndLoad() {
    allItems = [];
    currentPage = 1;
    hasMore = true;
    loadItems(1, true);
  }

  // === SCROLL PAGINATION ===
  function handleScroll() {
    if (isLoading || !hasMore) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    if (scrollTop + windowHeight >= documentHeight - 1000) {
      loadItems(currentPage + 1);
    }
  }

  window.addEventListener('scroll', handleScroll);

  // === STATUS CONTAINER VISIBILITY ===
  function updateStatusContainer() {
    const statusBtnContainer = document.getElementById("check-status-container");
    if (statusBtnContainer) {
      statusBtnContainer.style.display = (currentStatus === "planned") ? "block" : "none";
    }
  }

  // === GLOBAL EDIT MODAL FUNCTION ===
  window.openEditModal = function(element) {
    const itemId = element.dataset.id;
    const mediaType = element.dataset.mediaType;
    const coverUrl = element.dataset.coverUrl;
    const bannerUrl = element.dataset.bannerUrl;
    const title = element.dataset.title;
    const sourceId = element.dataset.sourceId;

    const modal = document.getElementById('edit-modal');
    const banner = modal.querySelector('.modal-banner');
    const cover = modal.querySelector('.modal-cover img');
    const titleElement = modal.querySelector('.modal-title');
    const overlay = document.getElementById('edit-overlay');

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
        
        // Use the populateForm function from edit_modal.js
        if (window.populateEditForm) {
          window.populateEditForm(form, data.item);
        }
        modal.classList.remove("modal-hidden");
        overlay.classList.remove("modal-hidden");
      })
      .catch(err => {
        console.error("Fetch error:", err);
        alert("Failed to load item");
      });
  };

  // === SCROLL POSITION RESTORATION ===
  const scrollKey = `scrollPos_${mediaType}`;
  const pageKey = `scrollPage_${mediaType}`;
  
  // Detect if this is a back/forward navigation
  const isBackForwardNav = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  
  // Save scroll position before leaving
  window.addEventListener('beforeunload', () => {
    sessionStorage.setItem(scrollKey, window.scrollY);
    sessionStorage.setItem(pageKey, currentPage);
  });
  
  // === EVENT DELEGATION FOR EDIT BUTTONS ===
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('edit-card-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      const card = e.target.closest('.card, .list-row');
      if (card) {
        window.openEditModal(card);
      }
    }
  });
  
  // Restore scroll position after loading
  const savedPage = parseInt(sessionStorage.getItem(pageKey)) || 1;
  const savedScroll = parseInt(sessionStorage.getItem(scrollKey)) || 0;
  

  
  if (isBackForwardNav && savedPage > 1) {
    // Reserve scrollbar space and hide it
    document.documentElement.style.overflowY = 'scroll';
    document.documentElement.style.visibility = 'hidden';
    
    // Hide content while loading
    cardView.style.opacity = '0';
    listView.style.opacity = '0';
    
    // Load all pages up to saved page
    async function loadUpToPage() {
      for (let i = 1; i <= savedPage; i++) {
        await loadItems(i, i === 1);
      }
      // Restore scroll position and show content
      window.scrollTo(0, savedScroll);
      document.documentElement.style.visibility = 'visible';
      cardView.style.opacity = '1';
      listView.style.opacity = '1';
    }
    loadUpToPage();
  } else {
    if (!isBackForwardNav) {
      // Clear saved position on fresh navigation
      sessionStorage.removeItem(scrollKey);
      sessionStorage.removeItem(pageKey);
    }
    loadItems(1, true);
  }
  
  updateStatusContainer();
  loadAllBanners();
  updateSortButtons();

  // === BANNER ROTATOR ===
  let firstLoad = true;
  let bannerInterval;

  function initBannerRotator() {
    if (bannerPool.length === 0) return;
    
    updateBanner();
    if (bannerInterval) clearInterval(bannerInterval);
    bannerInterval = setInterval(updateBanner, 30000);
  }

  function updateBanner() {
    if (bannerPool.length === 0) return;
    const random = Math.floor(Math.random() * bannerPool.length);
    const { bannerUrl, notes } = bannerPool[random];

    const quoteBox = document.querySelector(".banner-quote");

    if (firstLoad) {
      bannerImg.src = bannerUrl;
      bannerImg.style.opacity = 1;

      if (quoteBox) {
        quoteBox.innerText = notes ? `“${notes}”\n\n~You` : "";
        quoteBox.style.display = notes ? "block" : "none";
        quoteBox.style.opacity = notes ? 1 : 0;
      }

      firstLoad = false;
      return;
    }

    bannerImg.style.opacity = 0;
    if (quoteBox) quoteBox.style.opacity = 0;

    setTimeout(() => {
      bannerImg.src = bannerUrl;
      if (quoteBox) {
        quoteBox.innerText = notes ? `“${notes}”\n\n~You` : "";
        quoteBox.style.display = notes ? "block" : "none";
        quoteBox.style.opacity = notes ? 1 : 0;
      }
      bannerImg.style.opacity = 1;
    }, 1000);
  }


});



const checkStatusBtn = document.getElementById("check-status-btn");

if (checkStatusBtn) {
  checkStatusBtn.addEventListener("click", () => {
    const mediaType = document.body.getAttribute("data-media-type");
    let apiUrl = "";

    switch (mediaType) {
      case "movies":
        apiUrl = "/api/check_planned_movie_statuses/";
        break;
      case "tvshows":
        apiUrl = "/api/check_planned_tvseries_statuses/";
        break;
      case "anime":
      case "manga":
        apiUrl = `/api/check_planned_anime_manga_statuses/?media_type=${mediaType}`;
        break;
      default:
        console.warn("Unknown media type for status check");
        return;
    }

    fetch(apiUrl)
      .then(response => response.json())
      .then(statuses => {
        for (const [sourceId, status] of Object.entries(statuses)) {
          const card = document.querySelector(`.card[data-source-id="${sourceId}"]`);
          if (card && !card.querySelector(".status-dot")) {
            const dot = document.createElement("div");
            dot.classList.add("status-dot");

            if (mediaType === "movies") {
              if (status === "Released") dot.style.backgroundColor = "green";
              else if (status.includes("Production")) dot.style.backgroundColor = "red";
              else dot.style.backgroundColor = "red";
            } else if (mediaType === "tvshows") {
              if (status === "Ended") dot.style.backgroundColor = "green";
              else if (status === "Returning with upcoming episode") dot.style.backgroundColor = "orange";
              else if (status === "In Production") dot.style.backgroundColor = "red";
              else dot.style.backgroundColor = "red";
            } else if (mediaType === "anime" || mediaType === "manga") {
              if (status === "Finished") dot.style.backgroundColor = "green";
              else if (status === "Releasing") dot.style.backgroundColor = "orange";
              else if (status === "Not yet released") dot.style.backgroundColor = "red";
              else dot.style.backgroundColor = "gray";
            }

            card.appendChild(dot);
          }
        }
      });
  });
}
document.addEventListener("DOMContentLoaded", function () {

  const cardView = document.getElementById("card-view");
  const listView = document.getElementById("list-view");
  const loadingIndicator = document.getElementById("loading-indicator");

  const cardBtn = document.getElementById("card-view-btn");
  const listBtn = document.getElementById("list-view-btn");

  const filterButtons = document.querySelectorAll(".filter-btn");
  const typeFilterButtons = document.querySelectorAll(".type-filter-btn");
  const sortButtons = document.querySelectorAll(".sort-btn");
  const sortSelect = document.getElementById("sort-select");
  const sortOptions = document.querySelectorAll(".sort-option");
  const sortOrderBtn = document.getElementById("sort-order-btn");
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
  let listCacheVersion = sessionStorage.getItem(`cacheVersion_${mediaType}`) || "";

  // Canonical order for status groups (used to render and insert groups predictably)
  const statusesOrder = ['ongoing', 'completed', 'on_hold', 'planned', 'dropped'];

  // === FILTER STATE ===
  let currentStatus = sessionStorage.getItem(filterKey) || "all";
  let currentSearch = "";
  let currentView = sessionStorage.getItem(viewKey) || "card";
  let currentType = localStorage.getItem(typeKey) || "both";
  let currentSort = localStorage.getItem(sortKey) || "rating";
  let currentSortOrder = localStorage.getItem(sortOrderKey) || (currentSort === "rating" ? "desc" : "asc");

  const availableSortTypes = Array.from(sortOptions).map(option => option.dataset.sort).filter(Boolean);
  if (availableSortTypes.length && !availableSortTypes.includes(currentSort)) {
    currentSort = "rating";
    currentSortOrder = "desc";
    localStorage.setItem(sortKey, currentSort);
    localStorage.setItem(sortOrderKey, currentSortOrder);
  }
  if (!['asc', 'desc'].includes(currentSortOrder)) {
    currentSortOrder = currentSort === "rating" ? "desc" : "asc";
    localStorage.setItem(sortOrderKey, currentSortOrder);
  }
  
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
      
      if (listCacheVersion) {
        params.append('_v', listCacheVersion);
      }

      const response = await fetch(`/api/${mediaType}/?${params}`);
      const data = await response.json();
      
      if (reset) {
        allItems = data.items || [];
        currentPage = 1;
      } else {
        // Merge new page items into allItems without duplicating entries
        const existingMap = new Map(allItems.map((it, idx) => [String(it.id), idx]));
        for (const ni of (data.items || [])) {
          const nid = String(ni.id);
          if (existingMap.has(nid)) {
            // replace existing entry with fresh data
            allItems[existingMap.get(nid)] = ni;
          } else {
            existingMap.set(nid, allItems.length);
            allItems.push(ni);
          }
        }
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
    const statusesToRender = [...statusesOrder, ...Object.keys(groupedItems).filter(s => !statusesOrder.includes(s))];
    statusesToRender.forEach(status => {
      const items = groupedItems[status] || [];
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

        items.forEach(item => cardGrid.appendChild(createCardElement(item)));
        statusGroup.appendChild(cardGrid);
      } else {
        const table = document.createElement('table');
        let tableHeaders;
        // Table headers with sort support
        function th(label, sortKey) {
          const isActive = currentSort === sortKey;
          const arrow = isActive ? getArrow(currentSortOrder === 'asc') : '';
          return `<th class="sortable-th" data-sort="${sortKey}">${label}${arrow}</th>`;
        }

        if (mediaType === 'tvshows') {
          tableHeaders = `<thead><tr>
            ${th('Title', 'title')}
            ${th('Rating', 'rating')}
            ${th('Activity Date', 'activity_date')}
            ${th('Release Date', 'release_date')}
            ${th('Episodes', 'episodes')}
            ${th('Seasons', 'seasons')}
          </tr></thead>`;
        } else if (mediaType === 'anime') {
          tableHeaders = `<thead><tr>
            ${th('Title', 'title')}
            ${th('Rating', 'rating')}
            ${th('Activity Date', 'activity_date')}
            ${th('Release Date', 'release_date')}
            ${th('Episodes', 'episodes')}
          </tr></thead>`;
        } else if (mediaType === 'manga') {
          tableHeaders = `<thead><tr>
            ${th('Title', 'title')}
            ${th('Rating', 'rating')}
            ${th('Activity Date', 'activity_date')}
            ${th('Release Date', 'release_date')}
            ${th('Chapters', 'chapters')}
            ${th('Volumes', 'volumes')}
          </tr></thead>`;
        } else if (mediaType === 'games') {
          tableHeaders = `<thead><tr>
            ${th('Title', 'title')}
            ${th('Rating', 'rating')}
            ${th('Activity Date', 'activity_date')}
            ${th('Release Date', 'release_date')}
            ${th('Hours', 'hours')}
          </tr></thead>`;
        } else if (mediaType === 'books') {
          tableHeaders = `<thead><tr>
            ${th('Title', 'title')}
            ${th('Rating', 'rating')}
            ${th('Activity Date', 'activity_date')}
            ${th('Release Date', 'release_date')}
            ${th('Pages', 'pages')}
          </tr></thead>`;
        } else if (mediaType === 'music') {
          tableHeaders = `<thead><tr>
            ${th('Title', 'title')}
            ${th('Rating', 'rating')}
            ${th('Activity Date', 'activity_date')}
            ${th('Release Date', 'release_date')}
          </tr></thead>`;
        } else {
          tableHeaders = `<thead><tr>
            ${th('Title', 'title')}
            ${th('Rating', 'rating')}
            ${th('Activity Date', 'activity_date')}
            ${th('Release Date', 'release_date')}
          </tr></thead>`;
        }
        
        table.innerHTML = `${tableHeaders}<tbody></tbody>`;
        
        const tbody = table.querySelector('tbody');
        items.forEach(item => {
          tbody.appendChild(createListRowElement(item));
        });

        // Add click listeners to table headers for sorting
        const ths = table.querySelectorAll('.sortable-th');
        ths.forEach(th => {
          th.style.cursor = 'pointer';
          th.addEventListener('click', () => {
            const sortType = th.dataset.sort;
            applySortFromControl(sortType, true);
          });
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
    const episodesHtml = getListMainProgressHtml(item);
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

    // Activity Date
    const activityDate = item.date_added ? new Date(item.date_added).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    tableHtml += `<td>${activityDate}</td>`;

    // Release Date
    const releaseDate = item.release_date || '';
    tableHtml += `<td>${releaseDate}</td>`;

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
        <td style="text-align: center;">${seasonsHtml}</td>
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

    const rnum = Number(rating);
    if (isNaN(rnum)) return '';

    // Normalize rating depending on detected ratingMode and possible formats
    // Some updates may send 1-5 (stars) or 1-10 (scale_10) while UI expects 0-100
    let normalized = rnum;
    if (ratingMode === 'stars_5') {
      // If value is 1-5, convert to 0-100 scale
      normalized = (rnum > 0 && rnum <= 5) ? (rnum * 20) : rnum;
    } else if (ratingMode === 'scale_10') {
      // If value is 1-10, keep as-is for display; if it's 0-100, convert to 1-10 later
      normalized = rnum;
    }

    const rounded = Math.round(normalized);

    if (ratingMode === 'faces') {
      if (rounded <= 33) {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="frown" class="svg-inline--fa fa-frown fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm-80 128c-40.2 0-78 17.7-103.8 48.6-8.5 10.2-7.1 25.3 3.1 33.8 10.2 8.4 25.3 7.1 33.8-3.1 16.6-19.9 41-31.4 66.9-31.4s50.3 11.4 66.9 31.4c8.1 9.7 23.1 11.9 33.8 3.1 10.2-8.5 11.5-23.6 3.1-33.8C326 321.7 288.2 304 248 304z"></path></svg></span>';
      } else if (rounded <= 66) {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="meh" class="svg-inline--fa fa-meh fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm8 144H160c-13.2 0-24 10.8-24 24s10.8 24 24 24h176c13.2 0 24-10.8 24-24s-10.8-24-24-24z"></path></svg></span>';
      } else {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="smile" class="svg-inline--fa fa-smile fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg></span>';
      }
    } else if (ratingMode === 'stars_5') {
      // Determine star count from normalized 0-100 scale or raw 1-5
      let starsCount = 0;
      if (rnum > 0 && rnum <= 5) {
        starsCount = Math.round(rnum);
      } else {
        starsCount = Math.round(normalized / 20);
      }
      let starsHtml = '<span class="card-rating"><span class="star-rating">';
      for (let i = 1; i <= 5; i++) {
        if (i <= starsCount) {
          starsHtml += '<svg class="star-icon filled" viewBox="0 0 32 32" style="color:gold;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
        } else {
          starsHtml += '<svg class="star-icon empty" viewBox="0 0 32 32" style="color:#444;"><path fill="currentColor" stroke="#000" stroke-width="1.2" d="M16 2.5l4.09 8.29 9.16 1.33-6.62 6.45 1.56 9.09L16 23.13l-8.19 4.32 1.56-9.09-6.62-6.45 9.16-1.33L16 2.5z"/></svg>';
        }
      }
      starsHtml += '</span></span>';
      return starsHtml;
    } else if (ratingMode === 'scale_10') {
      // If rating looks like 0-100, convert to 1-10 for display; if already 1-10, show it
      let displayVal = rnum;
      if (rnum > 10) displayVal = Math.round(rnum / 10);
      return `<span class="card-rating"><span class="rating-number">${displayVal}</span></span>`;
    } else if (ratingMode === 'scale_100') {
      return `<span class="card-rating"><span class="rating-number">${Math.round(rnum)}</span></span>`;
    }
    
    return '';
  }

  function getProgressHtml(item) {
    if (!item.progress_main) return '';
    
    if (item.progress_main === item.total_main || item.progress_main > item.total_main) {
      return `<div class="card-progress">${item.progress_main}</div>`;
    } else {
      const total = item.total_main ? `/${item.total_main}` : '';
      return `<div class="card-progress">${item.progress_main}${total}</div>`;
    }
  }

  function formatListProgress(currentValue, totalValue, options = {}) {
    const hasCurrent = currentValue !== null && currentValue !== undefined && currentValue !== '';
    if (!hasCurrent) return '';

    const currentNumber = Number(currentValue);
    const totalNumber = Number(totalValue);
    const current = Number.isFinite(currentNumber) ? currentNumber : currentValue;
    const hasTotal = totalValue !== null && totalValue !== undefined && totalValue !== '' && Number.isFinite(totalNumber) && totalNumber > 0;

    if (!hasTotal || (options.hideTotalWhenOver && Number.isFinite(currentNumber) && currentNumber > totalNumber)) {
      return `${current}`;
    }

    return `${current}/${totalNumber}`;
  }

  function getListMainProgressHtml(item) {
    if (mediaType === 'games') {
      return formatListProgress(item.progress_main);
    }

    return formatListProgress(item.progress_main, item.total_main, {
      hideTotalWhenOver: mediaType === 'books'
    });
  }

  function getSeasonsHtml(item) {
    return formatListProgress(item.progress_secondary, item.total_secondary);
  }

 function getLinkUrl(item) {
    const source_id = item.source_id || (item.provider_ids ? item.provider_ids[item.source] : null);
    
    if (item.media_type === 'tv' && source_id && source_id.includes('_s')) {
      const parts = source_id.split('_s');
      return `/tmdb/season/${parts[0]}/${parts[1]}/`;
    } else if (item.media_type === 'anime' || item.media_type === 'manga') {
      return `/${item.source}/${item.media_type}/${source_id}/`;
    } else if (item.media_type === 'game') {
      return `/igdb/game/${source_id}/`;
    } else if (item.media_type === 'book') {
      return `/openlib/book/${source_id}/`;
    } else if (item.media_type === 'music') {
      return `/musicbrainz/music/${source_id}/`;
    } else {
      const prefix = item.source || 'tmdb';
      return `/${prefix}/${item.media_type}/${source_id}/`;
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

  // Replace or move a single updated item in the DOM without reloading the whole page
  function replaceItemElement(item) {
    try {
      listCacheVersion = Date.now().toString();
      sessionStorage.setItem(`cacheVersion_${mediaType}`, listCacheVersion);

      const id = String(item.id);

      // Get old status BEFORE updating allItems
      const idx = allItems.findIndex(i => String(i.id) === id);
      const oldItem = idx !== -1 ? {...allItems[idx]} : null;
      const oldStatus = oldItem ? oldItem.status : null;
      
      // Update in-memory list (best-effort)
      if (idx !== -1) {
        allItems[idx] = Object.assign({}, allItems[idx], item);
      } else {
        // If not present, add to in-memory list (we don't know exact position without full load)
        allItems.unshift(item);
      }

      // If a status filter is active, do not insert items of other statuses
      if (currentStatus && currentStatus !== 'all' && item.status !== currentStatus) {
        // Remove element if currently visible but being filtered out
        document.querySelectorAll(`.card[data-id="${id}"], .list-row[data-id="${id}"]`).forEach(n => n.remove());
        // Remove from memory
        allItems = allItems.filter(i => String(i.id) !== id);
        // Update counts BEFORE returning (if status changed)
        if (oldStatus && oldStatus !== item.status) {
          statusCounts[oldStatus] = Math.max(0, statusCounts[oldStatus] - 1);
          statusCounts[item.status] = statusCounts[item.status] + 1;
        }
        
        updateFilterButtons();
        return;
      }

      // Create a fresh element using existing render helpers
      const newEl = (currentView === 'card') ? createCardElement(item) : createListRowElement(item);
      // Attach date data for comparisons
      if (item.date_added) newEl.dataset.dateAdded = item.date_added;

      // Try to find existing element in DOM BEFORE removing it
      const selector = currentView === 'card' ? `.card[data-id="${id}"]` : `.list-row[data-id="${id}"]`;
      const oldEl = (currentView === 'card' ? cardView : listView)?.querySelector(selector) || document.querySelector(selector);
      if (oldEl) {
        // Check if we need to re-sort based on current sort criteria
        let needsResort = false;
        if (oldStatus !== item.status) needsResort = true;
        else if (currentSort === 'rating' && oldItem && oldItem.personal_rating != item.personal_rating) needsResort = true;
        else if ((currentSort === 'date' || currentSort === 'activity_date') && oldItem && oldItem.date_added != item.date_added) needsResort = true;
        else if (currentSort === 'release_date' && oldItem && oldItem.release_date != item.release_date) needsResort = true;
        else if ((currentSort === 'hours' || currentSort === 'pages') && oldItem && oldItem.progress_main != item.progress_main) needsResort = true;
        else if ((currentSort === 'episodes' || currentSort === 'chapters') && oldItem && (oldItem.total_main != item.total_main || oldItem.progress_main != item.progress_main)) needsResort = true;
        else if ((currentSort === 'seasons' || currentSort === 'volumes') && oldItem && (oldItem.total_secondary != item.total_secondary || oldItem.progress_secondary != item.progress_secondary)) needsResort = true;
        else if (currentSort === 'title' && oldItem && oldItem.title != item.title) needsResort = true;

        // If status didn't change and no re-sort needed, replace in-place (PRESERVE DOM position)
        if (!needsResort && oldEl.dataset.status === item.status) {
          oldEl.replaceWith(newEl);
          return;
        }
        // Status changed (or other grouping), remove old and fallthrough to insert in new group
        const oldGroup = oldEl.closest('.status-group');
        oldEl.remove();

        // Check if oldGroup is empty
        if (oldGroup) {
             const grid = oldGroup.querySelector('.card-grid');
             const tbody = oldGroup.querySelector('tbody');
             const hasChildren = (grid && grid.children.length > 0) || (tbody && tbody.children.length > 0);
             if (!hasChildren) oldGroup.remove();
        }
      }

      // Comparison helpers using server-side fields in allItems
      function normalizeRating(r) {
          const val = Number(r) || 0;
          if (ratingMode === 'stars_5' && val <= 5 && val > 0) return val * 20;
          if (ratingMode === 'scale_10' && val <= 10 && val > 0) return val * 10;
          return val;
      }

      function effectiveProgress(total, progress) {
          const totalValue = Number(total) || 0;
          if (totalValue > 0) return totalValue;
          return Number(progress) || 0;
      }

function compareItems(a, b) {
        if (!a || !b) return 0;

        // Helper for case-insensitive, natural string comparison
        const compareTitles = (t1, t2) => {
          return String(t1 || '').localeCompare(String(t2 || ''), undefined, {
            sensitivity: 'base',
            numeric: true
          });
        };

        // rating
        if (currentSort === 'rating') {
          const ra = normalizeRating(a.personal_rating);
          const rb = normalizeRating(b.personal_rating);
          if (ra !== rb) return ra - rb;
          return compareTitles(a.title, b.title);
        }
        // activity date
        if (currentSort === 'date' || currentSort === 'activity_date') {
          const da = a.date_added ? new Date(a.date_added).getTime() : 0;
          const db = b.date_added ? new Date(b.date_added).getTime() : 0;
          if (da !== db) return da - db;
          return compareTitles(a.title, b.title);
        }
        // release date
        if (currentSort === 'release_date') {
          const da = a.release_date ? new Date(a.release_date).getTime() : 0;
          const db = b.release_date ? new Date(b.release_date).getTime() : 0;
          if (da !== db) return da - db;
          return compareTitles(a.title, b.title);
        }
        // hours / pages
        if (currentSort === 'hours' || currentSort === 'pages') {
            const pa = Number(a.progress_main) || 0;
            const pb = Number(b.progress_main) || 0;
            if (pa !== pb) return pa - pb;
            return compareTitles(a.title, b.title);
        }
        // episodes / seasons / chapters / volumes
        if (currentSort === 'episodes' || currentSort === 'chapters') {
            const ea = effectiveProgress(a.total_main, a.progress_main);
            const eb = effectiveProgress(b.total_main, b.progress_main);
            if (ea !== eb) return ea - eb;
            return compareTitles(a.title, b.title);
        }
        if (currentSort === 'seasons' || currentSort === 'volumes') {
            const sa = effectiveProgress(a.total_secondary, a.progress_secondary);
            const sb = effectiveProgress(b.total_secondary, b.progress_secondary);
            if (sa !== sb) return sa - sb;
            return compareTitles(a.title, b.title);
        }
        // fallback to title
        return compareTitles(a.title, b.title);
      }

      // Insert into correct container/group (card or list)
      if (currentView === 'card') {
        // Find or create status group
        let destGroup = cardView.querySelector(`.status-group[data-status="${item.status}"]`);
        if (!destGroup) {
          destGroup = document.createElement('div');
          destGroup.className = 'status-group';
          destGroup.dataset.status = item.status;
          const header = document.createElement('h2');
          header.className = 'status-header';
          const labels = statusLabelsMap[mediaType] || {};
          header.textContent = labels[item.status] || item.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          destGroup.appendChild(header);

          // create card grid wrapper
          const cardGrid = document.createElement('div');
          cardGrid.className = 'card-grid';
          destGroup.appendChild(cardGrid);

          // Insert destGroup in canonical status order
          const existingGroups = Array.from(cardView.querySelectorAll('.status-group'));
          const myIndex = statusesOrder.indexOf(item.status);
          let placed = false;
          for (const g of existingGroups) {
            const gIndex = statusesOrder.indexOf(g.dataset.status);
            if (gIndex === -1) continue;
            if (gIndex > myIndex) {
              cardView.insertBefore(destGroup, g);
              placed = true;
              break;
            }
          }
          if (!placed) cardView.appendChild(destGroup);
        }

        const cardGrid = destGroup.querySelector('.card-grid');
        // Determine insertion point among currently loaded children using in-memory allItems for comparison
        const children = Array.from(cardGrid.children);
        let inserted = false;
        for (const child of children) {
          const cid = String(child.dataset.id);
          const childItem = allItems.find(i => String(i.id) === cid);
          if (!childItem) continue;
          const cmp = compareItems(item, childItem);
          const shouldInsertBefore = (currentSortOrder === 'desc' ? cmp > 0 : cmp < 0);
          if (shouldInsertBefore) {
            cardGrid.insertBefore(newEl, child);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          cardGrid.appendChild(newEl);
        }
      } else {
        // List view: find or create status group table/tbody
        let destGroup = listView.querySelector(`.status-group[data-status="${item.status}"]`);
        if (!destGroup) {
          destGroup = document.createElement('div');
          destGroup.className = 'status-group';
          destGroup.dataset.status = item.status;
          const header = document.createElement('h2');
          header.className = 'status-header';
          const labels = statusLabelsMap[mediaType] || {};
          header.textContent = labels[item.status] || item.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          destGroup.appendChild(header);

          const table = document.createElement('table');
          table.innerHTML = `<thead></thead><tbody></tbody>`;
          destGroup.appendChild(table);

          // Insert destGroup into listView according to statusesOrder
          const existingGroups = Array.from(listView.querySelectorAll('.status-group'));
          const myIndex = statusesOrder.indexOf(item.status);
          let placed = false;
          for (const g of existingGroups) {
            const gIndex = statusesOrder.indexOf(g.dataset.status);
            if (gIndex === -1) continue;
            if (gIndex > myIndex) {
              listView.insertBefore(destGroup, g);
              placed = true;
              break;
            }
          }
          if (!placed) listView.appendChild(destGroup);
          console.log('Created new destGroup for status:', item.status);
        }

        const tbody = destGroup.querySelector('tbody') || destGroup.querySelector('table tbody') || destGroup;
        // Insert row by comparing to loaded rows
        const rows = Array.from(tbody.children);
        let insertedRow = false;
        for (const row of rows) {
          const rid = String(row.dataset.id);
          const rowItem = allItems.find(i => String(i.id) === rid);
          if (!rowItem) continue;
          const cmp = compareItems(item, rowItem);
          const shouldInsertBefore = (currentSortOrder === 'desc' ? cmp > 0 : cmp < 0);
          if (shouldInsertBefore) {
            tbody.insertBefore(newEl, row);
            insertedRow = true;
            break;
          }
        }
        if (!insertedRow) {
          tbody.appendChild(newEl);
        }
      }
      
      // Update counts if status changed
      if (oldStatus && oldStatus !== item.status) {
        // Item changed status: decrement old status, increment new status
        statusCounts[oldStatus] = Math.max(0, statusCounts[oldStatus] - 1);
        statusCounts[item.status] = statusCounts[item.status] + 1;
      }
      
      // Update filter buttons after replacement
      updateFilterButtons();
    } catch (e) {
      console.error('replaceItemElement error', e);
    }
  }

  // Expose for edit_modal to call
  window.replaceItemElement = replaceItemElement;

  // Remove an item from DOM + in-memory arrays (used after delete)
  function removeItemElement(id) {
    try {
      listCacheVersion = Date.now().toString();
      sessionStorage.setItem(`cacheVersion_${mediaType}`, listCacheVersion);

      const sid = String(id);
      // Find the item to get its status before removal
      const itemIdx = allItems.findIndex(i => String(i.id) === sid);
      const itemStatus = itemIdx !== -1 ? allItems[itemIdx].status : null;
      
      // Remove DOM nodes
      document.querySelectorAll(`.card[data-id="${sid}"], .list-row[data-id="${sid}"]`).forEach(n => n.remove());
      // Remove from allItems
      allItems = allItems.filter(i => String(i.id) !== sid);
      // Remove empty status groups
      const containers = [cardView, listView];
      containers.forEach(container => {
          const groups = Array.from(container.querySelectorAll('.status-group')) || [];
          groups.forEach(g => {
            const grid = g.querySelector('.card-grid');
            const tbody = g.querySelector('tbody');
            const hasChildren = (grid && grid.children.length > 0) || (tbody && tbody.children.length > 0);
            if (!hasChildren) g.remove();
          });
      });
      
      // Update counts: decrement status count and total
      if (itemStatus) {
        statusCounts[itemStatus] = Math.max(0, statusCounts[itemStatus] - 1);
        statusCounts.all = Math.max(0, statusCounts.all - 1);
      }
      
      // Update filter buttons after removal
      updateFilterButtons();
    } catch (e) {
      console.error('removeItemElement error', e);
    }
  }

  window.removeItemElement = removeItemElement;

  // Initialize status counts from HTML (backend-provided)
  const statusCounts = {
    all: 0,
    ongoing: 0,
    completed: 0,
    on_hold: 0,
    planned: 0,
    dropped: 0,
  };
  
  // Extract initial counts from filter buttons
  filterButtons.forEach(btn => {
    const filter = btn.dataset.filter;
    const countEl = btn.querySelector('.btn-count');
    if (countEl) {
      statusCounts[filter] = parseInt(countEl.textContent) || 0;
    }
  });

  // Update filter button visibility and counts - only called on edit/delete
  function updateFilterButtons() {
    // Ensure buttons exist only for statuses that currently have items
    Object.keys(statusCounts).forEach(filter => {
      if (filter === 'all') return;
      const cnt = statusCounts[filter] || 0;
      if (cnt > 0 && !document.querySelector(`.filter-btn[data-filter="${filter}"]`)) {
        ensureFilterButton(filter);
      }
    });

    // Query buttons dynamically each time (in case new ones were added)
    const allFilterButtons = document.querySelectorAll(".filter-btn");
    
    // Update each filter button
    allFilterButtons.forEach(btn => {
      const filter = btn.dataset.filter;
      const count = statusCounts[filter];
      const countEl = btn.querySelector('.btn-count');
      
      if (countEl) {
        countEl.textContent = count;
      }

      // Show/hide button based on count (except for "all" which is always shown)
      if (filter === 'all') {
        btn.style.display = 'flex';
      } else if (count > 0) {
        btn.style.display = 'flex';
      } else {
        btn.style.display = 'none';
      }
    });

    // If current filter has 0 items, auto-switch to "all" and reload
    const currentFilterCount = statusCounts[currentStatus === 'all' ? 'all' : currentStatus] || 0;
    if (currentStatus !== 'all' && currentFilterCount === 0) {
      currentStatus = 'all';
      sessionStorage.setItem(filterKey, currentStatus);
      allFilterButtons.forEach(b => b.classList.remove("active"));
      const allBtn = document.querySelector(`.filter-btn[data-filter="all"]`);
      if (allBtn) allBtn.classList.add("active");
      // Reload items to show the unfiltered list
      resetAndLoad();
    }
  }

  // Helper: Ensure a filter button exists, create if needed (but do NOT auto-run on load)
  function ensureFilterButton(filter) {
    let btn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
    if (btn) return btn; // Already exists

    // Create button for this filter matching server-rendered structure
    btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.filter = filter;
    const label = (statusLabelsMap[mediaType] && statusLabelsMap[mediaType][filter]) || filter.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    btn.innerHTML = `<span class="btn-text">${label}</span><span class="btn-count">${statusCounts[filter] || 0}</span>`;

    // Find the button container
    const btnContainer = document.querySelector('.filter-buttons') || filterButtons[0]?.parentElement;
    if (btnContainer) {
      // Insert according to canonical statusesOrder
      const myIndex = statusesOrder.indexOf(filter);
      const existing = Array.from(btnContainer.querySelectorAll('.filter-btn'));
      let placed = false;
      for (const ex of existing) {
        const exFilter = ex.dataset.filter;
        if (!exFilter) continue;
        const exIndex = statusesOrder.indexOf(exFilter);
        if (exIndex === -1) continue;
        if (exIndex > myIndex) {
          btnContainer.insertBefore(btn, ex);
          placed = true;
          break;
        }
      }
      if (!placed) btnContainer.appendChild(btn);
    }

    // Add click listener matching existing behavior
    btn.addEventListener('click', () => {
      const allButtons = document.querySelectorAll('.filter-btn');
      allButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStatus = btn.dataset.filter;
      sessionStorage.setItem(filterKey, currentStatus);
      localStorage.setItem('music_player_status', currentStatus);
      updateStatusContainer();
      resetAndLoad();
    });

    return btn;
  }

  window.updateFilterButtons = updateFilterButtons;

  // === Set active filter buttons ===
  const matchingBtn = document.querySelector(`.filter-btn[data-filter="${currentStatus}"]`);
  if (matchingBtn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    matchingBtn.classList.add('active');
    localStorage.setItem('music_player_status', currentStatus);
  }
  

  
// === Sort controls ===
const defaultSortLabels = {
  title: "Title",
  rating: "Rating",
  activity_date: "Activity Date",
  date: "Activity Date",
  release_date: "Release Date",
  episodes: "Episodes",
  seasons: "Seasons",
  chapters: "Chapters",
  volumes: "Volumes",
  hours: "Hours",
  pages: "Pages",
};

function getSortLabel(sortType) {
  const option = Array.from(sortOptions).find(opt => opt.dataset.sort === sortType);
  if (option) return option.textContent.trim();

  const button = Array.from(sortButtons).find(btn => btn.dataset.sort === sortType);
  if (button) return (button.dataset.label || button.textContent).trim();

  return defaultSortLabels[sortType] || defaultSortLabels.rating;
}

function getSortTooltip(sortType) {
  if (sortType === 'title') {
    return currentSortOrder === 'asc' ? 'A-Z' : 'Z-A';
  }
  if (sortType === 'rating') {
    return currentSortOrder === 'asc' ? '1-9' : '9-1';
  }
  if (sortType === 'date' || sortType === 'activity_date' || sortType === 'release_date') {
    return currentSortOrder === 'asc' ? 'Old-New' : 'New-Old';
  }
  if (['hours', 'pages', 'episodes', 'seasons', 'chapters', 'volumes'].includes(sortType)) {
    return currentSortOrder === 'asc' ? 'Low-High' : 'High-Low';
  }
  return '';
}

function persistSortState() {
  localStorage.setItem(sortKey, currentSort);
  localStorage.setItem(sortOrderKey, currentSortOrder);
}

function setSortSelectOpen(isOpen) {
  const optionsList = sortSelect?.closest('.custom-select-wrapper')?.querySelector('.custom-options');
  if (!optionsList) return;
  optionsList.classList.toggle('open', isOpen);
  sortSelect.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function updateSortButtons() {
  sortButtons.forEach(btn => {
    const sortType = btn.dataset.sort;
    const baseLabel = btn.dataset.label || btn.textContent.trim();
    btn.dataset.label = baseLabel;

    if (sortType === currentSort) {
      btn.classList.add('active');
      btn.textContent = `${baseLabel} ${currentSortOrder === 'asc' ? '^' : 'v'}`;
      btn.title = getSortTooltip(sortType);
    } else {
      btn.classList.remove('active');
      btn.textContent = baseLabel;
      btn.removeAttribute('title');
    }
  });

  if (sortSelect) {
    sortSelect.textContent = getSortLabel(currentSort);
    sortSelect.dataset.value = currentSort;
    sortSelect.title = getSortTooltip(currentSort);
  }

  sortOptions.forEach(option => {
    const isActive = option.dataset.sort === currentSort;
    option.classList.toggle('active', isActive);
    option.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  if (sortOrderBtn) {
    const orderLabel = currentSortOrder === 'asc' ? 'Sort ascending' : 'Sort descending';
    sortOrderBtn.dataset.order = currentSortOrder;
    sortOrderBtn.setAttribute('aria-label', orderLabel);
    sortOrderBtn.title = orderLabel;
  }
}

function applySortFromControl(sortType, toggleIfSame = false) {
  if (!sortType) return;

  if (currentSort === sortType) {
    if (!toggleIfSame) {
      setSortSelectOpen(false);
      updateSortButtons();
      return;
    }
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort = sortType;
    currentSortOrder = sortType === 'rating' ? 'desc' : 'asc';
  }

  persistSortState();
  setSortSelectOpen(false);
  updateSortButtons();
  resetAndLoad();
}

function getArrow(isAscending) {
  return `<span class="table-sort-arrow ${isAscending ? 'asc' : 'desc'}" aria-hidden="true"></span>`;
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
    updateStatusContainer();
    renderItems();
  });

  listBtn.addEventListener("click", () => {
    listBtn.classList.add("active");
    cardBtn.classList.remove("active");
    listView.style.display = "block";
    cardView.style.display = "none";
    currentView = "list";
    sessionStorage.setItem(viewKey, currentView);
    updateStatusContainer();
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
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStatus = btn.dataset.filter;
      sessionStorage.setItem(filterKey, currentStatus);
      localStorage.setItem('music_player_status', currentStatus);
      updateStatusContainer();
      resetAndLoad();
    });
  });
  
  // === SORT BUTTONS ===
  sortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applySortFromControl(btn.dataset.sort, true);
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener("click", (e) => {
      e.stopPropagation();
      const optionsList = sortSelect.closest('.custom-select-wrapper')?.querySelector('.custom-options');
      setSortSelectOpen(!optionsList?.classList.contains('open'));
    });

    sortSelect.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const optionsList = sortSelect.closest('.custom-select-wrapper')?.querySelector('.custom-options');
        setSortSelectOpen(!optionsList?.classList.contains('open'));
      } else if (e.key === "Escape") {
        setSortSelectOpen(false);
      }
    });
  }

  sortOptions.forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      applySortFromControl(option.dataset.sort, false);
    });
  });

  if (sortOrderBtn) {
    sortOrderBtn.addEventListener("click", () => {
      currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
      persistSortState();
      updateSortButtons();
      resetAndLoad();
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest('.sort-controls')) {
      setSortSelectOpen(false);
    }
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
      statusBtnContainer.style.display = (currentStatus === "planned" && currentView === "card") ? "block" : "none";
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
    const cover = modal.querySelector('.modal-cover img');
    const titleElement = modal.querySelector('.modal-title');
    const overlay = document.getElementById('edit-overlay');

    if (titleElement && title) {
      titleElement.textContent = title;
    }

    if (cover && coverUrl) {
      cover.src = coverUrl;
    }

    // Set banner using the function from g_edit_modal.js
    if (window.setModalBanner) {
      window.setModalBanner(bannerUrl, mediaType);
    }

    const form = document.getElementById("edit-form");
    if (!form) return console.error("Edit form not found");

    fetch(`/get-item/${itemId}/?_t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) return alert("Failed to load item");
        
        // Use the populateForm function from g_edit_modal.js
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
  window.addEventListener('pagehide', () => {
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
  
  // === CHECK STATUS BUTTON ===
  const checkStatusBtn = document.getElementById("check-status-btn");

  if (checkStatusBtn) {
    checkStatusBtn.addEventListener("click", () => {
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
        case "games":
          apiUrl = "/api/check_planned_game_statuses/";
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
              } else if (mediaType === "games") {
                if (status === "Released") dot.style.backgroundColor = "green";
                else if (["Alpha", "Beta", "Early Access"].includes(status)) dot.style.backgroundColor = "orange";
                else dot.style.backgroundColor = "red";
              }

              card.appendChild(dot);
            }
          }
        })
        .catch(err => console.error('Error checking statuses', err));
    });
  }

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
      if (
        !toggleBtn.contains(e.target) &&
        !sidebar.contains(e.target)
      ) {
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

  // === BANNER ROTATOR ===
  let firstLoad = true;
  let bannerInterval;
  let lastBannerIndex = -1;

 function initBannerRotator() {
    if (bannerPool.length === 0) return;
    
    // If the HTML already loaded an image, skip replacing it on the very first tick
    const currentSrc = bannerImg.getAttribute("src");
    if (firstLoad && !currentSrc.includes("placeholder.png")) {
        firstLoad = false;
        // Just start the 30-second timer for the NEXT image
        bannerInterval = setInterval(updateBanner, 30000);
        return;
    }

    // Otherwise, run normally
    updateBanner();
    if (bannerInterval) clearInterval(bannerInterval);
    bannerInterval = setInterval(updateBanner, 30000);
  }
  
  function updateBanner() {
    if (bannerPool.length === 0) return;
    
    let random;
    if (bannerPool.length > 1) {
      do {
        random = Math.floor(Math.random() * bannerPool.length);
      } while (random === lastBannerIndex);
    } else {
      random = 0;
    }
    lastBannerIndex = random;

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

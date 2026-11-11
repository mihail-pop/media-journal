document.addEventListener("DOMContentLoaded", function () {

  const cardView = document.getElementById("card-view");
  const listView = document.getElementById("list-view");
  const detailedListView = document.getElementById("detailed-list-view");
  const loadingIndicator = document.getElementById("loading-indicator");

  const cardBtn = document.getElementById("card-view-btn");
  const listBtn = document.getElementById("list-view-btn");
  const detailedListBtn = document.getElementById("detailed-list-view-btn");

  const filterButtons = document.querySelectorAll(".filter-btn");
  const typeFilterButtons = document.querySelectorAll(".type-filter-btn");
  const sortButtons = document.querySelectorAll(".sort-btn");
  const sortSelect = document.getElementById("sort-select");
  const sortOptions = document.querySelectorAll(".sort-option");
  const sortOrderBtn = document.getElementById("sort-order-btn");
  const searchInput = document.getElementById("search-input");

  const genreSelectWrapper = document.querySelector('.genre-select-wrapper');
  const genreSearchInput = document.getElementById('genre-search');
  const genreOptionsContainer = document.getElementById('genre-options');
  const genreTagsContainer = document.querySelector('.genre-tags');

  // Hardcoded standard API genres
  const mediaGenres = {
    movies:["Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance", "Science Fiction", "TV Movie", "Thriller", "War", "Western"],
    tvshows:["Action & Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama", "Family", "Kids", "Mystery", "News", "Reality", "Sci-Fi & Fantasy", "Soap", "Talk", "War & Politics", "Western"],
    anime:["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"],
    manga:["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"],
    games:["Adventure", "Arcade", "Card & Board Game", "Fighting", "Hack and slash/Beat 'em up", "Indie", "MOBA", "Music", "Pinball", "Platform", "Point-and-click", "Puzzle", "Quiz/Trivia", "Racing", "Real Time Strategy (RTS)", "Role-playing (RPG)", "Shooter", "Simulator", "Sport", "Strategy", "Tactical", "Turn-based strategy (TBS)", "Visual Novel"],
    books:["Action & Adventure Fiction", "Biography", "Classics", "Fantasy", "Historical Fiction", "History", "Horror", "Mystery", "Non-fiction", "Poetry", "Romance", "Science Fiction", "Thriller", "Young Adult"],
    music:["Alternative", "Blues", "Classical", "Country", "Electronic", "Folk", "Hip Hop", "Indie", "Jazz", "Metal", "Pop", "Punk", "R&B", "Reggae", "Rock", "Soul"]
  };

  let currentGenres =[];

  const bannerImg = document.getElementById("rotating-banner");
  let bannerPool = [];
  let stopBannerRotator = null;

  const mediaType = document.body.dataset.mediaType || "default";
  if (cardView) {
    const overlayMediaType = {
      movies: 'movie', tvshows: 'tv', anime: 'anime', manga: 'manga',
      games: 'game', books: 'book', music: 'music',
    }[mediaType];
    let overlayMode = 'full';
    try {
      const preferences = JSON.parse(document.getElementById('list-card-overlay-preferences')?.textContent || '{}');
      if (['full', 'compact', 'hidden'].includes(preferences[overlayMediaType])) overlayMode = preferences[overlayMediaType];
    } catch (error) { /* Keep the existing full overlay if preferences are unavailable. */ }
    cardView.dataset.overlayMode = overlayMode;
  }
  const filterKey = `listFilterStatus_${mediaType}`;
  const viewKey = `listViewType_${mediaType}`;
  const typeKey = `listTypeFilter_${mediaType}`;
  const sortKey = `listSort_${mediaType}`;
  const sortOrderKey = `listSortOrder_${mediaType}`;

  // === PAGINATION STATE ===
  let currentPage = 1;
  let isLoading = false;
  let listRequestController = null;
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
  let currentFilterMode = 'include';
  let currentCollections = [];

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
  async function loadItems(page = 1, reset = false, { refreshLoaded = false, updatedId = null } = {}) {
    if (!reset && (isLoading || !hasMore)) return;

    // Filter changes and edits replace any older request, including an in-flight
    // scroll request whose offsets may have changed after the edit.
    listRequestController?.abort();
    const controller = new AbortController();
    listRequestController = controller;
    isLoading = true;

    const loadingTimeout = setTimeout(() => {
      if (listRequestController === controller) loadingIndicator.style.display = 'block';
    }, 200);

    try {
      const params = new URLSearchParams({
        status: currentStatus,
        search: currentSearch,
        sort_by: currentSort,
        sort_order: currentSortOrder
      });
      if (currentGenres.length > 0) params.set('genres', currentGenres.join(','));
      if (currentCollections.length > 0) params.set('collections', currentCollections.map(c => c.id).join(','));
      params.set('filter_mode', currentFilterMode);
      if (mediaType === 'tvshows') params.set('type', currentType);
      if (listCacheVersion) params.set('_v', listCacheVersion);

      const fetchedItems = [];
      let data;
      // An edit can move entries across page boundaries. Re-read the loaded
      // range and commit it together so ordering and the next offset agree.
      for (let nextPage = refreshLoaded ? 1 : page; nextPage <= page; nextPage++) {
        params.set('page', nextPage);
        const response = await fetch(`/api/${mediaType}/?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load list items.');
        data = await response.json();
        if (listRequestController !== controller) return;
        if (!Array.isArray(data.items)) throw new Error('Invalid list response.');
        fetchedItems.push(...data.items);
        if (!data.has_more) break;
      }

      const container = currentView === 'card' ? cardView : currentView === 'list' ? listView : detailedListView;
      const anchorElement = refreshLoaded ? Array.from(container.querySelectorAll('.card, .list-row')).find(element =>
        String(element.dataset.id) !== String(updatedId) && element.getBoundingClientRect().bottom > 0
      ) : null;
      const anchor = anchorElement ? { id: anchorElement.dataset.id, top: anchorElement.getBoundingClientRect().top } : null;
      const expandedEntry = refreshLoaded ? container.querySelector('.expandable-entry.expanded') : null;
      const expandedRow = expandedEntry?.closest('.list-row');
      const expanded = expandedRow ? {
        id: expandedRow.dataset.id,
        index: Array.from(expandedRow.querySelectorAll('.expandable-entry')).indexOf(expandedEntry),
        blurred: expandedEntry.classList.contains('log-spoiler-blur'),
      } : null;

      if (reset) {
        allItems = fetchedItems;
      } else {
        const existingMap = new Map(allItems.map((item, index) => [String(item.id), index]));
        for (const item of fetchedItems) {
          const id = String(item.id);
          if (existingMap.has(id)) {
            allItems[existingMap.get(id)] = item;
          } else {
            existingMap.set(id, allItems.length);
            allItems.push(item);
          }
        }
      }
      hasMore = data.has_more;
      currentPage = data.page;
      renderItems();

      if (expanded) {
        const entry = container.querySelector(`.list-row[data-id="${expanded.id}"]`)?.querySelectorAll('.expandable-entry')[expanded.index];
        entry?.classList.add('expanded');
        if (!expanded.blurred) entry?.classList.remove('log-spoiler-blur');
      }
      if (anchor) {
        const element = container.querySelector(`.card[data-id="${anchor.id}"], .list-row[data-id="${anchor.id}"]`);
        if (element) window.scrollBy({ top: element.getBoundingClientRect().top - anchor.top, behavior: 'instant' });
      }
    } catch (error) {
      if (error.name !== 'AbortError' && listRequestController === controller) {
        console.error('Error loading items:', error);
      }
    } finally {
      clearTimeout(loadingTimeout);
      if (listRequestController === controller) {
        listRequestController = null;
        isLoading = false;
        loadingIndicator.style.display = 'none';
      }
    }
  }

  function renderItems() {
    const isCardView = currentView === 'card';
    const isDetailedView = currentView === 'detailed_list';

    let container = cardView;
    if (currentView === 'list') container = listView;
    if (currentView === 'detailed_list') container = detailedListView;
    
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
        } else if (mediaType === 'movies') {
          tableHeaders = `<thead><tr>
            ${th('Title', 'title')}
            ${th('Rating', 'rating')}
            ${th('Activity Date', 'activity_date')}
            ${th('Release Date', 'release_date')}
            ${th('Length', 'length')}
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
          tbody.appendChild(createListRowElement(item, isDetailedView));
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
    card.dataset.coverUrl = item.cover_url || '';
    card.dataset.bannerUrl = item.banner_url || '';
    card.dataset.notes = item.notes || '';
    card.dataset.sourceId = item.source_id;
    
    const ratingHtml = getRatingHtml(item.personal_rating);
    const progressHtml = getProgressHtml(item);
    const linkUrl = getLinkUrl(item);
    const repeatHtml = item.repeats > 0 ? `<div class="repeat-indicator"><span class="repeat-count">${item.repeats}</span><svg class="repeat-icon" viewBox="0 0 512 512"><path fill="currentColor" d="M256.455 8c66.269.119 126.437 26.233 170.859 68.685l35.715-35.715C478.149 25.851 504 36.559 504 57.941V192c0 13.255-10.745 24-24 24H345.941c-21.382 0-32.09-25.851-16.971-40.971l41.75-41.75c-30.864-28.899-70.801-44.907-113.23-45.273-92.398-.798-170.283 73.977-169.484 169.442C88.764 348.009 162.184 424 256 424c41.127 0 79.997-14.678 110.629-41.556 4.743-4.161 11.906-3.908 16.368.553l39.662 39.662c4.872 4.872 4.631 12.815-.482 17.433C378.202 479.813 319.926 504 256 504 119.034 504 8.001 392.967 8 256.002 7.999 119.193 119.646 7.755 256.455 8z"/></svg></div>` : '';
    
    const playSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const playBtnHtml = item.media_type === 'music' ? `<button class="play-card-btn">${playSvg}</button>` : '';

    const coverSrc = item.cover_url || '/static/core/img/placeholder.png';
    const imgAlt = item.cover_url ? item.title : item.media_type;

    card.innerHTML = `
      <a href="${linkUrl}" class="card-link">
        <div class="card-image">
          <img src="${coverSrc}" alt="${imgAlt}" loading="lazy">
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
      ${playBtnHtml}
      <button class="edit-card-btn">⋯</button>
    `;
    
    return card;
  }

function parseJournalContent(html) {
  if(!html) return '';
  let text = html
    .replace(/</g, '&lt;').replace(/>/g, '&gt;') // sanitize
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\|\|(.*?)\|\|/g, '<span class="spoiler">$1</span>')
    .replace(/\[center\]([\s\S]*?)\[\/center\]/g, '<div style="text-align:center;">$1</div>')
    .replace(/^(?:&gt;|>)\s?(.*?)$/gm, '<blockquote style="border-left:3px solid var(--special-color); margin:0; padding-left:10px; color:var(--text-secondary);">$1</blockquote>')
    .replace(/\n/g, '<br>');
  return text;
}

function getDetailedJournalHtml(item) {
    let html = '<div class="detailed-journal-container">';
    
    if (item.notes) {
        const formattedNotes = parseJournalContent(item.notes);
        html += `
            <div class="journal-entry-wrapper">
                <div class="journal-entry-header">
                    <span class="entry-meta-pill type-pill">Notes</span>
                </div>
                <div class="journal-entry-body expandable-entry">${formattedNotes}</div>
            </div>
        `;
    }

    if (item.logs && item.logs.length > 0) {
        item.logs.forEach(log => {
            const formattedLog = parseJournalContent(log.content);
            const spoilerClass = log.is_spoiler ? 'log-spoiler-blur' : '';
            
            // Build pills
            let pillsHtml = `<span class="entry-meta-pill type-pill">${log.title || 'Log'}</span>`;
            pillsHtml += `<span class="entry-meta-pill date-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${log.activity_date}</span>`;
            
            if (log.progress_start !== null && log.progress_start !== undefined && log.progress_start !== "") {
                let unit = log.progress_unit || 'Unit';
                unit = unit.charAt(0).toUpperCase() + unit.slice(1);
                if (log.progress_end !== null && log.progress_end !== undefined && log.progress_end !== '') {
                    if (!unit.endsWith('s')) unit += 's';
                    pillsHtml += `<span class="entry-meta-pill progress-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> ${unit} ${log.progress_start} - ${log.progress_end}</span>`;
                } else {
                    pillsHtml += `<span class="entry-meta-pill progress-pill"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> ${unit} ${log.progress_start}</span>`;
                }
            }
            
            if (log.score) {
                pillsHtml += `<span class="entry-meta-pill score-pill"><span class="entry-score" data-score="${log.score}">${getRatingHtml(log.score)}</span></span>`;
            }

            html += `
                <div class="journal-entry-wrapper">
                    <div class="journal-entry-header">
                        ${pillsHtml}
                    </div>
                    <div class="journal-entry-body expandable-entry ${spoilerClass}">${formattedLog}</div>
                </div>
            `;
        });
    }
    
    html += '</div>';
    return html;
}

function createListRowElement(item, isDetailed = false) {
    const row = document.createElement('tr');
    row.className = isDetailed ? 'list-row detailed-row' : 'list-row';
    row.dataset.id = item.id;
    row.dataset.mediaType = item.media_type;
    row.dataset.status = item.status;
    row.dataset.personalRating = item.personal_rating || '0';
    row.dataset.title = item.title;
    row.dataset.coverUrl = item.cover_url || '';
    row.dataset.bannerUrl = item.banner_url || '';
    row.dataset.notes = item.notes || '';
    row.dataset.sourceId = item.source_id;

    if (isDetailed && item.banner_url) {
      row.style.setProperty('--banner-url', `url('${item.banner_url}')`);
    }
    
    const ratingHtml = getRatingHtml(item.personal_rating);
    const linkUrl = getLinkUrl(item);
    const episodesHtml = getListMainProgressHtml(item);
    const seasonsHtml = getSeasonsHtml(item);

    // Build the repeats indicator
    const repeatHtml = item.repeats > 0 ? `
      <div class="list-repeats-indicator" title="${item.repeats} repeats">
        <span class="repeat-count-text">${item.repeats}</span>
        <svg class="repeat-icon" viewBox="0 0 512 512"><path fill="currentColor" d="M256.455 8c66.269.119 126.437 26.233 170.859 68.685l35.715-35.715C478.149 25.851 504 36.559 504 57.941V192c0 13.255-10.745 24-24 24H345.941c-21.382 0-32.09-25.851-16.971-40.971l41.75-41.75c-30.864-28.899-70.801-44.907-113.23-45.273-92.398-.798-170.283 73.977-169.484 169.442C88.764 348.009 162.184 424 256 424c41.127 0 79.997-14.678 110.629-41.556 4.743-4.161 11.906-3.908 16.368.553l39.662 39.662c4.872 4.872 4.631 12.815-.482 17.433C378.202 479.813 319.926 504 256 504 119.034 504 8.001 392.967 8 256.002 7.999 119.193 119.646 7.755 256.455 8z"/></svg>
      </div>
    ` : '';
    
    const playSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const playBtnHtml = item.media_type === 'music' ? `<button class="play-card-btn" title="Play context playlist">${playSvg}</button>` : '';

    const coverSrc = item.cover_url || '/static/core/img/placeholder.png';
    const imgAlt = item.cover_url ? item.title : item.media_type;

    let firstCellHtml = '';
    if (isDetailed) {
      firstCellHtml = `
        <td class="detailed-title-cell">
          <a href="${linkUrl}">
            <div class="mini-card-image">
              <img src="${coverSrc}" alt="${imgAlt}" loading="lazy">
            </div>
            <div class="detailed-text-content">
              ${getTitleHtml(item, 'detailed-title')}
              ${getDetailedJournalHtml(item)}
            </div>
            <div class="list-row-actions">
              ${repeatHtml}
              ${playBtnHtml}
              <button class="edit-card-btn">⋯</button>
            </div>
          </a>
        </td>
      `;
    } else {
      firstCellHtml = `
        <td class="simple-title-cell">
          <a href="${linkUrl}">
            ${getTitleHtml(item, 'simple-title')}
            <div class="list-row-actions">
              ${repeatHtml}
              ${playBtnHtml}
              <button class="edit-card-btn">⋯</button>
            </div>
          </a>
        </td>
      `;
    }

    let tableHtml = `
      ${firstCellHtml}
      <td>${ratingHtml}</td>
    `;

    // Activity Date
    const activityDate = item.date_added ? new Date(item.date_added).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    tableHtml += `<td>${activityDate}</td>`;

    // Release Date
    const releaseDate = item.release_date || '';
    tableHtml += `<td>${releaseDate}</td>`;

    // Add columns based on media type
    if (mediaType === 'tvshows') {
      tableHtml += `<td style="text-align: center;">${episodesHtml}</td><td>${seasonsHtml}</td>`;
    } else if (['anime', 'games', 'books'].includes(mediaType)) {
      tableHtml += `<td style="text-align: center;">${episodesHtml}</td>`;
    } else if (mediaType === 'manga') {
      tableHtml += `<td style="text-align: center;">${episodesHtml}</td><td style="text-align: center;">${seasonsHtml}</td>`;
    } else if (mediaType === 'movies') {
      let lengthDisplay = '-';
      if (item.total_main) {
        const totalMinutes = Number(item.total_main);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        const hStr = h === 1 ? '1 hr' : `${h} hrs`;
        const mStr = m === 1 ? '1 min' : `${m} mins`;
        
        if (h > 0 && m > 0) lengthDisplay = `${hStr} ${mStr}`;
        else if (h > 0) lengthDisplay = hStr;
        else lengthDisplay = mStr;
      }
      tableHtml += `<td>${lengthDisplay}</td>`;
    }

    row.innerHTML = tableHtml;
    return row;
  }

  function getRatingHtml(rating) {
    if (!rating) return '';

    const rnum = Number(rating);
    if (isNaN(rnum)) return '';

    const displayRating = window.ratingToDisplay(rnum, ratingMode);
    if (displayRating === null) return '';
    const rounded = Math.round(rnum);

    if (ratingMode === 'faces') {
      if (rounded <= 33) {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="frown" class="svg-inline--fa fa-frown fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm-80 128c-40.2 0-78 17.7-103.8 48.6-8.5 10.2-7.1 25.3 3.1 33.8 10.2 8.4 25.3 7.1 33.8-3.1 16.6-19.9 41-31.4 66.9-31.4s50.3 11.4 66.9 31.4c8.1 9.7 23.1 11.9 33.8 3.1 10.2-8.5 11.5-23.6 3.1-33.8C326 321.7 288.2 304 248 304z"></path></svg></span>';
      } else if (rounded <= 66) {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="meh" class="svg-inline--fa fa-meh fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160-64c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm8 144H160c-13.2 0-24 10.8-24 24s10.8 24 24 24h176c13.2 0 24-10.8 24-24s-10.8-24-24-24z"></path></svg></span>';
      } else {
        return '<span class="card-rating"><svg aria-hidden="true" focusable="false" data-prefix="far" data-icon="smile" class="svg-inline--fa fa-smile fa-w-16 fa-lg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg></span>';
      }
    } else if (ratingMode === 'stars_5') {
      const starsCount = displayRating;
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
      const displayVal = displayRating;
      return `<span class="card-rating"><span class="rating-number">${displayVal}</span></span>`;
    } else if (ratingMode === 'scale_100') {
      return `<span class="card-rating"><span class="rating-number">${Math.round(rnum)}</span></span>`;
    }
    
    return '';
  }

  function hasEpisodeProgress(item) {
    return ['tv', 'anime', 'manga'].includes(item.media_type);
  }

  function getQuickProgressHtml(item, action, text) {
    const label = action === 'complete' ? 'Mark completed' :
      action === 'secondary' ? 'Add one season' :
      item.media_type === 'manga' ? 'Add one chapter' : 'Add one episode';
    return `<span class="quick-progress">${text ? `<span class="quick-progress-value">${text}</span>` : ''}<button type="button" class="progress-increment-btn" data-progress-action="${action}" aria-label="${label}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></span>`;
  }

  function getTitleHtml(item, titleClass) {
    const title = `<span class="${titleClass}">${item.title}</span>`;
    if (item.status !== 'ongoing' || hasEpisodeProgress(item)) return title;
    return `<span class="quick-progress-title">${title}${getQuickProgressHtml(item, 'complete', '')}</span>`;
  }

  function activeProgressText(current, total) {
    const count = Number(current) || 0;
    return `${count}/${Number(total) > 0 ? Number(total) : '?'}`;
  }

  function getProgressHtml(item) {
    if (item.status === 'ongoing') {
      if (!hasEpisodeProgress(item)) return `<div class="card-progress">${getQuickProgressHtml(item, 'complete', '0/1')}</div>`;
      return `<div class="card-progress">${getQuickProgressHtml(item, 'main', activeProgressText(item.progress_main, item.total_main))}</div>`;
    }
    if (['movie', 'music'].includes(item.media_type)) return '';
    if (!item.progress_main) return '';
    
    if (item.progress_main === item.total_main || item.progress_main > item.total_main) {
      return `<div class="card-progress">${item.progress_main}</div>`;
    } else {
      const total = item.total_main ? `/${item.total_main}` : '';
      return `<div class="card-progress">${item.progress_main}${total}</div>`;
    }
  }

  function formatListProgress(currentValue, totalValue, options = {}) {
    const current = (currentValue !== null && currentValue !== undefined && currentValue !== '') ? Number(currentValue) : 0;
    const totalNumber = Number(totalValue);
    const hasTotal = totalValue !== null && totalValue !== undefined && totalValue !== '' && Number.isFinite(totalNumber) && totalNumber > 0;

    if (!hasTotal || (options.hideTotalWhenOver && current > totalNumber)) {
      return `${current}`;
    }

    return `${current}/${totalNumber}`;
  }

  function getListMainProgressHtml(item) {
    if (item.status === 'ongoing' && hasEpisodeProgress(item)) {
      return getQuickProgressHtml(item, 'main', activeProgressText(item.progress_main, item.total_main));
    }
    if (mediaType === 'games') {
      return formatListProgress(item.progress_main);
    }

    return formatListProgress(item.progress_main, item.total_main, {
      hideTotalWhenOver: mediaType === 'books'
    });
  }

  function getSeasonsHtml(item) {
    if (item.status === 'ongoing' && item.media_type === 'tv') {
      return getQuickProgressHtml(item, 'secondary', activeProgressText(item.progress_secondary, item.total_secondary));
    }
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

  // Use the list API's canonical data/order after edits. Edit responses contain
  // display ratings and cannot identify an item's position among unloaded pages.
  function replaceItemElement(item) {
    const id = String(item.id);
    const oldItem = allItems.find(entry => String(entry.id) === id);
    const oldElement = document.querySelector(`.card[data-id="${id}"], .list-row[data-id="${id}"]`);
    const oldStatus = oldItem?.status || oldElement?.dataset.status;

    if (oldStatus && oldStatus !== item.status) {
      statusCounts[oldStatus] = Math.max(0, (statusCounts[oldStatus] || 0) - 1);
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    }
    // Track the new status while requests are pending so another edit cannot
    // count the same status change twice. Rendering waits for canonical data.
    if (oldItem) oldItem.status = item.status;
    if (oldElement) oldElement.dataset.status = item.status;

    listCacheVersion = Date.now().toString();
    sessionStorage.setItem(`cacheVersion_${mediaType}`, listCacheVersion);
    const filterChanged = updateFilterButtons(false);
    return loadItems(filterChanged ? 1 : currentPage, true, { refreshLoaded: true, updatedId: id });
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
      const containers = [cardView, listView, detailedListView];
      containers.forEach(container => {
          if (!container) return;
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
  function updateFilterButtons(reloadIfEmpty = true) {
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
      if (reloadIfEmpty) resetAndLoad();
      updateStatusContainer();
      return true;
    }
    return false;
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
  length: "Length",
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
  if (['hours', 'pages', 'episodes', 'seasons', 'chapters', 'volumes', 'length'].includes(sortType)) {
    return currentSortOrder === 'asc' ? 'Low-High' : 'High-Low';
  }
  return '';
}

function persistSortState() {
  localStorage.setItem(sortKey, currentSort);
  localStorage.setItem(sortOrderKey, currentSortOrder);
}

function setSortSelectOpen(isOpen) {
  const wrapper = sortSelect?.closest('.custom-select-wrapper');
  const optionsList = wrapper?.querySelector('.custom-options');
  if (!optionsList || !wrapper) return;

  if (isOpen) {
    const rect = sortSelect.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 220 && rect.top > spaceBelow) {
      wrapper.classList.add('drop-up');
    } else {
      wrapper.classList.remove('drop-up');
    }
  }

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

// === View Initialization and Toggle Controls ===
  function applyView(view) {
    cardBtn?.classList.toggle("active", view === "card");
    listBtn?.classList.toggle("active", view === "list");
    detailedListBtn?.classList.toggle("active", view === "detailed_list");

    if (cardView) cardView.style.display = view === "card" ? "block" : "none";
    if (listView) listView.style.display = view === "list" ? "block" : "none";
    if (detailedListView) detailedListView.style.display = view === "detailed_list" ? "block" : "none";
  }

  if (!['card', 'list', 'detailed_list'].includes(currentView)) {
    currentView = 'card';
  }
  applyView(currentView);

  // Helper for clicking toggle buttons
  function switchView(newView) {
    if (currentView === newView) return;
    currentView = newView;
    sessionStorage.setItem(viewKey, currentView);
    applyView(currentView);
    updateStatusContainer();
    renderItems();
  }

  cardBtn?.addEventListener("click", () => switchView("card"));
  listBtn?.addEventListener("click", () => switchView("list"));
  detailedListBtn?.addEventListener("click", () => switchView("detailed_list"));

// === GENRES MULTI-SELECT LOGIC ===
  if (genreSelectWrapper && genreSearchInput && genreOptionsContainer) {
    const availableGenres = mediaGenres[mediaType] ||[];
    
    // 1. Populate Dropdown
    availableGenres.forEach(genre => {
      const option = document.createElement('div');
      option.className = 'custom-option genre-option';
      option.dataset.value = genre;
      option.innerHTML = `<span>${genre}</span><span class="genre-check">✕</span>`;
      
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleGenre(genre);
        genreSearchInput.value = '';
        filterGenreOptions('');
      });
      genreOptionsContainer.appendChild(option);
    });

    // 2. Toggle selection
    function toggleGenre(genre) {
      if (currentGenres.includes(genre)) {
        currentGenres = currentGenres.filter(g => g !== genre);
      } else {
        currentGenres.push(genre);
      }
      updateGenreUI();
      resetAndLoad();
    }

    // Grab the new indicator element
    const genreIndicator = document.getElementById('genre-indicator');

    // 3. Update UI (Bubbles & Checks)
    function updateGenreUI() {
      // Update Tags
      genreTagsContainer.innerHTML = '';
      currentGenres.forEach(genre => {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        tag.innerHTML = `<span>${genre}</span><span class="remove-tag">✕</span>`;
        tag.querySelector('.remove-tag').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleGenre(genre);
        });
        genreTagsContainer.appendChild(tag);
      });

      // Update Dropdown Checkmarks
      const options = genreOptionsContainer.querySelectorAll('.genre-option');
      options.forEach(opt => {
        if (currentGenres.includes(opt.dataset.value)) {
          opt.classList.add('selected');
        } else {
          opt.classList.remove('selected');
        }
      });

      // Update Placeholder and "has-items" class
      if (currentGenres.length > 0) {
        genreSearchInput.placeholder = '';
        genreSelectWrapper.classList.add('has-items');
      } else {
        genreSearchInput.placeholder = 'Genres';
        genreSelectWrapper.classList.remove('has-items');
      }
    }

    // Helper to open genre select with drop-up check
    function openGenreSelect() {
      const rect = genreSelectWrapper.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 360 && rect.top > spaceBelow) {
        genreSelectWrapper.classList.add('drop-up');
      } else {
        genreSelectWrapper.classList.remove('drop-up');
      }
      genreOptionsContainer.classList.add('open');
      genreSelectWrapper.classList.add('open');
    }

    // 4. Open/Close & Clear Logic
    genreSelectWrapper.addEventListener('click', (e) => {
      openGenreSelect();
      // Only focus the input if the user didn't explicitly click it or a tag
      if (e.target !== genreSearchInput && e.target !== genreIndicator && !e.target.closest('.remove-tag')) {
        genreSearchInput.focus();
      }
    });
    
    genreSearchInput.addEventListener('focus', () => {
      openGenreSelect();
    });

    document.addEventListener('click', (e) => {
      if (!genreSelectWrapper.contains(e.target)) {
        genreOptionsContainer.classList.remove('open');
        genreSelectWrapper.classList.remove('open');
      }
    });

    // Handle clicking the arrow / X button
    genreIndicator.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent opening the wrapper
      
      // Manually close others since we stopped propagation
      const colWrapper = document.querySelector('.list-collection-select-wrapper');
      if (colWrapper) {
        document.getElementById('list-collection-options')?.classList.remove('open');
        colWrapper.classList.remove('open');
      }
      setSortSelectOpen(false);
      
      if (currentGenres.length > 0) {
        // If items are selected, clicking clears all and closes dropdown
        currentGenres = new Array(); // Safely emptying the list without using brackets!
        updateGenreUI();
        genreOptionsContainer.classList.remove('open');
        genreSelectWrapper.classList.remove('open');
        resetAndLoad();
      } else {
        // If empty, toggle dropdown open/closed
        if (genreOptionsContainer.classList.contains('open')) {
          genreOptionsContainer.classList.remove('open');
          genreSelectWrapper.classList.remove('open');
        } else {
          openGenreSelect();
          genreSearchInput.focus();
        }
      }
    });

    // Helper for normalizing text in JS (removes diacritics/accents)
    function normalizeSearchText(str) {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    // 5. Search/Filter Typing
    function filterGenreOptions(query) {
      const q = normalizeSearchText(query);
      const options = genreOptionsContainer.querySelectorAll('.genre-option');
      options.forEach(opt => {
        if (normalizeSearchText(opt.dataset.value).includes(q)) {
          opt.classList.remove('hidden');
        } else {
          opt.classList.add('hidden');
        }
      });
    }

    genreSearchInput.addEventListener('input', (e) => {
      filterGenreOptions(e.target.value);
    });

    // Backspace to delete last tag
    genreSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && e.target.value === '' && currentGenres.length > 0) {
        toggleGenre(currentGenres[currentGenres.length - 1]);
      }
    });
  }

  // === INCLUDE / EXCLUDE TOGGLE ===
  const filterModeToggle = document.getElementById('filter-mode-toggle');
  if (filterModeToggle) {
    filterModeToggle.addEventListener('click', () => {
      if (currentFilterMode === 'include') {
        currentFilterMode = 'exclude';
        filterModeToggle.textContent = 'Exclude';
        filterModeToggle.classList.add('exclude-mode');
      } else {
        currentFilterMode = 'include';
        filterModeToggle.textContent = 'Include';
        filterModeToggle.classList.remove('exclude-mode');
      }
      resetAndLoad();
    });
  }

  // === COLLECTIONS MULTI-SELECT LOGIC ===
  const collectionSelectWrapper = document.querySelector('.list-collection-select-wrapper');
  const collectionSearchInput = document.getElementById('list-collection-search');
  const collectionOptionsContainer = document.getElementById('list-collection-options');
  const collectionTagsContainer = document.querySelector('.list-collection-tags');
  const collectionIndicator = document.getElementById('list-collection-indicator');

  if (collectionSelectWrapper && collectionOptionsContainer) {
    const options = collectionOptionsContainer.querySelectorAll('.list-collection-option');
    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollection(opt.dataset.value, opt.dataset.title);
        collectionSearchInput.value = '';
        filterCollectionOptions('');
      });
    });

    function toggleCollection(id, title) {
      const existingIdx = currentCollections.findIndex(c => c.id === id);
      if (existingIdx > -1) {
        currentCollections.splice(existingIdx, 1);
      } else {
        currentCollections.push({id, title});
      }
      updateCollectionUI();
      resetAndLoad();
    }

    function updateCollectionUI() {
      collectionTagsContainer.innerHTML = '';
      currentCollections.forEach(col => {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        tag.innerHTML = `<span>${col.title}</span><span class="remove-tag">✕</span>`;
        tag.querySelector('.remove-tag').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleCollection(col.id, col.title);
        });
        collectionTagsContainer.appendChild(tag);
      });

      const options = collectionOptionsContainer.querySelectorAll('.list-collection-option');
      options.forEach(opt => {
        if (currentCollections.find(c => c.id === opt.dataset.value)) {
          opt.classList.add('selected');
        } else {
          opt.classList.remove('selected');
        }
      });

      if (currentCollections.length > 0) {
        collectionSearchInput.placeholder = '';
        collectionSelectWrapper.classList.add('has-items');
      } else {
        collectionSearchInput.placeholder = 'Collections';
        collectionSelectWrapper.classList.remove('has-items');
      }
    }

    function openCollectionSelect() {
      const rect = collectionSelectWrapper.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 360 && rect.top > spaceBelow) {
        collectionSelectWrapper.classList.add('drop-up');
      } else {
        collectionSelectWrapper.classList.remove('drop-up');
      }
      collectionOptionsContainer.classList.add('open');
      collectionSelectWrapper.classList.add('open');
    }

    collectionSelectWrapper.addEventListener('click', (e) => {
      openCollectionSelect();
      // Only focus the input if the user didn't explicitly click it or a tag
      if (e.target !== collectionSearchInput && e.target !== collectionIndicator && !e.target.closest('.remove-tag')) {
        collectionSearchInput.focus();
      }
    });

    collectionSearchInput.addEventListener('focus', () => {
      openCollectionSelect();
    });

    document.addEventListener('click', (e) => {
      if (!collectionSelectWrapper.contains(e.target)) {
        collectionOptionsContainer.classList.remove('open');
        collectionSelectWrapper.classList.remove('open');
      }
    });

    collectionIndicator.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Manually close others since we stopped propagation
      const genreWrapper = document.querySelector('.genre-select-wrapper');
      if (genreWrapper) {
        document.getElementById('genre-options')?.classList.remove('open');
        genreWrapper.classList.remove('open');
      }
      setSortSelectOpen(false);

      if (currentCollections.length > 0) {
        currentCollections = [];
        updateCollectionUI();
        collectionOptionsContainer.classList.remove('open');
        collectionSelectWrapper.classList.remove('open');
        resetAndLoad();
      } else {
        if (collectionOptionsContainer.classList.contains('open')) {
          collectionOptionsContainer.classList.remove('open');
          collectionSelectWrapper.classList.remove('open');
        } else {
          openCollectionSelect();
          collectionSearchInput.focus();
        }
      }
    });

    function normalizeSearchText(str) {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    function filterCollectionOptions(query) {
      const q = normalizeSearchText(query);
      const options = collectionOptionsContainer.querySelectorAll('.list-collection-option');
      options.forEach(opt => {
        if (normalizeSearchText(opt.dataset.title).includes(q)) {
          opt.classList.remove('hidden');
        } else {
          opt.classList.add('hidden');
        }
      });
    }

    collectionSearchInput.addEventListener('input', (e) => {
      filterCollectionOptions(e.target.value);
    });

    collectionSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && e.target.value === '' && currentCollections.length > 0) {
        const last = currentCollections[currentCollections.length - 1];
        toggleCollection(last.id, last.title);
      }
    });
  }
  
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
    return loadItems(1, true);
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
  
  const progressUpdates = new Set();
  document.addEventListener('click', async event => {
    const button = event.target.closest('.progress-increment-btn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const itemElement = button.closest('.card, .list-row');
    const id = itemElement?.dataset.id;
    if (!id || progressUpdates.has(id)) return;
    progressUpdates.add(id);
    const buttons = itemElement.querySelectorAll('.progress-increment-btn');
    buttons.forEach(control => { control.disabled = true; });
    try {
      const csrf = document.cookie.split('; ').find(value => value.startsWith('csrftoken='))?.split('=').slice(1).join('=') || '';
      const response = await fetch(`/edit-item/${id}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(csrf) },
        body: JSON.stringify({ increment_progress: button.dataset.progressAction }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to update progress.');
      await replaceItemElement(data.item);
    } catch (error) {
      alert(error.message || 'Unable to update progress. Please try again.');
    } finally {
      progressUpdates.delete(id);
      buttons.forEach(control => { control.disabled = false; });
    }
  }, true);

  // === EVENT DELEGATION FOR EDIT BUTTONS ===
  document.addEventListener('click', function(e) {
    const entryBody = e.target.closest('.expandable-entry');

    if (entryBody) {
        // Prevent clicking the text from navigating to details page
        e.preventDefault();
        e.stopPropagation();

        // 1. If the log is blurred, first click ONLY unblurs it.
        if (entryBody.classList.contains('log-spoiler-blur')) {
            entryBody.classList.remove('log-spoiler-blur');
            return; 
        }

        // 2. If we clicked an inline spoiler, toggle it and stop.
        const inlineSpoiler = e.target.closest('.spoiler');
        if (inlineSpoiler) {
            inlineSpoiler.classList.toggle('revealed');
            return; 
        }
        
        // 3. Otherwise, toggle expansion
        const isExpanded = entryBody.classList.contains('expanded');
        
        // Collapse all others
        document.querySelectorAll('.expandable-entry.expanded').forEach(el => {
            if (el !== entryBody) {
                el.classList.remove('expanded');
            }
        });

        // Toggle current
        entryBody.classList.toggle('expanded');
        return;
    }

    if (e.target.closest('.play-card-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      const card = e.target.closest('.card, .list-row');
      if (card) {
        const itemId = card.dataset.id;
        if (window.playContextPlaylist) {
            window.playContextPlaylist(itemId);
        }
      }
      return;
    }

    if (e.target.classList.contains('edit-card-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      const card = e.target.closest('.card, .list-row');
      if (card) {
        window.openEditModal(card);
      }
    }
  });
  
// Extracts the currently filtered items into a clean YouTube playlist
  window.getFilteredMusicPlaylist = async function() {
      const params = new URLSearchParams({
          status: currentStatus,
          search: currentSearch,
          sort_by: currentSort,
          sort_order: currentSortOrder,
          filter_mode: currentFilterMode
      });
      if (currentGenres.length > 0) params.append('genres', currentGenres.join(','));
      if (currentCollections.length > 0) params.append('collections', currentCollections.map(c => c.id).join(','));

      let page = 1;
      let hasMore = true;
      let allMusicItems = [];

      while (hasMore) {
          params.set('page', page);
          const res = await fetch(`/api/music/?${params}`);
          const data = await res.json();
          allMusicItems = allMusicItems.concat(data.items || []);
          hasMore = data.has_more;
          page++;
      }

      let contextPlaylist = [];
      allMusicItems.forEach(item => {
          let videoId = null;
          
          if (item.youtube_links && item.youtube_links.length > 0) {
              const sortedShots = [...item.youtube_links].sort((a, b) => (a.position || 0) - (b.position || 0));
              for (const shot of sortedShots) {
                  const match = shot.url ? shot.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&"'>\s]{11})/) : null;
                  if (match) {
                      videoId = match[1];
                      break;
                  }
              }
          }

          if (videoId) {
              contextPlaylist.push({
                  video_id: videoId,
                  item_id: item.id,
                  is_favorite: item.is_favorite || false,
                  source_id: item.source_id
              });
          }
      });
      
      return contextPlaylist;
  };

  // Called when clicking the specific '▶' button on an item card
  window.playContextPlaylist = async function(startItemId) {
      // Open a remembered pop-out during the click, before the asynchronous fetch.
      if (window.prepareMusicPlayerWindow) window.prepareMusicPlayerWindow();
      const btnList = document.querySelectorAll(`.card[data-id="${startItemId}"] .play-card-btn, .list-row[data-id="${startItemId}"] .play-card-btn`);
      const playSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      const loadingSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>`;
      
      btnList.forEach(btn => btn.innerHTML = loadingSvg);

      try {
          const contextPlaylist = await window.getFilteredMusicPlaylist();

          if (contextPlaylist.length === 0) {
              alert("No playable YouTube videos found in the current list.");
              return;
          }

          let startIndex = contextPlaylist.findIndex(v => v.item_id == startItemId);
          if (startIndex === -1) startIndex = 0; 

          if (window.startCustomPlaylist) {
              window.startCustomPlaylist(contextPlaylist, startIndex);
          }
      } catch (e) {
          console.error(e);
          alert("Error loading playlist.");
      } finally {
          btnList.forEach(btn => btn.innerHTML = playSvg);
      }
  };

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
  function initBannerRotator() {
    stopBannerRotator?.();
    stopBannerRotator = window.createBannerRotator({
      image: bannerImg, quote: document.querySelector('.banner-quote'), banners: bannerPool,
    });
  }

});

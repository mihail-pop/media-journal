document.addEventListener("DOMContentLoaded", () => {
  const cardView = document.getElementById("card-view");
  const loadingIndicator = document.getElementById("loading-indicator");
  const noItemsMsg = document.getElementById("no-items-message");
  const searchInput = document.getElementById("search-input");
  
  // Sort Controls
  const sortSelect = document.getElementById("sort-select");
  const sortOptions = document.querySelectorAll(".sort-option");
  const sortOrderBtn = document.getElementById("sort-order-btn");
  
  // Filter Controls
  const filterModeToggle = document.getElementById('filter-mode-toggle');
  const activityDayInput = document.getElementById('activity-day');
  const activityMonthInput = document.getElementById('activity-month');
  const activityYearInput = document.getElementById('activity-year');
  const activityDateInputs = [activityDayInput, activityMonthInput, activityYearInput].filter(Boolean);
  const activityMonthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  let monthTypedPrefix = '';
  let monthTypingTime = 0;
  let monthSelectedIndex = -1;
  const rewindButton = document.getElementById('activity-rewind');
  
  // Slider Controls
  const releaseYearSlider = document.getElementById("release-year-slider");
  const releaseYearDisplay = document.getElementById("release-year-display");
  const releaseYearValue = document.getElementById("release-year-value");
  const releaseYearClear = document.getElementById("release-year-clear");

  // === PAGINATION STATE ===
  let currentPage = 1;
  let isLoading = false;
  let hasMore = true;
  let allItems = [];
  let activeRequest = null;
  let requestVersion = 0;
  let rewindRunning = false;
  let rewindGeneration = 0;
  let rewindTimer;
  let activityDateTimeout;
  const rewindDelay = 2000;

  const isBackForwardNav = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  
  if (!isBackForwardNav) {
    sessionStorage.removeItem('history_activity_year');
    sessionStorage.removeItem('history_activity_month');
    sessionStorage.removeItem('history_activity_day');
    sessionStorage.removeItem('history_search');
    sessionStorage.removeItem('history_sort_order');
    sessionStorage.removeItem('history_sort_by');
    sessionStorage.removeItem('history_filter_mode');
    sessionStorage.removeItem('history_types');
    sessionStorage.removeItem('history_statuses');
    sessionStorage.removeItem('history_collections');
    sessionStorage.removeItem('history_release_year');
  }

  let selectedActivityYear = isBackForwardNav ? (sessionStorage.getItem('history_activity_year') || "all") : "all";
  let selectedActivityMonth = isBackForwardNav ? (sessionStorage.getItem('history_activity_month') || "all") : "all";
  let selectedActivityDay = isBackForwardNav ? (sessionStorage.getItem('history_activity_day') || "all") : "all";
  let searchQuery = isBackForwardNav ? (sessionStorage.getItem('history_search') || "") : "";
  let sortOrder = isBackForwardNav ? (sessionStorage.getItem('history_sort_order') || "desc") : "desc";
  let sortBy = isBackForwardNav ? (sessionStorage.getItem('history_sort_by') || "activity_date") : "activity_date";
  
  let currentFilterMode = isBackForwardNav ? (sessionStorage.getItem('history_filter_mode') || "include") : "include";
  let currentTypes = isBackForwardNav ? JSON.parse(sessionStorage.getItem('history_types') || "[]") : [];
  let currentStatuses = isBackForwardNav ? JSON.parse(sessionStorage.getItem('history_statuses') || "[]") : [];
  let currentCollections = isBackForwardNav ? JSON.parse(sessionStorage.getItem('history_collections') || "[]") : [];
  
  let releaseYear = isBackForwardNav ? (sessionStorage.getItem('history_release_year') || "") : "";

  // Home's activity links select a day before the first request. Back navigation
  // keeps the user's restored filters, which may have changed since opening the link.
  if (!isBackForwardNav) {
    const linkedDate = new URLSearchParams(window.location.search).get('date') || '';
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(linkedDate);
    if (parts && resolveActivityDate({ year: parts[1], month: parts[2], day: parts[3] })) {
      selectedActivityYear = parts[1];
      selectedActivityMonth = parts[2];
      selectedActivityDay = parts[3];
    }
  }

  // === MULTI SELECT LOGIC ===
  function initMultiSelect(config) {
    const {
      wrapperId, searchId, optionsId, tagsContainerSelector, indicatorId, 
      availableOptions, currentSelection, onToggle, getTitle
    } = config;
    
    const wrapper = document.getElementById(wrapperId);
    const searchInputEl = document.getElementById(searchId);
    const optionsContainer = document.getElementById(optionsId);
    const tagsContainer = document.querySelector(tagsContainerSelector);
    const indicator = document.getElementById(indicatorId);

    if (!wrapper) return;
    optionsContainer.innerHTML = ''; 

    availableOptions.forEach(opt => {
      const optionEl = document.createElement('div');
      optionEl.className = `h-select-option ${wrapperId}-option`;
      optionEl.dataset.value = opt.value;
      optionEl.dataset.title = getTitle(opt);
      optionEl.innerHTML = `<span>${getTitle(opt)}</span><span class="${wrapperId}-check">✕</span>`;
      
      optionEl.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleItem(opt);
        searchInputEl.value = '';
        filterOptions('');
      });
      optionsContainer.appendChild(optionEl);
    });

    function toggleItem(opt) {
      const existingIdx = currentSelection.findIndex(item => item.value === opt.value);
      if (existingIdx > -1) {
        currentSelection.splice(existingIdx, 1);
      } else {
        currentSelection.push(opt);
      }
      updateUI();
      onToggle();
    }

    function updateUI() {
      tagsContainer.innerHTML = '';
      currentSelection.forEach(item => {
        const tag = document.createElement('div');
        tag.className = 'genre-tag';
        tag.innerHTML = `<span>${getTitle(item)}</span><span class="remove-tag">✕</span>`;
        tag.querySelector('.remove-tag').addEventListener('click', (e) => {
          e.stopPropagation();
          toggleItem(item);
        });
        tagsContainer.appendChild(tag);
      });

      const options = optionsContainer.querySelectorAll('.h-select-option');
      options.forEach(opt => {
        if (currentSelection.find(i => i.value === opt.dataset.value)) {
          opt.classList.add('selected');
        } else {
          opt.classList.remove('selected');
        }
      });

      if (currentSelection.length > 0) {
        searchInputEl.placeholder = '';
        wrapper.classList.add('has-items');
      } else {
        searchInputEl.placeholder = searchInputEl.dataset.placeholder || searchInputEl.getAttribute('placeholder');
        wrapper.classList.remove('has-items');
      }
    }

    function openSelect() {
      const rect = wrapper.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 360 && rect.top > spaceBelow) {
        wrapper.classList.add('drop-up');
      } else {
        wrapper.classList.remove('drop-up');
      }
      optionsContainer.classList.add('open');
      wrapper.classList.add('open');
    }

    wrapper.addEventListener('click', (e) => {
      openSelect();
      if (e.target !== searchInputEl && e.target !== indicator && !e.target.closest('.remove-tag')) {
        searchInputEl.focus();
      }
    });
    
    searchInputEl.addEventListener('focus', () => {
      openSelect();
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        optionsContainer.classList.remove('open');
        wrapper.classList.remove('open');
      }
    });

    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.h-select-wrapper.open').forEach(el => {
        if (el !== wrapper) {
            el.classList.remove('open');
            const opts = el.querySelector('.h-select-options');
            if (opts) opts.classList.remove('open');
        }
      });
      
      if (currentSelection.length > 0) {
        currentSelection.length = 0;
        updateUI();
        optionsContainer.classList.remove('open');
        wrapper.classList.remove('open');
        onToggle();
      } else {
        if (optionsContainer.classList.contains('open')) {
          optionsContainer.classList.remove('open');
          wrapper.classList.remove('open');
        } else {
          openSelect();
          searchInputEl.focus();
        }
      }
    });

    function normalizeSearchText(str) {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    function filterOptions(query) {
      const q = normalizeSearchText(query);
      const options = optionsContainer.querySelectorAll('.h-select-option');
      options.forEach(opt => {
        if (normalizeSearchText(opt.dataset.title).includes(q)) {
          opt.classList.remove('hidden');
        } else {
          opt.classList.add('hidden');
        }
      });
    }

    searchInputEl.addEventListener('input', (e) => {
      filterOptions(e.target.value);
    });

    searchInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && e.target.value === '' && currentSelection.length > 0) {
        toggleItem(currentSelection[currentSelection.length - 1]);
      }
    });

    updateUI();
  }

  // Init Type Filter
  initMultiSelect({
    wrapperId: 'type-select-wrapper',
    searchId: 'type-search',
    optionsId: 'type-options',
    tagsContainerSelector: '.type-tags',
    indicatorId: 'type-indicator',
    availableOptions: [
      { value: 'movie', label: 'Movies' },
      { value: 'tv', label: 'TV Shows' },
      { value: 'anime', label: 'Anime' },
      { value: 'manga', label: 'Manga' },
      { value: 'game', label: 'Games' },
      { value: 'book', label: 'Books' },
      { value: 'music', label: 'Music' }
    ],
    currentSelection: currentTypes,
    getTitle: opt => opt.label,
    onToggle: () => {
      sessionStorage.setItem('history_types', JSON.stringify(currentTypes));
      resetAndLoad();
    }
  });

  // Init Status Filter
  initMultiSelect({
    wrapperId: 'status-select-wrapper',
    searchId: 'status-search',
    optionsId: 'status-options',
    tagsContainerSelector: '.status-tags',
    indicatorId: 'status-indicator',
    availableOptions: [
      { value: 'ongoing', label: 'Ongoing' },
      { value: 'completed', label: 'Completed' },
      { value: 'on_hold', label: 'On Hold' },
      { value: 'planned', label: 'Planned' },
      { value: 'dropped', label: 'Dropped' }
    ],
    currentSelection: currentStatuses,
    getTitle: opt => opt.label,
    onToggle: () => {
      sessionStorage.setItem('history_statuses', JSON.stringify(currentStatuses));
      resetAndLoad();
    }
  });

  // Init Collection Filter
  const colContainer = document.getElementById('list-collection-options');
  if (colContainer) {
    const colOpts = document.querySelectorAll('#list-collection-options .list-collection-option');
    const availableCollections = Array.from(colOpts).map(el => ({
      value: el.dataset.value,
      label: el.dataset.title
    }));
    
    initMultiSelect({
      wrapperId: 'list-collection-select-wrapper',
      searchId: 'list-collection-search',
      optionsId: 'list-collection-options',
      tagsContainerSelector: '.list-collection-tags',
      indicatorId: 'list-collection-indicator',
      availableOptions: availableCollections,
      currentSelection: currentCollections,
      getTitle: opt => opt.label,
      onToggle: () => {
        sessionStorage.setItem('history_collections', JSON.stringify(currentCollections));
        resetAndLoad();
      }
    });
  }

  // === UI UPDATES FOR CONTROLS ===
  const defaultSortLabels = {
    title: "Title",
    rating: "Rating",
    activity_date: "Activity Date",
    release_date: "Release Date",
  };

  function updateSortButtons() {
    if (sortSelect) {
      sortSelect.textContent = defaultSortLabels[sortBy] || defaultSortLabels.activity_date;
      sortSelect.dataset.value = sortBy;
    }

    sortOptions.forEach(option => {
      const isActive = option.dataset.sort === sortBy;
      option.classList.toggle('active', isActive);
      option.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    if (sortOrderBtn) {
      sortOrderBtn.dataset.order = sortOrder;
    }
  }

  function setSortSelectOpen(isOpen) {
    const wrapper = sortSelect?.closest('.h-select-wrapper');
    const optionsList = wrapper?.querySelector('.h-select-options');
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

  function applySortFromControl(sortType) {
    if (!sortType) return;
    if (sortBy === sortType) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = sortType;
      sortOrder = (sortType === 'title' || sortType === 'release_date') ? 'asc' : 'desc';
    }

    sessionStorage.setItem('history_sort_by', sortBy);
    sessionStorage.setItem('history_sort_order', sortOrder);
    setSortSelectOpen(false);
    updateSortButtons();
    resetAndLoad();
  }

  // === EVENT LISTENERS ===
  if (filterModeToggle) {
    if (currentFilterMode === 'exclude') {
        filterModeToggle.textContent = 'Exclude';
        filterModeToggle.classList.add('exclude-mode');
    }
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
      sessionStorage.setItem('history_filter_mode', currentFilterMode);
      resetAndLoad();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("click", () => {
      const optionsList = sortSelect.closest('.h-select-wrapper')?.querySelector('.h-select-options');
      setSortSelectOpen(!optionsList?.classList.contains('open'));
    });
  }

  sortOptions.forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      applySortFromControl(option.dataset.sort);
    });
  });

  if (sortOrderBtn) {
    sortOrderBtn.addEventListener("click", () => {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      sessionStorage.setItem('history_sort_order', sortOrder);
      updateSortButtons();
      resetAndLoad();
    });
  }
  
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest('.sort-controls')) {
      setSortSelectOpen(false);
    }
  });

  let searchTimeout;
  searchInput.addEventListener("input", e => {
    stopRewind();
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value;
      sessionStorage.setItem('history_search', searchQuery);
      resetAndLoad();
    }, 300);
  });

  function resolveActivityDate(raw = {
    year: selectedActivityYear, month: selectedActivityMonth, day: selectedActivityDay,
  }) {
    const year = raw.year === 'all' ? '' : raw.year;
    const month = raw.month === 'all' ? '' : raw.month;
    const day = raw.day === 'all' ? '' : raw.day;
    if ((year && (!/^\d{4}$/.test(year) || Number(year) < 1)) ||
        (month && (!/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12)) ||
        (day && (!/^\d{1,2}$/.test(day) || Number(day) < 1 || Number(day) > 31))) return null;
    const today = new Date();
    const resolved = {
      year: year ? Number(year) : (month || day ? today.getFullYear() : null),
      month: month ? Number(month) : (day ? today.getMonth() + 1 : null),
      day: day ? Number(day) : null,
    };
    if (resolved.day) {
      const date = new Date(0);
      date.setUTCFullYear(resolved.year, resolved.month - 1, resolved.day);
      if (date.getUTCFullYear() !== resolved.year || date.getUTCMonth() + 1 !== resolved.month ||
          date.getUTCDate() !== resolved.day) return null;
    }
    return resolved;
  }

  function activityMonthValue(value) {
    const text = value.trim();
    if (!text || /^\d+$/.test(text)) return text;
    const index = activityMonthNames.findIndex(name => name.toLowerCase().startsWith(text.toLowerCase()));
    return index < 0 ? text : String(index + 1);
  }

  function selectActivityMonth(letter) {
    const key = letter.toLowerCase();
    const now = Date.now();
    let prefix = now - monthTypingTime < 1000 && monthTypedPrefix && monthTypedPrefix !== key
      ? monthTypedPrefix + key : key;
    const matchesFor = query => activityMonthNames.map((name, index) => ({ name, index }))
      .filter(month => month.name.toLowerCase().startsWith(query));
    let matches = matchesFor(prefix);
    if (!matches.length) { prefix = key; matches = matchesFor(prefix); }
    if (!matches.length) return;
    const position = prefix === key && monthTypedPrefix === key
      ? (matches.findIndex(month => month.index === monthSelectedIndex) + 1) % matches.length : 0;
    activityMonthInput.value = matches[position].name.slice(0, 3);
    activityMonthInput.select();
    monthTypedPrefix = prefix;
    monthTypingTime = now;
    monthSelectedIndex = matches[position].index;
  }

  function normalizeActivityDateInput(input, commit = false) {
    if (input === activityMonthInput && /^[a-z]+$/i.test(input.value.trim())) {
      const month = Number(activityMonthValue(input.value));
      if (month >= 1 && month <= 12) input.value = activityMonthNames[month - 1].slice(0, 3);
      return;
    }
    const digits = input.value.replace(/\D/g, '');
    if (input === activityYearInput) {
      input.value = digits.slice(0, 4);
      return;
    }
    const maximum = input === activityMonthInput ? 12 : 31;
    let value = digits.slice(0, 2);
    if (digits && (Number(digits) > maximum || digits.length > 2)) value = String(Math.min(maximum, Number(digits)));
    // Keep a leading zero while typing so dates such as 04 remain easy to enter.
    if (commit && value && Number(value) === 0) value = '1';
    input.value = value;
    if (input === activityMonthInput) monthTypedPrefix = '';
  }

  function readActivityDateInputs(showErrors = false) {
    const raw = {
      year: activityYearInput?.value || '', month: activityMonthValue(activityMonthInput?.value || ''), day: activityDayInput?.value || '',
    };
    const valid = resolveActivityDate(raw) !== null;
    const incomplete = (raw.year && raw.year.length < 4) || raw.month === '0' || raw.day === '0';
    activityDateInputs.forEach(input => {
      const invalid = !valid && !!input.value && (showErrors || !incomplete);
      const message = invalid ? 'Enter a valid date. Use four digits for the year.' : '';
      input.setCustomValidity(message);
      input.setAttribute('aria-invalid', String(invalid));
      input.title = message;
    });
    if (rewindButton) rewindButton.disabled = !valid && !rewindRunning;
    return valid ? raw : null;
  }

  function applyActivityDate(raw, fillInputs = false) {
    selectedActivityYear = raw.year || 'all';
    selectedActivityMonth = raw.month || 'all';
    selectedActivityDay = raw.day || 'all';
    sessionStorage.setItem('history_activity_year', selectedActivityYear);
    sessionStorage.setItem('history_activity_month', selectedActivityMonth);
    sessionStorage.setItem('history_activity_day', selectedActivityDay);
    if (fillInputs) {
      if (activityYearInput) activityYearInput.value = raw.year;
      if (activityMonthInput) activityMonthInput.value = raw.month;
      if (activityDayInput) activityDayInput.value = raw.day;
      readActivityDateInputs();
    }
  }

  function cancelHistoryRequest() {
    activeRequest?.controller.abort();
    activeRequest = null;
    requestVersion++;
    isLoading = false;
    loadingIndicator.style.display = 'none';
  }

  function updateRewindButton() {
    if (!rewindButton) return;
    rewindButton.textContent = rewindRunning ? 'Stop' : 'Rewind';
    const label = rewindRunning ? 'Stop activity rewind' : 'Rewind activity days';
    rewindButton.title = label;
    rewindButton.setAttribute('aria-label', label);
    rewindButton.setAttribute('aria-pressed', String(rewindRunning));
    readActivityDateInputs();
  }

  function stopRewind() {
    rewindRunning = false;
    rewindGeneration++;
    clearTimeout(rewindTimer);
    if (activeRequest?.rewind) cancelHistoryRequest();
    updateRewindButton();
  }

  async function advanceRewind(generation, before = '') {
    if (!rewindRunning || generation !== rewindGeneration) return;
    const data = await loadItems(1, true, { rewind: true, before, generation });
    if (!rewindRunning || generation !== rewindGeneration) return;
    if (!data || data.rewind_exhausted || !data.activity_date) {
      stopRewind();
      return;
    }
    // Start the viewing interval after the results arrive, never overlapping requests.
    rewindTimer = setTimeout(() => advanceRewind(generation, data.activity_date), rewindDelay);
  }

  rewindButton?.addEventListener('click', () => {
    if (rewindRunning) {
      stopRewind();
      return;
    }
    clearTimeout(activityDateTimeout);
    const raw = readActivityDateInputs(true);
    if (!raw) return;
    clearTimeout(searchTimeout);
    searchQuery = searchInput.value;
    sessionStorage.setItem('history_search', searchQuery);
    clearTimeout(releaseYearDebounce);
    if (releaseYearDisplay.style.display !== 'none' && /^\d{4}$/.test(releaseYearValue.value)) {
      releaseYear = releaseYearValue.value;
      sessionStorage.setItem('history_release_year', releaseYear);
    }
    applyActivityDate(raw);
    rewindRunning = true;
    const generation = ++rewindGeneration;
    updateRewindButton();
    advanceRewind(generation);
  });

  function activityDateInputChanged(input) {
    normalizeActivityDateInput(input);
    stopRewind();
    cancelHistoryRequest();
    clearTimeout(activityDateTimeout);
    const raw = readActivityDateInputs();
    if (!raw) return;
    activityDateTimeout = setTimeout(() => {
      applyActivityDate(raw);
      resetAndLoad();
    }, 250);
  }

  activityDateInputs.forEach(input => {
    input.addEventListener('input', event => {
      if (event.isComposing) return;
      // Soft keyboards may insert letters without a usable keydown event.
      if (input === activityMonthInput && /^[a-z]$/i.test(event.data || '')) selectActivityMonth(event.data);
      activityDateInputChanged(input);
    });
    input.addEventListener('blur', () => {
      const previous = input.value;
      normalizeActivityDateInput(input, true);
      if (input === activityMonthInput) monthTypedPrefix = '';
      if (input.value !== previous) activityDateInputChanged(input);
      readActivityDateInputs(true);
    });
    input.addEventListener('keydown', event => {
      if (input === activityMonthInput && /^[a-z]$/i.test(event.key) &&
          !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
        event.preventDefault();
        selectActivityMonth(event.key);
        activityDateInputChanged(input);
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      clearTimeout(activityDateTimeout);
      activityDateInputs.forEach(field => normalizeActivityDateInput(field, true));
      const raw = readActivityDateInputs(true);
      if (!raw) return;
      applyActivityDate(raw);
      resetAndLoad();
    });
  });

  let lastValidReleaseYear = releaseYearSlider.value;
  if (releaseYear) {
    releaseYearSlider.value = releaseYear;
    releaseYearValue.value = releaseYear;
    lastValidReleaseYear = releaseYear;
    releaseYearDisplay.style.display = 'inline';
  } else {
    releaseYearSlider.value = new Date().getFullYear() + 1;
    lastValidReleaseYear = releaseYearSlider.value;
  }

  let releaseYearDebounce;

  releaseYearSlider.addEventListener("input", (e) => {
    stopRewind();
    releaseYearValue.value = e.target.value;
    releaseYearDisplay.style.display = 'inline';
    
    clearTimeout(releaseYearDebounce);
    releaseYearDebounce = setTimeout(() => {
      if (releaseYear !== e.target.value) {
        releaseYear = e.target.value;
        lastValidReleaseYear = releaseYear;
        sessionStorage.setItem('history_release_year', releaseYear);
        resetAndLoad();
      }
    }, 1000);
  });

  releaseYearSlider.addEventListener("change", (e) => {
    clearTimeout(releaseYearDebounce);
    if (releaseYear !== e.target.value) {
      releaseYear = e.target.value;
      lastValidReleaseYear = releaseYear;
      sessionStorage.setItem('history_release_year', releaseYear);
      resetAndLoad();
    }
  });

  // Release year custom input event listeners
  releaseYearValue.addEventListener("input", (e) => {
    stopRewind();
    if (e.target.value.length > 4) {
      e.target.value = e.target.value.slice(0, 4);
    }
  });

  releaseYearValue.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      releaseYearValue.blur();
    }
  });

  releaseYearValue.addEventListener("blur", () => {
    let val = releaseYearValue.value;
    // Validate if it is a 4-digit number
    if (val.length === 4 && !isNaN(val)) {
      lastValidReleaseYear = val;
      releaseYearSlider.value = val;
      if (releaseYear !== val) {
        releaseYear = val;
        sessionStorage.setItem('history_release_year', releaseYear);
        resetAndLoad();
      }
    } else {
      // Revert changes if it's less than 4 numbers
      releaseYearValue.value = lastValidReleaseYear;
    }
  });

  releaseYearClear.addEventListener("click", () => {
    releaseYear = "";
    releaseYearSlider.value = new Date().getFullYear() + 1; 
    lastValidReleaseYear = releaseYearSlider.value;
    releaseYearDisplay.style.display = 'none';
    sessionStorage.setItem('history_release_year', releaseYear);
    resetAndLoad();
  });

  // Restore entered values, keeping inferred year/month defaults out of the boxes.
  if (isBackForwardNav) searchInput.value = searchQuery;
  applyActivityDate({
    year: selectedActivityYear === 'all' ? '' : selectedActivityYear,
    month: selectedActivityMonth === 'all' ? '' : selectedActivityMonth,
    day: selectedActivityDay === 'all' ? '' : selectedActivityDay,
  }, true);
  updateSortButtons();

  // === API FUNCTIONS ===
  async function loadItems(page = 1, reset = false, options = {}) {
    if (!reset && (isLoading || !hasMore)) return null;
    if (reset) activeRequest?.controller.abort();
    const request = { controller: new AbortController(), rewind: !!options.rewind };
    activeRequest = request;
    const version = ++requestVersion;
    isLoading = true;
    const loadingTimeout = options.rewind ? null : setTimeout(() => {
      if (version === requestVersion) loadingIndicator.style.display = 'block';
    }, 200);
    try {
      const params = new URLSearchParams({
        page, search: searchQuery, sort_by: sortBy, sort_order: sortOrder, filter_mode: currentFilterMode,
      });
      const date = resolveActivityDate();
      if (!date) return null;
      if (date.year) params.append('activity_year', date.year);
      if (date.month) params.append('month', date.month);
      if (date.day) params.append('day', date.day);
      if (options.rewind) {
        params.append('rewind', '1');
        if (options.before) params.append('rewind_before', options.before);
      }
      if (releaseYear) params.append('release_year', releaseYear);
      if (currentTypes.length > 0) params.append('types', currentTypes.map(t => t.value).join(','));
      if (currentStatuses.length > 0) params.append('statuses', currentStatuses.map(s => s.value).join(','));
      if (currentCollections.length > 0) params.append('collections', currentCollections.map(c => c.value).join(','));
      const historyCacheVersion = sessionStorage.getItem('cacheVersion_history');
      if (historyCacheVersion) params.append('_v', historyCacheVersion);
      const response = await fetch(`/api/history/?${params}`, { signal: request.controller.signal });
      const data = await response.json();
      if (version !== requestVersion || request.controller.signal.aborted) return null;
      if (!response.ok) throw new Error(data.error || 'Unable to load history.');
      if (options.rewind) {
        if (!rewindRunning || options.generation !== rewindGeneration) return null;
        if (data.rewind_exhausted) return data;
        const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.activity_date || '');
        if (!parts) throw new Error('Invalid activity date in rewind response.');
        applyActivityDate({ year: parts[1], month: parts[2], day: parts[3] }, true);
      }
      if (reset) allItems = data.items || [];
      else {
        const existingMap = new Map(allItems.map((item, index) => [String(item.id), index]));
        for (const item of data.items || []) {
          const id = String(item.id);
          if (existingMap.has(id)) allItems[existingMap.get(id)] = item;
          else {
            existingMap.set(id, allItems.length);
            allItems.push(item);
          }
        }
      }
      hasMore = data.has_more;
      currentPage = data.page;
      renderItems();
      return data;
    } catch (error) {
      if (error.name !== 'AbortError' && version === requestVersion) {
        console.error('Error loading items:', error);
        if (reset) hasMore = false;
      }
      return null;
    } finally {
      clearTimeout(loadingTimeout);
      if (version === requestVersion) {
        activeRequest = null;
        isLoading = false;
        loadingIndicator.style.display = 'none';
      }
    }
  }

  function renderItems() {
    cardView.innerHTML = '';
    
    allItems.forEach(item => {
      const card = createCardElement(item);
      cardView.appendChild(card);
    });
    
    if (noItemsMsg) {
      noItemsMsg.style.display = allItems.length === 0 ? "block" : "none";
    }
  }

  function replaceHistoryItem(item) {
    try {
      // Edit responses also include a form display score; sorting/rendering use the stored score.
      if (Object.hasOwn(item, 'personal_rating_raw')) item = { ...item, personal_rating: item.personal_rating_raw };
      sessionStorage.setItem('cacheVersion_history', Date.now().toString());
      const id = String(item.id);

      const idx = allItems.findIndex(i => String(i.id) === id);
      if (idx !== -1) {
        allItems[idx] = item;
      } else {
        allItems.unshift(item);
      }

      function matchesFilters(it) {
        if (!it) return false;
        
        if (currentTypes.length > 0) {
          const typeMatches = currentTypes.find(t => t.value === it.media_type);
          if (currentFilterMode === 'include' && !typeMatches) return false;
          if (currentFilterMode === 'exclude' && typeMatches) return false;
        }

        if (currentStatuses.length > 0) {
          const statusMatches = currentStatuses.find(s => s.value === it.status);
          if (currentFilterMode === 'include' && !statusMatches) return false;
          if (currentFilterMode === 'exclude' && statusMatches) return false;
        }

        const activityDate = resolveActivityDate();
        if (activityDate && (activityDate.year || activityDate.month || activityDate.day)) {
          const [year, month, day] = String(it.date_added || '').slice(0, 10).split('-').map(Number);
          if ((activityDate.year && year !== activityDate.year) ||
              (activityDate.month && month !== activityDate.month) ||
              (activityDate.day && day !== activityDate.day)) return false;
        }

        if (releaseYear) {
          if (!it.release_date || !it.release_date.startsWith(String(releaseYear))) return false;
        }

        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          if (!(String(it.title || '').toLowerCase().includes(q))) return false;
        }
        
        return true;
      }

      if (!matchesFilters(item)) {
        document.querySelectorAll(`.card[data-id="${id}"]`).forEach(n => n.remove());
        allItems = allItems.filter(i => String(i.id) !== id);
        return;
      }

      if (!item.date_formatted && item.date_added) {
        try {
          const d = new Date(item.date_added);
          item.date_formatted = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
          item.date_formatted = '';
        }
      }

      if (!item.url) {
        if (item.source === "tmdb" && item.media_type === "tv" && item.source_id && item.source_id.includes("_s")) {
          const parts = item.source_id.split("_s");
          item.url = `/tmdb/season/${parts[0]}/${parts[1]}/`;
        } else if (item.source === "tmdb" && (item.media_type === "movie" || item.media_type === "tv")) {
          item.url = `/tmdb/${item.media_type}/${item.source_id}/`;
        } else if (item.media_type === "anime" || item.media_type === "manga") {
          item.url = `/${item.source}/${item.media_type}/${item.source_id}/`;
        } else if (item.source === "igdb" && item.media_type === "game") {
          item.url = `/igdb/game/${item.source_id}/`;
        } else if (item.source === "openlib" && item.media_type === "book") {
          item.url = `/openlib/book/${item.source_id}/`;
        } else if (item.source === "musicbrainz" && item.media_type === "music") {
          item.url = `/musicbrainz/music/${item.source_id}/`;
        } else {
          item.url = "#";
        }
      }

      document.querySelectorAll(`.card[data-id="${id}"]`).forEach(n => n.remove());
      const newEl = createCardElement(item);

      const cards = Array.from(cardView.querySelectorAll('.card'));
      let inserted = false;
      for (const c of cards) {
        const cid = String(c.dataset.id);
        const ci = allItems.find(i => String(i.id) === cid);
        if (!ci) continue;
        
        let cmp = 0;
        if (sortBy === 'title') {
            cmp = String(item.title || '').localeCompare(String(ci.title || ''));
        } else if (sortBy === 'release_date') {
            const a = item.release_date ? new Date(item.release_date).getTime() : 0;
            const b = ci.release_date ? new Date(ci.release_date).getTime() : 0;
            cmp = a - b;
            if (cmp === 0) cmp = String(item.title || '').localeCompare(String(ci.title || ''));
        } else if (sortBy === 'rating') {
            const a = item.personal_rating || 0;
            const b = ci.personal_rating || 0;
            cmp = a - b;
            if (cmp === 0) cmp = String(item.title || '').localeCompare(String(ci.title || ''));
        } else {
            const a = item.date_added ? new Date(item.date_added).getTime() : 0;
            const b = ci.date_added ? new Date(ci.date_added).getTime() : 0;
            cmp = a - b;
            if (cmp === 0) cmp = String(item.title || '').localeCompare(String(ci.title || ''));
        }
        
        const shouldInsertBefore = (sortOrder === 'desc' ? cmp > 0 : cmp < 0);
        if (shouldInsertBefore) {
          cardView.insertBefore(newEl, c);
          inserted = true;
          break;
        }
      }
      if (!inserted) cardView.appendChild(newEl);
    } catch (e) {
      console.error('replaceHistoryItem error', e);
    }
  }

  function removeHistoryItem(id) {
    try {
      sessionStorage.setItem('cacheVersion_history', Date.now().toString());
      const sid = String(id);
      document.querySelectorAll(`.card[data-id="${sid}"]`).forEach(n => n.remove());
      allItems = allItems.filter(i => String(i.id) !== sid);
    } catch (e) {
      console.error('removeHistoryItem error', e);
    }
  }

  window.removeHistoryItem = removeHistoryItem;
  window.replaceHistoryItem = replaceHistoryItem;

  let ratingMode = document.body.getAttribute('data-rating-mode') || 'faces';

  function getRatingHtml(rating) {
    if (!rating) return 'Unrated';
    const rnum = Number(rating);
    if (isNaN(rnum)) return 'Unrated';

    const displayRating = window.ratingToDisplay(rnum, ratingMode);
    if (displayRating === null) return 'Unrated';
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
    return 'Unrated';
  }

  function formatDateString(dateStr) {
    if (!dateStr) return 'Unknown';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  function createCardElement(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    card.dataset.mediaType = item.media_type;
    card.dataset.title = item.title;
    card.dataset.status = item.status;
    card.dataset.coverUrl = item.cover_url;
    card.dataset.bannerUrl = item.banner_url;
    
    let dynamicText = item.date_formatted;
    if (sortBy === 'release_date') {
      dynamicText = formatDateString(item.release_date);
    } else if (sortBy === 'rating') {
      dynamicText = getRatingHtml(item.personal_rating);
    }
    
    card.innerHTML = `
      <a href="${item.url}" class="card-link">
        <div class="card-image">
          <img src="${item.cover_url}" alt="${item.title}" loading="lazy">
        </div>
        <div class="card-title-overlay">
          <span class="card-title">${item.title}</span>
          <div class="card-date">
            ${dynamicText}
          </div>
        </div>
      </a>
      <div class="status-overlay status-${item.status}"></div>
      <button class="edit-card-btn">⋯</button>
    `;
    
    return card;
  }

  function resetAndLoad() {
    stopRewind();
    clearTimeout(activityDateTimeout);
    const raw = readActivityDateInputs();
    if (raw) applyActivityDate(raw);
    return loadItems(1, true);
  }

  // === SCROLL PAGINATION ===
  function handleScroll() {
    if (rewindRunning || isLoading || !hasMore) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    if (scrollTop + windowHeight >= documentHeight - 1000) {
      loadItems(currentPage + 1);
    }
  }

  window.addEventListener('scroll', handleScroll);

  // === GLOBAL EDIT MODAL FUNCTION ===
  window.openEditModal = function(element) {
    stopRewind();
    const itemId = element.dataset.id;
    const coverUrl = element.dataset.coverUrl;
    const title = element.dataset.title;

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

    const form = document.getElementById("edit-form");
    if (!form) return console.error("Edit form not found");

    fetch(`/get-item/${itemId}/?_t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) return alert("Failed to load item");
        
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

  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('edit-card-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      const card = e.target.closest('.card');
      if (card) {
        window.openEditModal(card);
      }
    }
  });

  // === SCROLL POSITION RESTORATION ===
  const scrollKey = 'scrollPos_history';
  const pageKey = 'scrollPage_history';
  
  window.addEventListener('pagehide', () => {
    stopRewind();
    cancelHistoryRequest();
    clearTimeout(activityDateTimeout);
    clearTimeout(searchTimeout);
    clearTimeout(releaseYearDebounce);
    sessionStorage.setItem(scrollKey, window.scrollY);
    sessionStorage.setItem(pageKey, currentPage);
  });
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRewind();
  });

  const savedPage = parseInt(sessionStorage.getItem(pageKey)) || 1;
  const savedScroll = parseInt(sessionStorage.getItem(scrollKey)) || 0;
  
  if (isBackForwardNav && savedPage > 1) {
    document.documentElement.style.overflowY = 'scroll';
    document.documentElement.style.visibility = 'hidden';
    cardView.style.opacity = '0';
    
    async function loadUpToPage() {
      for (let i = 1; i <= savedPage; i++) {
        await loadItems(i, i === 1);
      }
      window.scrollTo(0, savedScroll);
      document.documentElement.style.visibility = 'visible';
      cardView.style.opacity = '1';
    }
    loadUpToPage();
  } else {
    if (!isBackForwardNav) {
      sessionStorage.removeItem(scrollKey);
      sessionStorage.removeItem(pageKey);
    }
    loadItems(1, true);
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

    document.addEventListener('click', (e) => {
      if (!toggleBtn.contains(e.target) && !sidebar.contains(e.target)) {
        sidebar.classList.remove('sidebar-visible');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        sidebar.classList.remove('sidebar-visible');
      }
    });
  }
});

const theme = document.body.getAttribute('data-theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);

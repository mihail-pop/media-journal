document.addEventListener("DOMContentLoaded", () => {

  const cardView = document.getElementById("card-view");
  const loadingIndicator = document.getElementById("loading-indicator");
  const searchInput = document.getElementById("search-input");
  const yearBtns = [...document.querySelectorAll(".year-btn")];
  const monthBtns = [...document.querySelectorAll(".month-btn")];
  const typeBtns = [...document.querySelectorAll(".type-btn")];
  const statusBtns = [...document.querySelectorAll(".status-btn")];
  const monthFilterDiv = document.getElementById("month-filter");
  const noItemsMsg = document.getElementById("no-items-message");

  const sortAscBtn = document.getElementById("sort-asc");
  const sortDescBtn = document.getElementById("sort-desc");
  const customYearInput = document.getElementById("custom-year");
  const startDateInput = document.getElementById("start-date");
  const endDateInput = document.getElementById("end-date");

  // === PAGINATION STATE ===
  let currentPage = 1;
  let isLoading = false;
  let hasMore = true;
  let allItems = [];

  let selectedYear = "all";
  let selectedMonth = "all";
  let selectedType = "all";
  let selectedStatus = "all";
  let searchQuery = "";
  let sortOrder = "desc"; // newest first
  let startDate = null;
  let endDate = null;

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
        search: searchQuery,
        sort: sortOrder
      });
      
      if (selectedYear !== 'all') params.append('year', selectedYear);
      if (selectedMonth !== 'all') params.append('month', selectedMonth);
      if (selectedType !== 'all') params.append('type', selectedType);
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      const response = await fetch(`/api/history/?${params}`);
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
    cardView.innerHTML = '';
    
    allItems.forEach(item => {
      const card = createCardElement(item);
      cardView.appendChild(card);
    });
    
    // Show/hide month filter
    monthFilterDiv.style.display = selectedYear !== "all" ? "flex" : "none";
    
    // Show/hide "No items found" message
    if (noItemsMsg) {
      noItemsMsg.style.display = allItems.length === 0 ? "block" : "none";
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
    
    const dateObj = new Date(item.date_added);
    const timeAgo = getTimeAgo(dateObj);
    const statusText = getStatusText(item.status, timeAgo);
    
    card.innerHTML = `
      <a href="${item.url}" class="card-link">
        <div class="card-image">
          <img src="${item.cover_url}" alt="${item.title}" loading="lazy">
        </div>
        <div class="card-title-overlay">
          <span class="card-title">${item.title}</span>
          <div class="card-subtitle">
            ${statusText}
          </div>
          <div class="card-date">
            ${item.date_formatted}
          </div>
        </div>
      </a>
      <div class="status-overlay status-${item.status}"></div>
      <button class="edit-card-btn">⋯</button>
    `;
    
    return card;
  }

  function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    
    if (diffYears > 0) return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
    if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
    if (diffWeeks > 0) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  function getStatusText(status, timeAgo) {
    if (status === 'on_hold') return `Paused ${timeAgo}`;
    if (status === 'ongoing') return `Started ${timeAgo}`;
    return `${status.charAt(0).toUpperCase() + status.slice(1)} ${timeAgo}`;
  }

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

  // Search filter
  let searchTimeout;
  searchInput.addEventListener("input", e => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value;
      resetAndLoad();
    }, 300);
  });

  // Year filter
  yearBtns.forEach(btn => btn.addEventListener("click", () => {
    yearBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedYear = btn.dataset.year;
    selectedMonth = "all";
    monthBtns.forEach(b => b.classList.remove("active"));
    resetAndLoad();
  }));

  // Month filter
  monthBtns.forEach(btn => btn.addEventListener("click", () => {
    monthBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedMonth = btn.dataset.month;
    resetAndLoad();
  }));

  // Type filter
  typeBtns.forEach(btn => btn.addEventListener("click", () => {
    typeBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedType = btn.dataset.type;
    resetAndLoad();
  }));

  // Status filter
  statusBtns.forEach(btn => btn.addEventListener("click", () => {
    statusBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedStatus = btn.dataset.status;
    resetAndLoad();
  }));

  // Sort buttons
  sortAscBtn.addEventListener("click", () => {
    sortOrder = "asc";
    sortAscBtn.classList.add("active");
    sortDescBtn.classList.remove("active");
    resetAndLoad();
  });

  sortDescBtn.addEventListener("click", () => {
    sortOrder = "desc";
    sortDescBtn.classList.add("active");
    sortAscBtn.classList.remove("active");
    resetAndLoad();
  });

  // Custom year input
  customYearInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      selectedYear = customYearInput.value;
      selectedMonth = "all";
      monthBtns.forEach(b => b.classList.remove("active"));
      resetAndLoad();
    }
  });

  // Date range filter
  startDateInput.addEventListener("change", e => {
    startDate = e.target.value || null;
    resetAndLoad();
  });

  endDateInput.addEventListener("change", e => {
    endDate = e.target.value || null;
    resetAndLoad();
  });

  // Initial states
  yearBtns[0]?.classList.add("active");
  typeBtns[0]?.classList.add("active");
  statusBtns[0]?.classList.add("active");
  sortDescBtn?.classList.add("active");

  // === GLOBAL EDIT MODAL FUNCTION ===
  window.openEditModal = function(element) {
    const itemId = element.dataset.id;
    const mediaType = element.dataset.mediaType;
    const coverUrl = element.dataset.coverUrl;
    const bannerUrl = element.dataset.bannerUrl;
    const title = element.dataset.title;

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

  // === EVENT DELEGATION FOR EDIT BUTTONS ===
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

  // Initial load
  loadItems(1, true);
});

// Apply theme on page load
const theme = document.body.getAttribute('data-theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);

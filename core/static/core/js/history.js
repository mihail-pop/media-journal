document.addEventListener("DOMContentLoaded", () => {
  const cards = [...document.querySelectorAll(".card")];
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

  let selectedYear = "all";
  let selectedMonth = "all";
  let selectedType = "all";
  let selectedStatus = "all";
  let searchQuery = "";
  let sortOrder = "desc"; // newest first
  let startDate = null;
  let endDate = null;

  function filterCards() {
    let visibleCount = 0;

    cards.forEach(card => {
      const title = card.dataset.title?.toLowerCase() || "";
      const year = card.dataset.year;
      const month = card.dataset.month;
      const date = card.dataset.date; // YYYY-MM-DD
      const type = card.dataset.mediaType;
      const status = card.dataset.status;

      let visible = true;

      if (selectedYear !== "all") visible = visible && year === String(selectedYear);
      if (selectedMonth !== "all") visible = visible && month === String(selectedMonth).padStart(2, '0');
      if (selectedType !== "all") visible = visible && type === selectedType;
      if (selectedStatus !== "all") visible = visible && status === selectedStatus;
      if (searchQuery) visible = visible && title.includes(searchQuery.toLowerCase());

      if (startDate || endDate) {
        if (date) {
          const d = new Date(date);
          if (startDate && d < new Date(startDate)) visible = false;
          if (endDate && d > new Date(endDate)) visible = false;
        }
      }

      card.style.display = visible ? "" : "none";
      if (visible) visibleCount++;
    });

    // Show/hide month filter
    monthFilterDiv.style.display = selectedYear !== "all" ? "flex" : "none";

    // Show/hide "No items found" message
    if (noItemsMsg) {
      noItemsMsg.style.display = visibleCount === 0 ? "block" : "none";
    }
  }

  function sortCards() {
    const container = document.getElementById("card-view");
    const visibleCards = [...cards].filter(c => c.style.display !== "none");

    visibleCards.sort((a, b) => {
      const da = new Date(a.dataset.date);
      const db = new Date(b.dataset.date);
      return sortOrder === "asc" ? da - db : db - da;
    });

    visibleCards.forEach(c => container.appendChild(c));
  }

  function applyFilters() {
    filterCards();
    sortCards();
  }

  // Search filter
  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value;
    applyFilters();
  });

  // Year filter
  yearBtns.forEach(btn => btn.addEventListener("click", () => {
    yearBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedYear = btn.dataset.year;
    selectedMonth = "all";
    monthBtns.forEach(b => b.classList.remove("active"));
    applyFilters();
  }));

  // Month filter
  monthBtns.forEach(btn => btn.addEventListener("click", () => {
    monthBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedMonth = btn.dataset.month;
    applyFilters();
  }));

  // Type filter
  typeBtns.forEach(btn => btn.addEventListener("click", () => {
    typeBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedType = btn.dataset.type;
    applyFilters();
  }));

  // Status filter
  statusBtns.forEach(btn => btn.addEventListener("click", () => {
    statusBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedStatus = btn.dataset.status;
    applyFilters();
  }));

  // Sort buttons
  sortAscBtn.addEventListener("click", () => {
    sortOrder = "asc";
    sortAscBtn.classList.add("active");
    sortDescBtn.classList.remove("active");
    sortCards();
  });

  sortDescBtn.addEventListener("click", () => {
    sortOrder = "desc";
    sortDescBtn.classList.add("active");
    sortAscBtn.classList.remove("active");
    sortCards();
  });

  // Custom year input
  customYearInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      selectedYear = customYearInput.value;
      selectedMonth = "all";
      monthBtns.forEach(b => b.classList.remove("active"));
      applyFilters();
    }
  });

  // Date range filter
  startDateInput.addEventListener("change", e => {
    startDate = e.target.value || null;
    applyFilters();
  });

  endDateInput.addEventListener("change", e => {
    endDate = e.target.value || null;
    applyFilters();
  });

  // Initial states
  yearBtns[0]?.classList.add("active");
  typeBtns[0]?.classList.add("active");
  statusBtns[0]?.classList.add("active");
  sortDescBtn?.classList.add("active");

  // Initial run
  applyFilters();
});

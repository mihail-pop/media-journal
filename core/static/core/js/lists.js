document.addEventListener("DOMContentLoaded", function () {
  const cardView = document.getElementById("card-view");
  const listView = document.getElementById("list-view");

  const cardBtn = document.getElementById("card-view-btn");
  const listBtn = document.getElementById("list-view-btn");

  const filterButtons = document.querySelectorAll(".filter-btn");
  const searchInput = document.getElementById("search-input");

  const bannerImg = document.getElementById("rotating-banner");
  let bannerPool = [];

  const mediaType = document.body.dataset.mediaType || "default";
  const filterKey = `listFilterStatus_${mediaType}`; // e.g., listFilterStatus_movie
  const viewKey = `listViewType_${mediaType}`; // new key for view mode

  // === FILTER STATE ===
  let currentStatus = sessionStorage.getItem(filterKey) || "all";
  let currentSearch = "";
  let currentView = sessionStorage.getItem(viewKey) || "card"; // default card view

  // === Set active filter button ===
  const matchingBtn = document.querySelector(`.filter-btn[data-filter="${currentStatus}"]`);
  if (matchingBtn) {
    filterButtons.forEach(b => b.classList.remove("active"));
    matchingBtn.classList.add("active");
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
    applyFilters();
  });

  listBtn.addEventListener("click", () => {
    listBtn.classList.add("active");
    cardBtn.classList.remove("active");
    listView.style.display = "block";
    cardView.style.display = "none";
    currentView = "list";
    sessionStorage.setItem(viewKey, currentView);
    applyFilters();
  });

  // === STATUS FILTER BUTTONS ===
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatus = btn.dataset.filter;
      sessionStorage.setItem(filterKey, currentStatus); // Save filter scoped by media type
      applyFilters();
    });
  });

  // === SEARCH INPUT ===
  searchInput.addEventListener("input", () => {
    currentSearch = searchInput.value.trim().toLowerCase();
    applyFilters();
  });

  // === FILTER FUNCTION ===
  function applyFilters() {
    const view = cardView.style.display === "none" ? listView : cardView;
    const isCardView = view === cardView;
    const sectionGroups = view.querySelectorAll(".status-group");

    sectionGroups.forEach(group => {
      const status = group.dataset.status;
      const items = isCardView
        ? [...group.querySelectorAll(".card")]
        : [...group.querySelectorAll(".list-row")];

      const visibleItems = items.filter(item => {
        const itemStatus = item.dataset.status;
        const title = item.dataset.title.toLowerCase();
        const matchesStatus = currentStatus === "all" || itemStatus === currentStatus;
        const matchesSearch = title.includes(currentSearch);
        return matchesStatus && matchesSearch;
      });

      // Show/hide items
      items.forEach(item => item.style.display = "none");
      visibleItems.forEach(item => item.style.display = "");

      // Show/hide the whole group
      group.style.display = visibleItems.length > 0 ? "" : "none";
    });
  }

  applyFilters();

  // Banner rotator code unchanged ...
  let firstLoad = true;

  function initBannerRotator() {
    const cards = [...document.querySelectorAll(".card")];

    bannerPool = cards
      .map(card => {
        const bannerUrl = card.dataset.bannerUrl;
        const notes = card.dataset.notes?.trim();
        return bannerUrl && !bannerUrl.includes("placeholder")
          ? { bannerUrl, notes }
          : null;
      })
      .filter(Boolean);

    if (bannerPool.length === 0) return;

    updateBanner();
    setInterval(updateBanner, 30000);
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

  initBannerRotator();
});

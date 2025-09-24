document.addEventListener("DOMContentLoaded", function () {

  const cardView = document.getElementById("card-view");
  const listView = document.getElementById("list-view");

  const cardBtn = document.getElementById("card-view-btn");
  const listBtn = document.getElementById("list-view-btn");

  const filterButtons = document.querySelectorAll(".filter-btn");
  const typeFilterButtons = document.querySelectorAll(".type-filter-btn");
  const searchInput = document.getElementById("search-input");

  const bannerImg = document.getElementById("rotating-banner");
  let bannerPool = [];

  const mediaType = document.body.dataset.mediaType || "default";
  const filterKey = `listFilterStatus_${mediaType}`; // e.g., listFilterStatus_movie
  const viewKey = `listViewType_${mediaType}`; // new key for view mode
  const typeKey = `listTypeFilter_${mediaType}`; // new key for type filter

  // === FILTER STATE ===
  let currentStatus = sessionStorage.getItem(filterKey) || "all";
  let currentSearch = "";
  let currentView = sessionStorage.getItem(viewKey) || "card"; // default card view
  let currentType = localStorage.getItem(typeKey) || "both"; // default both
  
  // Check if type filter buttons exist (seasons present)
  const hasTypeButtons = document.querySelectorAll(".type-filter-btn").length > 0;
  if (!hasTypeButtons && currentType !== "both") {
    currentType = "both";
    localStorage.setItem(typeKey, currentType);
  }

  // === Set active filter buttons ===
  const matchingBtn = document.querySelector(`.filter-btn[data-filter="${currentStatus}"]`);
  if (matchingBtn) {
    filterButtons.forEach(b => b.classList.remove("active"));
    matchingBtn.classList.add("active");
  }
  
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

  // === TYPE FILTER BUTTONS ===
  typeFilterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      typeFilterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      localStorage.setItem(typeKey, currentType);
      applyFilters();
    });
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
        
        // Type filtering: check if source_id contains '_s' to determine if it's a season
        const sourceId = item.dataset.sourceId || '';
        const isSeason = sourceId.includes('_s');
        let matchesType = true;
        if (currentType === "shows") {
          matchesType = !isSeason;
        } else if (currentType === "seasons") {
          matchesType = isSeason;
        }
        // currentType === "both" matches everything
        
        return matchesStatus && matchesSearch && matchesType;
      });

      // Show/hide items
      items.forEach(item => item.style.display = "none");
      visibleItems.forEach(item => item.style.display = "");

      // Show/hide the whole group
      group.style.display = visibleItems.length > 0 ? "" : "none";
    });

    const statusBtnContainer = document.getElementById("check-status-container");
if (statusBtnContainer) {
  statusBtnContainer.style.display = (currentStatus === "planned") ? "block" : "none";
}

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
          ? { bannerUrl, notes: notes === "None" ? "" : notes }
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



document.getElementById("check-status-btn").addEventListener("click", () => {
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
            else dot.style.backgroundColor = "gray"; // for Cancelled or unknown
          }

          card.appendChild(dot);
        }
      }
    });
});
document.addEventListener("DOMContentLoaded", function () {
  const cardView = document.getElementById("card-view");
  const listView = document.getElementById("list-view");

  const cardBtn = document.getElementById("card-view-btn");
  const listBtn = document.getElementById("list-view-btn");

  const filterButtons = document.querySelectorAll(".filter-btn");
  const searchInput = document.getElementById("search-input");

  const bannerImg = document.getElementById("rotating-banner");
  let bannerPool = [];

  // === VIEW TOGGLE ===
  cardBtn.addEventListener("click", () => {
    cardBtn.classList.add("active");
    listBtn.classList.remove("active");
    cardView.style.display = "block";
    listView.style.display = "none";
    applyFilters();
  });

  listBtn.addEventListener("click", () => {
    listBtn.classList.add("active");
    cardBtn.classList.remove("active");
    listView.style.display = "block";
    cardView.style.display = "none";
    applyFilters();
  });

  // === FILTER STATE ===
  let currentStatus = "all";
  let currentSearch = "";

  // === STATUS FILTER BUTTONS ===
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatus = btn.dataset.filter;
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
    // Immediately show banner without fade
    bannerImg.src = bannerUrl;
    bannerImg.style.opacity = 1;

    if (quoteBox) {
      quoteBox.innerText = notes ? `“${notes}”\n\n~You` : "";
      quoteBox.style.display = notes ? "block" : "none";
      quoteBox.style.opacity = notes ? 1 : 0;
    }

    firstLoad = false;  // next time fade will apply
    return;
  }

  // Fade out
  bannerImg.style.opacity = 0;
  if (quoteBox) quoteBox.style.opacity = 0;

  setTimeout(() => {
    bannerImg.src = bannerUrl;
    if (quoteBox) {
      quoteBox.innerText = notes ? `“${notes}”\n\n~You` : "";
      quoteBox.style.display = notes ? "block" : "none";
      quoteBox.style.opacity = notes ? 1 : 0;
    }
    // Fade back in
    bannerImg.style.opacity = 1;
  }, 1000);
}

initBannerRotator();
});

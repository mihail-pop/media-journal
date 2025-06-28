document.addEventListener("DOMContentLoaded", function () {
  const bannerImg = document.getElementById("rotating-banner");
  const quoteBox = document.querySelector(".banner-quote");

  let bannerPool = [];

  function initBannerRotator() {
    const cards = [...document.querySelectorAll(".card")];

    bannerPool = cards
      .map(card => {
        const bannerUrl = card.dataset.bannerUrl;
        const notes = card.dataset.notes?.trim();
        return bannerUrl && !bannerUrl.includes("fallback")
          ? { bannerUrl, notes }
          : null;
      })
      .filter(Boolean);

    if (bannerPool.length === 0) return;

    updateBanner();
    setInterval(updateBanner, 30000); // rotate every 30 seconds
  }

  function updateBanner() {
    if (bannerPool.length === 0) return;

    const random = Math.floor(Math.random() * bannerPool.length);
    const { bannerUrl, notes } = bannerPool[random];

    // Fade out
    bannerImg.style.opacity = 0;
    if (quoteBox) quoteBox.style.opacity = 0;

    setTimeout(() => {
      bannerImg.src = bannerUrl;

      if (quoteBox) {
        if (notes) {
          quoteBox.innerText = `“${notes}”\n\n~You`;
          quoteBox.style.display = "block";
        } else {
          quoteBox.innerText = "";
          quoteBox.style.display = "none";
        }
        quoteBox.style.opacity = notes ? 1 : 0;
      }

      bannerImg.style.opacity = 1;
    }, 1000); // match CSS transition time
  }

  initBannerRotator();
});

function openFavoritesOverlay(category) {
  const id = `overlay-${slugify(category)}`;
  document.getElementById(id)?.classList.remove('hidden');
}

function closeFavoritesOverlay(categorySlug) {
  const id = `overlay-${categorySlug}`;
  document.getElementById(id)?.classList.add('hidden');
}

// Helper to match Django's slugify (simplified version)
function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, '-');
}

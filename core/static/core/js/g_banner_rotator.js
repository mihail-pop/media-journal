(() => {
  window.createBannerRotator = function ({ image, quote, banners, updateMediaType = false }) {
    if (!image || !banners.length) return () => {};

    let stopped = false;
    let rotating = false;
    let revision = 0;
    const initialSrc = image.getAttribute('src');
    let firstLoad = !initialSrc || initialSrc.includes('placeholder.png');

    function setOpacity(value) {
      image.style.opacity = value;
      if (quote) quote.style.opacity = value;
    }

    function fadeTo(value) {
      return new Promise(resolve => {
        let timeout;
        function finish() {
          clearTimeout(timeout);
          image.removeEventListener('transitionend', onTransition);
          image.removeEventListener('transitioncancel', onTransition);
          resolve();
        }
        function onTransition(event) {
          if (event.target === image && event.propertyName === 'opacity') finish();
        }
        image.addEventListener('transitionend', onTransition);
        image.addEventListener('transitioncancel', onTransition);
        // Preserve the existing one-second CSS fade, with a fallback if the
        // browser does not emit a transition event (for example, in a hidden tab).
        timeout = setTimeout(finish, 1100);
        void image.offsetWidth;
        setOpacity(value);
      });
    }

    function prepareNext() {
      const currentSrc = image.getAttribute('src');
      const candidates = banners.filter(banner => banner.bannerUrl && banner.bannerUrl !== currentSrc);
      if (!candidates.length) return null;
      const banner = candidates[Math.floor(Math.random() * candidates.length)];
      return (async () => {
        const preparedImage = new Image();
        preparedImage.decoding = 'async';
        await new Promise((resolve, reject) => {
          preparedImage.onload = resolve;
          preparedImage.onerror = reject;
          preparedImage.src = banner.bannerUrl;
        });
        if (typeof preparedImage.decode === 'function') await preparedImage.decode();
        return { banner, preparedImage };
      })().catch(() => null);
    }

    // Prepare one upcoming image 10 seconds into each 30-second cycle.
    let prepared = null;
    let preloadTimeout;
    function schedulePreload() {
      clearTimeout(preloadTimeout);
      preloadTimeout = setTimeout(() => {
        preloadTimeout = null;
        if (!stopped && !rotating && !document.hidden && !prepared) prepared = prepareNext();
      }, 10000);
    }

    async function rotate() {
      if (stopped || rotating || document.hidden) return;
      // Also covers an initial placeholder or a preload skipped in a hidden tab.
      if (!prepared) prepared = prepareNext();
      if (!prepared) return;
      rotating = true;
      const currentRevision = revision;
      const interrupted = () => stopped || revision !== currentRevision || document.hidden;
      let swapped = false;
      let previous;
      try {
        const next = await prepared;
        if (interrupted()) return;
        if (!next) {
          prepared = null;
          return;
        }
        if (!firstLoad) await fadeTo('0');
        if (interrupted()) return;

        previous = {
          src: image.getAttribute('src'), alt: image.alt,
          text: quote?.innerText, display: quote?.style.display,
        };
        swapped = true;
        image.src = next.banner.bannerUrl;
        if (updateMediaType) image.alt = next.banner.media_type;
        if (quote) {
          quote.innerText = next.banner.notes ? `“${next.banner.notes}”\n\n~You` : '';
          quote.style.display = next.banner.notes ? 'block' : 'none';
        }
        // Also wait for the displayed element itself before fading it in.
        if (typeof image.decode === 'function') await image.decode();
        if (interrupted()) return;

        if (firstLoad) {
          firstLoad = false;
          setOpacity('1');
        } else {
          await fadeTo('1');
        }
      } catch (error) {
        if (!stopped) {
          if (swapped) {
            image.src = previous.src;
            image.alt = previous.alt;
            if (quote) {
              quote.innerText = previous.text;
              quote.style.display = previous.display;
            }
          }
          setOpacity('1');
        }
      } finally {
        if (swapped && !stopped) prepared = null;
        rotating = false;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        // Cancel an in-progress fade so returning to the tab cannot apply a
        // delayed swap from an earlier rotation.
        revision++;
        setOpacity('1');
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = setInterval(() => {
      schedulePreload();
      return rotate();
    }, 30000);
    schedulePreload();
    if (firstLoad) rotate();

    return () => {
      stopped = true;
      revision++;
      clearInterval(interval);
      clearTimeout(preloadTimeout);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      setOpacity('1');
    };
  };
})();

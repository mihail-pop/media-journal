(() => {
  let dialog, viewer, preview, caption, fullscreen, source;
  let closing = false;

  async function closeViewer() {
    if (!dialog?.open || closing) return;
    closing = true;
    if (document.fullscreenElement === viewer) {
      try { await document.exitFullscreen(); } catch (_) {}
    }
    dialog.close();
  }

  function updateFullscreen() {
    const active = document.fullscreenElement === viewer;
    const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreen.setAttribute('aria-label', label);
    fullscreen.setAttribute('aria-pressed', String(active));
    fullscreen.title = label;
    fullscreen.hidden = !document.fullscreenEnabled || !viewer.requestFullscreen;
  }

  function createViewer() {
    dialog = document.createElement('dialog');
    dialog.id = 'docs-screenshot-viewer';
    dialog.setAttribute('aria-labelledby', 'docs-screenshot-caption');
    dialog.innerHTML = `
      <div class="docs-screenshot-viewer__content">
        <div class="docs-screenshot-viewer__toolbar">
          <span id="docs-screenshot-caption"></span>
          <button type="button" class="docs-screenshot-viewer__fullscreen" aria-label="Enter fullscreen" aria-pressed="false" title="Enter fullscreen">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>
          </button>
          <button type="button" class="docs-screenshot-viewer__close" aria-label="Close screenshot" title="Close screenshot" autofocus>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div class="docs-screenshot-viewer__stage"><img class="docs-screenshot-viewer__image" alt=""></div>
      </div>`;
    document.body.appendChild(dialog);
    viewer = dialog.querySelector('.docs-screenshot-viewer__content');
    preview = dialog.querySelector('img');
    caption = dialog.querySelector('#docs-screenshot-caption');
    fullscreen = dialog.querySelector('.docs-screenshot-viewer__fullscreen');
    const stage = dialog.querySelector('.docs-screenshot-viewer__stage');

    dialog.querySelector('.docs-screenshot-viewer__close').addEventListener('click', closeViewer);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
    dialog.addEventListener('click', event => {
      if ([dialog, viewer, stage].includes(event.target)) closeViewer();
    });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('docs-screenshot-open');
      preview.removeAttribute('src');
      if (source?.isConnected) {
        source.setAttribute('aria-expanded', 'false');
        source.focus({ preventScroll: true });
      }
      source = null;
      closing = false;
    });
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement === viewer) await document.exitFullscreen();
        else await viewer.requestFullscreen();
      } catch (_) {
        // The enlarged viewer still works when fullscreen is unavailable.
        fullscreen.hidden = true;
      }
    });
    document.addEventListener('fullscreenchange', updateFullscreen);
  }

  function openViewer(image) {
    if (closing) return;
    if (!dialog.showModal) {
      window.open(image.currentSrc || image.src, '_blank', 'noopener');
      return;
    }
    source = image;
    preview.src = image.currentSrc || image.src;
    preview.alt = image.alt || 'Screenshot';
    caption.textContent = image.alt || 'Screenshot';
    source.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('docs-screenshot-open');
    updateFullscreen();
    dialog.showModal();
  }

  function initialize() {
    const images = document.querySelectorAll('img.docs-screenshot');
    if (!images.length) return;
    if (!dialog) createViewer();
    images.forEach(image => {
      if (image.dataset.viewerReady) return;
      image.dataset.viewerReady = 'true';
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-haspopup', 'dialog');
      image.setAttribute('aria-controls', dialog.id);
      image.setAttribute('aria-expanded', 'false');
      image.setAttribute('aria-label', `Enlarge ${image.alt || 'screenshot'}`);
      image.addEventListener('click', () => openViewer(image));
      image.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openViewer(image);
        }
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
  if (typeof document$ !== 'undefined') document$.subscribe(() => { closeViewer(); initialize(); });
})();

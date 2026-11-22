// Formatting and embedded media for Community posts, comments and previews.
(() => {
  const types = { movie: 'Movie', tv: 'TV Show', anime: 'Anime', manga: 'Manga', game: 'Game', book: 'Book', music: 'Music' };
  const sources = { movie: ['tmdb'], tv: ['tmdb'], anime: ['anilist', 'mal'], manga: ['anilist', 'mal'], game: ['igdb'], book: ['openlib'], music: ['musicbrainz'] };
  const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function httpUrl(value) {
    try {
      const url = new URL(String(value).trim());
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  }

  function parseImgur(value) {
    try {
      const text = String(value).trim();
      const url = new URL(text.includes('://') ? text : `https://${text}`);
      if (!httpUrl(url.href) || !['imgur.com', 'www.imgur.com', 'm.imgur.com', 'i.imgur.com'].includes(url.hostname)) throw new Error();
      if (/^\/(a|gallery)\//.test(url.pathname)) return { error: 'Use the image’s own link rather than an album or gallery link.' };
      const match = url.pathname.match(/^\/([a-zA-Z0-9]+)(\.(?:png|jpe?g|gif|webp))?\/?$/i);
      if (!match) return { error: 'Use a direct JPG, PNG, GIF or WebP image link from Imgur.' };
      return { url: `https://i.imgur.com/${match[1]}${match[2] || '.png'}` };
    } catch (_) { return { error: 'Please enter an Imgur image link.' }; }
  }

  function mediaUrl(type, source, sourceId) {
    if (!sources[type]?.includes(source) || !sourceId || String(sourceId).startsWith('custom_')) return null;
    const id = String(sourceId);
    const season = type === 'tv' && source === 'tmdb' && id.match(/^(\d+)_s(\d+)$/);
    if (season) return `/tmdb/season/${season[1]}/${season[2]}/`;
    return `/${source}/${type}/${encodeURIComponent(source === 'openlib' ? id.replace(/^\/works\//, '') : id)}/`;
  }

  function mediaIdentity(item) {
    const ids = item.provider_ids || {};
    const source = ids[item.source] ? item.source : Object.keys(ids).find(key => ids[key]);
    const sourceId = ids[source];
    return mediaUrl(item.media_type, source, sourceId) ? { source, sourceId } : null;
  }

  function mediaTag(item) {
    const identity = mediaIdentity(item);
    if (!identity) return null;
    const title = String(item.title).replace(/:/g, '&#58;').replace(/\]/g, '&#93;').replace(/\s+/g, ' ');
    return `[MEDIA:${item.media_type}:${identity.source}:${identity.sourceId}:${title}:${item.status || 'planned'}]`;
  }

  function startSeconds(value) {
    const text = String(value || '0');
    if (/^\d+$/.test(text)) return Math.min(Number(text), 604800);
    const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return match ? Math.min(Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0), 604800) : 0;
  }

  function videoMarkup(id, start) {
    return `<div class="community-video" data-video-id="${id}" data-start="${start}"><img class="video-thumbnail" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="YouTube video preview" loading="lazy"><span class="video-preview-play" aria-hidden="true">▶</span></div>`;
  }

  function galleryMarkup(images) {
    const arrows = images.length > 1 ? '<button type="button" class="gallery-prev" aria-label="Previous image">‹</button><button type="button" class="gallery-next" aria-label="Next image">›</button><span class="gallery-counter">1 / ' + images.length + '</span>' : '';
    return `<div class="community-image-gallery" data-images="${escape(JSON.stringify(images))}"><img src="${escape(images[0])}" alt="Shared image" loading="lazy">${arrows}</div>`;
  }

  function render(value) {
    if (!value) return '';
    let text = String(value).replace(/[\uE000\uE001]/g, '');
    const blocks = [];
    const keep = html => `\uE000${blocks.push(html) - 1}\uE001`;
    const images = Array.from(text.matchAll(/\[IMG:([^\]]+)\]/g), match => parseImgur(match[1])).filter(image => image.url).map(image => image.url);
    let galleryShown = false;
    text = text.replace(/\[IMG:([^\]]+)\]/g, (match, url) => {
      const image = parseImgur(url);
      if (image.error) return keep(`<span class="content-warning">${escape(image.error)}</span>`);
      if (galleryShown) return '';
      galleryShown = true;
      return keep(galleryMarkup(images));
    });
    text = text.replace(/\[MEDIA:([^:]+):([^:]+):([^:]+):([^\]]+?):([^:\]]+)\]/g, (match, type, source, id, title) => {
      const url = mediaUrl(type, source, id);
      const name = title.replace(/&#58;/g, ':').replace(/&#93;/g, ']');
      return keep(url ? `<a class="community-media-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(name)}</a>` : escape(name));
    });
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, title, value) => {
      const url = httpUrl(value);
      return url ? keep(`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(title)}</a>`) : match;
    });
    let videos = 0;
    text = text.replace(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?[^\s<>]*?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})([^\s<>\]\uE000\uE001]*)/g, (match, id) => {
      const url = httpUrl(match.replace(/[.,!?)]+$/, ''));
      if (!url) return match;
      const parsed = new URL(url);
      const start = startSeconds(parsed.searchParams.get('t') || parsed.searchParams.get('start'));
      videos++;
      return keep(videos <= 2 ? videoMarkup(id, start) : `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Video ${videos}</a>`);
    });
    return escape(text).replace(/\r?\n/g, '<br>').replace(/\uE000(\d+)\uE001/g, (_, index) => blocks[Number(index)] || '');
  }

  function loadVideo(frame) {
    if (!frame.isConnected || frame.dataset.loading) return;
    frame.dataset.loading = 'true';
    videoObserver?.unobserve(frame);
    const iframe = document.createElement('iframe');
    iframe.title = 'YouTube video player';
    iframe.allowFullscreen = true;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.referrerPolicy = 'origin-when-cross-origin';
    iframe.addEventListener('load', () => frame.classList.add('is-ready'), { once: true });
    iframe.src = `https://www.youtube.com/embed/${frame.dataset.videoId}?start=${Number(frame.dataset.start) || 0}&rel=0`;
    frame.appendChild(iframe);
  }

  // Warm the player before it enters view, retaining its thumbnail until it loads.
  const videoObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) loadVideo(entry.target); });
  }, { rootMargin: '900px 0px' }) : null;

  function initialize(container) {
    container.querySelectorAll('.community-video:not([data-observed])').forEach(frame => {
      frame.dataset.observed = 'true';
      frame.addEventListener('click', () => loadVideo(frame));
      if (videoObserver) videoObserver.observe(frame);
      else loadVideo(frame);
    });
    container.querySelectorAll('.community-image-gallery:not([data-ready])').forEach(gallery => {
      gallery.dataset.ready = 'true';
      const images = JSON.parse(gallery.dataset.images);
      let index = 0;
      gallery.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
        index = (index + (button.classList.contains('gallery-next') ? 1 : -1) + images.length) % images.length;
        gallery.querySelector('img').src = images[index];
        gallery.querySelector('.gallery-counter').textContent = `${index + 1} / ${images.length}`;
      }));
    });
  }

  function release(container) {
    container.querySelectorAll('.community-video').forEach(frame => videoObserver?.unobserve(frame));
  }

  window.CommunityContent = { escape, httpUrl, parseImgur, mediaUrl, mediaTag, mediaIdentity, render, initialize, release, types };
})();

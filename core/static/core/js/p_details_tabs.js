document.addEventListener('DOMContentLoaded', () => {
  const stateElement = document.getElementById('details-tabs-state');
  if (!stateElement) return;
  const state = JSON.parse(stateElement.textContent);
  const nav = document.querySelector('.details-tabs');
  const tabs = [...nav.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('.details-panel')];
  const CACHE_KEY = 'detailsSectionsCacheV4';
  try {
    sessionStorage.removeItem('detailsSectionsCacheV1');
    sessionStorage.removeItem('detailsSectionsCacheV2');
    sessionStorage.removeItem('detailsSectionsCacheV3');
  } catch (_) { /* Storage disabled. */ }
  const CACHE_TTL = 20 * 60 * 1000;
  const CACHE_ITEMS = 20;
  const CACHE_BYTES = 2 * 1024 * 1024;
  const identity = [state.source, state.media_type, state.id, state.artist_id, state.album_id].join(':');
  let data = null;
  let expires = 0;
  let active = 'overview';
  let inFlight = null;
  const pageRequests = new Map();
  const rendered = new Set();
  let observer = null;
  const playingTrailers = new Map();
  const trailerTitleRequests = new Map();
  const trailerTitleControllers = new Set();

  function readCache() {
    try {
      const cache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
      return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
    } catch (_) { return {}; }
  }

  function storeCache() {
    if (!data || data.errors || !state.api_enabled) return;
    const cache = readCache();
    const now = Date.now();
    for (const key of Object.keys(cache)) {
      if (!cache[key] || cache[key].expires <= now) delete cache[key];
    }
    cache[identity] = { data, expires, used: now };
    const oldest = () => Object.keys(cache).sort((a, b) => cache[a].used - cache[b].used)[0];
    while (Object.keys(cache).length > CACHE_ITEMS) delete cache[oldest()];
    let serialized = JSON.stringify(cache);
    while (serialized.length * 2 > CACHE_BYTES && Object.keys(cache).length) {
      delete cache[oldest()];
      serialized = JSON.stringify(cache);
    }
    try { sessionStorage.setItem(CACHE_KEY, serialized); }
    catch (_) {
      // Other app preferences may already fill storage. Keep the current
      // bundle in memory; storage availability must not break the tabs.
      try { sessionStorage.removeItem(CACHE_KEY); } catch (_) { /* Storage disabled. */ }
    }
  }

  const cached = readCache()[identity];
  if (state.seed) {
    data = state.seed;
    expires = Date.now() + CACHE_TTL;
    storeCache();
  } else if (cached && cached.expires > Date.now() && cached.data) {
    data = cached.data;
    expires = cached.expires;
    storeCache();
  }

  window.DetailsSections = { load: ensureBundle, invalidate() {
    const cache = readCache();
    delete cache[identity];
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (_) { /* Storage disabled. */ }
    data = null;
    expires = 0;
    rendered.clear();
  } };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeLink(value) {
    if (typeof value !== 'string') return '';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username ? url.href : '';
    } catch (_) { return ''; }
  }

  function requestUrl(section, page) {
    const params = new URLSearchParams({ media_type: state.media_type, source: state.source,
      item_id: state.id });
    if (state.artist_id) params.set('artist_id', state.artist_id);
    if (state.album_id) params.set('album_id', state.album_id);
    if (section) { params.set('section', section); params.set('page', page); }
    return '/api/get-extra-info/?' + params;
  }

  async function ensureBundle() {
    if (data && (expires > Date.now() || !state.api_enabled)) return data;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      nav.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch(requestUrl());
        const fresh = await ApiFeedback.readResponse(response, state.source);
        if (!Array.isArray(fresh.information) || !fresh.pagination) throw new Error('Invalid section response.');
        data = fresh;
        expires = Date.now() + CACHE_TTL;
        rendered.clear();
        storeCache();
        document.dispatchEvent(new CustomEvent('details-sections-loaded', { detail: data }));
        return data;
      } finally {
        nav.removeAttribute('aria-busy');
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function information(container, bundle, preserveOrder = false) {
    container.replaceChildren();
    const source = bundle.information?.length ? bundle : state.local;
    const surface = element('div', 'details-information-surface');
    container.appendChild(surface);
    if (bundle.score && Number.isFinite(bundle.score.value)) {
      const score = element('div', 'details-api-score');
      score.dataset.provider = bundle.score.provider.toLowerCase();
      const label = element('span', 'details-api-score-provider', bundle.score.provider);
      const value = element('span', 'details-api-score-value', String(bundle.score.value));
      value.appendChild(element('small', '', '/' + bundle.score.maximum));
      const meter = element('meter', 'details-api-score-meter');
      meter.min = 0;
      meter.max = bundle.score.maximum;
      meter.value = bundle.score.value;
      meter.setAttribute('aria-label', `${bundle.score.provider} score: ${bundle.score.value} out of ${bundle.score.maximum}`);
      score.append(label, value, meter);
      surface.appendChild(score);
    }
    const list = element('dl', 'details-information-list');
    const rows = [...(source.information || [])];
    if (!preserveOrder) rows.sort((a, b) => Number(!!(a.values || a.links)) - Number(!!(b.values || b.links)));
    for (const row of rows) {
      const pair = element('div', 'details-information-row');
      if ((row.values?.length || 0) > 4 || (row.links?.length || 0) > 3) pair.classList.add('details-information-wide');
      pair.appendChild(element('dt', '', row.label));
      const value = element('dd', '', row.values ? '' : row.value || '');
      for (const part of row.values || []) value.appendChild(element('span', 'details-information-tag', part));
      for (const link of row.links || []) {
        const url = safeLink(link.url);
        if (!url) continue;
        const anchor = element('a', '', link.title);
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        value.appendChild(anchor);
      }
      if (row.detail) value.appendChild(element('span', 'details-information-detail', row.detail));
      pair.appendChild(value);
      list.appendChild(pair);
    }
    surface.appendChild(list);
    if (!list.children.length && !bundle.score) {
      surface.remove();
      container.appendChild(element('p', 'details-empty', 'No additional information available.'));
    }
  }

  function musicInformation(container) {
    container.replaceChildren();
    const surface = element('div', 'details-music-information');
    for (const [key, label] of [['tracks', 'Album'], ['singles', 'Singles']]) {
      const entries = data[key] || [];
      if (!entries.length) continue;
      const section = element('section', 'details-music-information-section');
      const heading = element('h3', '', label);
      if (key === 'tracks' && data.album_title) heading.appendChild(element('span', 'details-music-album-title', data.album_title));
      section.appendChild(heading);
      const list = element('div', 'details-track-list');
      for (const entry of entries) list.appendChild(card(entry, key));
      section.appendChild(list);
      surface.appendChild(section);
    }
    container.appendChild(surface);
    if (!surface.children.length) container.appendChild(element('p', 'details-empty', 'No album tracks or singles available.'));
  }

  function refreshTabVisibility() {
    // Saved items use the stored relation-availability flag. Other saved tabs
    // remain visible, including when a provider currently has no content.
    if (state.saved || !data) return;
    for (const tab of tabs) {
      const key = tab.dataset.tab;
      let available = key === 'overview' || !!data.errors?.[key];
      if (key === 'information') available ||= state.media_type === 'music'
        ? !!(data.tracks?.length || data.singles?.length) : !!(data.information?.length || data.score);
      else available ||= !!(data[key]?.length || data.pagination?.[key]?.has_more);
      tab.hidden = !available && key !== active;
    }
  }

  function cardSubtitle(entry, type) {
    return [type === 'relations' ? entry.group : '', entry.subtitle].filter(Boolean).join(' · ');
  }

  function card(entry, type) {
    const href = safeLink(entry.href);
    const textOnly = ['tracks', 'singles'].includes(type);
    const person = ['cast', 'staff'].includes(type);
    const node = element('div', 'details-section-card');
    const link = element(href ? 'a' : 'div', (textOnly ? '' : person ? 'cast-member ' : 'rec-card ') + 'details-section-card-link');
    if (href) link.href = href;
    const subtitle = cardSubtitle(entry, type);
    node.title = [entry.title, subtitle].filter(Boolean).join(' · ');
    if (!textOnly) {
      const image = element('img');
      image.src = safeLink(entry.image) || '/static/core/img/placeholder.png';
      image.alt = entry.title || '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.addEventListener('error', () => { image.src = '/static/core/img/placeholder.png'; }, { once: true });
      link.appendChild(image);
    }
    const caption = element('div', 'details-section-card-caption' + (textOnly ? '' : ' card-title-overlay'));
    caption.appendChild(element(textOnly ? 'span' : 'p', 'details-section-card-title ' + (person ? 'actor-name' : textOnly ? '' : 'rec-title'), entry.title || ''));
    if (subtitle) caption.appendChild(element(textOnly ? 'span' : 'p', 'details-section-card-subtitle' + (textOnly ? '' : ' character-name'), subtitle));
    link.appendChild(caption);
    node.appendChild(link);
    node.dataset.entryId = String(entry.id || entry.href || entry.title);
    if (entry.id && ['cast', 'staff'].includes(type)) {
      const favorite = element('label', 'cast-favorite details-person-favorite');
      favorite.dataset.personId = String(entry.id);
      favorite.dataset.name = entry.title || '';
      favorite.dataset.image = safeLink(entry.image);
      favorite.dataset.source = ['anilist', 'mal'].includes(state.source) ? 'anilist' : 'tmdb';
      favorite.dataset.type = type === 'cast' && ['anime', 'manga'].includes(state.media_type) ? 'character' : 'actor';
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = true;
      checkbox.setAttribute('aria-label', 'Favorite ' + (entry.title || 'person'));
      favorite.append(checkbox, element('span', 'heart'));
      node.appendChild(favorite);
    }
    return node;
  }

  function renderCards(section, container) {
    const entries = data[section] || [];
    if (section === 'staff') entries.sort((a, b) => (a.group_order ?? 99) - (b.group_order ?? 99)
      || (a.role_order ?? 99) - (b.role_order ?? 99) || (a.title || '').localeCompare(b.title || ''));
    else if (section === 'relations') entries.sort((a, b) => (a.group_order ?? 99) - (b.group_order ?? 99));
    const previous = new Map([...container.querySelectorAll('.details-section-card')].map(node => [node.dataset.entryId, node]));
    const anchor = container.getBoundingClientRect().top < 0
      ? [...previous.values()].find(node => node.getBoundingClientRect().bottom > 0) : null;
    const anchorTop = anchor?.getBoundingClientRect().top;
    const list = element('div', 'details-card-list');
    const textOnly = ['tracks', 'singles'].includes(section);
    const grid = element('div', 'details-section-grid ' + (textOnly ? 'details-track-list' : ['cast', 'staff'].includes(section) ? 'cast-list' : 'recommendations-list'));
    for (const entry of entries) {
      const key = String(entry.id || entry.href || entry.title);
      const node = previous.get(key) || card(entry, section);
      const text = cardSubtitle(entry, section);
      node.title = [entry.title, text].filter(Boolean).join(' · ');
      const caption = node.querySelector('.details-section-card-caption');
      let subtitle = node.querySelector('.details-section-card-subtitle');
      if (text && !subtitle) {
        subtitle = element(textOnly ? 'span' : 'p', 'details-section-card-subtitle' + (textOnly ? '' : ' character-name'));
        caption.appendChild(subtitle);
      }
      if (subtitle) subtitle.textContent = text;
      grid.appendChild(node);
    }
    list.appendChild(grid);
    const existingList = container.querySelector('.details-card-list');
    if (existingList) existingList.replaceWith(list);
    else container.appendChild(list);
    if (anchor?.isConnected && active === section) window.scrollBy(0, anchor.getBoundingClientRect().top - anchorTop);
    if (!entries.length && !data.pagination?.[section]?.has_more && !container.querySelector('.details-empty')) {
      container.appendChild(element('p', 'details-empty', 'No ' +
        (tabs.find(tab => tab.dataset.tab === section)?.textContent || 'information').toLowerCase() + ' available.'));
    }
  }

  async function syncFavorites(container, onlyUnknown = false) {
    const labels = [...container.querySelectorAll('.details-person-favorite')]
      .filter(label => !onlyUnknown || !label.querySelector('input').dataset.statusKnown);
    for (let offset = 0; offset < labels.length; offset += 500) {
      const batch = labels.slice(offset, offset + 500);
      const versions = batch.map(label => label.querySelector('input').dataset.favoriteRevision || '0');
      const params = new URLSearchParams({ type: batch[0].dataset.type, source: batch[0].dataset.source,
        ids: batch.map(label => label.dataset.personId).join(',') });
      try {
        const response = await fetch('/api/check_favorite_person/?' + params);
        const status = await ApiFeedback.readResponse(response);
        if (!Array.isArray(status.favorites)) continue;
        const favorites = new Set(status.favorites.map(String));
        for (const [index, label] of batch.entries()) {
          const checkbox = label.querySelector('input');
          if (checkbox.dataset.saving || (checkbox.dataset.favoriteRevision || '0') !== versions[index]) continue;
          checkbox.checked = favorites.has(label.dataset.personId);
          checkbox.disabled = false;
          checkbox.dataset.statusKnown = 'true';
        }
      } catch (_) { /* Leave controls disabled until the saved state is known. */ }
    }
  }

  document.querySelectorAll('.details-person-search').forEach(searchForm => {
    const section = searchForm.dataset.section;
    const input = searchForm.querySelector('input');
    const toggle = searchForm.querySelector('button');
    const results = searchForm.closest('.details-remote-panel').querySelector('.details-person-search-results');
    let controller = null;
    let revision = 0;
    function closeSearch() {
      controller?.abort();
      revision++;
      input.hidden = true;
      input.value = '';
      results.hidden = true;
      results.replaceChildren();
      toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', () => {
      if (!input.hidden) { closeSearch(); return; }
      input.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      input.focus();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') { closeSearch(); toggle.focus(); }
    });
    searchForm.addEventListener('submit', async event => {
      event.preventDefault();
      const query = input.value.trim();
      controller?.abort();
      const current = ++revision;
      if (!query) { results.hidden = true; results.replaceChildren(); return; }
      controller = new AbortController();
      const anilist = ['anime', 'manga'].includes(state.media_type);
      const characters = anilist && section === 'cast';
      const provider = anilist ? 'anilist' : 'tmdb';
      const endpoint = characters ? '/api/character_search/' : anilist ? '/api/anilist_staff_search/' : '/api/actor_search/';
      try {
        const response = await fetch(endpoint + '?q=' + encodeURIComponent(query), { signal: controller.signal });
        const people = await ApiFeedback.readResponse(response, provider);
        if (current !== revision) return;
        if (!Array.isArray(people)) throw new Error('Invalid search results.');
        results.replaceChildren();
        results.hidden = false;
        const grid = element('div', 'details-section-grid cast-list');
        for (const person of people) {
          if (!person.id) continue;
          grid.appendChild(card({ id: person.id, title: person.name || '', image: person.image || '', subtitle: '',
            href: characters ? `/character/${person.id}/` : `/person/${provider}/${person.id}/` }, section));
        }
        results.appendChild(grid);
        if (!grid.children.length) results.appendChild(element('p', 'details-empty', 'No results found.'));
        syncFavorites(results);
      } catch (error) {
        if (current !== revision || error.name === 'AbortError') return;
        results.hidden = false;
        ApiFeedback.render(results, error, provider);
      }
    });
    window.addEventListener('pagehide', () => controller?.abort());
  });

  document.addEventListener('change', async event => {
    const checkbox = event.target;
    const label = checkbox.closest?.('.details-person-favorite');
    if (!label || checkbox.type !== 'checkbox') return;
    const desired = checkbox.checked;
    checkbox.dataset.favoriteRevision = String(Number(checkbox.dataset.favoriteRevision || '0') + 1);
    checkbox.dataset.saving = 'true';
    checkbox.disabled = true;
    try {
      const token = document.cookie.split('; ').find(value => value.startsWith('csrftoken='))?.split('=').slice(1).join('=') || '';
      const response = await fetch('/api/toggle_favorite_person/', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(token) },
        body: JSON.stringify({ name: label.dataset.name, image_url: label.dataset.image,
          person_id: label.dataset.personId, type: label.dataset.type, source: label.dataset.source, favorite: desired }),
      });
      const result = await ApiFeedback.readResponse(response, label.dataset.source);
      if (result.status !== (desired ? 'added' : 'removed')) throw new Error('Unable to update this favorite.');
      document.querySelectorAll('.details-person-favorite').forEach(other => {
        if (other.dataset.personId === label.dataset.personId && other.dataset.source === label.dataset.source && other.dataset.type === label.dataset.type) {
          const input = other.querySelector('input');
          input.checked = desired;
          input.dataset.favoriteRevision = String(Number(input.dataset.favoriteRevision || '0') + 1);
        }
      });
      overview.querySelectorAll('[data-details-preview="cast"] .cast-favorite').forEach(other => {
        if (other.dataset.id === label.dataset.personId && other.dataset.type === label.dataset.type) {
          other.querySelector('input').checked = desired;
        }
      });
    } catch (error) {
      checkbox.checked = !desired;
      ApiFeedback.notify(error, label.dataset.source);
    } finally {
      delete checkbox.dataset.saving;
      checkbox.disabled = false;
    }
  });

  function sizeIcon(small) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '3 3 18 18');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', small
      ? 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z'
      : 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z');
    svg.appendChild(path);
    return svg;
  }

  function stopTrailers() {
    for (const restore of [...playingTrailers.values()]) restore();
  }

  function trailerTitle(video) {
    if (video.title && !/^(trailer|teaser)$/i.test(video.title.trim())) return Promise.resolve(video.title);
    const id = video.youtube_id;
    if (!trailerTitleRequests.has(id)) {
      const controller = new AbortController();
      trailerTitleControllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 8000);
      const request = (async () => {
        try {
          // AniList supplies a video ID, not its title. This optional lookup
          // runs after rendering and never blocks the rest of the details.
          const params = new URLSearchParams({ url: `https://www.youtube.com/watch?v=${id}`, format: 'json' });
          const response = await fetch('https://www.youtube.com/oembed?' + params,
            { signal: controller.signal, credentials: 'omit' });
          if (!response.ok) return '';
          const metadata = await response.json();
          return typeof metadata?.title === 'string' ? metadata.title.trim() : '';
        } catch (_) { return ''; }
        finally {
          clearTimeout(timeout);
          trailerTitleControllers.delete(controller);
        }
      })();
      trailerTitleRequests.set(id, request);
    }
    return trailerTitleRequests.get(id);
  }

  function trailers(container, videos, preview = false, controls) {
    // Overview thumbnails arrive in the HTML. Attach behavior without replacing
    // them, so later sections never move while this script initializes.
    const grid = container.querySelector('.details-trailer-grid') || element('div', 'details-trailer-grid');
    const toggle = controls?.querySelector('.details-trailer-size') || element('button', 'music-control-btn details-trailer-size');
    toggle.type = 'button';
    toggle.title = 'Toggle size';
    toggle.setAttribute('aria-label', 'Toggle size');
    let small = false;
    try { small = localStorage.getItem('trailerSize') === 'small'; } catch (_) { /* Storage disabled. */ }
    grid.classList.toggle('small', small);
    toggle.setAttribute('aria-pressed', String(small));
    toggle.replaceChildren(sizeIcon(small));
    toggle.addEventListener('click', () => {
      small = !grid.classList.contains('small');
      document.querySelectorAll('.details-trailer-grid').forEach(other => other.classList.toggle('small', small));
      document.querySelectorAll('.details-trailer-size').forEach(other => {
        other.replaceChildren(sizeIcon(small));
        other.setAttribute('aria-pressed', String(small));
      });
      try { localStorage.setItem('trailerSize', small ? 'small' : 'large'); } catch (_) { /* Storage disabled. */ }
    });
    if (controls && toggle.parentElement !== controls) controls.appendChild(toggle);
    if (grid.parentElement !== container) container.appendChild(grid);
    const existing = new Map([...grid.querySelectorAll('.details-trailer-card')].map(card => [card.dataset.youtubeId, card]));
    for (const video of videos.slice(0, preview ? 3 : 9)) {
      if (!/^[A-Za-z0-9_-]{11}$/.test(video.youtube_id || '')) continue;
      const card = existing.get(video.youtube_id) || element('div', 'details-trailer-card');
      card.dataset.youtubeId = video.youtube_id;
      let button = card.querySelector('.details-trailer-preview');
      if (!button) {
        button = element('button', 'details-trailer-preview');
        button.type = 'button';
        const image = element('img');
        image.src = `https://i.ytimg.com/vi/${video.youtube_id}/hqdefault.jpg`;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        const play = element('span', 'details-trailer-play');
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', 'currentColor');
        icon.setAttribute('aria-hidden', 'true');
        const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        triangle.setAttribute('d', 'M8 5v14l11-7z');
        icon.appendChild(triangle);
        play.appendChild(icon);
        button.append(image, play);
        card.appendChild(button);
      }
      let title = card.querySelector('.details-trailer-name');
      const kind = video.kind || 'Trailer';
      if (!title) {
        title = element('p', 'details-trailer-name');
        if (!video.title || /^(trailer|teaser)$/i.test(video.title)) title.classList.add('details-trailer-name-pending');
        title.appendChild(element('span', 'details-trailer-kind', kind));
        title.appendChild(element('span', 'details-trailer-title'));
        card.appendChild(title);
      }
      const caption = title.querySelector('.details-trailer-title');
      const setTitle = text => {
        caption.textContent = text && !/^(trailer|teaser)$/i.test(text) ? ' ' + text : '';
        title.title = text || kind;
        button.setAttribute('aria-label', 'Play ' + (text || kind));
      };
      setTitle(video.title);
      trailerTitle(video).then(text => {
        if (!text || text === video.title) return;
        video.title = text;
        setTitle(text);
        storeCache();
      });
      button.addEventListener('click', () => {
        stopTrailers();
        const frame = element('iframe');
        frame.src = `https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
        frame.title = video.title || 'Trailer';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        button.replaceWith(frame);
        playingTrailers.set(frame, () => {
          frame.replaceWith(button);
          playingTrailers.delete(frame);
        });
      });
      if (card.parentElement !== grid) grid.appendChild(card);
    }
  }

  function observeNext(section, container) {
    observer?.disconnect();
    const pagination = data?.pagination?.[section];
    if (!pagination?.has_more) return;
    const marker = element('div', 'details-scroll-marker');
    container.appendChild(marker);
    observer = new IntersectionObserver(entries => {
      if (active === section && entries.some(entry => entry.isIntersecting)) loadNext(section, container, marker);
    }, { rootMargin: '400px' });
    observer.observe(marker);
  }

  async function loadNext(section, container, marker) {
    if (pageRequests.has(section) || !data.pagination?.[section]?.has_more) return;
    const currentData = data;
    const nextPage = currentData.pagination[section].page + 1;
    const pending = (async () => {
      observer?.unobserve(marker);
      try {
        const response = await fetch(requestUrl(section, nextPage));
        const more = await ApiFeedback.readResponse(response, state.source);
        if (data !== currentData) return;
        if (!Array.isArray(more[section]) || !more.pagination?.[section]) throw new Error('Invalid section page.');
        const entries = data[section] || [];
        const existing = new Map(entries.map(entry => [String(entry.id || entry.href || entry.title), entry]));
        for (const entry of more[section]) {
          const key = String(entry.id || entry.href || entry.title);
          if (existing.has(key)) {
            const previous = existing.get(key);
            const subtitles = [...new Set([...(previous.subtitle || '').split(' · '), ...(entry.subtitle || '').split(' · ')])].filter(Boolean);
            previous.subtitle = subtitles.join(' · ');
            if ((entry.group_order ?? 99) < (previous.group_order ?? 99)
              || entry.group_order === previous.group_order && (entry.role_order ?? 99) < (previous.role_order ?? 99)) {
              previous.group = entry.group;
              previous.group_order = entry.group_order;
              previous.role_order = entry.role_order;
            }
            continue;
          }
          entries.push(entry);
          existing.set(key, entry);
        }
        data[section] = entries;
        data.pagination[section] = more.pagination[section];
        renderCards(section, container);
        if (entries.length) container.querySelector('.details-empty')?.remove();
        else if (!data.pagination[section].has_more && !container.querySelector('.details-empty')) {
          container.appendChild(element('p', 'details-empty', 'No additional entries available.'));
        }
        storeCache();
        if (['cast', 'staff'].includes(section)) syncFavorites(container, true);
        marker.remove();
        if (active === section) observeNext(section, container);
      } catch (error) {
        if (data === currentData) ApiFeedback.render(marker, error, state.source,
          { retry: () => { marker.replaceChildren(); loadNext(section, container, marker); } });
      } finally { pageRequests.delete(section); }
    })();
    pageRequests.set(section, pending);
    await pending;
  }

  function render(section) {
    const panel = document.getElementById('details-panel-' + section);
    const container = panel.querySelector('.details-panel-content');
    if (data.errors?.[section]) {
      container.replaceChildren();
      if (section === 'information') state.media_type === 'music' ? musicInformation(container) : information(container, data);
      const errorBox = element('div');
      container.appendChild(errorBox);
      ApiFeedback.render(errorBox, data.errors[section], state.source, { retry: () => {
        expires = 0;
        select(section);
      } });
      return;
    }
    if (!rendered.has(section)) {
      container.replaceChildren();
      if (section === 'information') state.media_type === 'music' ? musicInformation(container) : information(container, data);
      else if (section === 'trailers' && data.trailers?.length) trailers(container, data.trailers, false, panel.querySelector('.details-panel-tools'));
      else {
        renderCards(section, container);
      }
      rendered.add(section);
    }
    container.querySelectorAll('.details-scroll-marker').forEach(marker => marker.remove());
    observeNext(section, container);
    if (['cast', 'staff'].includes(section)) syncFavorites(container);
  }

  async function select(section, focus = false) {
    const tab = tabs.find(tab => tab.dataset.tab === section);
    if (!tab) return;
    const previous = active;
    active = section;
    refreshTabVisibility();
    observer?.disconnect();
    for (const button of tabs) {
      const selected = button === tab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.id !== 'details-panel-' + section;
    if (focus) tab.focus();
    if (previous !== section) {
      stopTrailers();
      document.dispatchEvent(new CustomEvent('details-tab-change', { detail: { previous, current: section } }));
      document.querySelectorAll(`#details-panel-${previous} iframe`).forEach(frame => {
        frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), 'https://www.youtube.com');
      });
    }
    if (section === 'overview') return;
    const panel = document.getElementById('details-panel-' + section);
    panel.setAttribute('aria-busy', 'true');
    try {
      await ensureBundle();
      refreshTabVisibility();
      if (active === section) render(section);
    } catch (error) {
      if (active === section) ApiFeedback.render(panel.querySelector('.details-panel-content'), error, state.source,
        { retry: () => select(section) });
    } finally { panel.removeAttribute('aria-busy'); }
  }

  nav.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) select(tab.dataset.tab);
  });
  nav.addEventListener('keydown', event => {
    const visibleTabs = tabs.filter(tab => !tab.hidden);
    const index = visibleTabs.indexOf(event.target);
    if (index < 0) return;
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % visibleTabs.length;
    if (event.key === 'ArrowLeft') target = (index + visibleTabs.length - 1) % visibleTabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = visibleTabs.length - 1;
    if (target === undefined) return;
    event.preventDefault();
    select(visibleTabs[target].dataset.tab, true);
  });

  function headingLink(heading, section) {
    if (!heading || !tabs.some(tab => tab.dataset.tab === section)) return;
    const button = element('button', 'details-preview-title', heading.textContent);
    button.type = 'button';
    button.addEventListener('click', async () => {
      await select(section);
      if (active === section) document.querySelector('.main-colored-section').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    heading.replaceChildren(button);
  }
  const overview = document.getElementById('details-panel-overview');
  if (state.season_number !== undefined) syncFavorites(overview);
  refreshTabVisibility();
  const musicHeader = document.getElementById('music-header-information');
  if (musicHeader && !musicHeader.querySelector('.details-information-surface') && state.header_information?.information?.length) {
    information(musicHeader, state.header_information, true);
  }
  const relationError = document.getElementById('movie-relations-api-error');
  if (relationError && state.movie_relations_error) ApiFeedback.render(relationError, state.movie_relations_error,
    state.source, { retry: () => location.reload() });
  headingLink(overview.querySelector('[data-details-preview="cast"] .cast-header h2'), 'cast');
  overview.querySelectorAll('[data-details-preview="recommendations"] > h2').forEach(title => headingLink(title, 'recommendations'));
  if (!state.saved) {
    const infoPreview = document.getElementById('overview-information');
    if (infoPreview) {
      let heading = infoPreview.querySelector('h2');
      if (!heading) {
        heading = element('h2', '', 'Information');
        const content = element('div');
        infoPreview.append(heading, content);
        information(content, data || state.local);
      }
      headingLink(heading, 'information');
    }
    const trailerPreview = document.getElementById('overview-trailers');
    if (trailerPreview && data?.trailers?.length) {
      trailerPreview.hidden = false;
      const title = trailerPreview.querySelector('h2');
      const controls = trailerPreview.querySelector('.details-trailer-controls');
      const videos = trailerPreview.querySelector('.details-trailer-preview-content');
      trailers(videos, data.trailers, true, controls);
      headingLink(title, 'trailers');
    }
  }
  window.addEventListener('pagehide', () => {
    observer?.disconnect();
    stopTrailers();
    for (const controller of trailerTitleControllers) controller.abort();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && active !== 'overview' && data) select(active);
  });
});

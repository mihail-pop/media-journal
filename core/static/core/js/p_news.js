document.addEventListener('DOMContentLoaded', () => {
  const page = document.getElementById('news-page');
  if (!page) return;

  const grid = document.getElementById('news-videos');
  const status = document.getElementById('news-status');
  const statusTitle = document.getElementById('news-status-title');
  const statusDetail = document.getElementById('news-status-detail');
  const retry = document.getElementById('news-retry');
  const warning = document.getElementById('news-warning');
  const search = document.getElementById('search-input');
  const sidebar = document.getElementById('news-sidebar');
  const sidebarToggle = document.getElementById('news-sidebar-toggle');
  const sources = document.getElementById('news-sources');
  const channelList = document.getElementById('news-channel-list');
  const channelForm = document.getElementById('news-channel-form');
  const channelInput = document.getElementById('news-channel-url');
  const sourceFeedback = document.getElementById('news-source-feedback');
  const sortWrapper = document.getElementById('news-sort-wrapper');
  const sortSelect = document.getElementById('news-sort-select');
  const sortOptions = document.getElementById('news-sort-options');
  const orderButton = document.getElementById('news-sort-order');
  const deletePanel = document.getElementById('news-delete-panel');
  const deleteMessage = document.getElementById('news-delete-message');
  const deleteCancel = document.getElementById('news-delete-cancel');
  const deleteConfirm = document.getElementById('news-delete-confirm');
  const typeButtons = Array.from(page.querySelectorAll('[data-type]'));
  const sortButtons = Array.from(sortOptions.querySelectorAll('[data-sort]'));
  const types = new Set(typeButtons.map(button => button.dataset.type));
  const portrait = window.matchMedia('(orientation: portrait)');
  const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  const wholeNumber = new Intl.NumberFormat('en');
  const defaultType = 'movie';
  const sortPreferenceKey = 'news-sort-preference';

  let selectedType = types.has(page.dataset.selectedType) ? page.dataset.selectedType : defaultType;
  let selectedSort = page.dataset.selectedSort === 'date' ? 'date' : 'views';
  let selectedOrder = page.dataset.selectedOrder === 'asc' ? 'asc' : 'desc';
  try {
    const saved = JSON.parse(localStorage.getItem(sortPreferenceKey));
    const params = new URLSearchParams(window.location.search);
    if (!params.has('sort') && ['views', 'date'].includes(saved?.sort)) selectedSort = saved.sort;
    if (!params.has('order') && ['asc', 'desc'].includes(saved?.order)) selectedOrder = saved.order;
  } catch { /* Keep the defaults when browser storage is unavailable. */ }
  let requestNumber = 0;
  let pendingRequest = null;
  let channelRevision = 0;
  let sourceBusy = false;
  let deleteTarget = null;
  let deleteFocus = null;
  let currentChannels = [];
  // Only the current selection is held while the page is open. Search and sort
  // work on these videos; changing media type always requests fresh RSS feeds.
  let currentVideos = null;
  let visibleVideos = [];

  function safeWebUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  function readableDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return null;
    const delta = Date.now() - date.getTime();
    const seconds = Math.max(1, Math.floor(Math.abs(delta) / 1000));
    let label;
    if (seconds < 60) label = `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
    else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      label = `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      label = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    else if (seconds < 172800) label = '1 day';
    else label = `${Math.floor(seconds / 86400)}d`;
    return {
      dateTime: date.toISOString(),
      text: delta < 0 ? `in ${label}` : `${label} ago`,
      title: date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' }),
    };
  }

  function durationLabel(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    const total = Math.floor(value);
    const seconds = String(total % 60).padStart(2, '0');
    const minutes = Math.floor(total / 60) % 60;
    const hours = Math.floor(total / 3600);
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
  }

  function viewCount(video) {
    return typeof video.views === 'number' && Number.isFinite(video.views) && video.views >= 0 ? video.views : -1;
  }

  function initialLetters(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || '').join('').toUpperCase();
  }

  function renderVideo(video) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'news-video';
    card.setAttribute('aria-label', `Play ${video.title}`);
    card.addEventListener('click', () => playVideo(video.id));

    const thumbnail = document.createElement('span');
    thumbnail.className = 'news-video-thumbnail';
    const imageUrl = safeWebUrl(video.thumbnail_url);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      thumbnail.append(image);
    }
    const duration = durationLabel(video.duration_seconds);
    if (duration) {
      const label = document.createElement('span');
      label.className = 'news-video-duration';
      label.textContent = duration;
      thumbnail.append(label);
    }

    const body = document.createElement('span');
    body.className = 'news-video-body';
    const avatar = document.createElement('span');
    avatar.className = 'news-channel-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initialLetters(video.channel);
    const avatarUrl = safeWebUrl(video.avatar_url);
    if (avatarUrl) {
      const image = document.createElement('img');
      image.src = avatarUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => image.remove(), { once: true });
      avatar.append(image);
    }
    const text = document.createElement('span');
    text.className = 'news-video-text';
    const title = document.createElement('span');
    title.className = 'news-video-title';
    title.textContent = video.title;
    title.title = video.title;
    const channel = document.createElement('span');
    channel.className = 'news-video-channel';
    channel.textContent = typeof video.channel === 'string' ? video.channel : '';
    const metadata = document.createElement('span');
    metadata.className = 'news-video-meta';
    const views = viewCount(video);
    if (views >= 0) {
      const label = document.createElement('span');
      label.textContent = `${compactNumber.format(views).toLowerCase()} ${views === 1 ? 'view' : 'views'}`;
      label.title = `${wholeNumber.format(views)} ${views === 1 ? 'view' : 'views'}`;
      metadata.append(label);
    }
    const published = readableDate(video.published_at);
    if (published) {
      const time = document.createElement('time');
      time.dateTime = published.dateTime;
      time.textContent = published.text;
      time.title = published.title;
      metadata.append(time);
    }
    text.append(title, channel, metadata);
    body.append(avatar, text);
    card.append(thumbnail, body);
    return card;
  }

  async function playVideo(id) {
    const queue = visibleVideos.map(video => ({ ...video }));
    const index = queue.findIndex(video => video.id === id);
    if (index < 0) return;
    try {
      if (typeof window.startNewsPlayback !== 'function') throw new Error('The player is unavailable. Reload the page and try again.');
      await window.startNewsPlayback(queue, index);
    } catch (error) {
      showStatus('Could not start the video', error.message || 'Please try again.');
    }
  }

  function showStatus(title, detail = '', allowRetry = false) {
    statusTitle.textContent = title;
    statusDetail.textContent = detail;
    statusDetail.hidden = !detail;
    retry.hidden = !allowRetry;
    status.hidden = false;
  }

  function setSourceFeedback(message = '') {
    sourceFeedback.textContent = message;
    sourceFeedback.hidden = !message;
  }

  function updateSelection() {
    typeButtons.forEach(button => {
      const active = button.dataset.type === selectedType;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    sortButtons.forEach(button => {
      const active = button.dataset.sort === selectedSort;
      button.setAttribute('aria-selected', String(active));
      button.classList.toggle('active', active);
    });
    sortSelect.textContent = selectedSort === 'date' ? 'Upload Date' : 'Views';
    orderButton.dataset.order = selectedOrder;
    orderButton.setAttribute('aria-label', `Sort ${selectedOrder === 'asc' ? 'ascending' : 'descending'}`);
  }

  function renderVideos() {
    if (currentVideos === null) return;
    const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const direction = selectedOrder === 'asc' ? 1 : -1;
    visibleVideos = currentVideos.filter(video => {
      const haystack = `${video.title} ${video.channel || ''}`.toLocaleLowerCase();
      return words.every(word => haystack.includes(word));
    }).sort((left, right) => {
      const leftDate = Date.parse(left.published_at) || 0;
      const rightDate = Date.parse(right.published_at) || 0;
      if (selectedSort === 'views') {
        const leftViews = viewCount(left);
        const rightViews = viewCount(right);
        if (leftViews < 0 && rightViews >= 0) return 1;
        if (rightViews < 0 && leftViews >= 0) return -1;
        const difference = (leftViews - rightViews) * direction;
        if (difference) return difference;
        return rightDate - leftDate || left.id.localeCompare(right.id);
      }
      return (leftDate - rightDate) * direction || left.id.localeCompare(right.id);
    });
    const fragment = document.createDocumentFragment();
    visibleVideos.forEach(video => fragment.append(renderVideo(video)));
    grid.replaceChildren(fragment);
    if (visibleVideos.length) status.hidden = true;
    else if (words.length) showStatus('No matching videos');
    else if (currentChannels.length && currentChannels.every(channel => !channel.enabled)) showStatus('No channels enabled', 'Enable a channel to see its videos.');
    else showStatus('No videos found');
  }

  function renderChannels(channels) {
    currentChannels = Array.isArray(channels) ? channels.filter(channel => channel && typeof channel.key === 'string') : [];
    const fragment = document.createDocumentFragment();
    for (const channel of currentChannels) {
      const pill = document.createElement('span');
      pill.className = `news-source-pill${channel.enabled ? ' enabled' : ''}`;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'news-channel-toggle';
      toggle.textContent = channel.name || 'YouTube channel';
      toggle.setAttribute('aria-pressed', String(Boolean(channel.enabled)));
      toggle.title = channel.enabled ? 'Disable channel' : 'Enable channel';
      toggle.disabled = sourceBusy;
      toggle.addEventListener('click', () => mutateSource({ action: 'toggle', key: channel.key, enabled: !channel.enabled }));
      pill.append(toggle);
      if (!channel.is_default) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'news-channel-delete';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Delete ${channel.name || 'channel'}`);
        remove.disabled = sourceBusy;
        remove.addEventListener('click', () => openDeletePanel(channel, remove));
        pill.append(remove);
      }
      fragment.append(pill);
    }
    channelList.replaceChildren(fragment);
    setSourceControls();
  }

  function setSourceControls() {
    channelList.querySelectorAll('button').forEach(button => { button.disabled = sourceBusy; });
    channelForm.querySelectorAll('input, button').forEach(control => { control.disabled = sourceBusy; });
    deleteConfirm.disabled = sourceBusy;
    deleteCancel.disabled = sourceBusy;
  }

  function csrfToken() {
    const token = document.querySelector('[name="csrfmiddlewaretoken"]')?.value;
    if (token) return token;
    const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('csrftoken='));
    return cookie ? decodeURIComponent(cookie.slice('csrftoken='.length)) : '';
  }

  async function mutateSource(values) {
    if (sourceBusy) return false;
    const type = selectedType;
    channelRevision++;
    sourceBusy = true;
    setSourceControls();
    setSourceFeedback();
    try {
      const response = await fetch(page.dataset.channelsUrl, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken(), Accept: 'application/json' },
        body: JSON.stringify({ ...values, type }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !Array.isArray(data.channels)) throw new Error(data?.error || 'Could not update channels. Please try again.');
      if (type === selectedType) {
        channelRevision++;
        renderChannels(data.channels);
        if (values.action === 'add') channelInput.value = '';
        loadNews();
      }
      return true;
    } catch (error) {
      if (type === selectedType) {
        setSourceFeedback(error.name === 'TypeError' ? 'Could not connect. Please try again.' : error.message);
        if (currentVideos === null) loadNews();
      }
      return false;
    } finally {
      sourceBusy = false;
      setSourceControls();
    }
  }

  async function loadChannels(type, revision) {
    try {
      const url = new URL(page.dataset.channelsUrl, window.location.origin);
      url.searchParams.set('type', type);
      const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (type !== selectedType || revision !== channelRevision) return;
      if (response.ok && Array.isArray(data?.channels)) renderChannels(data.channels);
    } catch { /* The main error remains visible; source controls can be retried. */ }
  }

  async function loadNews() {
    const currentRequest = ++requestNumber;
    const type = selectedType;
    const sourceRevision = channelRevision;
    if (pendingRequest) pendingRequest.abort();
    const controller = new AbortController();
    pendingRequest = controller;
    let timedOut = false;
    let receivedChannels = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 45000);
    currentVideos = null;
    visibleVideos = [];
    grid.replaceChildren();
    grid.setAttribute('aria-busy', 'true');
    status.hidden = true;
    warning.hidden = true;
    retry.disabled = true;
    try {
      const url = new URL(page.dataset.apiUrl, window.location.origin);
      url.searchParams.set('type', type);
      url.searchParams.set('sort', selectedSort);
      url.searchParams.set('order', selectedOrder);
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (currentRequest !== requestNumber || type !== selectedType || sourceRevision !== channelRevision) return;
      if (Array.isArray(data?.channels)) {
        renderChannels(data.channels);
        receivedChannels = true;
      }
      if (!response.ok || !data || !Array.isArray(data.videos)) {
        throw new Error(data?.error || 'Videos could not be loaded. Please try again.');
      }
      currentVideos = data.videos.filter(video => video && typeof video.title === 'string' && video.title.trim() && typeof video.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(video.id));
      renderVideos();
      const unavailable = Array.isArray(data.unavailable_channels) ? data.unavailable_channels.filter(name => typeof name === 'string') : [];
      warning.textContent = unavailable.length ? `Some channels could not be loaded: ${unavailable.join(', ')}.` : '';
      warning.hidden = !unavailable.length;
    } catch (error) {
      if (currentRequest !== requestNumber || type !== selectedType || sourceRevision !== channelRevision || (error.name === 'AbortError' && !timedOut)) return;
      showStatus('Videos are unavailable', timedOut ? 'YouTube took too long to respond. Please try again.' : error.name === 'TypeError' ? 'Could not connect. Please try again.' : error.message, true);
      if (!receivedChannels) loadChannels(type, sourceRevision);
    } finally {
      window.clearTimeout(timeout);
      if (currentRequest === requestNumber) {
        grid.setAttribute('aria-busy', 'false');
        retry.disabled = false;
        pendingRequest = null;
      }
    }
  }

  function closeSort() {
    sortSelect.setAttribute('aria-expanded', 'false');
    sortOptions.classList.remove('open');
  }

  function updateUrl(pushHistory) {
    const url = new URL(window.location.href);
    url.searchParams.delete('period');
    url.searchParams.set('type', selectedType);
    url.searchParams.set('sort', selectedSort);
    url.searchParams.set('order', selectedOrder);
    if (pushHistory) window.history.pushState(null, '', url);
    else window.history.replaceState(window.history.state, '', url);
  }

  function changeSelection(type, sort, order, pushHistory = true) {
    const typeChanged = type !== selectedType;
    const sortChanged = sort !== selectedSort || order !== selectedOrder;
    if (!typeChanged && sort === selectedSort && order === selectedOrder) return;
    selectedType = type;
    selectedSort = sort;
    selectedOrder = order;
    if (sortChanged) {
      try {
        localStorage.setItem(sortPreferenceKey, JSON.stringify({ sort, order }));
      } catch { /* Sorting still works without browser storage. */ }
    }
    if (pushHistory) updateUrl(true);
    closeSort();
    updateSelection();
    if (typeChanged) {
      channelRevision++;
      currentChannels = [];
      renderChannels([]);
      setSourceFeedback();
      channelInput.value = '';
      closeDeletePanel(true);
      loadNews();
    } else renderVideos();
  }

  function openDeletePanel(channel, button) {
    if (sourceBusy) return;
    deleteTarget = { ...channel, type: selectedType };
    deleteFocus = button;
    deleteMessage.textContent = `Delete ${channel.name || 'this channel'}?`;
    deletePanel.hidden = false;
    deleteCancel.focus({ preventScroll: true });
  }

  function closeDeletePanel(force = false) {
    if (sourceBusy && !force) return;
    deletePanel.hidden = true;
    deleteTarget = null;
    if (deleteFocus?.isConnected) deleteFocus.focus({ preventScroll: true });
    deleteFocus = null;
  }

  deleteCancel.addEventListener('click', () => closeDeletePanel());
  deleteConfirm.addEventListener('click', async () => {
    if (!deleteTarget || sourceBusy || deleteTarget.type !== selectedType) return;
    if (await mutateSource({ action: 'delete', key: deleteTarget.key })) closeDeletePanel();
  });
  channelForm.addEventListener('submit', event => {
    event.preventDefault();
    const url = channelInput.value.trim();
    if (url) mutateSource({ action: 'add', url });
  });
  typeButtons.forEach(button => button.addEventListener('click', () => changeSelection(button.dataset.type, selectedSort, selectedOrder)));
  sortButtons.forEach(button => button.addEventListener('click', () => {
    changeSelection(selectedType, button.dataset.sort, selectedOrder);
    closeSort();
    sortSelect.focus({ preventScroll: true });
  }));
  sortSelect.addEventListener('click', () => {
    const open = sortSelect.getAttribute('aria-expanded') !== 'true';
    sortSelect.setAttribute('aria-expanded', String(open));
    sortOptions.classList.toggle('open', open);
  });
  sortSelect.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    sortSelect.setAttribute('aria-expanded', 'true');
    sortOptions.classList.add('open');
    (sortButtons.find(button => button.dataset.sort === selectedSort) || sortButtons[0]).focus();
  });
  orderButton.addEventListener('click', () => changeSelection(selectedType, selectedSort, selectedOrder === 'desc' ? 'asc' : 'desc'));
  search.addEventListener('input', renderVideos);
  retry.addEventListener('click', loadNews);
  sources.addEventListener('toggle', () => {
    // Source controls remain usable while an external feed is slow or down.
    if (sources.open) loadChannels(selectedType, channelRevision);
  });

  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const type = types.has(params.get('type')) ? params.get('type') : defaultType;
    changeSelection(type, params.get('sort') === 'date' ? 'date' : 'views', params.get('order') === 'asc' ? 'asc' : 'desc', false);
  });

  function closeSidebar() {
    sidebar.classList.remove('sidebar-visible');
    sidebarToggle.setAttribute('aria-expanded', 'false');
    sidebar.inert = portrait.matches;
  }
  sidebarToggle.addEventListener('click', () => {
    const visible = sidebar.classList.toggle('sidebar-visible');
    sidebarToggle.setAttribute('aria-expanded', String(visible));
    sidebar.inert = portrait.matches && !visible;
  });
  document.addEventListener('click', event => {
    if (!sidebar.contains(event.target) && !sidebarToggle.contains(event.target)) closeSidebar();
    if (!sortWrapper.contains(event.target)) closeSort();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!deletePanel.hidden) { closeDeletePanel(); return; }
    closeSort();
    closeSidebar();
  });
  portrait.addEventListener('change', closeSidebar);
  closeSidebar();
  sources.open = false;
  updateSelection();
  updateUrl(false);
  window.addEventListener('pagehide', () => { if (pendingRequest) pendingRequest.abort(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      sources.open = false;
      closeDeletePanel(true);
      loadNews();
    }
  });
  loadNews();
});

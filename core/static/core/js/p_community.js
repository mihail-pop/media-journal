document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('community-root');
  if (!root) return;
  const content = window.CommunityContent;
  const firebaseUrl = root.dataset.firebaseUrl.replace(/\/$/, '');
  const mediaItems = JSON.parse(document.getElementById('media-items-json').textContent)
    .filter(item => content.mediaIdentity(item));
  const usernameField = document.getElementById('username-field');
  const usernameSizing = root.querySelector('.username-sizing');
  function fitUsername() {
    if (!usernameSizing) return;
    usernameSizing.textContent = usernameField.value;
    usernameSizing.parentElement.dataset.empty = String(!usernameField.value.trim());
  }
  usernameField.addEventListener('input', fitUsername);
  fitUsername();
  const postsContainer = document.getElementById('posts-container');
  const feedStatus = document.getElementById('community-feed-status');
  const sentinel = document.getElementById('community-feed-sentinel');
  const composers = new Set();
  const renderedPosts = new Set();
  const maxCharacters = 2200;
  const emojis = ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😊', '😉', '😋', '😍', '😘', '🫨', '😜', '🤨', '🤔', '🧐', '😎', '😢', '🥹', '😭', '😡', '🥳', '😇', '🤩', '😏', '😬', '😴', '🤗', '😱', '🥺', '🤓', '🙂‍↕️', '🙂‍↔️', '🫠', '😮‍💨', '😤', '😈', '💀', '👀', '👍', '👎', '👏', '🙏', '🔥', '🎉', '💯', '⭐', '🌟', '✨', '⚡', '❤️', '💖', '💔', '💙', '🍶', '🍺', '🍻', '🥂', '🍷', '🧂'];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function cookie(name) {
    const entry = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='));
    return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
  }

  function notice(message, warning = false) {
    document.querySelector('.community-notification')?.remove();
    const node = element('div', 'community-notification', message);
    node.classList.toggle('is-warning', warning);
    node.setAttribute('role', 'status');
    document.body.appendChild(node);
    setTimeout(() => node.remove(), warning ? 6000 : 2500);
  }

  async function jsonRequest(url, options = {}) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (options.signal?.aborted) cancel();
    options.signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const data = await response.json().catch(error => {
        if (error.name === 'AbortError') throw error;
        if (response.status === 204) return null;
        throw new Error('The server returned an invalid response. Please try again.');
      });
      if (!response.ok || data?.error) throw new Error(typeof data?.error === 'string' ? data.error : 'The request could not be completed. Please try again.');
      return data;
    } catch (error) {
      if (timedOut) throw new Error('The request took too long. Please try again.');
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', cancel);
    }
  }

  function remote(path, method, data, signal) {
    return jsonRequest(`${firebaseUrl}/${path}.json`, {
      method, signal, cache: 'no-store',
      ...(data !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
    });
  }

  let savedUsername = usernameField.value.trim();
  let queuedUsername = savedUsername;
  let usernameQueue = Promise.resolve();
  usernameField.addEventListener('blur', () => {
    const username = usernameField.value.trim();
    usernameField.value = username;
    fitUsername();
    if (username === queuedUsername) return;
    queuedUsername = username;
    usernameQueue = usernameQueue.then(async () => {
      try {
        const data = await jsonRequest('/settings/save_username/', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': cookie('csrftoken') }, body: JSON.stringify({ username }),
        });
        if (!data?.success) throw new Error('Unable to save your username.');
        savedUsername = username;
        if (usernameField.value.trim() === username) notice('Username saved.');
      } catch (error) {
        if (queuedUsername === username) queuedUsername = savedUsername;
        notice(error.message, true);
      }
    });
  });
  usernameField.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); usernameField.blur(); }
  });

  function normalized(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  }

  function count(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function timeAgo(timestamp) {
    const difference = Math.max(1, Math.floor(Date.now() / 1000 - Number(timestamp)));
    if (!Number.isFinite(difference)) return 'Unknown date';
    for (const [seconds, name] of [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']]) {
      if (difference >= seconds) {
        const amount = Math.floor(difference / seconds);
        return `${amount} ${name}${amount === 1 ? '' : 's'} ago`;
      }
    }
  }

  function authorHeader(name, timestamp, small = false) {
    const header = element('div', 'post-author');
    const identity = element('div', 'author-identity');
    identity.appendChild(element('strong', 'author-name', name));
    const time = element('time', 'post-time', timeAgo(timestamp));
    const date = new Date(Number(timestamp) * 1000);
    if (Number.isFinite(date.getTime())) { time.dateTime = date.toISOString(); time.title = date.toLocaleString(); }
    identity.appendChild(time);
    header.appendChild(identity);
    if (small) header.classList.add('post-author-small');
    return header;
  }

  // One outside-click handler for every composer; removed comment editors leave no listeners behind.
  document.addEventListener('click', event => composers.forEach(composer => composer.outside(event.target)));

  function createComposer(container, { comment = false, onSend }) {
    container.classList.add('community-composer');
    if (comment) container.classList.add('comment-composer');
    const textarea = container.querySelector('.composer-text');
    const preview = container.querySelector('.composer-preview');
    const editor = container.querySelector('.composer-editor');
    const send = container.querySelector('.composer-send');
    const error = container.querySelector('.composer-error');
    const searchBox = container.querySelector('.composer-media-search');
    const search = container.querySelector('.composer-search-input');
    const results = container.querySelector('.composer-search-results');
    const picker = container.querySelector('.emoji-picker');
    const emojiButton = container.querySelector('.emoji-trigger');
    const tools = Array.from(container.querySelectorAll('[data-tool]'));
    const panels = Array.from(container.querySelectorAll('[data-panel]'));
    let sending = false;
    let destroyed = false;
    let mode = 'write';
    const characterLimit = comment ? null : maxCharacters;
    if (comment) {
      textarea.removeAttribute('maxlength');
      textarea.placeholder = 'Write a comment...';
      textarea.setAttribute('aria-label', 'Comment text');
      send.textContent = 'Send';
    }
    const sendLabel = send.textContent;
    function showError(message = '') { error.textContent = message; error.hidden = !message; }
    function closeEmoji() {
      picker.hidden = true;
      emojiButton.setAttribute('aria-expanded', 'false');
      window.removeEventListener('scroll', closeEmoji);
      window.removeEventListener('resize', closeEmoji);
    }
    function closePanels() {
      panels.forEach(panel => { panel.hidden = true; });
      closeEmoji();
      tools.filter(tool => tool.dataset.tool !== 'media').forEach(tool => tool.setAttribute('aria-expanded', 'false'));
    }
    function closeSearch() {
      searchBox.hidden = true;
      results.hidden = true;
      tools.find(tool => tool.dataset.tool === 'media').setAttribute('aria-expanded', 'false');
    }
    function insert(text) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (characterLimit && textarea.value.length - (end - start) + text.length > characterLimit) {
        showError(`Keep the text within ${maxCharacters.toLocaleString()} characters.`);
        return false;
      }
      textarea.setRangeText(text, start, end, 'end');
      textarea.focus();
      showError();
      return true;
    }
    function showSearchResults() {
      const query = normalized(search.value.trim());
      results.replaceChildren();
      if (!query) { results.hidden = true; return; }
      const matches = mediaItems.filter(item => normalized(item.title).includes(query)).slice(0, 20);
      for (const item of matches) {
        const button = element('button', 'composer-search-result');
        button.type = 'button';
        button.dataset.mediaType = item.media_type;
        const frame = element('span', 'search-result-cover');
        const cover = document.createElement('img');
        cover.src = item.cover_url || '/static/core/img/placeholder.png';
        cover.alt = '';
        cover.loading = 'lazy';
        frame.appendChild(cover);
        const info = element('span', 'search-result-info');
        info.appendChild(element('span', 'search-result-title', item.title));
        const year = String(item.release_date || '').slice(0, 4);
        info.appendChild(element('span', 'search-result-type', `${content.types[item.media_type]}${year ? ' • ' + year : ''}`));
        button.append(frame, info);
        button.addEventListener('click', () => {
          const tag = content.mediaTag(item);
          if (tag && insert(tag)) { closeSearch(); search.value = ''; results.replaceChildren(); }
        });
        results.appendChild(button);
      }
      results.hidden = !matches.length;
    }
    search.addEventListener('input', showSearchResults);
    search.addEventListener('focus', showSearchResults);
    tools.forEach(tool => tool.addEventListener('click', () => {
      if (sending || mode === 'preview') return;
      showError();
      const name = tool.dataset.tool;
      if (name === 'media') {
        const opening = searchBox.hidden;
        closePanels();
        searchBox.hidden = !opening;
        tool.setAttribute('aria-expanded', String(opening));
        if (opening) { search.focus(); showSearchResults(); }
        else results.hidden = true;
      } else {
        const panel = panels.find(panel => panel.dataset.panel === name);
        const opening = panel.hidden;
        closePanels();
        closeSearch();
        panel.hidden = !opening;
        tool.setAttribute('aria-expanded', String(opening));
        if (opening) panel.querySelector('input').focus();
      }
    }));
    container.querySelectorAll('[data-insert]').forEach(button => {
      function insertAttachment() {
        if (sending) return;
        const kind = button.dataset.insert;
        if (kind === 'image') {
          const input = container.querySelector('[data-field="image-url"]');
          const image = content.parseImgur(input.value);
          if (image.error) { showError(image.error); return; }
          if (insert(`[IMG:${image.url}]`)) { input.value = ''; closePanels(); }
        } else {
          const title = container.querySelector('[data-field="link-text"]');
          const address = container.querySelector('[data-field="link-url"]');
          const url = content.httpUrl(address.value);
          if (!title.value.trim() || !url) { showError('Enter link text and a valid HTTP or HTTPS URL.'); return; }
          if (/[\]\r\n]/.test(title.value)) { showError('Link text cannot contain a closing bracket or a line break.'); return; }
          if (insert(`[${title.value.trim()}](${url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`)) {
            title.value = address.value = '';
            closePanels();
          }
        }
      }
      button.addEventListener('click', insertAttachment);
      button.closest('.composer-panel').querySelectorAll('input').forEach(input => input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); insertAttachment(); }
      }));
    });
    emojis.forEach(emoji => {
      const button = element('button', 'emoji-choice', emoji);
      button.type = 'button';
      button.addEventListener('click', () => {
        if (!sending && insert(emoji)) closeEmoji();
      });
      picker.appendChild(button);
    });
    emojiButton.addEventListener('click', () => {
      if (sending || mode === 'preview') return;
      const opening = picker.hidden;
      closePanels();
      results.hidden = true;
      picker.hidden = !opening;
      emojiButton.setAttribute('aria-expanded', String(opening));
      if (opening) {
        picker.style.position = 'fixed';
        picker.style.left = '0';
        picker.style.top = '0';
        picker.style.bottom = 'auto';
        picker.style.right = 'auto';
        const bounds = picker.getBoundingClientRect();
        const anchor = emojiButton.getBoundingClientRect();
        picker.style.left = `${Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
        picker.style.top = `${Math.max(8, Math.min(anchor.top - bounds.height - 8, window.innerHeight - bounds.height - 8))}px`;
        window.addEventListener('scroll', closeEmoji, { passive: true, once: true });
        window.addEventListener('resize', closeEmoji, { once: true });
      }
    });
    container.querySelectorAll('.composer-tab').forEach(button => button.addEventListener('click', () => {
      if (sending || button.dataset.tab === mode) return;
      const height = editor.getBoundingClientRect().height;
      mode = button.dataset.tab;
      content.release(preview);
      container.classList.toggle('is-preview', mode === 'preview');
      container.querySelectorAll('.composer-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === mode);
        tab.setAttribute('aria-selected', String(tab.dataset.tab === mode));
      });
      closePanels();
      results.hidden = true;
      textarea.hidden = mode !== 'write';
      preview.hidden = mode !== 'preview';
      if (mode === 'preview') {
        preview.style.height = `${height}px`;
        preview.innerHTML = content.render(textarea.value) || '<span class="empty-preview">Nothing to preview.</span>';
        content.initialize(preview);
      } else { preview.replaceChildren(); textarea.focus(); }
    }));
    container.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      closePanels(); closeSearch(); showError();
    });
    send.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (sending || !text) return;
      if (characterLimit && text.length > characterLimit) { showError(`Keep the text within ${maxCharacters.toLocaleString()} characters.`); return; }
      sending = true;
      showError();
      const controls = Array.from(container.querySelectorAll('button, input, textarea'));
      controls.forEach(control => { control.disabled = true; });
      send.textContent = comment ? 'Sending…' : 'Posting…';
      try {
        await onSend(text);
        if (destroyed) return;
        textarea.value = '';
        content.release(preview);
        preview.replaceChildren();
        closePanels(); closeSearch();
      } catch (error) {
        if (!destroyed) showError(error.message || 'Unable to send. Please try again.');
      } finally {
        sending = false;
        if (!destroyed) {
          controls.forEach(control => { control.disabled = false; });
          send.textContent = sendLabel;
        }
      }
    });
    const composer = {
      outside(target) {
        if (!container.contains(target)) { closePanels(); results.hidden = true; }
        else {
          if (!searchBox.contains(target) && !target.closest('[data-tool="media"]')) results.hidden = true;
          if (!target.closest('.composer-emoji')) closeEmoji();
        }
      },
      destroy() { destroyed = true; closeEmoji(); content.release(preview); composers.delete(composer); },
    };
    composers.add(composer);
    return composer;
  }

  const heartIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  const commentIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3C6.48 3 2 6.8 2 11.5c0 2.1.9 4 2.4 5.5l-.9 4 4.7-1.7c1.2.4 2.5.7 3.8.7 5.5 0 10-3.8 10-8.5S17.5 3 12 3Z"/></svg>';

  function renderPost(post, id) {
    const article = element('article', 'community-post');
    article.dataset.postId = id;
    const name = typeof post.user === 'string' && post.user.trim() ? post.user : 'Anonymous';
    article.appendChild(authorHeader(name, post.timestamp || 0));
    const body = element('div', 'post-body');
    if (post.text) body.innerHTML = content.render(post.text);
    else if (post.item && typeof post.item === 'object') {
      // Older activity posts use a structured item instead of a text tag.
      body.appendChild(document.createTextNode(`${post.action || ''} `));
      const item = post.item;
      const url = content.mediaUrl(item.media_type, item.source, item.source_id);
      const link = element(url ? 'a' : 'span', '', String(item.title || 'Media item'));
      if (url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      body.appendChild(link);
    }
    article.appendChild(body);
    const actions = element('div', 'post-reactions');
    const like = element('button', 'post-like');
    like.type = 'button';
    like.setAttribute('aria-label', 'Like post');
    like.innerHTML = heartIcon;
    const likes = element('span', 'reaction-count');
    like.appendChild(likes);
    const legacyKey = `liked_${id}`;
    let liked = post.liked_by_me === true;
    let legacyLike = false;
    let liking = false;
    try {
      if (typeof post.liked_by_me === 'boolean') localStorage.removeItem(legacyKey);
      else legacyLike = localStorage.getItem(legacyKey) === '1';
    } catch (_) {}
    if (legacyLike) liked = true;
    function updateLikes() {
      likes.textContent = count(post.likes) || '';
      like.classList.toggle('is-liked', liked);
      like.setAttribute('aria-pressed', String(liked));
      like.setAttribute('aria-label', liked ? 'Unlike post' : 'Like post');
    }
    async function saveLike(wanted, legacy = false) {
      const result = await jsonRequest(`/community/posts/${encodeURIComponent(id)}/like/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': cookie('csrftoken') },
        body: JSON.stringify({ liked: wanted, legacy }),
      });
      if (typeof result?.liked !== 'boolean') throw new Error('Unable to confirm your like. Please try again.');
      liked = result.liked;
      post.likes = result.likes;
      post.liked_by_me = liked;
      legacyLike = false;
      try { localStorage.removeItem(legacyKey); } catch (_) {}
      updateLikes();
    }
    updateLikes();
    // Retire the old browser-only flag once, preserving its existing count.
    // A stored false also stops another old browser from re-importing an unlike.
    if (legacyLike) {
      liking = true;
      like.disabled = true;
      saveLike(true, true).catch(() => {}).finally(() => { liking = false; like.disabled = false; });
    }
    like.addEventListener('click', async () => {
      if (liking) return;
      const wanted = !liked;
      liking = true;
      like.disabled = true;
      try {
        if (legacyLike) await saveLike(true, true);
        await saveLike(wanted);
      } catch (error) { notice(error.message, true); }
      finally { liking = false; like.disabled = false; }
    });
    const commentsButton = element('button', 'post-comments-toggle');
    commentsButton.type = 'button';
    commentsButton.innerHTML = commentIcon;
    commentsButton.setAttribute('aria-label', 'Comments');
    const commentsCount = element('span', 'reaction-count');
    commentsButton.appendChild(commentsCount);
    commentsButton.setAttribute('aria-expanded', 'false');
    function updateCommentCount() { commentsCount.textContent = count(post.commentCount) || ''; }
    updateCommentCount();
    actions.append(like, commentsButton);
    article.appendChild(actions);
    let thread = null;
    let prefetchedComments = null;
    let commentHoverTimer;
    function warmComments() {
      if (thread) return null;
      if (prefetchedComments) return prefetchedComments;
      const request = { controller: new AbortController() };
      request.promise = remote(`comments/${encodeURIComponent(id)}`, 'GET', undefined, request.controller.signal);
      // A speculative read must not leave an unhandled rejection or retain old data.
      request.promise.catch(() => { if (prefetchedComments === request) prefetchedComments = null; });
      request.expiry = setTimeout(() => {
        if (prefetchedComments === request) { prefetchedComments = null; request.controller.abort(); }
      }, 5000);
      prefetchedComments = request;
      return request;
    }
    commentsButton.addEventListener('pointerenter', () => { commentHoverTimer = setTimeout(warmComments, 120); });
    commentsButton.addEventListener('pointerleave', () => clearTimeout(commentHoverTimer));
    commentsButton.addEventListener('focus', warmComments);
    commentsButton.addEventListener('pointerdown', warmComments);
    commentsButton.addEventListener('click', () => {
      clearTimeout(commentHoverTimer);
      if (thread) {
        thread.controller.abort();
        thread.composer?.destroy();
        content.release(thread.section);
        thread.section.remove();
        thread = null;
        commentsButton.setAttribute('aria-expanded', 'false');
        return;
      }
      const initialRequest = warmComments();
      clearTimeout(initialRequest.expiry);
      prefetchedComments = null;
      const state = {
        section: element('section', 'comments-section'), controller: initialRequest.controller,
        list: element('div', 'comments-list'), nodes: new Map(), composer: null,
      };
      thread = state;
      state.section.setAttribute('aria-label', 'Comments');
      state.section.appendChild(state.list);
      article.appendChild(state.section);
      commentsButton.setAttribute('aria-expanded', 'true');

      function insertComment(commentId, comment) {
        if (state.nodes.has(commentId)) return;
        const node = element('article', 'comment');
        node.dataset.timestamp = Number(comment.timestamp) || 0;
        node.dataset.commentId = commentId;
        const username = typeof comment.username === 'string' && comment.username.trim() ? comment.username : 'Anonymous';
        node.appendChild(authorHeader(username, comment.timestamp, true));
        const text = element('div', 'comment-body');
        text.innerHTML = content.render(comment.text);
        node.appendChild(text);
        const next = Array.from(state.list.children).find(child =>
          Number(child.dataset.timestamp) > Number(node.dataset.timestamp) ||
          (child.dataset.timestamp === node.dataset.timestamp && child.dataset.commentId > commentId));
        state.list.insertBefore(node, next || null);
        state.nodes.set(commentId, node);
        content.initialize(node);
      }

      const form = element('div', 'comment-composer');
      form.appendChild(document.getElementById('community-composer-template').content.cloneNode(true));
      state.section.appendChild(form);
      state.composer = createComposer(form, { comment: true, onSend: async text => {
        const commentId = window.crypto?.randomUUID?.() || `mj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
        const comment = { username: usernameField.value.trim() || 'Anonymous', text, timestamp: Math.floor(Date.now() / 1000) };
        // Save the comment and increment its total in one Firebase update.
        const commentPath = `comments/${id}/${commentId}`;
        const countPath = `posts/${id}/commentCount`;
        const result = await remote('', 'PATCH', { [commentPath]: comment, [countPath]: { '.sv': { increment: 1 } } });
        if (thread === state) {
          insertComment(commentId, comment);
          post.commentCount = Math.max(state.nodes.size, count(result?.[countPath]));
        } else { post.commentCount = count(post.commentCount) + 1; }
        updateCommentCount();
      } });

      async function loadComments(prefetched = null) {
        state.section.querySelector('.comments-error')?.remove();
        try {
          const data = await (prefetched || remote(`comments/${encodeURIComponent(id)}`, 'GET', undefined, state.controller.signal)) || {};
          if (thread !== state || state.controller.signal.aborted) return;
          Object.entries(data).filter(([, value]) => value && typeof value === 'object').forEach(([key, value]) => insertComment(key, value));
          post.commentCount = Math.max(count(post.commentCount), state.nodes.size);
          updateCommentCount();

        } catch (error) {
          if (error.name === 'AbortError' || thread !== state) return;
          const failure = element('div', 'comments-error');
          failure.appendChild(element('p', '', 'Unable to load comments.'));
          const retry = element('button', 'community-retry', 'Try again');
          retry.type = 'button';
          retry.addEventListener('click', () => { retry.disabled = true; loadComments(); });
          failure.appendChild(retry);
          state.list.appendChild(failure);
        }
      }
      loadComments(initialRequest.promise);
    });
    return article;
  }

  let currentPage = 0;
  let nextCursor = null;
  let hasMore = true;
  let isLoadingPosts = false;
  let feedFailed = false;
  let feedObserver;
  let loadCheck;

  function checkForMore() {
    if (hasMore && !isLoadingPosts && !feedFailed && sentinel.getBoundingClientRect().top < window.innerHeight + 800) loadPosts();
  }

  async function loadPosts() {
    if (isLoadingPosts || !hasMore) return;
    isLoadingPosts = true;
    feedFailed = false;
    feedStatus.hidden = true;
    try {
      const params = new URLSearchParams({ page: currentPage + 1 });
      if (nextCursor) params.set('cursor', JSON.stringify(nextCursor));
      const data = await jsonRequest(`/community/posts/?${params}`, { cache: 'no-store' });
      if (!Array.isArray(data?.items)) throw new Error('Invalid community response.');
      for (const post of data.items) {
        if (renderedPosts.has(post.id)) continue;
        const node = renderPost(post, post.id);
        postsContainer.appendChild(node);
        renderedPosts.add(post.id);
        content.initialize(node);
      }
      currentPage = data.page;
      nextCursor = data.next_cursor;
      hasMore = !!data.has_more && data.items.length > 0;
      if (!renderedPosts.size) {
        feedStatus.textContent = 'No posts yet.';
        feedStatus.hidden = false;
      }
    } catch (error) {
      feedFailed = true;
      feedStatus.replaceChildren(element('p', '', 'Unable to load community posts.'));
      const retry = element('button', 'community-retry', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', () => loadPosts());
      feedStatus.appendChild(retry);
      feedStatus.hidden = false;
    } finally {
      isLoadingPosts = false;
      if (!hasMore) feedObserver?.unobserve(sentinel);
      else if (!feedFailed) loadCheck = requestAnimationFrame(checkForMore);
    }
  }

  createComposer(document.getElementById('post-composer'), { onSend: async text => {
    const post = { user: usernameField.value.trim() || 'Anonymous', text, timestamp: Math.floor(Date.now() / 1000), likes: 0, commentCount: 0 };
    const result = await remote('posts', 'POST', post);
    if (typeof result?.name !== 'string') throw new Error('Unable to confirm that the post was saved. Reload the page before trying again.');
    if (!renderedPosts.has(result.name)) {
      const node = renderPost(post, result.name);
      postsContainer.prepend(node);
      renderedPosts.add(result.name);
      content.initialize(node);
    }
    if (!feedFailed) feedStatus.hidden = true;
  } });

  if ('IntersectionObserver' in window) {
    feedObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) checkForMore();
    }, { rootMargin: '800px 0px' });
    feedObserver.observe(sentinel);
  }
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(loadCheck);
    loadCheck = requestAnimationFrame(checkForMore);
  }, { passive: true });
  window.addEventListener('resize', checkForMore);
  loadPosts();
});

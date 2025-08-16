document.addEventListener('DOMContentLoaded', () => {

  const root = document.getElementById('board-root');
  const FIREBASE_URL = root.dataset.firebaseUrl.replace(/\/$/, '');
  const MEDIA_ITEMS = JSON.parse(document.getElementById('media-items-json').textContent);

  // Modal elements
  const makePostBtn = document.getElementById('make-post-btn');
  const modalOverlay = document.getElementById('modal-overlay');
  const postModal = document.getElementById('post-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');

  // Form elements inside modal
  const mediaTypeSelect = document.getElementById('media-type-select');
  const searchContainer = document.getElementById('search-container');
  const mediaSearchInput = document.getElementById('media-search');
  const searchResults = document.getElementById('search-results');
  const sendPostBtn = document.getElementById('send-post-btn');
  const usernameContainer = document.getElementById('username-container');
  const usernameInput = document.getElementById('username-input');
  const postPreviewContainer = document.getElementById('post-preview');
  const postsContainer = document.getElementById('posts-container');

  let selectedMedia = null;

  function filterMediaByType(mediaType) {
    if (!mediaType) return [];
    return MEDIA_ITEMS.filter(item => item.media_type === mediaType);
  }

  function renderSearchResults(results) {
    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchResults.textContent = 'No results found.';
      return;
    }
    results.forEach(item => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.textContent = item.title;
      div.dataset.itemId = item.id;
      div.dataset.mediaType = item.media_type;
      div.dataset.source = item.source;
      div.dataset.sourceId = item.source_id;
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => {
        selectMediaItem(item);
      });
      searchResults.appendChild(div);
    });
  }

  function buildMessage(user, mediaItem) {
    const status = mediaItem.status || 'planned';
    const mediaType = mediaItem.media_type;
    const title = mediaItem.title;
    const url = `http://${window.location.hostname}:8000/${mediaItem.source}/${mediaType}/${mediaItem.source_id}/`;

    let actionText = '';
    switch (status) {
      case 'planned':
        if (["tv", "movie", "anime"].includes(mediaType)) {
          actionText = 'plans to watch';
        } else if (mediaType === 'game') {
          actionText = 'plans to play';
        } else if (["manga", "book"].includes(mediaType)) {
          actionText = 'plans to read';
        } else {
          actionText = 'plans to experience';
        }
        break;
      case 'ongoing':
        if (["tv", "movie", "anime"].includes(mediaType)) {
          actionText = 'is watching';
        } else if (mediaType === 'game') {
          actionText = 'is  playing';
        } else if (["manga", "book"].includes(mediaType)) {
          actionText = 'is reading';
        } else {
          actionText = 'is experiencing';
        }
        break;
      case 'completed':
        if (["tv", "movie", "anime"].includes(mediaType)) {
          actionText = 'watched';
        } else if (mediaType === 'game') {
          actionText = 'completed';
        } else if (["manga", "book"].includes(mediaType)) {
          actionText = 'read';
        } else {
          actionText = 'finished';
        }
        break;
      case 'dropped':
        actionText = 'dropped';
        break;
      case 'on_hold':
        actionText = 'put on hold';
        break;
      default:
        actionText = 'is interacting with';
    }

    return `${user} ${actionText} <a href="${url}" target="_blank">${title}</a>`;
  }

  function selectMediaItem(item) {
    selectedMedia = item;
    mediaSearchInput.value = item.title;
    searchResults.innerHTML = '';
    sendPostBtn.disabled = false;

    // Show username input box
    usernameContainer.style.display = 'block';

    // Set preview with default username or existing username input
    const username = usernameInput.value.trim() || 'Anonymous';
    postPreviewContainer.innerHTML = buildMessage(username, item);
  }

  async function sendPost(postData) {
    try {
      const response = await fetch(`${FIREBASE_URL}/posts.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
      });
      if (!response.ok) {
        throw new Error('Failed to send post');
      }
      return await response.json();
    } catch (err) {
      console.error(err);
      alert('Error sending post');
    }
  }

  function timeAgo(ts) {
    const now = Date.now() / 1000;
    const diff = Math.floor(now - ts);
    if (diff < 60) return `${diff} second${diff !== 1 ? 's' : ''} ago`;
    if (diff < 3600) {
      const min = Math.floor(diff / 60);
      return `${min} minute${min !== 1 ? 's' : ''} ago`;
    }
    if (diff < 86400) {
      const hr = Math.floor(diff / 3600);
      return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
    }
    const days = Math.floor(diff / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  function renderPost(post, postId) {
    const div = document.createElement('div');
    div.className = 'board-post';
    div.dataset.postId = postId;

    const message = buildMessage(post.user || 'Anonymous', post.item);
    div.innerHTML = `<p>${message}</p><small>${timeAgo(post.timestamp)}</small>`;

    // --- Likes UI ---
    const likesRow = document.createElement('div');
    likesRow.className = 'likes-row';
    likesRow.style.display = 'flex';
    likesRow.style.alignItems = 'center';
    likesRow.style.gap = '16px';

    // Heart icon
    const heart = document.createElement('span');
    heart.className = 'like-heart';
    heart.innerHTML = '❤';
    heart.style.cursor = 'pointer';
    heart.style.color = '#e25555';
    heart.style.fontSize = '1.6em';
    heart.style.userSelect = 'none';
    // Likes count
    const likesCount = document.createElement('span');
    likesCount.className = 'likes-count';
    if (post.likes && post.likes > 0) {
      likesCount.textContent = post.likes;
      likesCount.style.display = '';
    } else {
      likesCount.textContent = '';
      likesCount.style.display = 'none';
    }

    // LocalStorage like check
    const likedKey = `liked_${postId}`;
    let liked = localStorage.getItem(likedKey) === '1';
    if (liked) heart.style.opacity = '1';
    else heart.style.opacity = '0.5';

    heart.addEventListener('click', async () => {
      if (localStorage.getItem(likedKey) === '1') return; // already liked
      // Optimistically update UI
      let newLikes = (post.likes || 0) + 1;
      likesCount.textContent = newLikes;
      likesCount.style.display = '';
      heart.style.opacity = '1';
      localStorage.setItem(likedKey, '1');
      // Patch likes in Firebase
      await fetch(`${FIREBASE_URL}/posts/${postId}/likes.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLikes)
      });
    });

    likesRow.appendChild(heart);
    likesRow.appendChild(likesCount);

    // --- Comments UI ---
    const commentIcon = document.createElement('span');
    commentIcon.className = 'comment-icon';
    commentIcon.innerHTML = '💭';
    commentIcon.style.cursor = 'pointer';
    commentIcon.style.fontSize = '1.5em';
    commentIcon.style.userSelect = 'none';
// Comments count
const commentsCount = document.createElement('span');
commentsCount.className = 'comments-count';

// Use post.commentCount instead of post.comments
const commentNum = post.commentCount || 0;

if (commentNum > 0) {
  commentsCount.textContent = commentNum;
  commentsCount.style.display = '';
} else {
  commentsCount.textContent = '';
  commentsCount.style.display = 'none';
}

    likesRow.appendChild(commentIcon);
    likesRow.appendChild(commentsCount);
    div.appendChild(likesRow);
// --- Comments Section ---
let commentsSection = null;
let commentsVisible = false;

commentIcon.addEventListener('click', async () => {
  if (commentsVisible) {
    if (commentsSection) commentsSection.remove();
    commentsVisible = false;
    return;
  }

  commentsVisible = true;
  commentsSection = document.createElement('div');
  commentsSection.className = 'comments-section';
  commentsSection.style.marginTop = '8px';
  commentsSection.innerHTML = '';

  // Fetch only comments for this post
  const res = await fetch(`${FIREBASE_URL}/comments/${postId}.json`);
  const postCommentsObj = await res.json() || {};
  const postComments = Object.values(postCommentsObj);

  if (postComments.length > 0) {
    postComments.forEach(comment => {
      const commentDiv = document.createElement('div');
      commentDiv.className = 'comment';
      commentDiv.innerHTML = `<b>${comment.username || 'Anonymous'}</b> ${comment.text} <small>${timeAgo(comment.timestamp)}</small>`;
      commentsSection.appendChild(commentDiv);
    });
  } else {
    commentsSection.innerHTML = '<div class="comment">No comments yet.</div>';
  }

  commentIcon.parentNode.insertBefore(commentsSection, commentIcon.nextSibling);

      // Add comment box
      const commentBox = document.createElement('div');
      commentBox.className = 'comment-box';
      commentBox.style.display = 'flex';
      commentBox.style.gap = '10px';
      commentBox.style.marginTop = '14px';
      commentBox.style.alignItems = 'flex-end';

      // Username input (above comment box, small)
      const commentUsername = document.createElement('input');
      commentUsername.type = 'text';
      commentUsername.placeholder = '(Optional) Username';
      commentUsername.className = 'comment-username-input';
      commentUsername.style.width = '210px';
      commentUsername.style.marginBottom = '4px';
      commentUsername.style.fontSize = '1rem';
      commentUsername.style.fontWeight = '500';
      commentUsername.style.border = '1px solid #23304a';
      commentUsername.style.background = '#101820';
      commentUsername.style.color = 'rgb(237, 241, 245)';
      commentUsername.style.borderRadius = '4px';
      commentUsername.style.padding = '6px 10px';

      // Comment input (expandable textarea)
      const commentInput = document.createElement('textarea');
      commentInput.placeholder = 'Write a comment...';
      commentInput.className = 'comment-input';
      commentInput.style.flex = '1 1 auto';
      commentInput.style.padding = '6px 10px';
      commentInput.style.borderRadius = '4px';
      commentInput.style.border = '1px solid #23304a';
      commentInput.style.background = '#101820';
      commentInput.style.color = '#EDF1F5';
      commentInput.style.fontSize = '1rem';
      commentInput.style.minHeight = '80px';
      commentInput.style.maxHeight = '200px';
      commentInput.style.resize = 'vertical';
      commentInput.style.marginRight = '4px';

      // Emoji button
      const emojiBtn = document.createElement('button');
      emojiBtn.type = 'button';
      emojiBtn.className = 'emoji-btn';
      emojiBtn.textContent = '😊';
      emojiBtn.style.background = 'none';
      emojiBtn.style.border = 'none';
      emojiBtn.style.fontSize = '1.3em';
      emojiBtn.style.cursor = 'pointer';
      emojiBtn.style.marginRight = '2px';
      emojiBtn.style.position = 'relative';

      // Emoji picker
      const emojiPicker = document.createElement('div');
      emojiPicker.className = 'emoji-picker';
      emojiPicker.style.position = 'absolute';

emojiPicker.style.left = '100%';
      emojiPicker.style.background = '#151F2E';
      emojiPicker.style.border = '1px solid #23304a';
      emojiPicker.style.borderRadius = '8px';
      emojiPicker.style.padding = '8px';
      emojiPicker.style.display = 'none';
      emojiPicker.style.zIndex = '10';
      emojiPicker.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
      emojiPicker.style.minWidth = '30rem';
      emojiPicker.style.maxWidth = '30rem';
      emojiPicker.style.maxHeight = '180px';
      emojiPicker.style.overflowY = 'auto';

      // Simple emoji list
      const emojis = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😍','😘','😜','🤔','😎','😢','😭','😡','👍','👎','🙏','🔥','🎉','💯','🥳','😇','🤩','😏','😬','😴','🤗','😱','🥺','😤','😈','💖','💔','💙','⭐','🌟','✨','⚡','🍶','🍺','🍻','🥂','🍷','🧂'];
      emojis.forEach(e => {
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = e;
        emojiSpan.style.cursor = 'pointer';
        emojiSpan.style.fontSize = '1.2em';
        emojiSpan.style.margin = '2px';
        emojiSpan.addEventListener('click', () => {
          commentInput.value += e;
          emojiPicker.style.display = 'none';
          commentInput.focus();
        });
        emojiPicker.appendChild(emojiSpan);
      });
      emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
      });
      document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
          emojiPicker.style.display = 'none';
        }
      });

      // Send button
      const sendBtn = document.createElement('button');
      sendBtn.textContent = 'Send';
      sendBtn.className = 'send-comment-btn';
      sendBtn.style.padding = '7px 18px';
      sendBtn.style.borderRadius = '4px';
      sendBtn.style.border = 'none';
      sendBtn.style.background = '#3DB4F2';
      sendBtn.style.color = '#fff';
      sendBtn.style.cursor = 'pointer';
      sendBtn.style.fontWeight = 'bold';
      sendBtn.style.fontSize = '1rem';
      sendBtn.style.transition = 'background 0.2s';
      sendBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)';

sendBtn.addEventListener('click', async () => {
  const username = commentUsername.value.trim() || 'Anonymous';
  const text = commentInput.value.trim();
  if (!text) return;

  sendBtn.disabled = true;

  const commentData = {
    username,
    text,
    timestamp: Math.floor(Date.now() / 1000)
  };

  // POST to Firebase under /comments/{postId}/ so it generates a unique ID automatically
  const response = await fetch(`${FIREBASE_URL}/comments/${postId}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(commentData)
  });

  const result = await response.json(); // contains the generated key: { "name": "-NAbC123..." }

  // Update UI
  const commentDiv = document.createElement('div');
  commentDiv.className = 'comment';
  commentDiv.innerHTML = `<b>${username}</b> ${text} <small>${timeAgo(commentData.timestamp)}</small>`;
  // Remove "No comments yet." if present
  const noCommentsMsg = Array.from(commentsSection.querySelectorAll('.comment')).find(
    el => el.textContent === 'No comments yet.'
  );
  if (noCommentsMsg) {
    noCommentsMsg.remove();
  }
  commentsSection.insertBefore(commentDiv, commentUsername);

  // Recalculate comment count from DOM, excluding placeholders
  const actualComments = Array.from(commentsSection.querySelectorAll('.comment')).filter(
    el => el.textContent !== 'No comments yet.'
  );
  const newCount = actualComments.length;
  await fetch(`${FIREBASE_URL}/posts/${postId}/commentCount.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newCount)
  });

  commentInput.value = '';
  sendBtn.disabled = false;

  // Update local counter
  commentsCount.textContent = newCount;
  commentsCount.style.display = '';
  commentNum = newCount;
});

      // Structure: username input above, then comment box row (textarea, emoji, send)
      const commentBoxWrapper = document.createElement('div');
      commentBoxWrapper.style.display = 'flex';
      commentBoxWrapper.style.flexDirection = 'row';
      commentBoxWrapper.style.alignItems = 'flex-end';
      commentBoxWrapper.style.gap = '10px';
commentBoxWrapper.appendChild(commentInput);

// Emoji wrapper for positioning
const emojiWrapper = document.createElement('div');
emojiWrapper.style.position = 'relative';
emojiWrapper.style.display = 'inline-block';
emojiWrapper.appendChild(emojiBtn);
emojiWrapper.appendChild(emojiPicker);

commentBoxWrapper.appendChild(emojiWrapper);
commentBoxWrapper.appendChild(sendBtn);

      // Add username input above comment box
      commentsSection.appendChild(commentUsername);
      commentsSection.appendChild(commentBoxWrapper);
      div.appendChild(commentsSection);
    });

    return div;
  }

  async function loadPosts() {
    postsContainer.innerHTML = '<p>Loading posts...</p>';
    try {
      const response = await fetch(`${FIREBASE_URL}/posts.json?orderBy="timestamp"&limitToLast=25`);
      if (!response.ok) throw new Error('Failed to load posts');
      const data = await response.json();
      postsContainer.innerHTML = '';
      if (!data) {
        postsContainer.innerHTML = '<p>No posts yet.</p>';
        return;
      }
      // Use Object.entries to get postId
      const posts = Object.entries(data).sort((a, b) => b[1].timestamp - a[1].timestamp);
      posts.forEach(([postId, post]) => {
        const postDiv = renderPost(post, postId);
        postsContainer.appendChild(postDiv);
      });
    } catch (err) {
      console.error(err);
      postsContainer.innerHTML = '<p>Error loading posts.</p>';
    }
  }


  sendPostBtn.addEventListener('click', async () => {
    if (!selectedMedia) return;
    let userName = usernameInput.value.trim();
    if (!userName) userName = 'Anonymous';

    const timestamp = Math.floor(Date.now() / 1000);

    const postData = {
      user: userName,
      action: selectedMedia.status,
      item: selectedMedia,
      timestamp: timestamp,
      likes: 0,
      comments: {}
    };

    sendPostBtn.disabled = true;
    await sendPost(postData);
    sendPostBtn.disabled = false;

    // Reset inputs and UI
    mediaSearchInput.value = '';
    searchResults.innerHTML = '';
    selectedMedia = null;
    sendPostBtn.disabled = true;
    usernameInput.value = '';
    usernameContainer.style.display = 'none';
    postPreviewContainer.innerHTML = '';

    // Hide modal and overlay
    postModal.style.display = 'none';
    modalOverlay.style.display = 'none';

    loadPosts();
  });


  mediaTypeSelect.addEventListener('change', () => {
    const mediaType = mediaTypeSelect.value;
    selectedMedia = null;
    sendPostBtn.disabled = true;

    usernameContainer.style.display = 'none';
    usernameInput.value = '';

    if (!mediaType) {
      searchContainer.style.display = 'none';
      mediaSearchInput.value = '';
      searchResults.innerHTML = '';
      postPreviewContainer.innerHTML = '';
      return;
    }

    searchContainer.style.display = 'block';
    mediaSearchInput.value = '';
    searchResults.innerHTML = '';
    postPreviewContainer.innerHTML = '';
  });


  mediaSearchInput.addEventListener('input', () => {
    const query = mediaSearchInput.value.trim().toLowerCase();
    if (!query) {
      searchResults.innerHTML = '';
      sendPostBtn.disabled = true;
      selectedMedia = null;
      usernameContainer.style.display = 'none';
      usernameInput.value = '';
      postPreviewContainer.innerHTML = '';
      return;
    }
    const mediaType = mediaTypeSelect.value;
    const candidates = filterMediaByType(mediaType);
    const filtered = candidates.filter(item =>
      item.title.toLowerCase().includes(query)
    ).slice(0, 10);
    renderSearchResults(filtered);
    postPreviewContainer.innerHTML = '';
    usernameContainer.style.display = 'none';
    usernameInput.value = '';
  });


  // Update preview in real-time as user types username
  usernameInput.addEventListener('input', () => {
    if (!selectedMedia) return;
    const username = usernameInput.value.trim() || 'Username';
    postPreviewContainer.innerHTML = buildMessage(username, selectedMedia);
  });

  // Modal open/close logic
  makePostBtn.addEventListener('click', () => {
    postModal.style.display = 'flex';
    modalOverlay.style.display = 'block';
    // Reset modal form
    mediaTypeSelect.value = '';
    searchContainer.style.display = 'none';
    mediaSearchInput.value = '';
    searchResults.innerHTML = '';
    usernameContainer.style.display = 'none';
    usernameInput.value = '';
    postPreviewContainer.innerHTML = '';
    sendPostBtn.disabled = true;
    selectedMedia = null;
  });

  closeModalBtn.addEventListener('click', () => {
    postModal.style.display = 'none';
    modalOverlay.style.display = 'none';
  });

  // Close modal when clicking overlay
  modalOverlay.addEventListener('click', () => {
    postModal.style.display = 'none';
    modalOverlay.style.display = 'none';
  });

  loadPosts();
});

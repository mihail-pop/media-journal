document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('board-root');
  const FIREBASE_URL = root.dataset.firebaseUrl.replace(/\/$/, '');
  const MEDIA_ITEMS = JSON.parse(document.getElementById('media-items-json').textContent);

  const usernameField = document.getElementById('username-field');
  const postText = document.getElementById('post-text');
  const insertMediaBtn = document.getElementById('insert-media-btn');
  const sendPostBtn = document.getElementById('send-post-btn');
  const mediaTypeButtons = document.getElementById('media-type-buttons');
  const mediaSearchBox = document.getElementById('media-search-box');
  const mediaSearchInput = document.getElementById('media-search-input');
  const mediaSearchResults = document.getElementById('media-search-results');
  const postsContainer = document.getElementById('posts-container');
  const writeTab = document.getElementById('write-tab');
  const previewTab = document.getElementById('preview-tab');
  const postPreview = document.getElementById('post-preview');

  // Save username function
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    const isMobile = window.matchMedia("(orientation: portrait)").matches;
    notification.style.cssText = `
      position: fixed;
      top: ${isMobile ? '5rem' : '4rem'};
      left: 50%;
      transform: translateX(-50%);
      background: #4CAF50;
      color: white;
      padding: ${isMobile ? '20px 40px' : '12px 24px'};
      border-radius: ${isMobile ? '12px' : '6px'};
      z-index: 9999;
      font-weight: 500;
      font-size: ${isMobile ? '2.5rem' : '1rem'};
      width: ${isMobile ? '90%' : 'auto'};
      max-width: ${isMobile ? '90%' : 'auto'};
      text-align: center;
      box-sizing: border-box;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
  }

  const saveUsername = async () => {
    const username = usernameField.value.trim();
    try {
      const response = await fetch('/settings/save_username/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ username })
      });
      const data = await response.json();
      if (data.success) {
        showNotification('Your username has been saved');
        usernameField.classList.add('saved');
      }
    } catch (err) {
      console.error('Failed to save username:', err);
    }
  };

  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  // Save username on blur and Enter key
  if (usernameField) {
    usernameField.addEventListener('focus', () => {
      usernameField.classList.remove('saved');
    });
    usernameField.addEventListener('blur', saveUsername);
    usernameField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveUsername();
        usernameField.blur();
      }
    });
  }

  let selectedMediaType = null;

  // Post emoji picker
  const postEmojiBtn = document.getElementById('post-emoji-btn');
  const postEmojiPicker = document.getElementById('post-emoji-picker');
  const emojis = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😍','😘','😜','🤔','😎','😢','😭','😡','👍','👎','🙏','🔥','🎉','💯','🥳','😇','🤩','😏','😬','😴','🤗','😱','🥺','😤','😈','💖','💔','💙','⭐','🌟','✨','⚡','🍶','🍺','🍻','🥂','🍷','🧂'];
  emojis.forEach(e => {
    const emojiSpan = document.createElement('span');
    emojiSpan.textContent = e;
    emojiSpan.addEventListener('click', () => {
      postText.value += e;
      postEmojiPicker.style.display = 'none';
      postText.focus();
    });
    postEmojiPicker.appendChild(emojiSpan);
  });
  postEmojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = postEmojiPicker.style.display === 'none' || postEmojiPicker.style.display === '';
    postEmojiPicker.style.display = isHidden ? 'block' : 'none';
  });
  document.addEventListener('click', (e) => {
    if (!postEmojiPicker.contains(e.target) && e.target !== postEmojiBtn) {
      postEmojiPicker.style.display = 'none';
    }
  });

  // Post link button
  const postLinkBtn = document.getElementById('post-link-btn');
  postLinkBtn.addEventListener('click', () => {
    const link = `[text](url)`;
    const cursorPos = postText.selectionStart;
    const textBefore = postText.value.substring(0, cursorPos);
    const textAfter = postText.value.substring(cursorPos);
    postText.value = textBefore + link + textAfter;
    postText.focus();
    postText.selectionStart = postText.selectionEnd = cursorPos + link.length;
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'write') {
        writeTab.classList.add('active');
      } else {
        previewTab.classList.add('active');
        updatePreview();
      }
    });
  });

  // Insert Media button
  insertMediaBtn.addEventListener('click', () => {
    if (mediaTypeButtons.style.display === 'none' && mediaSearchBox.style.display === 'none') {
      mediaTypeButtons.style.display = 'flex';
    } else {
      mediaTypeButtons.style.display = 'none';
      mediaSearchBox.style.display = 'none';
    }
  });

  // Media type selection
  document.querySelectorAll('.media-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMediaType = btn.dataset.type;
      mediaTypeButtons.style.display = 'none';
      mediaSearchBox.style.display = 'block';
      mediaSearchInput.focus();
      mediaSearchInput.value = '';
      mediaSearchResults.innerHTML = '';
    });
  });

  // Media search
  mediaSearchInput.addEventListener('input', () => {
    const query = mediaSearchInput.value.trim().toLowerCase();
    if (!query) {
      mediaSearchResults.innerHTML = '';
      return;
    }
    const filtered = MEDIA_ITEMS.filter(item => 
      item.media_type === selectedMediaType && item.title.toLowerCase().includes(query)
    ).slice(0, 10);
    
    mediaSearchResults.innerHTML = '';
    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.textContent = item.title;
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => {
        insertMediaTag(item);
        mediaSearchBox.style.display = 'none';
        mediaTypeButtons.style.display = 'none';
        mediaSearchInput.value = '';
        mediaSearchResults.innerHTML = '';
      });
      mediaSearchResults.appendChild(div);
    });
  });

  function insertMediaTag(item) {
    const tag = `[MEDIA:${item.media_type}:${item.source}:${item.source_id}:${item.title.replace(/:/g, '&#58;')}:${item.status}]`;
    const cursorPos = postText.selectionStart;
    const textBefore = postText.value.substring(0, cursorPos);
    const textAfter = postText.value.substring(cursorPos);
    postText.value = textBefore + tag + textAfter;
    postText.focus();
    postText.selectionStart = postText.selectionEnd = cursorPos + tag.length;
  }

  function processYouTubeLinks(text) {
    const youtubeRegex = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)([^\s]*)/g;
    return text.replace(youtubeRegex, (match, www, urlType, videoId, params) => {
      const timeMatch = params.match(/[&?]t=(\d+)/);
      const startTime = timeMatch ? `?start=${timeMatch[1]}` : '';
      return `<br><iframe width=100% height=450px src="https://www.youtube.com/embed/${videoId}${startTime}" frameborder="0" allowfullscreen referrerpolicy="origin-when-cross-origin"></iframe>`;
    });
  }

  function parsePostText(text) {
    if (!text) return '';
    let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Parse media tags first (match everything except ] in title to avoid capturing markdown links)
    const mediaRegex = /\[MEDIA:([^:]+):([^:]+):([^:]+):([^\]]+?):([^:\]]+)\]/g;
    html = html.replace(mediaRegex, (match, mediaType, source, sourceId, title, status) => {
      const decodedTitle = title.replace(/&#58;/g, ':');
      let url;
      if (sourceId.includes('_s')) {
        const parts = sourceId.split('_s');
        url = `http://${window.location.hostname}:8000/tmdb/season/${parts[0]}/${parts[1]}/`;
      } else {
        url = `http://${window.location.hostname}:8000/${source}/${mediaType}/${sourceId}/`;
      }
      return `<a href="${url}" target="_blank">${decodedTitle}</a>`;
    });
    
    // Parse markdown links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^\)]+)\)/g;
    html = html.replace(linkRegex, (match, text, url) => {
      return `<a href="${url}" target="_blank">${text}</a>`;
    });
    
    html = processYouTubeLinks(html);
    return html.replace(/\n/g, '<br>');
  }

  function updatePreview() {
    postPreview.innerHTML = parsePostText(postText.value) || '<em>Nothing to preview</em>';
  }

  // Send post
  sendPostBtn.addEventListener('click', async () => {
    const text = postText.value.trim();
    if (!text) return;

    const username = usernameField.value.trim() || 'Anonymous';
    const timestamp = Math.floor(Date.now() / 1000);

    const postData = {
      user: username,
      text: text,
      timestamp: timestamp,
      likes: 0,
      commentCount: 0
    };

    sendPostBtn.disabled = true;
    try {
      await fetch(`${FIREBASE_URL}/posts.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
      });
      
      postText.value = '';
      mediaTypeButtons.style.display = 'none';
      mediaSearchBox.style.display = 'none';
      loadPosts();
    } catch (err) {
      console.error(err);
      alert('Error sending post');
    }
    sendPostBtn.disabled = false;
  });

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
    if (diff < 2592000) {
      const days = Math.floor(diff / 86400);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
    if (diff < 31536000) {
      const months = Math.floor(diff / 2592000);
      return `${months} month${months !== 1 ? 's' : ''} ago`;
    }
    const years = Math.floor(diff / 31536000);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  }

  function renderPost(post, postId) {
    const div = document.createElement('div');
    div.className = 'board-post';
    div.dataset.postId = postId;

    // Support old post format
    let message;
    if (post.text) {
      message = parsePostText(post.text);
    } else if (post.item) {
      // Old format: convert to link
      const item = post.item;
      let url;
      if (item.source_id && item.source_id.includes('_s')) {
        const parts = item.source_id.split('_s');
        url = `http://${window.location.hostname}:8000/tmdb/season/${parts[0]}/${parts[1]}/`;
      } else {
        url = `http://${window.location.hostname}:8000/${item.source}/${item.mediatype}/${item.source_id}/`;
      }
      message = `${post.action} <a href="${url}" target="_blank">${item.title}</a>`;
    } else {
      message = '';
    }
    div.innerHTML = `<p><strong>${post.user || 'Anonymous'}</strong><span class="post-time">${timeAgo(post.timestamp || 0)}</span><br><br>${message}</p>`;

    // Likes UI
    const likesRow = document.createElement('div');
    likesRow.className = 'likes-row';
    likesRow.style.display = 'flex';
    likesRow.style.alignItems = 'center';
    likesRow.style.gap = '16px';

    const heart = document.createElement('span');
    heart.className = 'like-heart';
    heart.innerHTML = '❤';
    heart.style.cursor = 'pointer';
    heart.style.color = '#e25555';
    heart.style.fontSize = '1.6em';
    heart.style.userSelect = 'none';

    const likesCount = document.createElement('span');
    likesCount.className = 'likes-count';
    if (post.likes && post.likes > 0) {
      likesCount.textContent = post.likes;
      likesCount.style.display = '';
    } else {
      likesCount.textContent = '';
      likesCount.style.display = 'none';
    }

    const likedKey = `liked_${postId}`;
    let liked = localStorage.getItem(likedKey) === '1';
    heart.style.opacity = liked ? '1' : '0.5';

    heart.addEventListener('click', async () => {
      if (localStorage.getItem(likedKey) === '1') return;
      let newLikes = (post.likes || 0) + 1;
      likesCount.textContent = newLikes;
      likesCount.style.display = '';
      heart.style.opacity = '1';
      localStorage.setItem(likedKey, '1');
      await fetch(`${FIREBASE_URL}/posts/${postId}/likes.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLikes)
      });
    });

    likesRow.appendChild(heart);
    likesRow.appendChild(likesCount);

    // Comments UI
    const commentIcon = document.createElement('span');
    commentIcon.className = 'comment-icon';
    commentIcon.innerHTML = '💭';
    commentIcon.style.cursor = 'pointer';
    commentIcon.style.fontSize = '1.5em';
    commentIcon.style.userSelect = 'none';

    const commentsCount = document.createElement('span');
    commentsCount.className = 'comments-count';
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

      const res = await fetch(`${FIREBASE_URL}/comments/${postId}.json`);
      const postCommentsObj = await res.json() || {};
      const postComments = Object.values(postCommentsObj);

      if (postComments.length > 0) {
        postComments.forEach(comment => {
          const commentDiv = document.createElement('div');
          commentDiv.className = 'comment';
          const processedText = parsePostText(comment.text);
          commentDiv.innerHTML = `<div><b>${comment.username || 'Anonymous'}</b><span class="post-time">${timeAgo(comment.timestamp)}</span><br>${processedText}</div>`;
          commentsSection.appendChild(commentDiv);
        });
      } else {
        commentsSection.innerHTML = '<div class="comment">No comments yet.</div>';
      }

      commentIcon.parentNode.insertBefore(commentsSection, commentIcon.nextSibling);

      // Comment write tab
      const commentWriteTab = document.createElement('div');
      commentWriteTab.className = 'comment-tab-content';
      commentWriteTab.style.display = 'block';

      const commentInsertBtn = document.createElement('button');
      commentInsertBtn.textContent = 'Insert Media';
      commentInsertBtn.type = 'button';

      const commentInput = document.createElement('textarea');
      commentInput.placeholder = 'Write a comment...';
      commentInput.className = 'comment-input';

      // Comment tabs
      const commentTabs = document.createElement('div');
      commentTabs.className = 'comment-tabs';
      
      const commentTabsLeft = document.createElement('div');
      commentTabsLeft.className = 'comment-tabs-left';
      commentTabsLeft.innerHTML = `
        <button class="comment-tab-btn active" data-tab="write">Write</button>
        <button class="comment-tab-btn" data-tab="preview">Preview</button>
      `;
      
      const commentTabsRight = document.createElement('div');
      commentTabsRight.className = 'comment-tabs-right';
      
      const commentLinkBtn = document.createElement('button');
      commentLinkBtn.textContent = 'Link';
      commentLinkBtn.className = 'link-btn';
      commentLinkBtn.addEventListener('click', () => {
        const link = `[text](url)`;
        const cursorPos = commentInput.selectionStart;
        const textBefore = commentInput.value.substring(0, cursorPos);
        const textAfter = commentInput.value.substring(cursorPos);
        commentInput.value = textBefore + link + textAfter;
        commentInput.focus();
        commentInput.selectionStart = commentInput.selectionEnd = cursorPos + link.length;
      });
      
      commentTabsRight.appendChild(commentLinkBtn);
      commentTabsRight.appendChild(commentInsertBtn);
      
      commentTabs.appendChild(commentTabsLeft);
      commentTabs.appendChild(commentTabsRight);

      const commentMediaButtons = document.createElement('div');
      commentMediaButtons.className = 'comment-media-buttons';
      commentMediaButtons.style.display = 'none';
      commentMediaButtons.style.flexWrap = 'wrap';
      commentMediaButtons.style.gap = '8px';
      commentMediaButtons.style.marginTop = '8px';

      const commentMediaSearch = document.createElement('div');
      commentMediaSearch.className = 'comment-media-search';
      commentMediaSearch.style.display = 'none';
      commentMediaSearch.style.marginTop = '8px';

      const commentSearchInput = document.createElement('input');
      commentSearchInput.type = 'text';
      commentSearchInput.placeholder = 'Search...';
      commentSearchInput.style.width = '100%';
      commentSearchInput.style.padding = '8px';
      commentSearchInput.style.background = 'var(--overlay-bg)';
      commentSearchInput.style.color = 'var(--text-secondary)';
      commentSearchInput.style.border = '1px solid var(--border-color)';
      commentSearchInput.style.borderRadius = '4px';

      const commentSearchResults = document.createElement('div');
      commentSearchResults.style.marginTop = '8px';
      commentSearchResults.style.maxHeight = '150px';
      commentSearchResults.style.overflowY = 'auto';
      commentSearchResults.style.background = 'var(--overlay-bg)';
      commentSearchResults.style.border = '1px solid var(--border-color)';
      commentSearchResults.style.borderRadius = '4px';

      commentMediaSearch.appendChild(commentSearchInput);
      commentMediaSearch.appendChild(commentSearchResults);

      let commentSelectedType = null;

      commentInsertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (commentMediaButtons.style.display === 'none' && commentMediaSearch.style.display === 'none') {
          commentMediaButtons.style.display = 'flex';
        } else {
          commentMediaButtons.style.display = 'none';
          commentMediaSearch.style.display = 'none';
        }
      });

      document.querySelectorAll('.media-type-btn').forEach(btn => {
        const cloneBtn = btn.cloneNode(true);
        cloneBtn.addEventListener('click', () => {
          commentSelectedType = cloneBtn.dataset.type;
          commentMediaButtons.style.display = 'none';
          commentMediaSearch.style.display = 'block';
          commentSearchInput.focus();
          commentSearchInput.value = '';
          commentSearchResults.innerHTML = '';
        });
        commentMediaButtons.appendChild(cloneBtn);
      });

      commentSearchInput.addEventListener('input', () => {
        const query = commentSearchInput.value.trim().toLowerCase();
        if (!query) {
          commentSearchResults.innerHTML = '';
          return;
        }
        const filtered = MEDIA_ITEMS.filter(item => 
          item.media_type === commentSelectedType && item.title.toLowerCase().includes(query)
        ).slice(0, 10);
        
        commentSearchResults.innerHTML = '';
        filtered.forEach(item => {
          const div = document.createElement('div');
          div.style.padding = '8px';
          div.style.cursor = 'pointer';
          div.style.borderBottom = '1px solid var(--border-color)';
          div.textContent = item.title;
          div.addEventListener('click', () => {
            const tag = `[MEDIA:${item.media_type}:${item.source}:${item.source_id}:${item.title}:${item.status}]`;
            const cursorPos = commentInput.selectionStart;
            const textBefore = commentInput.value.substring(0, cursorPos);
            const textAfter = commentInput.value.substring(cursorPos);
            commentInput.value = textBefore + tag + textAfter;
            commentInput.focus();
            commentInput.selectionStart = commentInput.selectionEnd = cursorPos + tag.length;
            commentMediaSearch.style.display = 'none';
            commentMediaButtons.style.display = 'none';
            commentSearchInput.value = '';
            commentSearchResults.innerHTML = '';
          });
          div.addEventListener('mouseenter', () => {
            div.style.background = 'var(--bg-quaternary)';
          });
          div.addEventListener('mouseleave', () => {
            div.style.background = '';
          });
          commentSearchResults.appendChild(div);
        });
      });

      // Comment preview tab
      const commentPreviewTab = document.createElement('div');
      commentPreviewTab.className = 'comment-tab-content';
      commentPreviewTab.style.display = 'none';
      commentPreviewTab.style.minHeight = '80px';
      commentPreviewTab.style.padding = '12px';
      commentPreviewTab.style.background = 'var(--overlay-bg)';
      commentPreviewTab.style.border = '1px solid var(--border-color)';
      commentPreviewTab.style.borderRadius = '4px';
      commentPreviewTab.innerHTML = '<em>Nothing to preview</em>';

      // Tab switching
      commentTabs.querySelectorAll('.comment-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          commentTabs.querySelectorAll('.comment-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (btn.dataset.tab === 'write') {
            commentWriteTab.style.display = 'block';
            commentPreviewTab.style.display = 'none';
          } else {
            commentWriteTab.style.display = 'none';
            commentPreviewTab.style.display = 'block';
            commentPreviewTab.innerHTML = parsePostText(commentInput.value) || '<em>Nothing to preview</em>';
          }
        });
      });

      const emojiBtn = document.createElement('button');
      emojiBtn.type = 'button';
      emojiBtn.className = 'emoji-btn';
      emojiBtn.textContent = '😊';

      const emojiPicker = document.createElement('div');
      emojiPicker.className = 'emoji-picker';

      const emojis = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😍','😘','😜','🤔','😎','😢','😭','😡','👍','👎','🙏','🔥','🎉','💯','🥳','😇','🤩','😏','😬','😴','🤗','😱','🥺','😤','😈','💖','💔','💙','⭐','🌟','✨','⚡','🍶','🍺','🍻','🥂','🍷','🧂'];
      emojis.forEach(e => {
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = e;
        emojiSpan.addEventListener('click', () => {
          commentInput.value += e;
          emojiPicker.style.display = 'none';
          commentInput.focus();
        });
        emojiPicker.appendChild(emojiSpan);
      });
      emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = emojiPicker.style.display === 'none' || emojiPicker.style.display === '';
        emojiPicker.style.display = isHidden ? 'block' : 'none';
      });
      document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
          emojiPicker.style.display = 'none';
        }
      });

      const sendBtn = document.createElement('button');
      sendBtn.textContent = 'Send';
      sendBtn.className = 'send-comment-btn';

      sendBtn.addEventListener('click', async () => {
        const username = usernameField.value.trim() || 'Anonymous';
        const text = commentInput.value.trim();
        if (!text) return;

        sendBtn.disabled = true;

        const commentData = {
          username,
          text,
          timestamp: Math.floor(Date.now() / 1000)
        };

        await fetch(`${FIREBASE_URL}/comments/${postId}.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(commentData)
        });

        const commentDiv = document.createElement('div');
        commentDiv.className = 'comment';
        const processedText = parsePostText(text);
        commentDiv.innerHTML = `<div><b>${username}</b><span class="post-time">${timeAgo(commentData.timestamp)}</span><br>${processedText}</div>`;
        
        const noCommentsMsg = Array.from(commentsSection.querySelectorAll('.comment')).find(
          el => el.textContent === 'No comments yet.'
        );
        if (noCommentsMsg) noCommentsMsg.remove();
        
        commentsSection.insertBefore(commentDiv, commentTabs);

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

        commentsCount.textContent = newCount;
        commentsCount.style.display = '';
      });

      const commentBoxWrapper = document.createElement('div');
      commentBoxWrapper.style.display = 'flex';
      commentBoxWrapper.style.flexDirection = 'row';
      commentBoxWrapper.style.alignItems = 'flex-end';
      commentBoxWrapper.style.justifyContent = 'flex-end';
      commentBoxWrapper.style.gap = '10px';

      const emojiWrapper = document.createElement('div');
      emojiWrapper.style.position = 'relative';
      emojiWrapper.style.display = 'inline-block';
      emojiWrapper.appendChild(emojiBtn);
      emojiWrapper.appendChild(emojiPicker);

      commentBoxWrapper.appendChild(emojiWrapper);
      commentBoxWrapper.appendChild(sendBtn);

      const commentMediaContainer = document.createElement('div');
      commentMediaContainer.appendChild(commentMediaButtons);
      commentMediaContainer.appendChild(commentMediaSearch);

      commentWriteTab.appendChild(commentInput);
      commentWriteTab.appendChild(commentBoxWrapper);

      commentsSection.appendChild(commentTabs);
      commentsSection.appendChild(commentMediaContainer);
      commentsSection.appendChild(commentWriteTab);
      commentsSection.appendChild(commentPreviewTab);
      div.appendChild(commentsSection);
    });

    return div;
  }

  async function loadPosts() {
    if (!postsContainer) return;
    const loadingTimeout = setTimeout(() => {
      postsContainer.innerHTML = '<p class="empty-message">Loading posts...</p>';
    }, 2000);
    try {
      const response = await fetch(`${FIREBASE_URL}/posts.json?orderBy="timestamp"&limitToLast=25`);
      if (!response.ok) throw new Error('Failed to load posts');
      const data = await response.json();
      clearTimeout(loadingTimeout);
      postsContainer.innerHTML = '';
      if (!data) {
        postsContainer.innerHTML = '<p class="empty-message">No posts yet.</p>';
      } else {
        const posts = Object.entries(data).sort((a, b) => b[1].timestamp - a[1].timestamp);
        posts.forEach(([postId, post]) => {
          if (post) {
            const postDiv = renderPost(post, postId);
            postsContainer.appendChild(postDiv);
          }
        });
      }
      root.classList.add('loaded');
    } catch (err) {
      clearTimeout(loadingTimeout);
      console.error('Error loading posts:', err);
      postsContainer.innerHTML = '<p class="empty-message">Error loading posts.</p>';
      root.classList.add('loaded');
    }
  }

  loadPosts();
});

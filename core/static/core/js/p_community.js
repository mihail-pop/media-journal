document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('community-root');
  const FIREBASE_URL = root.dataset.firebaseUrl.replace(/\/$/, '');
  const MEDIA_ITEMS = JSON.parse(document.getElementById('media-items-json').textContent);

  const usernameField = document.getElementById('username-field');
  const postText = document.getElementById('post-text');
  const MAX_CHARACTERS = 2200;
  
  // Character limit enforcement
  postText.addEventListener('input', () => {
    if (postText.value.length > MAX_CHARACTERS) {
      postText.value = postText.value.substring(0, MAX_CHARACTERS);
    }
  });
  
  postText.addEventListener('keydown', (e) => {
    if (postText.value.length >= MAX_CHARACTERS && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
      e.preventDefault();
    }
  });
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
  const postImageBtn = document.getElementById('post-image-btn');
  const postImageBox = document.getElementById('post-image-box');
  const postImageInput = document.getElementById('post-image-input');
  const postImageSendBtn = document.getElementById('post-image-send-btn');

  // Pagination state
  let currentPage = 1;
  let hasMore = true;
  let isLoadingPosts = false;

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
  
  const emojis = ['😊', '😁', '😉', '😋', '😍', '🫨', '😜', '🤨', '🤔', '🧐', '😎', '😢', '🥹', '😭', '😡', '🥳', '😇', '🤩', '😏', '😴', '🤗', '😱', '🥺', '🤓', '🙂‍↕️', '🙂‍↔️', '🫠', '😮‍💨', '😤', '😈', '💀', '👀', '👍', '👎', '👏', '🔥', '🎉', '💯', '⭐', '🌟', '✨', '❤️', '🍻', '🧂'];
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
    if (!postEmojiPicker.contains(e.target) && e.target !== postEmojiBtn && !postEmojiBtn.contains(e.target)) {
      postEmojiPicker.style.display = 'none';
    }
  });

  // Set SVG for post emoji button
  postEmojiBtn.innerHTML = '<svg class="rating-svg-icon" width="24" height="24" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg>';

  // Post link button
  const postLinkBtn = document.getElementById('post-link-btn');
  
  // Create link input box
  const postLinkBox = document.createElement('div');
  postLinkBox.id = 'post-link-box';
  postLinkBox.classList.add('hidden');
  
  const postLinkTextInput = document.createElement('input');
  postLinkTextInput.type = 'text';
  postLinkTextInput.placeholder = 'text';
  postLinkTextInput.className = 'post-link-input';
  
  const postLinkUrlInput = document.createElement('input');
  postLinkUrlInput.type = 'text';
  postLinkUrlInput.placeholder = 'url';
  postLinkUrlInput.className = 'post-link-input';
  
  const postLinkInputWrapper = document.createElement('div');
  postLinkInputWrapper.className = 'post-link-input-wrapper';
  postLinkInputWrapper.appendChild(postLinkTextInput);
  
  const postLinkUrlWrapper = document.createElement('div');
  postLinkUrlWrapper.className = 'post-link-url-wrapper';
  
  const postLinkUrlInputFull = document.createElement('input');
  postLinkUrlInputFull.type = 'text';
  postLinkUrlInputFull.placeholder = 'url';
  postLinkUrlInputFull.className = 'post-link-input';
  postLinkUrlInputFull.style.flex = '1';
  
  const postLinkSendBtn = document.createElement('button');
  postLinkSendBtn.id = 'post-link-send-btn';
  postLinkSendBtn.textContent = 'Insert';
  postLinkSendBtn.type = 'button';
  
  postLinkUrlWrapper.appendChild(postLinkUrlInputFull);
  postLinkUrlWrapper.appendChild(postLinkSendBtn);
  
  postLinkBox.appendChild(postLinkTextInput);
  postLinkBox.appendChild(postLinkUrlWrapper);
  
  // Insert after post image box
  postImageBox.parentNode.insertBefore(postLinkBox, postImageBox.nextSibling);
  
  postLinkBtn.addEventListener('click', () => {
    const isHidden = postLinkBox.classList.contains('hidden');
    postLinkBox.classList.toggle('hidden');
    // Clear and hide image box and media buttons
    postImageBox.style.display = 'none';
    postImageInput.value = '';
    const imgError = postImageBox.querySelector('.image-error-message');
    if (imgError) imgError.style.display = 'none';
    mediaTypeButtons.style.display = 'none';
    mediaSearchBox.style.display = 'none';
    // Clear link error when opening
    const linkError = postLinkBox.querySelector('.link-error-message');
    if (isHidden && linkError) linkError.style.display = 'none';
    if (isHidden) {
      postLinkTextInput.focus();
    }
  });
  
  const insertPostLink = () => {
    const text = postLinkTextInput.value.trim();
    const url = postLinkUrlInputFull.value.trim();
    
    // Get or create error message display
    let errorDisplay = postLinkBox.querySelector('.link-error-message');
    if (!errorDisplay) {
      errorDisplay = document.createElement('div');
      errorDisplay.className = 'link-error-message';
      errorDisplay.style.color = '#ff9800';
      errorDisplay.style.background = 'rgba(255, 152, 0, 0.1)';
      errorDisplay.style.padding = '12px';
      errorDisplay.style.borderRadius = '4px';
      errorDisplay.style.marginBottom = '8px';
      errorDisplay.style.border = '1px solid #ff9800';
      errorDisplay.style.display = 'none';
      postLinkBox.insertBefore(errorDisplay, postLinkBox.firstChild);
    }

    if (!text || !url) {
      return;
    }

    if (!isValidUrl(url)) {
      errorDisplay.textContent = 'Please insert a valid url';
      errorDisplay.style.display = 'block';
      return;
    }

    errorDisplay.style.display = 'none';
    
    const linkTag = `[${text}](${url})`;
    const cursorPos = postText.selectionStart;
    const textBefore = postText.value.substring(0, cursorPos);
    const textAfter = postText.value.substring(cursorPos);
    postText.value = textBefore + linkTag + textAfter;
    postText.focus();
    postText.selectionStart = postText.selectionEnd = cursorPos + linkTag.length;
    postLinkTextInput.value = '';
    postLinkUrlInputFull.value = '';
    postLinkBox.classList.add('hidden');
    updatePreview();
  };
  
  postLinkSendBtn.addEventListener('click', insertPostLink);
  postLinkTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      postLinkUrlInputFull.focus();
    }
  });
  postLinkUrlInputFull.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertPostLink();
    }
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'write') {
        writeTab.classList.add('active');
        // Show interactive buttons in write mode
        postImageBtn.style.display = '';
        postLinkBtn.style.display = '';
        insertMediaBtn.style.display = '';
        postEmojiBtn.style.display = '';
      } else {
        previewTab.classList.add('active');
        updatePreview();
        // Hide interactive buttons in preview mode but keep send button
        postImageBtn.style.display = 'none';
        postLinkBtn.style.display = 'none';
        insertMediaBtn.style.display = 'none';
        postEmojiBtn.style.display = 'none';
        // Close any open pop-ups and clear them
        postImageBox.style.display = 'none';
        postImageInput.value = '';
        const imgError = postImageBox.querySelector('.image-error-message');
        if (imgError) imgError.style.display = 'none';
        if (postLinkBox) {
          postLinkBox.classList.add('hidden');
          postLinkTextInput.value = '';
          postLinkUrlInputFull.value = '';
          const linkError = postLinkBox.querySelector('.link-error-message');
          if (linkError) linkError.style.display = 'none';
        }
        mediaTypeButtons.style.display = 'none';
        mediaSearchBox.style.display = 'none';
      }
    });
  });

  // Insert Media button
  insertMediaBtn.addEventListener('click', () => {
    const linkBoxVisible = postLinkBox && !postLinkBox.classList.contains('hidden');
    if (mediaTypeButtons.style.display === 'none' && mediaSearchBox.style.display === 'none' && postImageBox.style.display === 'none' && !linkBoxVisible) {
      mediaTypeButtons.style.display = 'flex';
    } else {
      mediaTypeButtons.style.display = 'none';
      mediaSearchBox.style.display = 'none';
      // Clear and hide image box
      postImageBox.style.display = 'none';
      postImageInput.value = '';
      const imgError = postImageBox.querySelector('.image-error-message');
      if (imgError) imgError.style.display = 'none';
      // Clear and hide link box
      if (postLinkBox) {
        postLinkBox.classList.add('hidden');
        postLinkTextInput.value = '';
        postLinkUrlInputFull.value = '';
        const linkError = postLinkBox.querySelector('.link-error-message');
        if (linkError) linkError.style.display = 'none';
      }
    }
  });

  // Image button for posts
  postImageBtn.addEventListener('click', () => {
    const isHidden = postImageBox.style.display === 'none';
    postImageBox.style.display = isHidden ? 'block' : 'none';
    // Clear and hide link box and media buttons
    if (postLinkBox) {
      postLinkBox.classList.add('hidden');
      postLinkTextInput.value = '';
      postLinkUrlInputFull.value = '';
      const linkError = postLinkBox.querySelector('.link-error-message');
      if (linkError) linkError.style.display = 'none';
    }
    mediaTypeButtons.style.display = 'none';
    mediaSearchBox.style.display = 'none';
    // Clear image error when opening
    const imgError = postImageBox.querySelector('.image-error-message');
    if (isHidden && imgError) imgError.style.display = 'none';
    if (isHidden) {
      postImageInput.focus();
    }
  });

  // Helper function to insert image tag in post
  function insertPostImage() {
    const urlValue = postImageInput.value.trim();
    if (!urlValue) return;

    // Validate and parse imgur URL
    const result = parseImgur(urlValue);
    
    // Get or create error message display
    let errorDisplay = postImageBox.querySelector('.image-error-message');
    if (!errorDisplay) {
      errorDisplay = document.createElement('div');
      errorDisplay.className = 'image-error-message';
      errorDisplay.style.color = '#ff9800';
      errorDisplay.style.background = 'rgba(255, 152, 0, 0.1)';
      errorDisplay.style.padding = '12px';
      errorDisplay.style.borderRadius = '4px';
      errorDisplay.style.marginBottom = '8px';
      errorDisplay.style.border = '1px solid #ff9800';
      errorDisplay.style.display = 'none';
      postImageBox.insertBefore(errorDisplay, postImageBox.querySelector('div'));
    }

    if (result.error) {
      errorDisplay.textContent = result.message;
      errorDisplay.style.display = 'block';
      postImageInput.value = '';
      return;
    }

    errorDisplay.style.display = 'none';
    
    // Insert the image tag
    const imgTag = `[IMG:${result.url}]`;
    const cursorPos = postText.selectionStart;
    const textBefore = postText.value.substring(0, cursorPos);
    const textAfter = postText.value.substring(cursorPos);
    postText.value = textBefore + imgTag + textAfter;
    postText.focus();
    postText.selectionStart = postText.selectionEnd = cursorPos + imgTag.length;
    postImageInput.value = '';
    postImageBox.style.display = 'none';
    updatePreview();
  }

  // Handle image URL input - Enter key
  postImageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertPostImage();
    }
  });

  // Handle image send button click
  postImageSendBtn.addEventListener('click', insertPostImage);

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
    const source_id = item.provider_ids[item.source] || Object.values(item.provider_ids)[0];
    const source_name = item.provider_ids[item.source] ? item.source : Object.keys(item.provider_ids)[0];

    const tag = `[MEDIA:${item.media_type}:${source_name}:${source_id}:${item.title.replace(/:/g, '&#58;')}:${item.status}]`;
    const cursorPos = postText.selectionStart;
    const textBefore = postText.value.substring(0, cursorPos);
    const textAfter = postText.value.substring(cursorPos);
    postText.value = textBefore + tag + textAfter;
    postText.focus();
    postText.selectionStart = postText.selectionEnd = cursorPos + tag.length;
  }

  function parseImgur(url) {
    // Check if it's an album URL - these won't work
    if (url.includes('/a/')) {
      return { error: true, message: 'Album url won\'t work, copy the url of the image with the copy link button or right click' };
    }

    // Check if it's a gallery URL - these won't work
    if (url.includes('/gallery/')) {
      return { error: true, message: 'Gallery url won\'t work, copy the url of the image with the copy link button or right click' };
    }

    // Check if it contains imgur at all
    if (!url.includes('imgur.com')) {
      return { error: true, message: 'Please insert an imgur link' };
    }

    // 1. If it's already a direct i.imgur.com link, validate format
    if (url.includes('i.imgur.com')) {
      // Should be like https://i.imgur.com/TB5kDiG.png
      return { url: url };
    }

    // 2. Check if it's imgur.com/[ID] format (no /a/ or /gallery/)
    if (url.includes('imgur.com')) {
      // Remove trailing slashes and protocol
      let cleanUrl = url.replace(/\/$/, "");
      
      // Get the last part of the URL (the ID)
      let parts = cleanUrl.split('/');
      let lastPart = parts[parts.length - 1];

      // Check for invalid imgur URL patterns
      if (lastPart.includes('gallery') || lastPart === 'a' || lastPart === '') {
        return { error: true, message: 'Gallery url won\'t work, copy the url of the image with the copy link button or right click' };
      }

      // Return the direct link format
      return { url: `https://i.imgur.com/${lastPart}.png` };
    }
    
    return { error: true, message: 'Please insert an imgur link' };
  }

  function isValidUrl(urlString) {
    try {
      new URL(urlString);
      return true;
    } catch (e) {
      return false;
    }
  }

  function processYouTubeLinks(text) {
    const youtubeRegex = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)([^\s]*)/g;
    let replacementIndex = 0;
    const youtubeRegex2 = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)([^\s]*)/g;
    
    return text.replace(youtubeRegex2, (match, www, urlType, videoId, params) => {
      const timeMatch = params.match(/[&?]t=(\d+)/);
      const startTime = timeMatch ? `?start=${timeMatch[1]}` : '';
      
      replacementIndex++;
      
      if (replacementIndex <= 2) {
        // Embed first 2 videos
        return `<iframe width=100% height=450px src="https://www.youtube.com/embed/${videoId}${startTime}" frameborder="0" allowfullscreen referrerpolicy="origin-when-cross-origin"></iframe>`;
      } else {
        // Rest as links
        return `<a href="${match}" target="_blank">Video ${replacementIndex}</a>`;
      }
    });
  }

  function parsePostText(text) {
    if (!text) return '';
    let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Parse image tags first - collect all images
    const imgRegex = /\[IMG:([^\]]+)\]/g;
    const images = [];
    let match;
    let lastIndex = 0;
    const textParts = [];
    
    // Collect all images
    const imgRegex2 = /\[IMG:([^\]]+)\]/g;
    while ((match = imgRegex2.exec(html)) !== null) {
      images.push(match[1]);
    }
    
    // Replace image tags - create slider if multiple images
    let imageIndex = 0;
    html = html.replace(imgRegex, (match, url) => {
      imageIndex++;
      const result = parseImgur(url);
      
      if (result.error) {
        return `<div style="color: #ff9800; background: rgba(255, 152, 0, 0.1); padding: 12px; border-radius: 4px; margin-top: 8px; border-left: 3px solid #ff9800;">${result.message}</div>`;
      }
      
      // If this is the first image and there are multiple, show slider
      if (imageIndex === 1 && images.length > 1) {
        const sliderId = 'slider_' + Math.random().toString(36).substr(2, 9);
        let sliderHTML = `<div class="slider-container" id="${sliderId}_container" style="position: relative; max-width: 100%; margin-top:-4px; border-radius: 4px; overflow: hidden; aspect-ratio: 1920/1080; background: #000;">`;
        sliderHTML += `<img id="${sliderId}" src="${result.url}" alt="image" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block;">`;
        sliderHTML += `<div class="slider-nav-left" id="${sliderId}_left" style="position: absolute; top: 50%; left: 10px; transform: translateY(-50%); z-index: 10; opacity: 0; transition: opacity 0.3s ease;">`;
        sliderHTML += `<button onclick="document.getElementById('${sliderId}').previousImage?.(); event.stopPropagation();" style="background: rgba(0,0,0,0.6); color: white; border: none; padding: 0; width: 40px; height: 40px; cursor: pointer; border-radius: 4px; transition: background 0.2s; display: flex; align-items: center; justify-content: center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>`;
        sliderHTML += `</div>`;
        sliderHTML += `<div class="slider-nav-right" id="${sliderId}_right" style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); z-index: 10; opacity: 0; transition: opacity 0.3s ease;">`;
        sliderHTML += `<button onclick="document.getElementById('${sliderId}').nextImage?.(); event.stopPropagation();" style="background: rgba(0,0,0,0.6); color: white; border: none; padding: 0; width: 40px; height: 40px; cursor: pointer; border-radius: 4px; transition: background 0.2s; display: flex; align-items: center; justify-content: center;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>`;
        sliderHTML += `</div>`;
        sliderHTML += `<div style="position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: white; padding: 6px 12px; border-radius: 4px; font-size: 12px; z-index: 10; font-weight: 500;">`;
        sliderHTML += `<span id="${sliderId}_counter">1</span> / ${images.length}`;
        sliderHTML += `</div></div>`;
        
        // Store image data on element
        const parsed = images.map(img => {
          const res = parseImgur(img);
          return res.error ? null : res.url;
        }).filter(u => u);
        
        setTimeout(() => {
          const imgElement = document.getElementById(sliderId);
          const container = document.getElementById(sliderId + '_container');
          const leftNav = document.getElementById(sliderId + '_left');
          const rightNav = document.getElementById(sliderId + '_right');
          
          if (imgElement && container) {
            let currentIndex = 0;
            const validImages = parsed;
            
            imgElement.nextImage = () => {
              currentIndex = (currentIndex + 1) % validImages.length;
              imgElement.src = validImages[currentIndex];
              document.getElementById(sliderId + '_counter').textContent = currentIndex + 1;
            };
            
            imgElement.previousImage = () => {
              currentIndex = (currentIndex - 1 + validImages.length) % validImages.length;
              imgElement.src = validImages[currentIndex];
              document.getElementById(sliderId + '_counter').textContent = currentIndex + 1;
            };
            
            // Add hover listeners to show/hide buttons
            container.addEventListener('mouseenter', () => {
              if (leftNav) leftNav.style.opacity = '1';
              if (rightNav) rightNav.style.opacity = '1';
            });
            
            container.addEventListener('mouseleave', () => {
              if (leftNav) leftNav.style.opacity = '0';
              if (rightNav) rightNav.style.opacity = '0';
            });
          }
        }, 0);
        
        return sliderHTML;
      } else if (imageIndex > 1) {
        // Skip additional images when slider is shown
        return '';
      }
      
      return `<div style="position: relative; max-width: 100%; margin-top: 2px; border-radius: 4px; overflow: hidden; aspect-ratio: 1920/1080; background: #000;"><img src="${result.url}" alt="image" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block;"></div>`;
    });
    
    // Parse media tags (match everything except ] in title to avoid capturing markdown links)
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
      postPreview.innerHTML = '';
      mediaTypeButtons.style.display = 'none';
      mediaSearchBox.style.display = 'none';
      // Reset pagination and reload
      currentPage = 1;
      hasMore = true;
      loadPosts(1, false);
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
    div.className = 'community-post';
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
        url = `http://${window.location.hostname}:8000/${item.source}/${item.media_type}/${item.source_id}/`;
      }
      message = `${post.action} <a href="${url}" target="_blank">${item.title}</a>`;
    } else {
      message = '';
    }
    div.innerHTML = `<p><strong>${post.user || 'Anonymous'}</strong><span class="post-time">${timeAgo(post.timestamp || 0)}</span><br><br>${message}</p>`;

    // Likes UI
    const likesRow = document.createElement('div');
    likesRow.className = 'likes-row';

    const heart = document.createElement('span');
    heart.className = 'like-heart like-heart-icon';
    heart.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';

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
    const commentIcon = document.createElement('button');
    commentIcon.className = 'comment-icon';
    commentIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    commentIcon.style.cursor = 'pointer';
    commentIcon.style.fontSize = '1em';
    commentIcon.style.userSelect = 'none';
    commentIcon.style.background = 'none';
    commentIcon.style.border = 'none';
    commentIcon.style.color = 'var(--text-secondary)';
    commentIcon.style.display = 'flex';
    commentIcon.style.alignItems = 'center';
    commentIcon.style.justifyContent = 'center';
    commentIcon.style.padding = '0px';

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
      
      const commentImageBtn = document.createElement('button');
      commentImageBtn.className = 'image-btn';
      commentImageBtn.title = 'Insert image';
      commentImageBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
      `;
      
      const commentLinkBtn = document.createElement('button');
      commentLinkBtn.textContent = 'Link';
      commentLinkBtn.className = 'link-btn';
      
      const commentLinkBox = document.createElement('div');
      commentLinkBox.style.display = 'none';
      commentLinkBox.style.padding = '12px 12px 8px 12px';
      commentLinkBox.style.background = 'var(--overlay-bg)';
      commentLinkBox.style.borderRadius = '6px';
      commentLinkBox.style.marginTop = '8px';
      commentLinkBox.style.border = '1px solid var(--border-color)';
      
      const commentLinkTextInput = document.createElement('input');
      commentLinkTextInput.type = 'text';
      commentLinkTextInput.placeholder = 'text';
      commentLinkTextInput.style.width = '100%';
      commentLinkTextInput.style.padding = '8px 12px';
      commentLinkTextInput.style.background = 'var(--bg-tertiary)';
      commentLinkTextInput.style.color = 'var(--text-secondary)';
      commentLinkTextInput.style.border = '1px solid var(--border-color)';
      commentLinkTextInput.style.borderRadius = '4px';
      commentLinkTextInput.style.fontSize = '0.95rem';
      commentLinkTextInput.style.boxSizing = 'border-box';
      commentLinkTextInput.style.marginBottom = '8px';
      
      const commentLinkUrlWrapper = document.createElement('div');
      commentLinkUrlWrapper.style.display = 'flex';
      commentLinkUrlWrapper.style.gap = '8px';
      
      const commentLinkUrlInput = document.createElement('input');
      commentLinkUrlInput.type = 'text';
      commentLinkUrlInput.placeholder = 'url';
      commentLinkUrlInput.style.flex = '1';
      commentLinkUrlInput.style.padding = '8px 12px';
      commentLinkUrlInput.style.background = 'var(--bg-tertiary)';
      commentLinkUrlInput.style.color = 'var(--text-secondary)';
      commentLinkUrlInput.style.border = '1px solid var(--border-color)';
      commentLinkUrlInput.style.borderRadius = '4px';
      commentLinkUrlInput.style.fontSize = '0.95rem';
      commentLinkUrlInput.style.boxSizing = 'border-box';
      
      const commentLinkSendBtn = document.createElement('button');
      commentLinkSendBtn.textContent = 'Insert';
      commentLinkSendBtn.type = 'button';
      commentLinkSendBtn.style.padding = '8px 16px';
      commentLinkSendBtn.style.background = 'var(--border)';
      commentLinkSendBtn.style.color = 'white';
      commentLinkSendBtn.style.border = 'none';
      commentLinkSendBtn.style.borderRadius = '4px';
      commentLinkSendBtn.style.cursor = 'pointer';
      commentLinkSendBtn.style.fontWeight = 'bold';
      commentLinkSendBtn.style.fontSize = '0.9rem';
      commentLinkSendBtn.style.whiteSpace = 'nowrap';
      
      commentLinkUrlWrapper.appendChild(commentLinkUrlInput);
      commentLinkUrlWrapper.appendChild(commentLinkSendBtn);
      
      commentLinkBox.appendChild(commentLinkTextInput);
      commentLinkBox.appendChild(commentLinkUrlWrapper);
      
      commentLinkBtn.addEventListener('click', () => {
        const isHidden = commentLinkBox.style.display === 'none';
        commentLinkBox.style.display = isHidden ? 'block' : 'none';
        commentImageBox.style.display = 'none';
        commentMediaButtons.style.display = 'none';
        commentMediaSearch.style.display = 'none';
        if (isHidden) {
          commentLinkTextInput.focus();
        }
      });
      
      const insertCommentLink = () => {
        const text = commentLinkTextInput.value.trim();
        const url = commentLinkUrlInput.value.trim();
        
        // Get or create error message display
        let errorDisplay = commentLinkBox.querySelector('.link-error-message');
        if (!errorDisplay) {
          errorDisplay = document.createElement('div');
          errorDisplay.className = 'link-error-message';
          errorDisplay.style.color = '#ff9800';
          errorDisplay.style.background = 'rgba(255, 152, 0, 0.1)';
          errorDisplay.style.padding = '12px';
          errorDisplay.style.borderRadius = '4px';
          errorDisplay.style.marginBottom = '8px';
          errorDisplay.style.border = '1px solid #ff9800';
          errorDisplay.style.display = 'none';
          commentLinkBox.insertBefore(errorDisplay, commentLinkBox.firstChild);
        }

        if (!text || !url) {
          return;
        }

        if (!isValidUrl(url)) {
          errorDisplay.textContent = 'Please insert a valid url';
          errorDisplay.style.display = 'block';
          return;
        }

        errorDisplay.style.display = 'none';
        
        const linkTag = `[${text}](${url})`;
        const cursorPos = commentInput.selectionStart;
        const textBefore = commentInput.value.substring(0, cursorPos);
        const textAfter = commentInput.value.substring(cursorPos);
        commentInput.value = textBefore + linkTag + textAfter;
        commentInput.focus();
        commentInput.selectionStart = commentInput.selectionEnd = cursorPos + linkTag.length;
        commentLinkTextInput.value = '';
        commentLinkUrlInput.value = '';
        commentLinkBox.style.display = 'none';
      };
      
      commentLinkSendBtn.addEventListener('click', insertCommentLink);
      commentLinkTextInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commentLinkUrlInput.focus();
        }
      });
      commentLinkUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          insertCommentLink();
        }
      });
      
      commentTabsRight.appendChild(commentImageBtn);
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

      const commentImageBox = document.createElement('div');
      commentImageBox.style.display = 'none';
      commentImageBox.style.padding = '12px 12px 8px 12px';
      commentImageBox.style.background = 'var(--overlay-bg)';
      commentImageBox.style.borderRadius = '6px';
      commentImageBox.style.marginTop = '8px';
      commentImageBox.style.border = '1px solid var(--border-color)';
      
      const commentImageBoxText = document.createElement('p');
      commentImageBoxText.style.margin = '0 0 8px 0';
      commentImageBoxText.style.color = 'var(--text-secondary)';
      commentImageBoxText.style.fontSize = '0.95rem';
      commentImageBoxText.innerHTML = 'Upload the image on <a href="https://imgur.com" target="_blank" style="color: var(--special-color); text-decoration: none;">Imgur</a> and copy the url here:';
      
      const commentImageInput = document.createElement('input');
      commentImageInput.type = 'text';
      commentImageInput.placeholder = 'Paste imgur url here...';
      commentImageInput.style.width = '100%';
      commentImageInput.style.padding = '8px 12px';
      commentImageInput.style.background = 'var(--bg-tertiary)';
      commentImageInput.style.color = 'var(--text-secondary)';
      commentImageInput.style.border = '1px solid var(--border-color)';
      commentImageInput.style.borderRadius = '4px';
      commentImageInput.style.fontSize = '0.95rem';
      commentImageInput.style.boxSizing = 'border-box';
      commentImageInput.style.flex = '1';
      
      const commentImageSendBtn = document.createElement('button');
      commentImageSendBtn.textContent = 'Insert';
      commentImageSendBtn.type = 'button';
      commentImageSendBtn.style.padding = '8px 16px';
      commentImageSendBtn.style.background = 'var(--border)';
      commentImageSendBtn.style.color = 'white';
      commentImageSendBtn.style.border = 'none';
      commentImageSendBtn.style.borderRadius = '4px';
      commentImageSendBtn.style.cursor = 'pointer';
      commentImageSendBtn.style.fontWeight = 'bold';
      commentImageSendBtn.style.fontSize = '0.9rem';
      commentImageSendBtn.style.whiteSpace = 'nowrap';

      const commentImageInputWrapper = document.createElement('div');
      commentImageInputWrapper.style.display = 'flex';
      commentImageInputWrapper.style.gap = '8px';
      commentImageInputWrapper.appendChild(commentImageInput);
      commentImageInputWrapper.appendChild(commentImageSendBtn);
      
      commentImageBox.appendChild(commentImageBoxText);
      commentImageBox.appendChild(commentImageInputWrapper);

      commentImageBtn.addEventListener('click', () => {
        const isHidden = commentImageBox.style.display === 'none';
        commentImageBox.style.display = isHidden ? 'block' : 'none';
        commentMediaButtons.style.display = 'none';
        commentMediaSearch.style.display = 'none';
        commentLinkBox.style.display = 'none';
        if (isHidden) {
          commentImageInput.focus();
        }
      });

      commentImageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          insertCommentImage();
        }
      });

      commentImageSendBtn.addEventListener('click', insertCommentImage);

      function insertCommentImage() {
        const urlValue = commentImageInput.value.trim();
        if (!urlValue) return;

        // Validate and parse imgur URL
        const result = parseImgur(urlValue);
        
        // Get or create error message display
        let errorDisplay = commentImageBox.querySelector('.image-error-message');
        if (!errorDisplay) {
          errorDisplay = document.createElement('div');
          errorDisplay.className = 'image-error-message';
          errorDisplay.style.color = '#ff9800';
          errorDisplay.style.background = 'rgba(255, 152, 0, 0.1)';
          errorDisplay.style.padding = '12px';
          errorDisplay.style.borderRadius = '4px';
          errorDisplay.style.marginBottom = '8px';
          errorDisplay.style.border = '1px solid #ff9800';
          errorDisplay.style.display = 'none';
          commentImageBox.insertBefore(errorDisplay, commentImageBox.querySelector('p').nextSibling);
        }

        if (result.error) {
          errorDisplay.textContent = result.message;
          errorDisplay.style.display = 'block';
          commentImageInput.value = '';
          return;
        }

        errorDisplay.style.display = 'none';
        
        // Insert the image tag
        const imgTag = `[IMG:${result.url}]`;
        const cursorPos = commentInput.selectionStart;
        const textBefore = commentInput.value.substring(0, cursorPos);
        const textAfter = commentInput.value.substring(cursorPos);
        commentInput.value = textBefore + imgTag + textAfter;
        commentInput.focus();
        commentInput.selectionStart = commentInput.selectionEnd = cursorPos + imgTag.length;
        commentImageInput.value = '';
        commentImageBox.style.display = 'none';
      }

      let commentSelectedType = null;

      commentInsertBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (commentMediaButtons.style.display === 'none' && commentMediaSearch.style.display === 'none' && commentImageBox.style.display === 'none' && commentLinkBox.style.display === 'none') {
          commentMediaButtons.style.display = 'flex';
        } else {
          commentMediaButtons.style.display = 'none';
          commentMediaSearch.style.display = 'none';
          commentImageBox.style.display = 'none';
          commentLinkBox.style.display = 'none';
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
            const source_id = item.provider_ids[item.source] || Object.values(item.provider_ids)[0];
            const source_name = item.provider_ids[item.source] ? item.source : Object.keys(item.provider_ids)[0];
            const tag = `[MEDIA:${item.media_type}:${source_name}:${source_id}:${item.title}:${item.status}]`;
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
            // Show interactive buttons in write mode
            commentImageBtn.style.display = '';
            commentLinkBtn.style.display = '';
            commentInsertBtn.style.display = '';
            svgWrapper.style.display = '';
          } else {
            commentWriteTab.style.display = 'none';
            commentPreviewTab.style.display = 'block';
            commentPreviewTab.innerHTML = parsePostText(commentInput.value) || '<em>Nothing to preview</em>';
            // Hide interactive buttons and pop-ups in preview mode
            commentImageBtn.style.display = 'none';
            commentLinkBtn.style.display = 'none';
            commentInsertBtn.style.display = 'none';
            svgWrapper.style.display = 'none';
            // Close any open pop-ups
            commentImageBox.style.display = 'none';
            commentLinkBox.style.display = 'none';
            commentMediaButtons.style.display = 'none';
            commentMediaSearch.style.display = 'none';
          }
        });
      });

      const likeBtn = document.createElement('button');
      likeBtn.type = 'button';
      likeBtn.style.background = 'none';
      likeBtn.style.border = 'none';
      likeBtn.style.cursor = 'pointer';
      likeBtn.style.padding = '6px';
      likeBtn.style.display = 'flex';
      likeBtn.style.alignItems = 'center';
      likeBtn.style.justifyContent = 'center';
      likeBtn.style.color = 'var(--text-secondary)';
      likeBtn.style.transition = 'color 0.2s';
      likeBtn.innerHTML = '<svg class="rating-svg-icon" width="20" height="20" viewBox="0 0 496 512"><path fill="currentColor" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z"></path></svg>';
      likeBtn.addEventListener('mouseenter', () => likeBtn.style.color = 'var(--special-color)');
      likeBtn.addEventListener('mouseleave', () => likeBtn.style.color = 'var(--text-secondary)');

      const emojiPicker = document.createElement('div');
      emojiPicker.className = 'emoji-picker';
      emojiPicker.style.display = 'none';

      const commentEmojis = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😍','😘','😜','🤔','😎','😢','😭','😡','👍','👎','🙏','🔥','🎉','💯','🥳','😇','🤩','😏','😬','😴','🤗','😱','🥺','😤','😈','💖','💔','💙','⭐','🌟','✨','⚡','🍶','🍺','🍻','🥂','🍷','🧂'];
      commentEmojis.forEach(e => {
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = e;
        emojiSpan.addEventListener('click', () => {
          commentInput.value += e;
          emojiPicker.style.display = 'none';
          commentInput.focus();
        });
        emojiPicker.appendChild(emojiSpan);
      });

      likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = emojiPicker.style.display === 'none' || emojiPicker.style.display === '';
        emojiPicker.style.display = isHidden ? 'block' : 'none';
      });
      
      document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== likeBtn && !likeBtn.contains(e.target)) {
          emojiPicker.style.display = 'none';
        }
      });

      const svgWrapper = document.createElement('div');
      svgWrapper.style.display = 'flex';
      svgWrapper.style.gap = '8px';
      svgWrapper.style.alignItems = 'center';
      svgWrapper.style.position = 'relative';
      svgWrapper.appendChild(likeBtn);
      svgWrapper.appendChild(emojiPicker);

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
        commentPreviewTab.innerHTML = '';
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
      commentBoxWrapper.style.marginTop = '12px';

      commentBoxWrapper.appendChild(svgWrapper);
      commentBoxWrapper.appendChild(sendBtn);

      const commentMediaContainer = document.createElement('div');
      commentMediaContainer.appendChild(commentMediaButtons);
      commentMediaContainer.appendChild(commentMediaSearch);
      commentMediaContainer.appendChild(commentImageBox);
      commentMediaContainer.appendChild(commentLinkBox);

      commentWriteTab.appendChild(commentInput);

      commentsSection.appendChild(commentTabs);
      commentsSection.appendChild(commentMediaContainer);
      commentsSection.appendChild(commentWriteTab);
      commentsSection.appendChild(commentPreviewTab);
      commentsSection.appendChild(commentBoxWrapper);
      div.appendChild(commentsSection);
    });

    return div;
  }

  async function loadPosts(page = 1, append = false) {
    if (isLoadingPosts || (!append && !hasMore)) return;
    if (!append && page === 1) isLoadingPosts = true; // Only set loading for initial load
    
    const shouldShowLoading = !append && page === 1;
    const loadingTimeout = shouldShowLoading ? setTimeout(() => {
      postsContainer.innerHTML = '<p class="empty-message">Loading posts...</p>';
    }, 2000) : null;

    try {
      const response = await fetch(`/community/posts/?page=${page}`);
      if (!response.ok) throw new Error('Failed to load posts');
      
      const data = await response.json();
      
      if (loadingTimeout) clearTimeout(loadingTimeout);
      
      // Only clear container on initial load
      if (!append && page === 1) {
        postsContainer.innerHTML = '';
      }
      
      if (!data.items || data.items.length === 0) {
        if (!append && page === 1) {
          postsContainer.innerHTML = '<p class="empty-message">No posts yet.</p>';
        }
        hasMore = false;
      } else {
        // Render posts
        data.items.forEach(post => {
          const postDiv = renderPost(post, post.id);
          postsContainer.appendChild(postDiv);
        });
        
        hasMore = data.has_more;
        currentPage = page;
      }
      
      root.classList.add('loaded');
    } catch (err) {
      if (loadingTimeout) clearTimeout(loadingTimeout);
      console.error('Error loading posts:', err);
      if (!append && page === 1) {
        postsContainer.innerHTML = '<p class="empty-message">Error loading posts.</p>';
      }
      root.classList.add('loaded');
    } finally {
      isLoadingPosts = false;
    }
  }

  // Infinite scroll detection
  function setupInfiniteScroll() {
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        // Check if user is near bottom
        const scrollPosition = window.innerHeight + window.scrollY;
        const documentHeight = document.documentElement.scrollHeight;
        
        // Trigger load when user is within 800px of bottom
        if (scrollPosition >= documentHeight - 800 && hasMore && !isLoadingPosts) {
          isLoadingPosts = true;
          loadPosts(currentPage + 1, true);
        }
      }, 100);
    });
  }

  // Initial load and setup
  loadPosts(1, false);
  setupInfiniteScroll();
});

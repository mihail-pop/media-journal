let musicPlayer;
let musicPlaylist = [];
let musicCurrentIndex = 0;
let isMusicPlayerReady = false;
let isMusicInitialized = false;
let playedSongs = [];
let isSequentialMode = false;
let isRestoringFromBfcache = false;
const tabId = Date.now() + Math.random();

// New Session History
let sessionHistory = [];
let historyIndex = -1;

// SVG Icons
const iconPlay = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
const iconPause = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
const iconPrev = `<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
const iconNext = `<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`;
const iconInfo = `<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;
const iconTheater = `<svg viewBox="0 0 24 24"><path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z"/></svg>`;
const iconSmall = `<svg viewBox="0 0 24 24"><path d="M19 7H5v10h14V7zM4 5h16c.55 0 1 .45 1 1v12c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1z"/></svg>`;
const iconFsEnter = `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
const iconFsExit = `<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
const iconClose = `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
const iconHistory = `<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8z"/></svg>`;
const iconHeart = (isFav) => {
    if (isFav) {
        // Added style="fill: red;" to override the CSS that forces all icons to be white
        return `<svg style="fill: red;" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
    } else {
        // Removed the hardcoded fill="white", it will naturally inherit the white color from the button
        return `<svg viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>`;
    }
};

window.startCustomPlaylist = function(playlist, startIndex) {
    sessionHistory = [];
    historyIndex = -1;
    localStorage.removeItem('music_player_history');
    localStorage.removeItem('music_player_history_index');

    musicPlaylist = playlist;
    musicCurrentIndex = startIndex;
    isSequentialMode = true;
    playedSongs = [musicPlaylist[startIndex].video_id];
    
    localStorage.setItem('musicPlayerEnabled', 'list');
    localStorage.setItem('music_player_playlist', JSON.stringify(playlist));
    localStorage.setItem('music_player_index', startIndex);
    localStorage.setItem('music_player_active_tab', tabId);
    
    const toggle = document.getElementById('music-player-toggle');
    if (toggle) toggle.checked = true;
    
    loadYouTubeAPI();
    if (window.YT && window.YT.Player) {
        if (musicPlayer && musicPlayer.destroy) {
            musicPlayer.destroy();
            isMusicPlayerReady = false;
        }
        createPlayer(musicPlaylist[musicCurrentIndex].video_id, 0);
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

function loadYouTubeAPI() {
  if (window.YT || document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
  
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function() {
  if (!isMusicInitialized) {
    isMusicInitialized = true;
    initMusicPlayer();
  }
};

function initMusicPlayer() {
  const savedMode = localStorage.getItem('musicPlayerEnabled');
  const toggle = document.getElementById('music-player-toggle');
  
  if (toggle) {
    const currentMode = toggle.dataset.mode;
    // Ensure the toggle is checked if we are explicitly playing a list AND we are on the music.html page ('filtered')
    toggle.checked = (savedMode === currentMode) || (savedMode === 'list' && currentMode === 'filtered');
  }
  
  if (savedMode) {
    localStorage.setItem('music_player_active_tab', tabId);
    loadYouTubeAPI();
    if (window.YT && window.YT.Player) {
      loadPlaylist();
    }
  }
}

function loadPlaylist() {
  const savedMode = localStorage.getItem('musicPlayerEnabled');
  const lastVideo = localStorage.getItem('music_player_video');
  const lastTime = parseFloat(localStorage.getItem('music_player_time')) || 0;
  
  if (savedMode === 'list') {
      try {
          const savedList = JSON.parse(localStorage.getItem('music_player_playlist'));
          if (savedList && savedList.length > 0) {
              musicPlaylist = savedList;
              musicCurrentIndex = parseInt(localStorage.getItem('music_player_index')) || 0;
              
              if (lastVideo && musicPlaylist.find(v => v.video_id === lastVideo)) {
                  musicCurrentIndex = musicPlaylist.findIndex(v => v.video_id === lastVideo);
              }
              
              isSequentialMode = true;
              if (musicCurrentIndex >= musicPlaylist.length) musicCurrentIndex = 0;
              playedSongs = [musicPlaylist[musicCurrentIndex].video_id];
              
              createPlayer(lastVideo || musicPlaylist[musicCurrentIndex].video_id, lastTime);
              return;
          }
      } catch(e) {}
  }

  if (savedMode === 'filtered' && window.getFilteredMusicPlaylist) {
      window.getFilteredMusicPlaylist().then(playlist => {
          if (playlist && playlist.length > 0) {
              musicPlaylist = shuffleArray(playlist);
              musicCurrentIndex = 0;
              
              if (lastVideo && musicPlaylist.find(v => v.video_id === lastVideo)) {
                  musicCurrentIndex = musicPlaylist.findIndex(v => v.video_id === lastVideo);
              }
              
              isSequentialMode = true;
              playedSongs = [musicPlaylist[musicCurrentIndex].video_id];
              
              localStorage.setItem('musicPlayerEnabled', 'list');
              localStorage.setItem('music_player_playlist', JSON.stringify(musicPlaylist));
              localStorage.setItem('music_player_index', musicCurrentIndex);
              
              createPlayer(lastVideo || musicPlaylist[musicCurrentIndex].video_id, lastTime);
          } else {
              alert("No playable YouTube videos found with current filters.");
              const toggle = document.getElementById('music-player-toggle');
              if (toggle) toggle.checked = false;
              localStorage.removeItem('musicPlayerEnabled');
          }
      }).catch(e => {
          console.error(e);
          alert("Error generating playlist.");
      });
      return;
  }

  isSequentialMode = false;
  let status = 'all';
  
  if (savedMode === 'status') {
    status = localStorage.getItem('music_player_status') || 'all';
  }
  
  fetch(`/api/favorite-music-videos/?mode=${savedMode}&status=${status}`)
    .then(res => res.json())
    .then(data => {
      if (data.videos && data.videos.length > 0) {
        musicPlaylist = shuffleArray(data.videos);
        playedSongs = [];
        
        if (lastVideo && musicPlaylist.find(v => v.video_id === lastVideo)) {
          musicCurrentIndex = musicPlaylist.findIndex(v => v.video_id === lastVideo);
          playedSongs.push(lastVideo);
          createPlayer(lastVideo, lastTime);
        } else {
          musicCurrentIndex = 0;
          playedSongs.push(musicPlaylist[0].video_id);
          createPlayer(musicPlaylist[musicCurrentIndex].video_id, 0);
        }
      }
    });
}

function createPlayer(videoId, startTime = 0) {
  const container = document.getElementById('music-player-container');
  if (!container) return;
  
  let actualVideoToPlay = videoId;
  
  // Intercept the request to play the correct video if navigating directly from a page reload with history
  try {
      const storedHist = JSON.parse(localStorage.getItem('music_player_history'));
      const storedIdx = parseInt(localStorage.getItem('music_player_history_index'));
      if (storedHist && storedHist.length > 0 && !isNaN(storedIdx)) {
          sessionHistory = storedHist;
          historyIndex = storedIdx;
          if (sessionHistory[historyIndex]) {
              actualVideoToPlay = sessionHistory[historyIndex].video_id;
          }
      }
  } catch(e) {}
  
  let currentData = musicPlaylist.find(v => v.video_id === actualVideoToPlay);
  
  // If the video isn't found in the current fresh playlist, fall back to our saved history entry
  if (!currentData && sessionHistory.length > 0 && sessionHistory[historyIndex]) {
      currentData = sessionHistory[historyIndex];
  }
  
  if (!currentData) return;
  
  // Initialize Session History if starting fresh
  if (sessionHistory.length === 0) {
      sessionHistory = [currentData];
      historyIndex = 0;
      saveHistory();
  }
  
  if (musicPlayer && musicPlayer.destroy) {
    try { musicPlayer.destroy(); } catch(e) {}
    isMusicPlayerReady = false;
  }
  
  container.style.display = 'block';
  
  const isFavorite = currentData.is_favorite;
  const sourceId = currentData.source_id;
  
  container.innerHTML = `
    <style>
      #mp-wrapper { display: flex; flex-direction: row; width: 100%; height: 100%; background: #000; font-family: sans-serif; overflow: hidden; }
      #mp-left { display: flex; flex-direction: column; flex: 1; position: relative; }
      #mp-controls { display: flex; align-items: center; background: #222; padding: 0 10px; z-index: 10; flex-shrink: 0; justify-content: space-between; }
      .mp-ctrl-group { display: flex; align-items: center; gap: 8px; flex: 1; }
      .mp-ctrl-center { justify-content: center; }
      .mp-ctrl-right { justify-content: flex-end; }
      
      #mp-video-wrap { flex: 1; position: relative; background: #000; }
      #mp-history { background: #111; overflow-y: auto; color: white; flex-direction: column; flex-shrink: 0; display: flex; }
      #mp-history::-webkit-scrollbar { width: 6px; }
      #mp-history::-webkit-scrollbar-track { background: #111; }
      #mp-history::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
      #mp-history::-webkit-scrollbar-thumb:hover { background: #666; }
      
      .mp-btn { background: transparent; color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 5px; border-radius: 4px; transition: background 0.2s; }
      .mp-btn:hover { background: rgba(255,255,255,0.2); }
      .mp-btn svg { width: 24px; height: 24px; fill: currentColor; }
      
      .history-item { padding: 10px; cursor: pointer; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 8px; transition: background 0.2s; }
      .history-item:hover { background: #222; }
      .history-item.active { background: #333; font-weight: bold; color: #4db8ff; }
      
      /* FULLSCREEN OVERRIDES */
      .mp-fullscreen #mp-wrapper { flex-direction: row; width: 100%; height: 100%; }
      .mp-fullscreen #mp-controls {
         position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
         background: rgba(0,0,0,0.8); border-radius: 12px; height: 60px; padding: 0 20px; width: 600px; max-width: 90vw;
      }
      .mp-fullscreen #mp-history {
         position: absolute; bottom: 100px; right: 20px; width: 300px; max-height: 50vh;
         background: rgba(0,0,0,0.8); border-radius: 8px; border: 1px solid #333;
      }
      .mp-fullscreen #mp-video-wrap { position: absolute; top:0; left:0; width:100%; height:100%; z-index: 1; }
      .mp-fullscreen #mp-video-wrap iframe, .mp-fullscreen #music-player { width: 100% !important; height: 100% !important; display: block; border: none; }
      .mp-fullscreen #mp-controls { z-index: 10; }
      .mp-fullscreen #mp-history { z-index: 10; pointer-events: auto; }
      .mp-fullscreen .mp-btn svg { width: 32px; height: 32px; }
      .mp-fullscreen #mp-hover-zone { position: absolute; bottom: 0; left: 0; width: 100%; height: 100px; z-index: 5; }
      
      /* Mobile Portrait Fullscreen (holding phone straight): 2-row layout with big buttons */
      .mp-fullscreen.mp-portrait #mp-controls {
          width: 92vw !important;
          max-width: 420px !important;
          height: auto !important;
          min-height: 110px !important;
          padding: 12px 16px !important;
          border-radius: 20px !important;
          bottom: 30px !important;
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: space-between !important;
          align-items: center !important;
          row-gap: 12px !important;
      }
      .mp-fullscreen.mp-portrait .mp-ctrl-group:not(.mp-ctrl-center) {
          order: 1 !important;
          flex: 0 0 auto !important;
          display: flex !important;
          gap: 14px !important;
      }
      .mp-fullscreen.mp-portrait .mp-ctrl-group:not(.mp-ctrl-center) .mp-btn svg {
          width: 28px !important;
          height: 28px !important;
      }
      .mp-fullscreen.mp-portrait .mp-ctrl-group.mp-ctrl-center {
          order: 2 !important;
          flex: 0 0 100% !important;
          width: 100% !important;
          display: flex !important;
          justify-content: center !important;
          gap: 40px !important;
          padding-top: 4px !important;
      }
      .mp-fullscreen.mp-portrait .mp-ctrl-group.mp-ctrl-center .mp-btn svg {
          width: 46px !important;
          height: 46px !important;
      }
      .mp-fullscreen.mp-portrait #mp-playpause svg {
          width: 56px !important;
          height: 56px !important;
      }

      /* Fallback native media query */
      @media (orientation: portrait) {
          .mp-fullscreen #mp-controls {
              width: 92vw !important;
              max-width: 420px !important;
              height: auto !important;
              min-height: 110px !important;
              padding: 12px 16px !important;
              border-radius: 20px !important;
              bottom: 30px !important;
              display: flex !important;
              flex-wrap: wrap !important;
              justify-content: space-between !important;
              align-items: center !important;
              row-gap: 12px !important;
          }
          .mp-fullscreen .mp-ctrl-group:not(.mp-ctrl-center) {
              order: 1 !important;
              flex: 0 0 auto !important;
              display: flex !important;
              gap: 14px !important;
          }
          .mp-fullscreen .mp-ctrl-group:not(.mp-ctrl-center) .mp-btn svg {
              width: 28px !important;
              height: 28px !important;
          }
          .mp-fullscreen .mp-ctrl-group.mp-ctrl-center {
              order: 2 !important;
              flex: 0 0 100% !important;
              width: 100% !important;
              display: flex !important;
              justify-content: center !important;
              gap: 40px !important;
              padding-top: 4px !important;
          }
          .mp-fullscreen .mp-ctrl-group.mp-ctrl-center .mp-btn svg {
              width: 46px !important;
              height: 46px !important;
          }
          .mp-fullscreen #mp-playpause svg {
              width: 56px !important;
              height: 56px !important;
          }
      }
    </style>
    <div id="mp-wrapper">
       <div id="mp-left">
          <div id="mp-controls">
             <div class="mp-ctrl-group">
                <button id="mp-heart" class="mp-btn" title="Favorite" data-item-id="${currentData.item_id}" data-favorite="${isFavorite}">${iconHeart(isFavorite)}</button>
                <a id="mp-info" href="/musicbrainz/music/${sourceId}/" class="mp-btn" title="Details">${iconInfo}</a>
                <button id="mp-toggle-hist" class="mp-btn" title="Toggle History">${iconHistory}</button>
             </div>
             <div class="mp-ctrl-group mp-ctrl-center">
                <button id="mp-prev" class="mp-btn" title="Previous">${iconPrev}</button>
                <button id="mp-playpause" class="mp-btn" title="Play/Pause">${iconPause}</button>
                <button id="mp-next" class="mp-btn" title="Next">${iconNext}</button>
             </div>
             <div class="mp-ctrl-group mp-ctrl-right">
                <button id="mp-expand" class="mp-btn" title=""></button>
                <button id="mp-fullscreen" class="mp-btn" title=""></button>
                <button id="mp-close" class="mp-btn" title="Close">${iconClose}</button>
             </div>
          </div>
          <div id="mp-video-wrap">
             <div id="music-player"></div>
             <div id="mp-hover-zone"></div>
          </div>
       </div>
       <div id="mp-history"></div>
    </div>
  `;
  
  updateContainerSize();
  renderHistoryList();
  bindPlayerEvents();
  
  musicPlayer = new YT.Player('music-player', {
    height: '100%',
    width: '100%',
    videoId: actualVideoToPlay,
    playerVars: {
      autoplay: 1,
      controls: 1,
      start: Math.floor(startTime)
    },
    events: {
      onReady: (e) => {
        isMusicPlayerReady = true;
        e.target.playVideo();
      },
      onStateChange: onPlayerStateChange
    }
  });
}

function updateContainerSize() {
    const container = document.getElementById('music-player-container');
    if (!container) return;
    const wrapper = document.getElementById('mp-wrapper');
    const historyEl = document.getElementById('mp-history');
    const controlsEl = document.getElementById('mp-controls');
    
    const isFullscreen = localStorage.getItem('music_player_fullscreen') === 'true';
    const isExpanded = localStorage.getItem('music_player_expanded') === 'true';
    const showHist = localStorage.getItem('music_player_history_visible') !== 'false';
    // Check both orientation matchMedia and physical screen dimensions for 100% detection
    const isMobilePortrait = window.matchMedia('(orientation: portrait)').matches || (window.innerHeight > window.innerWidth);
    const scale = isMobilePortrait ? 1.5 : 1;
    
    // Explicitly toggle the portrait class so CSS rules apply reliably without media-query quirks
    if (wrapper) {
        wrapper.classList.toggle('mp-portrait', isMobilePortrait);
    }
    
    if (historyEl) {
        historyEl.style.display = showHist ? 'flex' : 'none';
    }
    
    container.style.setProperty('position', 'fixed', 'important');
    
    if (isFullscreen) {
        if (wrapper) wrapper.classList.add('mp-fullscreen');
        container.style.setProperty('top', '0', 'important');
        container.style.setProperty('left', '0', 'important');
        container.style.setProperty('right', '0', 'important');
        container.style.setProperty('bottom', '0', 'important');
        container.style.setProperty('width', '100%', 'important');
        container.style.setProperty('height', '100%', 'important');
        container.style.setProperty('border-radius', '0', 'important');
        container.style.setProperty('z-index', '99999', 'important');
        
        if (historyEl) { historyEl.style.width = ''; historyEl.style.height = ''; }
        if (controlsEl) { controlsEl.style.height = ''; }
    } else {
        if (wrapper) wrapper.classList.remove('mp-fullscreen');
        let w = (isExpanded ? 480 : 384) * scale;
        let h = (isExpanded ? 270 : 216) * scale;
        let hw = showHist ? (200 * scale) : 0;
        let ch = 40 * scale;
        
        container.style.setProperty('width', (w + hw) + 'px', 'important');
        container.style.setProperty('height', (h + ch) + 'px', 'important');
        container.style.setProperty('border-radius', '8px', 'important');
        container.style.setProperty('z-index', '9999', 'important');
        
        if (historyEl) historyEl.style.width = showHist ? (hw + 'px') : '0';
        if (controlsEl) controlsEl.style.height = ch + 'px';
        
        if (isMobilePortrait) {
            container.style.setProperty('top', '0', 'important');
            container.style.setProperty('right', '0', 'important');
            container.style.setProperty('bottom', 'auto', 'important');
            container.style.setProperty('left', 'auto', 'important');
        } else {
            container.style.setProperty('bottom', '20px', 'important');
            container.style.setProperty('left', '20px', 'important');
            container.style.setProperty('top', 'auto', 'important');
            container.style.setProperty('right', 'auto', 'important');
        }
    }
    
    // Dynamic Tooltips and Icons injection
    const btnExpand = document.getElementById('mp-expand');
    if (btnExpand) {
        btnExpand.innerHTML = isExpanded ? iconTheater : iconSmall;
        btnExpand.title = isExpanded ? "Small Mode" : "Medium Mode";
    }
    
    const btnFs = document.getElementById('mp-fullscreen');
    if (btnFs) {
        btnFs.innerHTML = isFullscreen ? iconFsExit : iconFsEnter;
        btnFs.title = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
    }
}

function saveHistory() {
    localStorage.setItem('music_player_history', JSON.stringify(sessionHistory));
    localStorage.setItem('music_player_history_index', historyIndex.toString());
}

function bindPlayerEvents() {
    document.getElementById('mp-close').addEventListener('click', closePlayer);
    document.getElementById('mp-prev').addEventListener('click', playPrev);
    document.getElementById('mp-next').addEventListener('click', playNext);
    
    document.getElementById('mp-toggle-hist').addEventListener('click', () => {
        const current = localStorage.getItem('music_player_history_visible') !== 'false';
        localStorage.setItem('music_player_history_visible', !current);
        updateContainerSize();
    });
    
    document.getElementById('mp-expand').addEventListener('click', () => {
        const isExpanded = localStorage.getItem('music_player_expanded') === 'true';
        localStorage.setItem('music_player_expanded', !isExpanded);
        if (localStorage.getItem('music_player_fullscreen') === 'true') {
           localStorage.setItem('music_player_fullscreen', 'false');
        }
        updateContainerSize();
    });
    
    document.getElementById('mp-fullscreen').addEventListener('click', () => {
        const isFullscreen = localStorage.getItem('music_player_fullscreen') === 'true';
        localStorage.setItem('music_player_fullscreen', !isFullscreen);
        updateContainerSize();
    });
    
    document.getElementById('mp-playpause').addEventListener('click', () => {
        if (musicPlayer && isMusicPlayerReady) {
            const state = musicPlayer.getPlayerState();
            if (state === YT.PlayerState.PLAYING) {
                musicPlayer.pauseVideo();
            } else {
                musicPlayer.playVideo();
            }
        }
    });
    
    document.getElementById('mp-heart').addEventListener('click', function() {
        const itemId = this.dataset.itemId;
        const isFav = this.dataset.favorite === 'true';
        if (!itemId) return;
        
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
                          document.querySelector('meta[name="csrf-token"]')?.content || 
                          getCookie('csrftoken');
        
        fetch('/api/toggle-music-favorite/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
          body: JSON.stringify({ item_id: itemId, favorite: !isFav })
        }).then(res => res.json()).then(data => {
          if (data.success) {
            this.dataset.favorite = !isFav;
            this.innerHTML = iconHeart(!isFav);
            const playlistItem = musicPlaylist.find(v => String(v.item_id) === String(itemId));
            if (playlistItem) {
              playlistItem.is_favorite = !isFav;
              if (isSequentialMode) {
                  localStorage.setItem('music_player_playlist', JSON.stringify(musicPlaylist));
              }
            }
            sessionHistory.forEach(v => {
                if (String(v.item_id) === String(itemId)) v.is_favorite = !isFav;
            });
            saveHistory();
          }
        });
    });
}

function closePlayer() {
    localStorage.removeItem('music_player_playlist');
    localStorage.removeItem('music_player_index');
    if (musicPlayer && musicPlayer.destroy) {
      musicPlayer.destroy();
    }
    const container = document.getElementById('music-player-container');
    if (container) container.style.display = 'none';
    localStorage.removeItem('musicPlayerEnabled');
    localStorage.removeItem('music_player_video');
    localStorage.removeItem('music_player_time');
    localStorage.removeItem('music_player_active_tab');
    
    localStorage.removeItem('music_player_history');
    localStorage.removeItem('music_player_history_index');
    sessionHistory = [];
    historyIndex = -1;
    
    const toggle = document.getElementById('music-player-toggle');
    if (toggle) toggle.checked = false;
}

function renderHistoryList() {
    const histContainer = document.getElementById('mp-history');
    if (!histContainer) return;
    
    histContainer.innerHTML = '';
    sessionHistory.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-item' + (index === historyIndex ? ' active' : '');
        const titleText = item.title || ('Track ' + item.video_id); 
        
        div.innerHTML = `
            <div style="width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 1.5; color: inherit;" title="${titleText}">
                ${titleText}
            </div>
        `;
        div.addEventListener('click', () => {
            historyIndex = index;
            saveHistory();
            playVideoInternal(sessionHistory[historyIndex]);
        });
        histContainer.appendChild(div);
    });
    
    const activeItem = histContainer.querySelector('.active');
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function playVideoInternal(videoObj) {
    if (musicPlayer && isMusicPlayerReady) {
        musicPlayer.loadVideoById(videoObj.video_id);
        localStorage.setItem('music_player_video', videoObj.video_id);
        localStorage.setItem('music_player_time', '0');
        
        const heartBtn = document.getElementById('mp-heart');
        if (heartBtn) {
          heartBtn.dataset.itemId = videoObj.item_id;
          heartBtn.dataset.favorite = videoObj.is_favorite;
          heartBtn.innerHTML = iconHeart(videoObj.is_favorite);
        }
        const infoLink = document.getElementById('mp-info');
        if (infoLink && videoObj.source_id) {
          infoLink.href = `/musicbrainz/music/${videoObj.source_id}/`;
        }
        
        renderHistoryList();
    }
}

function onPlayerStateChange(event) {
  const ppBtn = document.getElementById('mp-playpause');
  if (ppBtn) {
    if (event.data === YT.PlayerState.PLAYING) {
        ppBtn.innerHTML = iconPause;
        
        // Grab the real title from the YouTube player if it's missing from our cache
        if (sessionHistory[historyIndex] && (!sessionHistory[historyIndex].title || sessionHistory[historyIndex].title.startsWith('Track '))) {
            try {
                const ytData = musicPlayer.getVideoData();
                if (ytData && ytData.title) {
                    sessionHistory[historyIndex].title = ytData.title;
                    
                    // Also update the main playlist so it remembers it for the next song
                    const plItem = musicPlaylist.find(v => v.video_id === sessionHistory[historyIndex].video_id);
                    if (plItem) plItem.title = ytData.title;
                    
                    saveHistory();
                    renderHistoryList();
                }
            } catch(e) {}
        }
        
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        ppBtn.innerHTML = iconPlay;
    }
  }
  
  if (event.data === YT.PlayerState.ENDED) {
    playNext();
  }
}

function playPrev() {
    if (historyIndex > 0) {
        historyIndex--;
        saveHistory();
        playVideoInternal(sessionHistory[historyIndex]);
    }
}

function playNext() {
  if (historyIndex < sessionHistory.length - 1) {
      historyIndex++;
      saveHistory();
      playVideoInternal(sessionHistory[historyIndex]);
      return;
  }
  
  let nextVideo;

  if (isSequentialMode) {
      musicCurrentIndex = (musicCurrentIndex + 1) % musicPlaylist.length;
      nextVideo = musicPlaylist[musicCurrentIndex];
      playedSongs.push(nextVideo.video_id);
      localStorage.setItem('music_player_index', musicCurrentIndex);
  } else {
      if (playedSongs.length >= musicPlaylist.length) {
        playedSongs = [];
        musicPlaylist = shuffleArray(musicPlaylist);
      }
      
      let unplayed = musicPlaylist.filter(v => !playedSongs.includes(v.video_id));
      if (unplayed.length === 0) unplayed = musicPlaylist;
      
      nextVideo = unplayed[Math.floor(Math.random() * unplayed.length)];
      musicCurrentIndex = musicPlaylist.indexOf(nextVideo);
      playedSongs.push(nextVideo.video_id);
  }
  
  sessionHistory.push(nextVideo);
  historyIndex++;
  saveHistory();
  playVideoInternal(nextVideo);
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Save state before page unload
window.addEventListener('pagehide', () => { 
  if (musicPlayer && isMusicPlayerReady && typeof musicPlayer.getCurrentTime === 'function' && localStorage.getItem('musicPlayerEnabled')) {
    try {
      const time = musicPlayer.getCurrentTime();
      const videoId = musicPlaylist[musicCurrentIndex].video_id;
      localStorage.setItem('music_player_time', time);
      localStorage.setItem('music_player_video', videoId);
    } catch (e) {}
  }
});

// Detect bfcache restoration
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    isRestoringFromBfcache = true;
    setTimeout(() => {
      isRestoringFromBfcache = false;
    }, 100);
    
    if (localStorage.getItem('musicPlayerEnabled')) {
      initMusicPlayer();
    }
  }
});

// Toggle player
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('music-player-toggle');
  if (toggle) {
    toggle.addEventListener('change', function() {
      localStorage.removeItem('music_player_playlist');
      localStorage.removeItem('music_player_index');
      const enabled = this.checked;
      const mode = this.dataset.mode;
      
      if (enabled) {
        const oldMode = localStorage.getItem('musicPlayerEnabled');
        if (oldMode && oldMode !== mode) {
          localStorage.removeItem('music_player_video');
          localStorage.removeItem('music_player_time');
        }
        
        // Fresh start: wipe local history
        localStorage.removeItem('music_player_history');
        localStorage.removeItem('music_player_history_index');
        sessionHistory = [];
        historyIndex = -1;
        
        localStorage.setItem('musicPlayerEnabled', mode);
        localStorage.setItem('music_player_active_tab', tabId);
        loadYouTubeAPI();
      } else {
        localStorage.removeItem('musicPlayerEnabled');
        localStorage.removeItem('music_player_video');
        localStorage.removeItem('music_player_time');
        localStorage.removeItem('music_player_active_tab');
      }
      
      const container = document.getElementById('music-player-container');
      if (enabled) {
        if (window.YT && window.YT.Player) {
          loadPlaylist();
        }
      } else {
        if (musicPlayer && musicPlayer.destroy) {
          musicPlayer.destroy();
        }
        if (container) {
          container.style.display = 'none';
        }
        localStorage.removeItem('music_player_video');
        localStorage.removeItem('music_player_time');
        localStorage.removeItem('music_player_active_tab');
        sessionHistory = [];
        historyIndex = -1;
      }
    });
  }
  
  // Initialize on page load if enabled
  const savedMode = localStorage.getItem('musicPlayerEnabled');
  if (savedMode) {
    loadYouTubeAPI();
    if (window.YT && window.YT.Player && !isMusicInitialized) {
      isMusicInitialized = true;
      initMusicPlayer();
    }
  }
  
  // Adjust sizing dynamically when phone rotates
  window.addEventListener('resize', () => {
    const container = document.getElementById('music-player-container');
    if (container && container.style.display !== 'none') {
        updateContainerSize();
    }
  });

  // Listen for storage changes from other tabs
  window.addEventListener('storage', (e) => {
    if (isRestoringFromBfcache) return; // Skip stale queued storage events
    if (e.key === 'music_player_active_tab' && e.newValue && e.newValue !== String(tabId)) {
      const container = document.getElementById('music-player-container');
      if (container && container.style.display !== 'none') {
        // Save current time before closing
        if (musicPlayer && isMusicPlayerReady && typeof musicPlayer.getCurrentTime === 'function') {
          try {
            const time = musicPlayer.getCurrentTime();
            const videoId = musicPlaylist[musicCurrentIndex]?.video_id;
            if (videoId) {
              localStorage.setItem('music_player_time', time);
              localStorage.setItem('music_player_video', videoId);
            }
          } catch (e) {}
        }
        if (musicPlayer && musicPlayer.destroy) {
          musicPlayer.destroy();
        }
        container.style.display = 'none';
      }
    }
  });
});

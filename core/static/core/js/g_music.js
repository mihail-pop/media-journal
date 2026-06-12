let musicPlayer;
let musicPlaylist = [];
let musicCurrentIndex = 0;
let isMusicPlayerReady = false;
let isMusicInitialized = false;
let playedSongs = [];
let isSequentialMode = false;
let isRestoringFromBfcache = false;
const tabId = Date.now() + Math.random();

window.startCustomPlaylist = function(playlist, startIndex) {
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
  
  if (savedMode === 'list') {
      try {
          const savedList = JSON.parse(localStorage.getItem('music_player_playlist'));
          if (savedList && savedList.length > 0) {
              musicPlaylist = savedList;
              musicCurrentIndex = parseInt(localStorage.getItem('music_player_index')) || 0;
              isSequentialMode = true;
              if (musicCurrentIndex >= musicPlaylist.length) musicCurrentIndex = 0;
              playedSongs = [musicPlaylist[musicCurrentIndex].video_id];
              
              const lastTime = parseFloat(localStorage.getItem('music_player_time')) || 0;
              createPlayer(musicPlaylist[musicCurrentIndex].video_id, lastTime);
              return;
          }
      } catch(e) {}
  }

  // Handle the new Shuffle/Filtered toggle on the Music list page
  if (savedMode === 'filtered' && window.getFilteredMusicPlaylist) {
      window.getFilteredMusicPlaylist().then(playlist => {
          if (playlist && playlist.length > 0) {
              musicPlaylist = shuffleArray(playlist);
              musicCurrentIndex = 0;
              isSequentialMode = true; // Use sequential mode to play linearly through the shuffled array (no repeats!)
              playedSongs = [musicPlaylist[0].video_id];
              
              // Lock it in as a 'list' so it persists across tabs reliably
              localStorage.setItem('musicPlayerEnabled', 'list');
              localStorage.setItem('music_player_playlist', JSON.stringify(musicPlaylist));
              localStorage.setItem('music_player_index', 0);
              
              createPlayer(musicPlaylist[0].video_id, 0);
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

  // Fallback for home.html 'favorites' mode or legacy saved states
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
        
        const lastVideo = localStorage.getItem('music_player_video');
        const lastTime = parseFloat(localStorage.getItem('music_player_time')) || 0;
        
        if (lastVideo && musicPlaylist.find(v => v.video_id === lastVideo)) {
          musicCurrentIndex = musicPlaylist.findIndex(v => v.video_id === lastVideo);
          playedSongs.push(lastVideo);
          createPlayer(musicPlaylist[musicCurrentIndex].video_id, lastTime);
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
  
  // Clean up any suspended player instance before creating a new one
  if (musicPlayer && musicPlayer.destroy) {
    try {
      musicPlayer.destroy();
    } catch(e) {}
    isMusicPlayerReady = false;
  }
  
  const currentData = musicPlaylist.find(v => v.video_id === videoId);
  const isFavorite = currentData ? currentData.is_favorite : false;
  const itemId = currentData ? currentData.item_id : null;
  const sourceId = currentData ? currentData.source_id : null;
  const heartColor = isFavorite ? 'red' : 'white';
  
  const isExpanded = localStorage.getItem('music_player_expanded') === 'true';
  const isMobilePortrait = window.matchMedia('(orientation: portrait)').matches;
  const scale = isMobilePortrait ? 2 : 1;
  const width = (isExpanded ? 480 : 320) * scale;
  const height = (isExpanded ? 270 : 180) * scale;
  const expandIcon = isExpanded 
    ? `<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
  
  const overlayHeight = height - (40 * scale);
  const btnSize = 32 * scale;
  const fontSize = 20 * scale;
  const buttonStyle = `position:absolute;background:rgba(0,0,0,0.7);color:white;border:none;width:${btnSize}px;height:${btnSize}px;border-radius:${4*scale}px;cursor:pointer;font-size:${fontSize}px;line-height:1;z-index:10000;pointer-events:auto;transition:all 0.2s;`;
  const hoverButtonStyle = buttonStyle + 'opacity:0;';
  const spacing = 5 * scale;
  const btnSpacing = 37 * scale;
  
  const svgSize = 20 * scale;
  const heartSvg = `<svg width="${svgSize}" height="${svgSize}" fill="${heartColor}" stroke="${heartColor}" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 21C12 21 7 16.5 5 12.5C3 8.5 5 5 8.5 5C10.5 5 12 7 12 7C12 7 13.5 5 15.5 5C19 5 21 8.5 19 12.5C17 16.5 12 21 12 21Z"/></svg>`;
  container.innerHTML = `<div id="music-player"></div><div style="position:absolute;top:0;right:0;width:${50*scale}px;height:${overlayHeight}px;background:transparent;z-index:9999;pointer-events:auto;"></div><div style="position:absolute;top:0;left:0;width:${50*scale}px;height:${overlayHeight}px;background:transparent;z-index:9999;pointer-events:auto;"></div><button id="music-player-expand" style="${hoverButtonStyle}top:${spacing}px;left:${spacing}px;${isMobilePortrait ? 'opacity:1;' : ''}">${expandIcon}</button><button id="music-player-heart" data-item-id="${itemId}" data-favorite="${isFavorite}" style="${hoverButtonStyle}top:${spacing+btnSpacing}px;left:${spacing}px;${isMobilePortrait ? 'opacity:1;' : ''}">${heartSvg}</button><a id="music-player-info" href="/musicbrainz/music/${sourceId}/" style="${hoverButtonStyle}top:${spacing+btnSpacing*2}px;left:${spacing}px;display:flex;align-items:center;justify-content:center;text-decoration:none;color:white;padding:0;${isMobilePortrait ? 'opacity:1;' : ''}"><svg width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path fill="rgba(0,0,0,0.7)" d="M11 10h2v7h-2zm0-4h2v2h-2z"/></svg></a><button id="music-player-close" style="${buttonStyle}top:${spacing}px;right:${spacing}px;">✕</button><button id="music-player-skip" style="${buttonStyle}top:${spacing+btnSpacing}px;right:${spacing}px;">⏭</button>`;
  container.style.display = 'block';
  container.style.width = width + 'px';
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
  
  container.addEventListener('mouseenter', () => {
    if (!isMobilePortrait) {
      document.getElementById('music-player-expand').style.opacity = '1';
      document.getElementById('music-player-heart').style.opacity = '1';
      document.getElementById('music-player-info').style.opacity = '1';
    }
  });
  container.addEventListener('mouseleave', () => {
    if (!isMobilePortrait) {
      document.getElementById('music-player-expand').style.opacity = '0';
      document.getElementById('music-player-heart').style.opacity = '0';
      document.getElementById('music-player-info').style.opacity = '0';
    }
  });
  
  // Add hover effects to all buttons
  ['music-player-expand', 'music-player-heart', 'music-player-info', 'music-player-close', 'music-player-skip'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(0,0,0,0.9)');
      btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(0,0,0,0.7)');
    }
  });
  
  document.getElementById('music-player-expand').addEventListener('click', () => {
    const newExpanded = !isExpanded;
    localStorage.setItem('music_player_expanded', newExpanded);
    if (musicPlayer && musicPlayer.destroy) {
      const currentTime = musicPlayer.getCurrentTime();
      const currentVideoId = musicPlaylist[musicCurrentIndex]?.video_id || videoId;
      musicPlayer.destroy();
      createPlayer(currentVideoId, currentTime);
    }
  });
  
  document.getElementById('music-player-skip').addEventListener('click', () => {
    playNext();
  });
  
  document.getElementById('music-player-heart').addEventListener('click', function() {
    const itemId = this.dataset.itemId;
    const isFavorite = this.dataset.favorite === 'true';
    
    if (!itemId) return;
    
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || 
                      document.querySelector('meta[name="csrf-token"]')?.content || 
                      getCookie('csrftoken');
    
    fetch('/api/toggle-music-favorite/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken
      },
      body: JSON.stringify({ item_id: itemId, favorite: !isFavorite })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        this.dataset.favorite = !isFavorite;
        const newColor = !isFavorite ? 'red' : 'white';
        const svg = this.querySelector('svg');
        if (svg) {
          svg.setAttribute('fill', newColor);
          svg.setAttribute('stroke', newColor);
        }
        
        // Update playlist data
        const playlistItem = musicPlaylist.find(v => v.item_id === itemId);
        if (playlistItem) {
          playlistItem.is_favorite = !isFavorite;
          if (isSequentialMode) {
          localStorage.setItem('music_player_playlist', JSON.stringify(musicPlaylist));
          }
        }
      }
    });
  });
  
  document.getElementById('music-player-close').addEventListener('click', () => {
    localStorage.removeItem('music_player_playlist');
    localStorage.removeItem('music_player_index');
    if (musicPlayer && musicPlayer.destroy) {
      musicPlayer.destroy();
    }
    container.style.display = 'none';
    localStorage.removeItem('musicPlayerEnabled');
    localStorage.removeItem('music_player_video');
    localStorage.removeItem('music_player_time');
    localStorage.removeItem('music_player_active_tab');
    const toggle = document.getElementById('music-player-toggle');
    if (toggle) toggle.checked = false;
  });
  
  musicPlayer = new YT.Player('music-player', {
    height: height.toString(),
    width: width.toString(),
    videoId: videoId,
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

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    playNext();
  }
}

function playNext() {
  let nextVideo;

  if (isSequentialMode) {
      // Loop sequentially
      musicCurrentIndex = (musicCurrentIndex + 1) % musicPlaylist.length;
      nextVideo = musicPlaylist[musicCurrentIndex];
      playedSongs.push(nextVideo.video_id);
      localStorage.setItem('music_player_index', musicCurrentIndex);
  } else {
      // Standard random shuffle
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
  
  if (musicPlayer && isMusicPlayerReady) {
    musicPlayer.loadVideoById(nextVideo.video_id);
    localStorage.setItem('music_player_video', nextVideo.video_id);
    localStorage.setItem('music_player_time', '0');
    
    // Update heart button and info link
    const heartBtn = document.getElementById('music-player-heart');
    if (heartBtn) {
      heartBtn.dataset.itemId = nextVideo.item_id;
      heartBtn.dataset.favorite = nextVideo.is_favorite;
      const svg = heartBtn.querySelector('svg');
      if (svg) {
        const color = nextVideo.is_favorite ? 'red' : 'white';
        svg.setAttribute('fill', color);
        svg.setAttribute('stroke', color);
      }
    }
    const infoLink = document.getElementById('music-player-info');
    if (infoLink && nextVideo.source_id) {
      infoLink.href = `/musicbrainz/music/${nextVideo.source_id}/`;
    }
  }
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

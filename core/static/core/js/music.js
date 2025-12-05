let musicPlayer;
let musicPlaylist = [];
let musicCurrentIndex = 0;
let isMusicPlayerReady = false;
let isMusicInitialized = false;
let playedSongs = [];

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

// Load YouTube IFrame API
if (!window.YT) {
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
    toggle.checked = savedMode === currentMode;
  }
  
  if (savedMode) {
    loadPlaylist();
  }
}

function loadPlaylist() {
  const savedMode = localStorage.getItem('musicPlayerEnabled');
  let status = 'all';
  
  if (savedMode === 'status') {
    const activeFilter = document.querySelector('.filter-btn.active');
    if (activeFilter) {
      status = activeFilter.dataset.filter;
    }
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
  
  const currentData = musicPlaylist.find(v => v.video_id === videoId);
  const isFavorite = currentData ? currentData.is_favorite : false;
  const itemId = currentData ? currentData.item_id : null;
  const heartColor = isFavorite ? 'red' : 'white';
  
  const isExpanded = localStorage.getItem('music_player_expanded') === 'true';
  const width = isExpanded ? 480 : 320;
  const height = isExpanded ? 270 : 180;
  const expandIcon = '⤢';
  
  const overlayHeight = height - 40;
  container.innerHTML = `<div id="music-player"></div><div style="position:absolute;top:0;right:0;width:50px;height:${overlayHeight}px;background:transparent;z-index:9999;pointer-events:auto;"></div><div style="position:absolute;top:0;left:0;width:50px;height:${overlayHeight}px;background:transparent;z-index:9999;pointer-events:auto;"></div><button id="music-player-expand" style="position:absolute;top:5px;left:5px;background:rgba(0,0,0,0.7);color:white;border:none;width:32px;height:32px;border-radius:4px;cursor:pointer;font-size:20px;line-height:1;z-index:10000;pointer-events:auto;opacity:0;transition:opacity 0.2s;">${expandIcon}</button><button id="music-player-heart" data-item-id="${itemId}" data-favorite="${isFavorite}" style="position:absolute;top:42px;left:5px;background:rgba(0,0,0,0.7);color:${heartColor};border:none;width:32px;height:32px;border-radius:4px;cursor:pointer;font-size:20px;line-height:1;z-index:10000;pointer-events:auto;opacity:0;transition:opacity 0.2s;">♥</button><button id="music-player-close" style="position:absolute;top:5px;right:5px;background:rgba(0,0,0,0.7);color:white;border:none;width:32px;height:32px;border-radius:4px;cursor:pointer;font-size:20px;line-height:1;z-index:10000;pointer-events:auto;">✕</button><button id="music-player-skip" style="position:absolute;top:42px;right:5px;background:rgba(0,0,0,0.7);color:white;border:none;width:32px;height:32px;border-radius:4px;cursor:pointer;font-size:20px;line-height:1;z-index:10000;pointer-events:auto;">⏭</button>`;
  container.style.display = 'block';
  
  container.addEventListener('mouseenter', () => {
    document.getElementById('music-player-expand').style.opacity = '1';
    document.getElementById('music-player-heart').style.opacity = '1';
  });
  container.addEventListener('mouseleave', () => {
    document.getElementById('music-player-expand').style.opacity = '0';
    document.getElementById('music-player-heart').style.opacity = '0';
  });
  
  document.getElementById('music-player-expand').addEventListener('click', () => {
    const newExpanded = !isExpanded;
    localStorage.setItem('music_player_expanded', newExpanded);
    if (musicPlayer && musicPlayer.destroy) {
      const currentTime = musicPlayer.getCurrentTime();
      musicPlayer.destroy();
      createPlayer(videoId, currentTime);
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
        this.style.color = !isFavorite ? 'red' : 'white';
        
        // Update playlist data
        const playlistItem = musicPlaylist.find(v => v.item_id === itemId);
        if (playlistItem) {
          playlistItem.is_favorite = !isFavorite;
        }
      }
    });
  });
  
  document.getElementById('music-player-close').addEventListener('click', () => {
    if (musicPlayer && musicPlayer.destroy) {
      musicPlayer.destroy();
    }
    container.style.display = 'none';
    localStorage.removeItem('musicPlayerEnabled');
    localStorage.removeItem('music_player_video');
    localStorage.removeItem('music_player_time');
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
    },
    events: {
      onReady: (e) => {
        isMusicPlayerReady = true;
        if (startTime > 0) {
          e.target.seekTo(startTime, true);
        }
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
  if (playedSongs.length >= musicPlaylist.length) {
    playedSongs = [];
    musicPlaylist = shuffleArray(musicPlaylist);
  }
  
  let nextVideo;
  const unplayed = musicPlaylist.filter(v => !playedSongs.includes(v.video_id));
  
  if (unplayed.length > 0) {
    nextVideo = unplayed[Math.floor(Math.random() * unplayed.length)];
  } else {
    nextVideo = musicPlaylist[Math.floor(Math.random() * musicPlaylist.length)];
  }
  
  musicCurrentIndex = musicPlaylist.indexOf(nextVideo);
  playedSongs.push(nextVideo.video_id);
  
  if (musicPlayer && isMusicPlayerReady) {
    musicPlayer.loadVideoById(nextVideo.video_id);
    localStorage.setItem('music_player_video', nextVideo.video_id);
    localStorage.setItem('music_player_time', '0');
    
    // Update heart button
    const heartBtn = document.getElementById('music-player-heart');
    if (heartBtn) {
      heartBtn.dataset.itemId = nextVideo.item_id;
      heartBtn.dataset.favorite = nextVideo.is_favorite;
      heartBtn.style.color = nextVideo.is_favorite ? 'red' : 'white';
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
window.addEventListener('beforeunload', () => {
  if (musicPlayer && isMusicPlayerReady && typeof musicPlayer.getCurrentTime === 'function' && localStorage.getItem('musicPlayerEnabled')) {
    try {
      const time = musicPlayer.getCurrentTime();
      const videoId = musicPlaylist[musicCurrentIndex].video_id;
      localStorage.setItem('music_player_time', time);
      localStorage.setItem('music_player_video', videoId);
    } catch (e) {}
  }
});

// Toggle player
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('music-player-toggle');
  if (toggle) {
    toggle.addEventListener('change', function() {
      const enabled = this.checked;
      const mode = this.dataset.mode;
      
      if (enabled) {
        const oldMode = localStorage.getItem('musicPlayerEnabled');
        if (oldMode && oldMode !== mode) {
          localStorage.removeItem('music_player_video');
          localStorage.removeItem('music_player_time');
        }
        localStorage.setItem('musicPlayerEnabled', mode);
      } else {
        localStorage.removeItem('musicPlayerEnabled');
        localStorage.removeItem('music_player_video');
        localStorage.removeItem('music_player_time');
      }
      
      const container = document.getElementById('music-player-container');
      if (enabled) {
        loadPlaylist();
      } else {
        if (musicPlayer && musicPlayer.destroy) {
          musicPlayer.destroy();
        }
        if (container) {
          container.style.display = 'none';
        }
        localStorage.removeItem('music_player_video');
        localStorage.removeItem('music_player_time');
      }
    });
  }
  
  // Initialize on page load if enabled and API ready
  if (window.YT && window.YT.Player && !isMusicInitialized) {
    isMusicInitialized = true;
    initMusicPlayer();
  }
});

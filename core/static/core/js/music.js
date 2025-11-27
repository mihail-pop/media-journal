let musicPlayer;
let musicPlaylist = [];
let musicCurrentIndex = 0;
let isMusicPlayerReady = false;
let isMusicInitialized = false;

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
  
  fetch(`/api/favorite-music-videos/?mode=${savedMode}`)
    .then(res => res.json())
    .then(data => {
      if (data.videos && data.videos.length > 0) {
        musicPlaylist = shuffleArray(data.videos);
        
        const lastVideo = localStorage.getItem('music_player_video');
        const lastTime = parseFloat(localStorage.getItem('music_player_time')) || 0;
        
        if (lastVideo && musicPlaylist.includes(lastVideo)) {
          musicCurrentIndex = musicPlaylist.findIndex(v => v === lastVideo);
          createPlayer(musicPlaylist[musicCurrentIndex], lastTime);
        } else {
          musicCurrentIndex = 0;
          createPlayer(musicPlaylist[musicCurrentIndex], 0);
        }
      }
    });
}

function createPlayer(videoId, startTime = 0) {
  const container = document.getElementById('music-player-container');
  if (!container) return;
  
  container.innerHTML = '<div id="music-player"></div><button id="music-player-close" style="position:absolute;top:5px;right:5px;background:rgba(0,0,0,0.7);color:white;border:none;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:16px;line-height:1;z-index:10000;">✕</button>';
  container.style.display = 'block';
  
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
    height: '180',
    width: '320',
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
  musicCurrentIndex = (musicCurrentIndex + 1) % musicPlaylist.length;
  if (musicPlayer && isMusicPlayerReady) {
    musicPlayer.loadVideoById(musicPlaylist[musicCurrentIndex]);
    localStorage.setItem('music_player_video', musicPlaylist[musicCurrentIndex]);
    localStorage.setItem('music_player_time', '0');
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
  if (musicPlayer && isMusicPlayerReady && typeof musicPlayer.getCurrentTime === 'function') {
    try {
      const time = musicPlayer.getCurrentTime();
      const videoId = musicPlaylist[musicCurrentIndex];
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

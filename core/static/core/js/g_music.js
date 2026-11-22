let musicPlayer;
let musicPlaylist = [];
let musicCurrentIndex = 0;
let isMusicPlayerReady = false;
let isMusicInitialized = false;
let playedSongs = [];
let isSequentialMode = false;
let isRestoringFromBfcache = false;
const tabId = Date.now() + Math.random();
const isMusicPopout = document.body.dataset.musicPopout === 'true';
const musicPopoutOwnerKey = 'music_player_popout_owner';
const musicPopoutCommandKey = 'music_player_popout_command';
const musicPopoutModeKey = 'music_player_popout';
const musicDockStateKey = 'music_player_dock_state';
const musicPopoutPositionKey = 'music_player_popout_position';
let pendingMusicPopoutState = null;
let musicControlsVisibility = null;
let nextMusicPlayIsFresh = false;
let nextMusicSessionIsFresh = false;
const musicPlaybackKindKey = 'music_player_kind';
const musicPlaylistRequestKey = 'music_player_playlist_request';
let musicPlaylistGeneration = 0;
let musicPlaybackKind = localStorage.getItem(musicPlaybackKindKey) === 'news' ? 'news' : 'music';
const musicPlayTracking = window.createMusicPlayTracker?.({
    getPlayer: () => isMusicPlayerReady ? musicPlayer : null,
    getCookie,
    isOwner: () => localStorage.getItem('music_player_active_tab') === String(tabId),
});

function invalidateMusicPlaylistLoad(shared = true) {
    musicPlaylistGeneration++;
    // A separate tab/pop-out can start another queue without changing its mode.
    if (shared) localStorage.setItem(musicPlaylistRequestKey, `${tabId}:${musicPlaylistGeneration}`);
}

function setMusicPlaybackKind(kind, preserveRequest = false) {
    invalidateMusicPlaylistLoad(!preserveRequest);
    musicPlaybackKind = kind === 'news' ? 'news' : 'music';
    localStorage.setItem(musicPlaybackKindKey, musicPlaybackKind);
}

function playbackHistoryKeys() {
    return musicPlaybackKind === 'news'
        ? ['news_player_history', 'news_player_history_index']
        : ['music_player_history', 'music_player_history_index'];
}

function musicPopoutWindowFeatures() {
    let width = 640;
    let height = 400;
    const availableLeft = Number.isFinite(screen.availLeft) ? screen.availLeft : 0;
    const availableTop = Number.isFinite(screen.availTop) ? screen.availTop : 0;
    let left = availableLeft + 20;
    let top = availableTop + Math.max(0, screen.availHeight - 400 - 20);
    try {
        const saved = JSON.parse(localStorage.getItem(musicPopoutPositionKey));
        if (saved && Number.isFinite(saved.width) && saved.width > 0 && Number.isFinite(saved.height) && saved.height > 0) {
            width = saved.width;
            height = saved.height;
            top = availableTop + Math.max(0, screen.availHeight - height - 20);
        }
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
            left = saved.left;
            top = saved.top;
        }
    } catch (error) { /* Use the bottom-left default if no valid position is saved. */ }
    return `popup,width=${Math.round(width)},height=${Math.round(height)},resizable=yes,left=${Math.round(left)},top=${Math.round(top)}`;
}

function saveMusicPopoutPosition() {
    const left = window.screenX;
    const top = window.screenY;
    const width = window.innerWidth;
    const height = window.innerHeight;
    // Some window managers place minimized windows far off-screen.
    if (!Number.isFinite(left) || !Number.isFinite(top) || left <= -30000 || top <= -30000) return;
    if (width <= 0 || height <= 0) return;
    try {
        const position = JSON.stringify({ left, top, width, height });
        if (localStorage.getItem(musicPopoutPositionKey) !== position) {
            localStorage.setItem(musicPopoutPositionKey, position);
        }
    } catch (error) { /* Position saving is optional if browser storage is unavailable. */ }
}

// Call during the initiating click, before fetching a playlist, to allow popups.
window.prepareMusicPlayerWindow = function(force = false) {
    if (isMusicPopout || (!force && localStorage.getItem(musicPopoutModeKey) !== 'true') || isMusicPopoutOpen()) return;
    localStorage.removeItem(musicPopoutCommandKey);
    const popup = window.open('/music/player/', 'media-journal-music-player', musicPopoutWindowFeatures());
    if (!popup) {
        if (!force) localStorage.setItem(musicPopoutModeKey, 'false');
        alert('Allow pop-ups for Media Journal to open the player. The player will stay in this page.');
        return;
    }
    localStorage.setItem(musicPopoutModeKey, 'true');
    localStorage.setItem(musicPopoutOwnerKey, JSON.stringify({ id: 'opening', updated: Date.now() }));
    popup.focus();
    return popup;
};

function isMusicPopoutOpen() {
    try {
        const owner = JSON.parse(localStorage.getItem(musicPopoutOwnerKey));
        return owner && Date.now() - owner.updated < 90000;
    } catch (e) {
        return false;
    }
}

function claimMusicPlayer() {
    if (isMusicPopout || !isMusicPopoutOpen()) {
        localStorage.setItem('music_player_active_tab', tabId);
    }
}

function musicPlayerSnapshot(videoId, time = 0, paused = false) {
    return {
        playlist: musicPlaylist, index: musicCurrentIndex,
        history: sessionHistory, historyIndex,
        played: playedSongs, sequential: isSequentialMode,
        videoId, time, paused, mode: localStorage.getItem('musicPlayerEnabled'),
        kind: musicPlaybackKind,
        playlistRequest: localStorage.getItem(musicPlaylistRequestKey),
        tracking: musicPlaybackKind === 'music' ? musicPlayTracking?.snapshot() || null : null,
        newPlay: nextMusicPlayIsFresh, newSession: nextMusicSessionIsFresh,
    };
}

function sendMusicPopoutCommand(action, state = null) {
    localStorage.setItem(musicPopoutCommandKey, JSON.stringify({ action, state, id: Date.now() + Math.random() }));
}

function hideEmbeddedMusicPlayer() {
    musicPlayTracking?.suspend();
    if (musicPlayer && musicPlayer.destroy) musicPlayer.destroy();
    musicPlayer = null;
    isMusicPlayerReady = false;
    const container = document.getElementById('music-player-container');
    if (container) container.style.display = 'none';
    setMusicPlayerScrollLock(false);
}

function openMusicPopout() {
    if (!musicPlayer || !isMusicPlayerReady) return;
    const state = musicPlayerSnapshot(
        musicPlayer.getVideoData().video_id,
        musicPlayer.getCurrentTime(),
        musicPlayer.getPlayerState() !== YT.PlayerState.PLAYING
    );
    const popup = window.prepareMusicPlayerWindow(true);
    if (!popup) return;
    sendMusicPopoutCommand('play', state);
    hideEmbeddedMusicPlayer();
    popup.focus();
}

function returnMusicPlayerToPage() {
    if (!musicPlayer || !isMusicPlayerReady) return;
    const state = musicPlayerSnapshot(musicPlayer.getVideoData().video_id, musicPlayer.getCurrentTime(),
        musicPlayer.getPlayerState() !== YT.PlayerState.PLAYING);
    localStorage.setItem(musicPopoutModeKey, 'false');
    localStorage.setItem(musicDockStateKey, JSON.stringify(state));
    localStorage.removeItem(musicPopoutOwnerKey);
    // Stop this iframe before the other page starts its copy.
    hideEmbeddedMusicPlayer();
    if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'media-journal-music-dock' }, window.location.origin);
        window.opener.focus();
    } else {
        window.open('/', '_blank');
    }
    window.close();
}

function receiveDockedMusicPlayer() {
    const saved = localStorage.getItem(musicDockStateKey);
    if (!saved || isMusicPopout) return false;
    localStorage.removeItem(musicDockStateKey);
    receiveMusicPopoutState(JSON.parse(saved));
    return true;
}

window.addEventListener('message', event => {
    if (event.origin === window.location.origin && event.data?.type === 'media-journal-music-dock' && !isMusicPopout) {
        receiveDockedMusicPlayer();
    }
});

function receiveMusicPopoutState(state) {
    if (!state || !Array.isArray(state.playlist) || !state.playlist.length || !state.videoId) return;
    if (state.playlistRequest && state.playlistRequest !== localStorage.getItem(musicPlaylistRequestKey)) return;
    pendingMusicPopoutState = state;
    loadYouTubeAPI();
    if (window.YT && window.YT.Player) restoreMusicPopoutState();
}

function restoreMusicPopoutState() {
    const state = pendingMusicPopoutState;
    if (!state) return;
    pendingMusicPopoutState = null;
    if (state.playlistRequest && state.playlistRequest !== localStorage.getItem(musicPlaylistRequestKey)) return;
    const incomingKind = state.kind === 'news' ? 'news' : 'music';
    if (musicPlaybackKind === 'music' && incomingKind === 'news') musicPlayTracking?.close();
    // A handoff continues the same queue intent; only invalidate local work.
    setMusicPlaybackKind(incomingKind, true);
    musicPlaylist = state.playlist;
    musicCurrentIndex = state.index;
    sessionHistory = state.history || [];
    historyIndex = state.historyIndex;
    playedSongs = state.played || [];
    isSequentialMode = state.sequential;
    localStorage.setItem('musicPlayerEnabled', state.mode || 'list');
    musicPlayTracking?.restore(musicPlaybackKind === 'music' ? state.tracking : null);
    nextMusicPlayIsFresh = musicPlaybackKind === 'music' && !!state.newPlay;
    nextMusicSessionIsFresh = musicPlaybackKind === 'music' && !!state.newSession;
    saveHistory();
    claimMusicPlayer();
    createPlayer(state.videoId, state.time, state.paused);
}

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

function startPlayerPlaylist(playlist, startIndex, kind) {
    if (!Array.isArray(playlist) || !playlist.length) return false;
    startIndex = Number.isInteger(startIndex) ? Math.max(0, Math.min(startIndex, playlist.length - 1)) : 0;
    musicPlayTracking?.suspend();
    const previousKind = musicPlaybackKind;
    if (previousKind === 'music' && kind === 'news') musicPlayTracking?.close();
    setMusicPlaybackKind(kind);
    if (kind === 'news') musicPlayTracking?.restore(null);
    nextMusicSessionIsFresh = kind === 'music' && (previousKind !== 'music'
        || !localStorage.getItem('musicPlayerEnabled') || (!isMusicPlayerReady && !isMusicPopoutOpen()));
    nextMusicPlayIsFresh = kind === 'music';
    window.prepareMusicPlayerWindow();
    const fixedQueue = kind === 'news' || playlist[0]?.loop_queue === true;
    sessionHistory = fixedQueue ? [...playlist] : [];
    historyIndex = fixedQueue ? startIndex : -1;
    localStorage.removeItem('music_player_history');
    localStorage.removeItem('music_player_history_index');
    localStorage.removeItem('news_player_history');
    localStorage.removeItem('news_player_history_index');
    if (fixedQueue) saveHistory();

    musicPlaylist = playlist;
    musicCurrentIndex = startIndex;
    isSequentialMode = true;
    playedSongs = [musicPlaylist[startIndex].video_id];
    
    localStorage.setItem('musicPlayerEnabled', 'list');
    localStorage.setItem('music_player_playlist', JSON.stringify(playlist));
    localStorage.setItem('music_player_index', startIndex);
    localStorage.setItem('music_player_video', playlist[startIndex].video_id);
    localStorage.setItem('music_player_time', '0');
    claimMusicPlayer();
    
    const toggle = document.getElementById('music-player-toggle');
    if (toggle) toggle.checked = kind === 'music';

    if (!isMusicPopout && isMusicPopoutOpen()) {
        createPlayer(musicPlaylist[musicCurrentIndex].video_id, 0);
        return true;
    }
    
    loadYouTubeAPI();
    if (window.YT && window.YT.Player) {
        if (musicPlayer && musicPlayer.destroy) {
            musicPlayer.destroy();
            isMusicPlayerReady = false;
        }
        createPlayer(musicPlaylist[musicCurrentIndex].video_id, 0);
    }
    return true;
}

window.startCustomPlaylist = function(playlist, startIndex) {
    return startPlayerPlaylist(playlist, startIndex, 'music');
};

window.startNewsPlayback = function(videos, startIndex = 0) {
    if (!Array.isArray(videos) || !videos.length) return false;
    const chosenVideo = videos[startIndex]?.id;
    const seen = new Set();
    const playlist = [];
    for (const video of videos) {
        const videoId = video?.id;
        if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
        seen.add(videoId);
        playlist.push({
            kind: 'news', video_id: videoId, item_id: null, source_id: null, is_favorite: false,
            title: typeof video.title === 'string' ? video.title : `Video ${videoId}`,
            channel: typeof video.channel === 'string' ? video.channel : '',
            thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        });
    }
    const index = Math.max(0, playlist.findIndex(video => video.video_id === chosenVideo));
    return startPlayerPlaylist(playlist, index, 'news');
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
  if (pendingMusicPopoutState) {
    restoreMusicPopoutState();
    return;
  }
  if (isMusicPopout) return;
  musicPlaybackKind = localStorage.getItem(musicPlaybackKindKey) === 'news' ? 'news' : 'music';
  const savedMode = localStorage.getItem('musicPlayerEnabled');
  const toggle = document.getElementById('music-player-toggle');
  
  if (toggle) {
    const currentMode = toggle.dataset.mode;
    // Ensure the toggle is checked if we are explicitly playing a list AND we are on the music.html page ('filtered')
    toggle.checked = musicPlaybackKind === 'music'
        && ((savedMode === currentMode) || (savedMode === 'list' && currentMode === 'filtered'));
  }
  
  if (savedMode) {
    if (!isMusicPopout && (isMusicPopoutOpen() || localStorage.getItem(musicPopoutModeKey) === 'true')) {
      hideEmbeddedMusicPlayer();
      return;
    }
    claimMusicPlayer();
    loadYouTubeAPI();
    if (window.YT && window.YT.Player) {
      loadPlaylist();
    }
  }
}

function loadPlaylist() {
  setMusicPlaybackKind(localStorage.getItem(musicPlaybackKindKey));
  const generation = musicPlaylistGeneration;
  const requestId = localStorage.getItem(musicPlaylistRequestKey);
  const requestedKind = musicPlaybackKind;
  const savedMode = localStorage.getItem('musicPlayerEnabled');
  const lastVideo = localStorage.getItem('music_player_video');
  const lastTime = parseFloat(localStorage.getItem('music_player_time')) || 0;
  const isCurrentRequest = () => generation === musicPlaylistGeneration
      && requestId === localStorage.getItem(musicPlaylistRequestKey)
      && requestedKind === musicPlaybackKind
      && requestedKind === (localStorage.getItem(musicPlaybackKindKey) === 'news' ? 'news' : 'music')
      && savedMode === localStorage.getItem('musicPlayerEnabled');
  if (musicPlaybackKind === 'news' && savedMode !== 'list') {
      closePlayer();
      return;
  }
  
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
              
              const videoId = musicPlaybackKind === 'news'
                  ? musicPlaylist[musicCurrentIndex].video_id
                  : lastVideo || musicPlaylist[musicCurrentIndex].video_id;
              createPlayer(videoId, lastVideo === videoId ? lastTime : 0);
              return;
          }
      } catch(e) {}
      // A missing news queue must never turn into a random music playlist.
      if (musicPlaybackKind === 'news') {
          closePlayer();
          return;
      }
  }

  if (savedMode === 'filtered' && window.getFilteredMusicPlaylist) {
      window.getFilteredMusicPlaylist().then(playlist => {
          if (!isCurrentRequest()) return;
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
          if (!isCurrentRequest()) return;
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
      if (!isCurrentRequest()) return;
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
    }).catch(error => {
      if (isCurrentRequest()) console.error('Unable to load music playlist', error);
    });
}

function createPlayer(videoId, startTime = 0, startPaused = false) {
  if (!isMusicPopout && isMusicPopoutOpen()) {
    sendMusicPopoutCommand('play', musicPlayerSnapshot(videoId, startTime, startPaused));
    nextMusicPlayIsFresh = false;
    nextMusicSessionIsFresh = false;
    hideEmbeddedMusicPlayer();
    return;
  }
  const container = document.getElementById('music-player-container');
  if (!container) return;
  
  let actualVideoToPlay = videoId;
  
  // Intercept the request to play the correct video if navigating directly from a page reload with history
  try {
      const [historyKey, indexKey] = playbackHistoryKeys();
      const storedHist = JSON.parse(localStorage.getItem(historyKey));
      const storedIdx = parseInt(localStorage.getItem(indexKey));
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
      sessionHistory = hasFixedPlaybackQueue() ? [...musicPlaylist] : [currentData];
      historyIndex = hasFixedPlaybackQueue() ? musicCurrentIndex : 0;
      saveHistory();
  }

  musicPlayTracking?.suspend();
  musicControlsVisibility?.destroy();
  musicControlsVisibility = null;
  
  if (musicPlayer && musicPlayer.destroy) {
    try { musicPlayer.destroy(); } catch(e) {}
    isMusicPlayerReady = false;
  }
  
  container.style.display = 'block';
  
  const isFavorite = currentData.is_favorite;
  const sourceId = currentData.source_id;
  const isNews = musicPlaybackKind === 'news';
  const detailsUrl = isNews ? `https://www.youtube.com/watch?v=${actualVideoToPlay}` : `/musicbrainz/music/${sourceId}/`;
  if (isMusicPopout) document.title = isNews ? 'Media Journal - Video Player' : 'Media Journal - Music Player';
  
  container.innerHTML = `
    <style>
      #mp-wrapper { display: flex; flex-direction: row; width: 100%; height: 100%; background: #000; font-family: sans-serif; overflow: hidden; }
      #mp-left { display: flex; flex-direction: column; flex: 1; position: relative; }
      #mp-controls { display: flex; align-items: center; background: #222; padding: 0 10px; z-index: 10; flex-shrink: 0; justify-content: space-between; }
      .mp-ctrl-group { display: flex; align-items: center; gap: 8px; flex: 1; }
      .mp-ctrl-center { justify-content: center; }
      .mp-ctrl-right { justify-content: flex-end; }
      
      #mp-video-wrap { flex: 1; position: relative; background: #000; }
      /* Adjust these percentages to move/resize the invisible video drag areas.
         Width applies to each side; the gap between them leaves the center clickable. */
      #mp-video-wrap {
        --mp-drag-top: 25%;
        --mp-drag-height: 45%;
        --mp-drag-width: 38%;
        --mp-drag-edge: 0%;
      }
      .mp-drag-zone {
        position: absolute;
        top: var(--mp-drag-top);
        height: var(--mp-drag-height);
        width: var(--mp-drag-width);
        z-index: 2;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }
      .mp-drag-zone-left { left: var(--mp-drag-edge); }
      .mp-drag-zone-right { right: var(--mp-drag-edge); }
      .mp-drag-zone.is-dragging { cursor: grabbing; }
      .mp-fullscreen .mp-drag-zone { display: none; }
      #mp-history { background: #111; overflow-y: auto; color: white; flex-direction: column; flex-shrink: 0; display: flex; }
      #mp-history::-webkit-scrollbar { width: 6px; }
      #mp-history::-webkit-scrollbar-track { background: #111; }
      #mp-history::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
      #mp-history::-webkit-scrollbar-thumb:hover { background: #666; }
      
      .mp-btn { background: transparent; color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 5px; border-radius: 4px; transition: background 0.2s; }
      .mp-btn:hover { background: rgba(255,255,255,0.2); }
      .mp-btn svg { width: 24px; height: 24px; fill: currentColor; }
      .mp-size-menu { position: relative; }
      .mp-size-popover { display: none; position: absolute; top: 100%; right: 0; padding-top: 4px; z-index: 20; }
      .mp-size-popover .mp-btn { background: #222; white-space: nowrap; gap: 6px; padding: 8px; font: 13px sans-serif; }
      .mp-size-menu:hover .mp-size-popover, .mp-size-menu:has(:focus-visible) .mp-size-popover { display: block; }
      .mp-size-popover .mp-btn:hover { background: #444; }
      .mp-fullscreen .mp-size-popover { top: auto; bottom: 100%; padding-top: 0; padding-bottom: 4px; }
      .mp-popout .mp-size-menu, .mp-popout #mp-fullscreen, .mp-popout .mp-drag-zone { display: none; }
      #mp-dock { display: none; }
      .mp-popout #mp-dock { display: flex; }
      .mp-popout #mp-left { min-width: 0; }
      .mp-popout #mp-controls { height: 40px; }
      .mp-popout .mp-ctrl-group { gap: 4px; }
      .mp-popout #mp-history { position: absolute; top: 40px; right: 0; bottom: 0; width: min(240px, 70vw); z-index: 15; line-height: 1.4; }
      
      .history-item { padding: 10px; cursor: pointer; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 8px; transition: background 0.2s; }
      .history-item:hover { background: #222; }
      .history-item.active { background: #333; font-weight: bold; color: #4db8ff; }
      
      /* FULLSCREEN OVERRIDES */
      .mp-fullscreen #mp-wrapper { flex-direction: row; width: 100%; height: 100%; }
      .mp-fullscreen #mp-controls {
         position: absolute; bottom: 0.5rem; left: 50%; transform: translateX(-50%);
         background: rgba(0,0,0,0.8); border-radius: 12px; height: 60px; padding: 0 20px; width: 600px; max-width: 90vw; box-sizing: border-box;
         opacity: 1; transition: opacity 100ms cubic-bezier(0, 0, 0.2, 1);
      }
      .mp-fullscreen.mp-controls-hidden #mp-controls {
         opacity: 0; pointer-events: none;
         transition: opacity 200ms cubic-bezier(0.4, 0, 1, 1);
      }
      .mp-controls-wake { display: none; position: absolute; inset: 0; z-index: 2; touch-action: none; cursor: none; }
      .mp-fullscreen.mp-controls-hidden .mp-controls-wake { display: block; }
      .mp-fullscreen #mp-history {
         position: absolute; bottom: 100px; right: 20px; width: 300px; max-height: 50vh;
         background: rgba(0,0,0,0.8); border-radius: 8px; border: 1px solid #333;
      }
      .mp-fullscreen #mp-video-wrap { position: absolute; top:0; left:0; width:100%; height:100%; z-index: 1; }
      .mp-fullscreen #mp-video-wrap iframe, .mp-fullscreen #music-player { width: 100% !important; height: 100% !important; display: block; border: none; }
      .mp-fullscreen #mp-controls { z-index: 10; }
      .mp-fullscreen #mp-history { z-index: 10; pointer-events: auto; }
      .mp-fullscreen .mp-btn svg { width: 32px; height: 32px; }
      
      /* Scale for both the app's wide mobile viewport and the pop-out's device viewport. */
      .mp-portrait {
          --mp-button-size: clamp(44px, 11.5vw, 112px);
          --mp-control-gap: clamp(4px, 1vw, 10px);
          --mp-control-padding: clamp(6px, 1.5vw, 14px);
          --mp-history-font-size: calc(var(--mp-button-size) * 0.34);
          position: relative;
      }
      .mp-portrait #mp-left { min-width: 0; }
      .mp-portrait #mp-controls {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          grid-template-areas: "favorite details history popout close" "size previous play next fullscreen";
          gap: var(--mp-control-gap);
          justify-items: center;
          align-items: center;
          box-sizing: border-box;
          min-width: calc(5 * var(--mp-button-size) + 4 * var(--mp-control-gap) + 2 * var(--mp-control-padding));
          height: auto !important;
          padding: var(--mp-control-padding);
      }
      .mp-portrait .mp-ctrl-group,
      .mp-portrait:not(.mp-popout) .mp-size-menu,
      .mp-portrait:not(.mp-popout) .mp-size-popover { display: contents; }
      .mp-portrait .mp-btn {
          box-sizing: border-box;
          width: var(--mp-button-size);
          height: var(--mp-button-size);
          padding: 0;
          line-height: 1;
          touch-action: manipulation;
      }
      .mp-portrait .mp-btn svg { width: 60%; height: 60%; }
      .mp-portrait #mp-playpause svg { width: 72%; height: 72%; }
      .mp-portrait #mp-heart { grid-area: favorite; }
      .mp-portrait #mp-info { grid-area: details; }
      .mp-portrait #mp-toggle-hist { grid-area: history; }
      .mp-portrait #mp-expand { grid-area: size; }
      .mp-portrait #mp-prev { grid-area: previous; }
      .mp-portrait #mp-playpause { grid-area: play; }
      .mp-portrait #mp-next { grid-area: next; }
      .mp-portrait #mp-fullscreen { grid-area: fullscreen; }
      .mp-portrait #mp-close { grid-area: close; }
      .mp-portrait #mp-dock { grid-area: dock; }
      .mp-portrait #mp-popout { grid-area: popout; background: transparent; padding: 0; }
      .mp-portrait #mp-popout:hover { background: rgba(255,255,255,0.2); }
      .mp-portrait #mp-popout span { display: none; }
      .mp-portrait.mp-popout #mp-controls {
          grid-template-areas: "favorite details history dock close" ". previous play next .";
      }
      .mp-portrait #mp-history {
          position: absolute;
          top: var(--mp-controls-height);
          right: 0;
          bottom: 0;
          width: min(85%, calc(6 * var(--mp-button-size)));
          max-height: none;
          z-index: 15;
          line-height: 1.4;
      }
      .mp-portrait .history-item {
          box-sizing: border-box;
          min-height: var(--mp-button-size);
          padding: calc(var(--mp-button-size) * 0.18);
          font-size: var(--mp-history-font-size);
      }
      .mp-fullscreen.mp-portrait #mp-controls {
          width: 94vw;
          max-width: calc(7 * var(--mp-button-size) + 6 * var(--mp-control-gap) + 2 * var(--mp-control-padding));
          bottom: max(var(--mp-control-padding), env(safe-area-inset-bottom, 0px));
      }
      .mp-fullscreen.mp-portrait #mp-history {
          top: auto;
          right: var(--mp-control-padding);
          bottom: calc(var(--mp-controls-height) + 2 * var(--mp-control-padding) + env(safe-area-inset-bottom, 0px));
          max-height: 50vh;
      }
    </style>
    <div id="mp-wrapper">
       <div id="mp-left">
          <div id="mp-controls">
             <div class="mp-ctrl-group">
                <button id="mp-heart" class="mp-btn" title="Favorite" data-item-id="${isNews ? '' : currentData.item_id || ''}" data-favorite="${isFavorite}"${isNews || !currentData.item_id ? ' style="display:none"' : ''}>${iconHeart(isFavorite)}</button>
                <a id="mp-info" href="${detailsUrl}" class="mp-btn" title="${isNews ? 'Watch on YouTube' : 'Details'}"${isNews ? ' target="_blank" rel="noopener noreferrer"' : ''}>${iconInfo}</a>
                <button id="mp-toggle-hist" class="mp-btn" title="${isNews ? 'Toggle Queue' : 'Toggle History'}">${iconHistory}</button>
             </div>
             <div class="mp-ctrl-group mp-ctrl-center">
                <button id="mp-prev" class="mp-btn" title="Previous">${iconPrev}</button>
                <button id="mp-playpause" class="mp-btn" title="Play/Pause">${iconPause}</button>
                <button id="mp-next" class="mp-btn" title="Next">${iconNext}</button>
             </div>
             <div class="mp-ctrl-group mp-ctrl-right">
                <div class="mp-size-menu">
                  <button id="mp-expand" class="mp-btn" title=""></button>
                  <div class="mp-size-popover"><button id="mp-popout" class="mp-btn" title="Open player in a separate window">${iconInfo}<span>Pop out player</span></button></div>
                </div>
                <button id="mp-fullscreen" class="mp-btn" title=""></button>
                <button id="mp-dock" class="mp-btn" title="Return player to page" aria-label="Return player to page">${iconTheater}</button>
                <button id="mp-close" class="mp-btn" title="Close">${iconClose}</button>
             </div>
          </div>
          <div id="mp-video-wrap">
             <div id="music-player"></div>
             <div class="mp-controls-wake" aria-hidden="true"></div>
             <div class="mp-drag-zone mp-drag-zone-left" title="Drag to move player"></div>
             <div class="mp-drag-zone mp-drag-zone-right" title="Drag to move player"></div>
          </div>
       </div>
       <div id="mp-history"></div>
    </div>
  `;
  
  updateContainerSize();
  renderHistoryList();
  bindPlayerEvents();
  bindMusicPlayerDragging(container);
  musicControlsVisibility = bindMusicControlsVisibility(container);

  if (!isNews) {
      if (nextMusicSessionIsFresh) musicPlayTracking?.startSession({ fresh: true });
      musicPlayTracking?.begin(currentData, { fresh: nextMusicPlayIsFresh });
  }
  nextMusicPlayIsFresh = false;
  nextMusicSessionIsFresh = false;
  
  musicPlayer = new YT.Player('music-player', {
    height: '100%',
    width: '100%',
    videoId: actualVideoToPlay,
    playerVars: {
      autoplay: startPaused ? 0 : 1,
      controls: 1,
      start: Math.floor(startTime)
    },
    events: {
      onReady: (e) => {
        if (e.target !== musicPlayer) return;
        isMusicPlayerReady = true;
        if (!startPaused) e.target.playVideo();
        if (musicPlaybackKind === 'music') musicPlayTracking?.stateChange(e.target.getPlayerState());
        musicControlsVisibility?.refresh();
      },
      onStateChange: onPlayerStateChange
    }
  });
}

function positionMusicPlayer(container, x, y) {
    // Keep the player within reach when changing size or using a smaller window.
    const left = Math.max(0, Math.min(x, Math.max(0, window.innerWidth - container.offsetWidth)));
    const top = Math.max(0, Math.min(y, Math.max(0, window.innerHeight - container.offsetHeight)));
    container.style.setProperty('left', left + 'px', 'important');
    container.style.setProperty('top', top + 'px', 'important');
    container.style.setProperty('right', 'auto', 'important');
    container.style.setProperty('bottom', 'auto', 'important');
    return { x: left, y: top };
}

function restoreMusicPlayerPosition(container) {
    try {
        const position = JSON.parse(localStorage.getItem('music_player_position'));
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
            positionMusicPlayer(container, position.x, position.y);
        }
    } catch (e) {
        // An invalid saved position should leave the default placement intact.
    }
}

function bindMusicPlayerDragging(container) {
    container.querySelectorAll('.mp-drag-zone').forEach(zone => {
        let drag = null;
        zone.addEventListener('pointerdown', event => {
            if (!event.isPrimary || event.button !== 0 || localStorage.getItem('music_player_fullscreen') === 'true') return;
            event.preventDefault();
            const rect = container.getBoundingClientRect();
            drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
            zone.setPointerCapture(event.pointerId);
            zone.classList.add('is-dragging');
        });
        zone.addEventListener('pointermove', event => {
            if (!drag || drag.pointerId !== event.pointerId) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) < 3) return;
            drag.moved = true;
            positionMusicPlayer(container, drag.left + dx, drag.top + dy);
        });
        const finishDrag = event => {
            if (!drag || drag.pointerId !== event.pointerId) return;
            const moved = drag.moved;
            drag = null;
            zone.classList.remove('is-dragging');
            if (zone.hasPointerCapture(event.pointerId)) zone.releasePointerCapture(event.pointerId);
            if (moved) {
                const rect = container.getBoundingClientRect();
                localStorage.setItem('music_player_position', JSON.stringify({ x: rect.left, y: rect.top }));
            }
        };
        zone.addEventListener('pointerup', finishDrag);
        zone.addEventListener('pointercancel', finishDrag);
        zone.addEventListener('lostpointercapture', finishDrag);
    });
}

let musicPlayerScrollPosition = null;

function bindMusicControlsVisibility(container) {
    const wrapper = document.getElementById('mp-wrapper');
    const controls = document.getElementById('mp-controls');
    const history = document.getElementById('mp-history');
    const wakeLayer = container.querySelector('.mp-controls-wake');
    let hideTimer = null;

    const isFullscreen = () => !isMusicPopout && wrapper.isConnected &&
        container.style.display !== 'none' && wrapper.classList.contains('mp-fullscreen') &&
        !!localStorage.getItem('musicPlayerEnabled');
    const isPlaying = () => musicPlayer && isMusicPlayerReady &&
        musicPlayer.getPlayerState() === YT.PlayerState.PLAYING;

    function reset() {
        clearTimeout(hideTimer);
        hideTimer = null;
        wrapper.classList.remove('mp-controls-hidden');
    }

    function refresh() {
        reset();
        if (!isFullscreen() || !isPlaying()) return;
        hideTimer = setTimeout(() => {
            hideTimer = null;
            const hoveringControls = window.matchMedia('(hover: hover)').matches && controls.matches(':hover');
            if (!isFullscreen() || !isPlaying() || hoveringControls || controls.querySelector(':focus-visible') ||
                history.style.display !== 'none') return;
            wrapper.classList.add('mp-controls-hidden');
        }, 4000);
    }

    function wakeControls(event) {
        // The layer receives this click, so pause through YouTube's API as well.
        event.preventDefault();
        event.stopPropagation();
        if (event.isPrimary && event.button === 0 && isFullscreen() && isPlaying()) {
            musicPlayer.pauseVideo();
        }
        refresh();
    }

    // YouTube's iframe does not forward pointer movement. Only cover it while idle,
    // and remove the layer on the first movement so its own controls work normally.
    const activityEvents = ['pointermove', 'pointerdown', 'keydown', 'focusin', 'focusout'];
    activityEvents.forEach(type => container.addEventListener(type, refresh));
    controls.addEventListener('pointerleave', refresh);
    wakeLayer.addEventListener('pointerdown', wakeControls);

    return {
        refresh,
        reset,
        destroy() {
            reset();
            activityEvents.forEach(type => container.removeEventListener(type, refresh));
            controls.removeEventListener('pointerleave', refresh);
            wakeLayer.removeEventListener('pointerdown', wakeControls);
        },
    };
}

function setMusicPlayerScrollLock(locked) {
    if (!locked) musicControlsVisibility?.reset();
    if (locked && !musicPlayerScrollPosition) {
        musicPlayerScrollPosition = { x: window.scrollX, y: window.scrollY };
        document.body.style.setProperty('--music-player-scroll-top', -musicPlayerScrollPosition.y + 'px');
        document.body.style.setProperty('--music-player-scroll-left', -musicPlayerScrollPosition.x + 'px');
        document.documentElement.classList.add('music-player-scroll-locked');
        document.body.classList.add('music-player-scroll-locked');
    } else if (!locked) {
        const position = musicPlayerScrollPosition;
        document.documentElement.classList.remove('music-player-scroll-locked');
        document.body.classList.remove('music-player-scroll-locked');
        document.body.style.removeProperty('--music-player-scroll-top');
        document.body.style.removeProperty('--music-player-scroll-left');
        musicPlayerScrollPosition = null;
        if (position) window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' });
    }
}

function updateContainerSize() {
    const container = document.getElementById('music-player-container');
    const wrapper = document.getElementById('mp-wrapper');
    // A remembered fullscreen preference must not lock a page without an active player.
    if (!container || !wrapper || container.style.display === 'none' || !localStorage.getItem('musicPlayerEnabled')) {
        setMusicPlayerScrollLock(false);
        return;
    }
    const historyEl = document.getElementById('mp-history');
    const controlsEl = document.getElementById('mp-controls');
    
    const isFullscreen = !isMusicPopout && localStorage.getItem('music_player_fullscreen') === 'true';
    setMusicPlayerScrollLock(isFullscreen);
    const isExpanded = localStorage.getItem('music_player_expanded') === 'true';
    const showHist = localStorage.getItem('music_player_history_visible') === 'true';
    // Check both orientation matchMedia and physical screen dimensions for 100% detection
    const isMobilePortrait = window.matchMedia('(orientation: portrait)').matches || (window.innerHeight > window.innerWidth);
    const scale = isMobilePortrait ? 1.5 : 1;
    
    // Explicitly toggle the portrait class so CSS rules apply reliably without media-query quirks
    if (wrapper) {
        wrapper.classList.toggle('mp-portrait', isMobilePortrait);
    }

    const portraitControlsStyle = isMobilePortrait && controlsEl ? getComputedStyle(controlsEl) : null;
    const portraitControlsHeight = portraitControlsStyle ? Math.ceil(controlsEl.getBoundingClientRect().height) : 0;
    
    if (historyEl) {
        historyEl.style.display = showHist ? 'flex' : 'none';
    }
    
    container.style.setProperty('position', 'fixed', 'important');
    
    if (isMusicPopout) {
        if (wrapper) wrapper.classList.add('mp-popout');
        for (const [property, value] of Object.entries({ top: '0', left: '0', right: 'auto', bottom: 'auto', width: '100%', height: '100%', 'border-radius': '0' })) {
            container.style.setProperty(property, value, 'important');
        }
        if (historyEl) { historyEl.style.width = ''; historyEl.style.height = ''; }
        if (controlsEl) controlsEl.style.height = '40px';
    } else if (isFullscreen) {
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
        const hw = showHist && !isMobilePortrait ? 200 * scale : 0;
        const ch = portraitControlsHeight || 40 * scale;

        if (portraitControlsStyle) {
            const minimumWidth = parseFloat(portraitControlsStyle.minWidth) || 0;
            const padding = parseFloat(portraitControlsStyle.paddingLeft) || 0;
            w = Math.min(Math.max(w, minimumWidth), Math.max(1, window.innerWidth - 2 * padding));
            h = w * 9 / 16;
        }
        
        container.style.setProperty('width', (w + hw) + 'px', 'important');
        container.style.setProperty('height', (h + ch) + 'px', 'important');
        container.style.setProperty('border-radius', '8px', 'important');
        container.style.setProperty('z-index', '9999', 'important');
        
        if (historyEl) historyEl.style.width = isMobilePortrait ? '' : showHist ? (hw + 'px') : '0';
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
        restoreMusicPlayerPosition(container);
    }

    if (isMobilePortrait && wrapper && controlsEl) {
        wrapper.style.setProperty('--mp-controls-height', Math.ceil(controlsEl.getBoundingClientRect().height) + 'px');
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
    musicControlsVisibility?.refresh();
}

function saveHistory() {
    const [historyKey, indexKey] = playbackHistoryKeys();
    localStorage.setItem(historyKey, JSON.stringify(sessionHistory));
    localStorage.setItem(indexKey, historyIndex.toString());
}

function bindPlayerEvents() {
    document.getElementById('mp-dock').addEventListener('click', returnMusicPlayerToPage);
    document.getElementById('mp-popout').addEventListener('click', openMusicPopout);
    document.getElementById('mp-close').addEventListener('click', closePlayer);
    document.getElementById('mp-prev').addEventListener('click', playPrev);
    document.getElementById('mp-next').addEventListener('click', playNext);
    
    document.getElementById('mp-toggle-hist').addEventListener('click', () => {
        const current = localStorage.getItem('music_player_history_visible') === 'true';
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

    document.getElementById('mp-info').addEventListener('click', event => {
        // News has no local media details page. Its external link can open
        // normally without redirecting the app/opener away from Media Journal.
        if (musicPlaybackKind === 'news') return;
        if (isMusicPopout) {
            event.preventDefault();
            if (window.opener && !window.opener.closed) {
                window.opener.location.href = event.currentTarget.href;
                window.opener.focus();
            } else {
                window.open(event.currentTarget.href, '_blank', 'noopener');
            }
            return;
        }
        if (localStorage.getItem('music_player_fullscreen') === 'true') {
            localStorage.setItem('music_player_fullscreen', 'false');
            updateContainerSize();
        }
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
        if (musicPlaybackKind === 'news') return;
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
            const playlistItems = musicPlaylist.filter(v => String(v.item_id) === String(itemId));
            if (playlistItems.length) {
              playlistItems.forEach(video => { video.is_favorite = !isFav; });
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

function clearMusicPlaybackState() {
    invalidateMusicPlaylistLoad();
    for (const key of [
        'musicPlayerEnabled', 'music_player_playlist', 'music_player_index',
        'music_player_video', 'music_player_time', 'music_player_active_tab',
        'music_player_history', 'music_player_history_index', musicPopoutCommandKey,
        'news_player_history', 'news_player_history_index', musicPlaybackKindKey, musicPlaylistRequestKey,
    ]) {
        localStorage.removeItem(key);
    }
    sessionHistory = [];
    historyIndex = -1;
    musicPlaybackKind = 'music';
}

function closePlayer() {
    if (musicPlaybackKind === 'music') musicPlayTracking?.close();
    else musicPlayTracking?.restore(null);
    nextMusicPlayIsFresh = false;
    nextMusicSessionIsFresh = false;
    setMusicPlayerScrollLock(false);
    if (musicPlayer && musicPlayer.destroy) {
      musicPlayer.destroy();
    }
    const container = document.getElementById('music-player-container');
    if (container) container.style.display = 'none';
    clearMusicPlaybackState();
    
    const toggle = document.getElementById('music-player-toggle');
    if (toggle) toggle.checked = false;
    if (isMusicPopout) window.close();
}

function renderHistoryList() {
    const histContainer = document.getElementById('mp-history');
    if (!histContainer) return;
    
    histContainer.innerHTML = '';
    sessionHistory.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-item' + (index === historyIndex ? ' active' : '');
        const titleText = item.title || ((musicPlaybackKind === 'news' ? 'Video ' : 'Track ') + item.video_id);
        const label = document.createElement('div');
        label.style.cssText = 'width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--mp-history-font-size, 13px);line-height:1.5;color:inherit';
        label.title = titleText;
        label.textContent = titleText;
        div.appendChild(label);
        div.addEventListener('click', () => {
            historyIndex = index;
            if (hasFixedPlaybackQueue()) {
                musicCurrentIndex = index;
                localStorage.setItem('music_player_index', index);
            }
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
        if (musicPlaybackKind === 'music') musicPlayTracking?.begin(videoObj, { fresh: true });
        musicPlayer.loadVideoById(videoObj.video_id);
        localStorage.setItem('music_player_video', videoObj.video_id);
        localStorage.setItem('music_player_time', '0');
        
        const heartBtn = document.getElementById('mp-heart');
        if (heartBtn) {
          heartBtn.style.display = musicPlaybackKind === 'news' || !videoObj.item_id ? 'none' : '';
          heartBtn.dataset.itemId = musicPlaybackKind === 'news' ? '' : videoObj.item_id || '';
          heartBtn.dataset.favorite = videoObj.is_favorite;
          heartBtn.innerHTML = iconHeart(videoObj.is_favorite);
        }
        const infoLink = document.getElementById('mp-info');
        if (infoLink) {
          const isNews = musicPlaybackKind === 'news';
          infoLink.href = isNews ? `https://www.youtube.com/watch?v=${videoObj.video_id}` : `/musicbrainz/music/${videoObj.source_id}/`;
          infoLink.title = isNews ? 'Watch on YouTube' : 'Details';
          if (isNews) {
              infoLink.target = '_blank';
              infoLink.rel = 'noopener noreferrer';
          } else {
              infoLink.removeAttribute('target');
              infoLink.removeAttribute('rel');
          }
        }
        
        renderHistoryList();
    }
}

function onPlayerStateChange(event) {
  if (event.target && event.target !== musicPlayer) return;
  if (musicPlaybackKind === 'music') musicPlayTracking?.stateChange(event.data);
  musicControlsVisibility?.refresh();
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

function hasFixedPlaybackQueue() {
    // Entry video queues loop by position; ordinary music playlists retain their history behavior.
    return musicPlaybackKind === 'news' || musicPlaylist[0]?.loop_queue === true;
}

function playPrev() {
    if (hasFixedPlaybackQueue()) {
        playQueueItem(musicCurrentIndex - 1);
        return;
    }
    if (historyIndex > 0) {
        historyIndex--;
        saveHistory();
        playVideoInternal(sessionHistory[historyIndex]);
    }
}

function playNext() {
  if (hasFixedPlaybackQueue()) {
      playQueueItem(musicCurrentIndex + 1);
      return;
  }
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

function playQueueItem(index) {
    if (!musicPlaylist.length || !musicPlayer || !isMusicPlayerReady) return;
    musicCurrentIndex = ((index % musicPlaylist.length) + musicPlaylist.length) % musicPlaylist.length;
    // Fixed queues show their entries rather than growing a duplicate history on each loop.
    sessionHistory = [...musicPlaylist];
    historyIndex = musicCurrentIndex;
    localStorage.setItem('music_player_index', musicCurrentIndex);
    saveHistory();
    playVideoInternal(musicPlaylist[musicCurrentIndex]);
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
  if (isMusicPopout) {
    saveMusicPopoutPosition();
    const owner = JSON.parse(localStorage.getItem(musicPopoutOwnerKey) || 'null');
    // Returning to the page releases ownership before closing this window.
    if (owner && owner.id === tabId) {
      if (musicPlaybackKind === 'music') musicPlayTracking?.close();
      else musicPlayTracking?.restore(null);
      localStorage.removeItem(musicPopoutOwnerKey);
      clearMusicPlaybackState();
    } else {
      musicPlayTracking?.suspend();
    }
    return;
  }
  musicPlayTracking?.suspend();
  if (musicPlayer && isMusicPlayerReady && typeof musicPlayer.getCurrentTime === 'function'
      && localStorage.getItem('musicPlayerEnabled') && localStorage.getItem('music_player_active_tab') === String(tabId)) {
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
    } else {
      hideEmbeddedMusicPlayer();
    }
  }
});

// Toggle player
document.addEventListener('DOMContentLoaded', () => {
  if (isMusicPopout) {
    localStorage.setItem(musicPopoutModeKey, 'true');
    const heartbeat = () => localStorage.setItem(musicPopoutOwnerKey, JSON.stringify({ id: tabId, updated: Date.now() }));
    heartbeat();
    const heartbeatTimer = setInterval(heartbeat, 10000);
    window.addEventListener('pagehide', () => clearInterval(heartbeatTimer), { once: true });
    // Browsers have no standard window-move event, so only write when position changes.
    const positionTimer = setInterval(saveMusicPopoutPosition, 1000);
    window.addEventListener('pagehide', () => clearInterval(positionTimer), { once: true });
    try {
      const command = JSON.parse(localStorage.getItem(musicPopoutCommandKey));
      if (command && command.action === 'play') receiveMusicPopoutState(command.state);
    } catch (e) { console.error('Unable to restore pop-out player', e); }
  }
  const toggle = document.getElementById('music-player-toggle');
  if (toggle) {
    const savedMode = localStorage.getItem('musicPlayerEnabled');
    toggle.checked = musicPlaybackKind === 'music'
        && (savedMode === toggle.dataset.mode || (savedMode === 'list' && toggle.dataset.mode === 'filtered'));
    toggle.addEventListener('change', function() {
      invalidateMusicPlaylistLoad();
      localStorage.removeItem('music_player_playlist');
      localStorage.removeItem('music_player_index');
      const enabled = this.checked;
      const mode = this.dataset.mode;
      
      if (enabled) {
        musicPlayTracking?.suspend();
        setMusicPlaybackKind('music');
        const wasPlaying = isMusicPlayerReady || isMusicPopoutOpen();
        window.prepareMusicPlayerWindow();
        const oldMode = localStorage.getItem('musicPlayerEnabled');
        nextMusicSessionIsFresh = !oldMode || !wasPlaying;
        nextMusicPlayIsFresh = true;
        if (oldMode && oldMode !== mode) {
          localStorage.removeItem('music_player_video');
          localStorage.removeItem('music_player_time');
        }
        
        // Fresh start: wipe local history
        localStorage.removeItem('music_player_history');
        localStorage.removeItem('music_player_history_index');
        localStorage.removeItem('news_player_history');
        localStorage.removeItem('news_player_history_index');
        sessionHistory = [];
        historyIndex = -1;
        
        localStorage.setItem('musicPlayerEnabled', mode);
        claimMusicPlayer();
        loadYouTubeAPI();
      } else {
        if (!isMusicPopout && isMusicPopoutOpen()) sendMusicPopoutCommand('stop');
        else if (musicPlaybackKind === 'music') musicPlayTracking?.close();
        nextMusicPlayIsFresh = false;
        nextMusicSessionIsFresh = false;
        localStorage.removeItem('musicPlayerEnabled');
        localStorage.removeItem('music_player_video');
        localStorage.removeItem('music_player_time');
        localStorage.removeItem('music_player_active_tab');
      }
      
      const container = document.getElementById('music-player-container');
      if (enabled) {
        if ((!isMusicPopout && isMusicPopoutOpen()) || (window.YT && window.YT.Player)) {
          loadPlaylist();
        }
      } else {
        if (musicPlayer && musicPlayer.destroy) {
          musicPlayer.destroy();
        }
        if (container) {
          container.style.display = 'none';
        }
        setMusicPlayerScrollLock(false);
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
  const receivedDockedPlayer = !isMusicPopout && receiveDockedMusicPlayer();
  if (!receivedDockedPlayer && savedMode && !isMusicPopout && !isMusicPopoutOpen() && localStorage.getItem(musicPopoutModeKey) !== 'true') {
    loadYouTubeAPI();
    if (window.YT && window.YT.Player && !isMusicInitialized) {
      isMusicInitialized = true;
      initMusicPlayer();
    }
  }
  
  // Adjust sizing dynamically when phone rotates
  window.addEventListener('resize', () => {
    if (isMusicPopout) saveMusicPopoutPosition();
    const container = document.getElementById('music-player-container');
    if (container && container.style.display !== 'none') {
        updateContainerSize();
    }
  });

  // Listen for storage changes from other tabs
  window.addEventListener('storage', (e) => {
    if (e.key === musicPopoutCommandKey && isMusicPopout && e.newValue) {
      try {
        const command = JSON.parse(e.newValue);
        if (command.action === 'play') receiveMusicPopoutState(command.state);
        if (command.action === 'stop') {
          pendingMusicPopoutState = null;
          closePlayer();
        }
      } catch (error) { console.error('Unable to update pop-out player', error); }
      return;
    }
    if (e.key === musicPopoutOwnerKey && !isMusicPopout && e.newValue && isMusicPopoutOpen()) {
      hideEmbeddedMusicPlayer();
    }
    if (isMusicPopout) return;
    if (e.key === 'musicPlayerEnabled' || e.key === musicPlaybackKindKey) {
      if (toggle) {
        const storedMode = localStorage.getItem('musicPlayerEnabled');
        toggle.checked = localStorage.getItem(musicPlaybackKindKey) !== 'news'
            && (storedMode === toggle.dataset.mode || (storedMode === 'list' && toggle.dataset.mode === 'filtered'));
      }
      if (e.key === 'musicPlayerEnabled' && !localStorage.getItem('musicPlayerEnabled')) {
        hideEmbeddedMusicPlayer();
        return;
      }
    }
    if (isRestoringFromBfcache) return; // Skip stale queued storage events
    if (e.key === 'music_player_active_tab' && e.newValue && e.newValue !== String(tabId)) {
      const container = document.getElementById('music-player-container');
      if (container && container.style.display !== 'none') {
        // Save current time before closing
        if (musicPlayer && isMusicPlayerReady && typeof musicPlayer.getCurrentTime === 'function') {
          try {
            const time = musicPlayer.getCurrentTime();
            const videoId = musicPlaylist[musicCurrentIndex]?.video_id;
            // A newly chosen queue may already belong to the other tab. Only
            // transfer this time if it is still resuming the same video/kind.
            if (videoId && localStorage.getItem('music_player_video') === videoId
                && (localStorage.getItem(musicPlaybackKindKey) === 'news' ? 'news' : 'music') === musicPlaybackKind) {
              localStorage.setItem('music_player_time', time);
              localStorage.setItem('music_player_video', videoId);
            }
          } catch (e) {}
        }
        musicPlayTracking?.suspend();
        if (musicPlayer && musicPlayer.destroy) {
          musicPlayer.destroy();
        }
        container.style.display = 'none';
        setMusicPlayerScrollLock(false);
      }
    }
  });
});

// ==========================================================================
// MediaDownloader Ultra & Sylveader - iOS Liquid Glass Application Logic
// ==========================================================================

// Global State
let currentTab = 'youtube';
let inspectedData = null;
let activeJobs = new Map();
let historyItems = [];
let appConfig = { downloadDir: '', maxConcurrent: 2 };
let ws = null;

// YouTube Mode and Selections
let ytCurrentMode = 'video'; // 'video' | 'audio'
let ytSelectedQuality = 'best';
let ytSelectedAudioFormat = 'mp3';

// Spotify Selections
let spotSelectedFormat = 'mp3';
let currentPlayingPreview = null;

// Audio Player for 30s previews
const previewAudioPlayer = document.getElementById('previewAudioPlayer');

// DOM Elements: Navigation & Ambience
const tabIndicator = document.getElementById('tabIndicator');
const tabYoutube = document.getElementById('tabYoutube');
const tabSpotify = document.getElementById('tabSpotify');
const tabHistory = document.getElementById('tabHistory');
const tabComingSoon = document.getElementById('tabComingSoon');
const historyBadgeCount = document.getElementById('historyBadgeCount');

const ambientYt = document.getElementById('ambientYt');
const ambientSpot = document.getElementById('ambientSpot');
const ambientGray = document.getElementById('ambientGray');

// Views
const viewYoutube = document.getElementById('viewYoutube');
const viewSpotify = document.getElementById('viewSpotify');
const viewHistory = document.getElementById('viewHistory');
const viewComingSoon = document.getElementById('viewComingSoon');

// YouTube Elements
const urlInputYt = document.getElementById('urlInputYt');
const btnClearYt = document.getElementById('btnClearYt');
const btnPasteYt = document.getElementById('btnPasteYt');
const btnAnalyzeYt = document.getElementById('btnAnalyzeYt');
const btnSampleYt = document.getElementById('btnSampleYt');
const skeletonYt = document.getElementById('skeletonYt');
const youtubeCard = document.getElementById('youtubeCard');
const ytThumbnail = document.getElementById('ytThumbnail');
const ytTitle = document.getElementById('ytTitle');
const ytUploader = document.getElementById('ytUploader');
const ytViewsCount = document.getElementById('ytViewsCount');
const ytDuration = document.getElementById('ytDuration');
const btnModeVideo = document.getElementById('btnModeVideo');
const btnModeAudio = document.getElementById('btnModeAudio');
const ytVideoChipsSection = document.getElementById('ytVideoChipsSection');
const ytAudioChipsSection = document.getElementById('ytAudioChipsSection');
const ytQualityChipsGrid = document.getElementById('ytQualityChipsGrid');
const ytAudioChipsGrid = document.getElementById('ytAudioChipsGrid');
const btnDownloadYt = document.getElementById('btnDownloadYt');
const btnDownloadYtText = document.getElementById('btnDownloadYtText');

// Spotify Elements
const urlInputSpot = document.getElementById('urlInputSpot');
const btnClearSpot = document.getElementById('btnClearSpot');
const btnPasteSpot = document.getElementById('btnPasteSpot');
const btnAnalyzeSpot = document.getElementById('btnAnalyzeSpot');
const btnSampleSpot = document.getElementById('btnSampleSpot');
const skeletonSpot = document.getElementById('skeletonSpot');
const spotifyCard = document.getElementById('spotifyCard');
const spotCover = document.getElementById('spotCover');
const spotTitle = document.getElementById('spotTitle');
const spotArtistName = document.getElementById('spotArtistName');
const spotTrackCountBadge = document.getElementById('spotTrackCountBadge');
const spotYearBadge = document.getElementById('spotYearBadge');
const spotTypeBadge = document.getElementById('spotTypeBadge');
const spotFormatChipsGrid = document.getElementById('spotFormatChipsGrid');
const btnDownloadSpot = document.getElementById('btnDownloadSpot');
const btnDownloadSpotText = document.getElementById('btnDownloadSpotText');
const btnPlaySinglePreview = document.getElementById('btnPlaySinglePreview');
const spotTracksTableContainer = document.getElementById('spotTracksTableContainer');
const spotTracksList = document.getElementById('spotTracksList');
const spotSelectAll = document.getElementById('spotSelectAll');
const spotSelectedCount = document.getElementById('spotSelectedCount');
const spotTrackSearchInput = document.getElementById('spotTrackSearchInput');

// Concurrency Selector
const concurrencyButtons = document.querySelectorAll('.concurrency-btn');

// Progress & History
const activeDownloadsSection = document.getElementById('activeDownloadsSection');
const activeJobsList = document.getElementById('activeJobsList');
const historyList = document.getElementById('historyList');
const emptyHistory = document.getElementById('emptyHistory');
const historySearchInput = document.getElementById('historySearchInput');

// In-App Media Player Modal
const mediaPlayerModal = document.getElementById('mediaPlayerModal');
const playerModalTitle = document.getElementById('playerModalTitle');
const playerModalSubtitle = document.getElementById('playerModalSubtitle');
const playerVideoContainer = document.getElementById('playerVideoContainer');
const inAppVideo = document.getElementById('inAppVideo');
const playerAudioContainer = document.getElementById('playerAudioContainer');
const inAppAudio = document.getElementById('inAppAudio');
const playerAudioCover = document.getElementById('playerAudioCover');
const playerAudioTitle = document.getElementById('playerAudioTitle');
const playerAudioArtist = document.getElementById('playerAudioArtist');
const btnClosePlayerModal = document.getElementById('btnClosePlayerModal');
const btnPlayerCloseBottom = document.getElementById('btnPlayerCloseBottom');
const btnPlayerOpenExternal = document.getElementById('btnPlayerOpenExternal');
let currentModalFilePath = '';

// Suggestion & Admin Modals
const btnOpenSuggestModal = document.getElementById('btnOpenSuggestModal');
const suggestionModal = document.getElementById('suggestionModal');
const btnCloseSuggestModal = document.getElementById('btnCloseSuggestModal');
const btnCancelSuggest = document.getElementById('btnCancelSuggest');
const suggestionForm = document.getElementById('suggestionForm');
const suggestNameInput = document.getElementById('suggestNameInput');
const suggestContactInput = document.getElementById('suggestContactInput');
const suggestMessageInput = document.getElementById('suggestMessageInput');
const suggestSuccessAlert = document.getElementById('suggestSuccessAlert');
const btnSubmitSuggest = document.getElementById('btnSubmitSuggest');

// Admin Suggestions Modal (Lunysse Private)
const badgeLunysse = document.getElementById('badgeLunysse');
const adminSuggestionsModal = document.getElementById('adminSuggestionsModal');
const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
const adminSuggestionsList = document.getElementById('adminSuggestionsList');
const adminSuggestionsCount = document.getElementById('adminSuggestionsCount');
const btnRefreshSuggestions = document.getElementById('btnRefreshSuggestions');
const toastContainer = document.getElementById('toastContainer');

// Global Engine Handles
let spaceStarsEngine = null;
let customPlayerController = null;

// ==========================================================================
// Toast Notification System
// ==========================================================================
function showToast(message, type = 'info', customIcon = null) {
  const toast = document.createElement('div');
  toast.className = 'toast text-xs font-semibold text-white shadow-2xl';

  let iconHtml = '<i class="fa-solid fa-info-circle text-indigo-400 text-sm"></i>';
  let borderClass = 'border-indigo-500/30';

  if (type === 'success') {
    iconHtml = '<i class="fa-solid fa-circle-check text-emerald-400 text-sm"></i>';
    borderClass = 'border-emerald-500/40 bg-emerald-950/40';
  } else if (type === 'error') {
    iconHtml = '<i class="fa-solid fa-triangle-exclamation text-rose-400 text-sm"></i>';
    borderClass = 'border-rose-500/40 bg-rose-950/40';
  } else if (type === 'yt') {
    iconHtml = '<i class="fa-brands fa-youtube text-rose-500 text-sm"></i>';
    borderClass = 'border-rose-500/40';
  } else if (type === 'spotify') {
    iconHtml = '<i class="fa-brands fa-spotify text-emerald-400 text-sm"></i>';
    borderClass = 'border-emerald-500/40';
  }

  if (customIcon) iconHtml = customIcon;
  toast.classList.add(...borderClass.split(' '));

  toast.innerHTML = `
    <div class="flex-shrink-0">${iconHtml}</div>
    <div class="flex-1 truncate">${message}</div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 320);
  }, 3500);
}

// ==========================================================================
// Cosmic Space Canvas Engine (Twinkling Starlight)
// ==========================================================================
class SpaceStarsEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.stars = [];
    this.starCount = 135;
    this.themeTint = { r: 255, g: 255, b: 255 };

    this.resize();
    this.initStars();
    window.addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  }

  initStars() {
    this.stars = [];
    for (let i = 0; i < this.starCount; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 1.5 + 0.4,
        baseAlpha: Math.random() * 0.55 + 0.2,
        twinkleSpeed: Math.random() * 0.03 + 0.008,
        twinklePhase: Math.random() * Math.PI * 2,
        driftY: (Math.random() - 0.5) * 0.12,
        driftX: (Math.random() - 0.5) * 0.12
      });
    }
  }

  setThemeTint(r, g, b) {
    this.themeTint = { r, g, b };
  }

  loop() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    const { r, g, b } = this.themeTint;

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.twinklePhase += s.twinkleSpeed;
      s.y += s.driftY;
      s.x += s.driftX;

      if (s.y < 0) s.y = this.height;
      if (s.y > this.height) s.y = 0;
      if (s.x < 0) s.x = this.width;
      if (s.x > this.width) s.x = 0;

      const alpha = Math.max(0.08, Math.min(1, s.baseAlpha + Math.sin(s.twinklePhase) * 0.35));

      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      this.ctx.fill();
    }

    requestAnimationFrame(this.loop);
  }
}

// ==========================================================================
// Custom Liquid Glass Media Player Controller (No Native White/Gray Bar)
// ==========================================================================
class CustomMediaPlayerController {
  constructor() {
    this.video = document.getElementById('inAppVideo');
    this.audio = document.getElementById('inAppAudio');
    this.btnPlayPause = document.getElementById('btnPlayerPlayPause');
    this.iconPlayPause = document.getElementById('playerPlayPauseIcon');
    this.track = document.getElementById('playerScrubberTrack');
    this.fill = document.getElementById('playerScrubberFill');
    this.currentTimeLabel = document.getElementById('playerCurrentTime');
    this.durationTimeLabel = document.getElementById('playerDurationTime');
    this.btnRewind10 = document.getElementById('btnPlayerRewind10');
    this.btnForward10 = document.getElementById('btnPlayerForward10');
    this.sliderVolume = document.getElementById('playerVolumeSlider');
    this.btnMute = document.getElementById('btnPlayerMute');
    this.iconVolume = document.getElementById('playerVolumeIcon');
    this.btnPiP = document.getElementById('btnPlayerPiP');
    this.btnFullscreen = document.getElementById('btnPlayerFullscreen');
    this.videoContainer = document.getElementById('playerVideoContainer');

    this.activeType = 'video'; // 'video' | 'audio'
    this.isDragging = false;
    this.lastVolume = 1;

    this.bindEvents();
  }

  getActiveMedia() {
    return this.activeType === 'video' ? this.video : this.audio;
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const mm = m < 10 ? `0${m}` : `${m}`;
    const ss = s < 10 ? `0${s}` : `${s}`;
    return `${mm}:${ss}`;
  }

  bindEvents() {
    // Play/Pause button
    if (this.btnPlayPause) {
      this.btnPlayPause.addEventListener('click', () => this.togglePlayPause());
    }

    // Skip -10s / +10s
    if (this.btnRewind10) {
      this.btnRewind10.addEventListener('click', () => {
        const m = this.getActiveMedia();
        if (m) m.currentTime = Math.max(0, (m.currentTime || 0) - 10);
      });
    }

    if (this.btnForward10) {
      this.btnForward10.addEventListener('click', () => {
        const m = this.getActiveMedia();
        if (m) m.currentTime = Math.min(m.duration || 0, (m.currentTime || 0) + 10);
      });
    }

    // Scrubber click & drag
    if (this.track) {
      this.track.addEventListener('click', (e) => this.seekByEvent(e));

      this.track.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.seekByEvent(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (this.isDragging) this.seekByEvent(e);
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
      });
    }

    // Volume
    if (this.sliderVolume) {
      this.sliderVolume.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.setVolume(val);
      });
    }

    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => this.toggleMute());
    }

    // Fullscreen & PiP
    if (this.btnFullscreen && this.videoContainer) {
      this.btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          this.videoContainer.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    if (this.btnPiP && this.video) {
      this.btnPiP.addEventListener('click', () => {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        } else if (document.pictureInPictureEnabled && this.video) {
          this.video.requestPictureInPicture().catch(() => {});
        }
      });
    }

    // Media element listener bindings
    [this.video, this.audio].forEach(el => {
      if (!el) return;
      el.addEventListener('timeupdate', () => this.onTimeUpdate(el));
      el.addEventListener('loadedmetadata', () => this.onLoadedMetadata(el));
      el.addEventListener('play', () => this.onPlayStateChange(true));
      el.addEventListener('pause', () => this.onPlayStateChange(false));
      el.addEventListener('ended', () => this.onEnded());
    });
  }

  seekByEvent(e) {
    const media = this.getActiveMedia();
    if (!media || !media.duration) return;
    const rect = this.track.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    media.currentTime = pos * media.duration;
    if (this.fill) this.fill.style.width = `${pos * 100}%`;
  }

  setVolume(val) {
    const media = this.getActiveMedia();
    if (media) media.volume = val;
    if (this.video) this.video.volume = val;
    if (this.audio) this.audio.volume = val;

    if (this.iconVolume) {
      if (val === 0) {
        this.iconVolume.className = 'fa-solid fa-volume-xmark text-rose-400';
      } else if (val < 0.5) {
        this.iconVolume.className = 'fa-solid fa-volume-low text-slate-300';
      } else {
        this.iconVolume.className = 'fa-solid fa-volume-high text-slate-300';
      }
    }
  }

  toggleMute() {
    const media = this.getActiveMedia();
    if (!media) return;
    if (media.volume > 0) {
      this.lastVolume = media.volume;
      this.setVolume(0);
      if (this.sliderVolume) this.sliderVolume.value = 0;
    } else {
      const restore = this.lastVolume > 0 ? this.lastVolume : 0.8;
      this.setVolume(restore);
      if (this.sliderVolume) this.sliderVolume.value = restore;
    }
  }

  togglePlayPause() {
    const media = this.getActiveMedia();
    if (!media) return;
    if (media.paused) {
      media.play().catch(() => {});
    } else {
      media.pause();
    }
  }

  onPlayStateChange(isPlaying) {
    if (this.iconPlayPause) {
      if (isPlaying) {
        this.iconPlayPause.className = 'fa-solid fa-pause';
      } else {
        this.iconPlayPause.className = 'fa-solid fa-play ml-0.5';
      }
    }
  }

  onTimeUpdate(el) {
    if (el !== this.getActiveMedia() || this.isDragging) return;
    const current = el.currentTime || 0;
    const duration = el.duration || 0;
    if (this.currentTimeLabel) {
      this.currentTimeLabel.textContent = this.formatTime(current);
    }

    if (duration > 0 && this.fill) {
      const pct = (current / duration) * 100;
      this.fill.style.width = `${pct}%`;
    } else if (this.fill) {
      this.fill.style.width = '0%';
    }
  }

  onLoadedMetadata(el) {
    if (el !== this.getActiveMedia()) return;
    if (this.durationTimeLabel) {
      this.durationTimeLabel.textContent = this.formatTime(el.duration || 0);
    }
  }

  onEnded() {
    if (this.iconPlayPause) {
      this.iconPlayPause.className = 'fa-solid fa-play ml-0.5';
    }
    if (this.fill) {
      this.fill.style.width = '0%';
    }
  }

  prepareMedia(type) {
    this.activeType = type;
    if (this.fill) this.fill.style.width = '0%';
    if (this.currentTimeLabel) this.currentTimeLabel.textContent = '00:00';
    if (this.durationTimeLabel) this.durationTimeLabel.textContent = '00:00';
    if (this.iconPlayPause) this.iconPlayPause.className = 'fa-solid fa-play ml-0.5';

    if (type === 'video') {
      if (this.btnPiP) this.btnPiP.classList.remove('hidden');
      if (this.btnFullscreen) this.btnFullscreen.classList.remove('hidden');
    } else {
      if (this.btnPiP) this.btnPiP.classList.add('hidden');
      if (this.btnFullscreen) this.btnFullscreen.classList.add('hidden');
    }
  }
}

// ==========================================================================
// Ambient Lighting & Space Stars Sync
// ==========================================================================
function updateAmbientForTab(tab) {
  if (tab === 'youtube') {
    if (ambientYt) ambientYt.style.opacity = '0.8';
    if (ambientSpot) ambientSpot.style.opacity = '0.15';
    if (ambientGray) ambientGray.style.opacity = '0';
    if (spaceStarsEngine) spaceStarsEngine.setThemeTint(255, 180, 190); // Warm reddish starlight
  } else if (tab === 'spotify') {
    if (ambientYt) ambientYt.style.opacity = '0.15';
    if (ambientSpot) ambientSpot.style.opacity = '0.8';
    if (ambientGray) ambientGray.style.opacity = '0';
    if (spaceStarsEngine) spaceStarsEngine.setThemeTint(180, 255, 200); // Emerald celestial starlight
  } else if (tab === 'history') {
    if (ambientYt) ambientYt.style.opacity = '0.3';
    if (ambientSpot) ambientSpot.style.opacity = '0.3';
    if (ambientGray) ambientGray.style.opacity = '0';
    if (spaceStarsEngine) spaceStarsEngine.setThemeTint(190, 200, 255); // Indigo twilight starlight
  } else if (tab === 'coming_soon') {
    if (ambientYt) ambientYt.style.opacity = '0.1';
    if (ambientSpot) ambientSpot.style.opacity = '0.1';
    if (ambientGray) ambientGray.style.opacity = '0.7';
    if (spaceStarsEngine) spaceStarsEngine.setThemeTint(220, 225, 235); // Silver frosted starlight
  }
}

// ==========================================================================
// WebSocket Connection
// ==========================================================================
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[WS] Conectado al servidor WebSocket');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'init') {
        historyItems = msg.history || [];
        appConfig = msg.config || {};
        renderHistory();
        updateHistoryBadge();
        updateConcurrencyUI(appConfig.maxConcurrent || 2);
      } else if (msg.type === 'job_created') {
        activeJobs.set(msg.job.id, msg.job);
        renderActiveJobs();
      } else if (msg.type === 'job_progress') {
        activeJobs.set(msg.job.id, msg.job);
        renderActiveJobs();
      } else if (msg.type === 'history_updated') {
        historyItems = msg.history || [];
        renderHistory();
        updateHistoryBadge();
        showToast('Historial actualizado con nueva descarga', 'success');
      } else if (msg.type === 'config_updated') {
        if (msg.maxConcurrent) {
          appConfig.maxConcurrent = msg.maxConcurrent;
          updateConcurrencyUI(msg.maxConcurrent);
        }
      }
    } catch (e) {
      console.error('[WS ERROR]', e);
    }
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 3000);
  };
}

function updateHistoryBadge() {
  const count = historyItems.length;
  if (count > 0) {
    historyBadgeCount.textContent = count;
    historyBadgeCount.classList.remove('hidden');
  } else {
    historyBadgeCount.classList.add('hidden');
  }
}

// ==========================================================================
// Concurrency Controller
// ==========================================================================
function updateConcurrencyUI(limit) {
  concurrencyButtons.forEach(btn => {
    const l = parseInt(btn.getAttribute('data-limit'), 10);
    if (l === limit) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

concurrencyButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const limit = parseInt(btn.getAttribute('data-limit'), 10);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxConcurrent: limit })
      });
      const data = await res.json();
      if (res.ok) {
        updateConcurrencyUI(limit);
        showToast(`Límite simultáneo fijado en ${limit} descarga(s)`, 'info');
      }
    } catch (e) {
      showToast('No se pudo actualizar el límite', 'error');
    }
  });
});

// ==========================================================================
// Sliding Tab Navigation (Liquid Glass Capsule)
// ==========================================================================
function updateTabIndicator(activeBtn) {
  if (!activeBtn) return;
  tabIndicator.style.left = `${activeBtn.offsetLeft}px`;
  tabIndicator.style.width = `${activeBtn.offsetWidth}px`;
}

function switchTab(tab, buttonEl) {
  currentTab = tab;
  [tabYoutube, tabSpotify, tabHistory, tabComingSoon].forEach(btn => {
    btn.classList.remove('active');
    btn.classList.add('text-slate-400');
    btn.classList.remove('text-white');
  });

  const targetBtn = buttonEl || (
    tab === 'youtube' ? tabYoutube :
    tab === 'spotify' ? tabSpotify :
    tab === 'history' ? tabHistory : tabComingSoon
  );

  targetBtn.classList.add('active', 'text-white');
  targetBtn.classList.remove('text-slate-400');
  updateTabIndicator(targetBtn);

  // Stop any playing preview
  stopPreviewAudio();

  // Hide all dedicated views
  viewYoutube.classList.add('hidden');
  viewSpotify.classList.add('hidden');
  viewHistory.classList.add('hidden');
  viewComingSoon.classList.add('hidden');

  if (tab === 'youtube') {
    viewYoutube.classList.remove('hidden');
  } else if (tab === 'spotify') {
    viewSpotify.classList.remove('hidden');
  } else if (tab === 'history') {
    viewHistory.classList.remove('hidden');
    renderHistory();
  } else if (tab === 'coming_soon') {
    viewComingSoon.classList.remove('hidden');
  }

  // Update dynamic ambient lighting & cosmic starlight tint
  updateAmbientForTab(tab);
}

tabYoutube.addEventListener('click', () => switchTab('youtube', tabYoutube));
tabSpotify.addEventListener('click', () => switchTab('spotify', tabSpotify));
tabHistory.addEventListener('click', () => switchTab('history', tabHistory));
tabComingSoon.addEventListener('click', () => switchTab('coming_soon', tabComingSoon));

window.addEventListener('resize', () => {
  const activeBtn = document.querySelector('.tab-btn.active');
  updateTabIndicator(activeBtn);
});

// ==========================================================================
// In-App Media Player Modal
// ==========================================================================
function closeInAppMediaPlayer() {
  if (inAppVideo) {
    inAppVideo.pause();
    inAppVideo.src = '';
  }
  if (inAppAudio) {
    inAppAudio.pause();
    inAppAudio.src = '';
  }
  if (customPlayerController) {
    customPlayerController.onPlayStateChange(false);
  }
  mediaPlayerModal.classList.add('hidden');
  mediaPlayerModal.classList.remove('flex');
  currentModalFilePath = '';
}

[btnClosePlayerModal, btnPlayerCloseBottom].forEach(btn => {
  if (btn) btn.addEventListener('click', closeInAppMediaPlayer);
});

if (btnPlayerOpenExternal) {
  btnPlayerOpenExternal.addEventListener('click', async () => {
    if (!currentModalFilePath) return;
    try {
      await fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentModalFilePath })
      });
      showToast('Abierto en reproductor de Windows', 'info');
    } catch (e) {
      showToast('No se pudo abrir el archivo', 'error');
    }
  });
}

window.playFile = (encodedPath, encodedTitle = '', encodedArtist = '', encodedCover = '') => {
  const filePath = decodeURIComponent(encodedPath);
  const title = encodedTitle ? decodeURIComponent(encodedTitle) : (filePath.split(/[\\\/]/).pop() || 'Archivo multimedia');
  const artist = encodedArtist ? decodeURIComponent(encodedArtist) : '';
  const cover = encodedCover ? decodeURIComponent(encodedCover) : '';

  currentModalFilePath = filePath;
  playerModalTitle.textContent = title;
  playerModalSubtitle.textContent = artist || filePath;

  const ext = filePath.split('.').pop().toLowerCase();
  const streamUrl = `/api/stream?path=${encodeURIComponent(filePath)}`;

  if (ext === 'mp4' || ext === 'mkv' || ext === 'webm') {
    if (customPlayerController) customPlayerController.prepareMedia('video');
    playerVideoContainer.classList.remove('hidden');
    playerAudioContainer.classList.add('hidden');
    if (inAppAudio) inAppAudio.pause();
    inAppVideo.src = streamUrl;
    inAppVideo.load();
    inAppVideo.play().catch(() => {});
  } else {
    if (customPlayerController) customPlayerController.prepareMedia('audio');
    playerAudioContainer.classList.remove('hidden');
    playerVideoContainer.classList.add('hidden');
    if (inAppVideo) inAppVideo.pause();
    playerAudioTitle.textContent = title;
    playerAudioArtist.textContent = artist || 'Audio descargado';
    if (cover) {
      playerAudioCover.src = cover;
      playerAudioCover.parentElement.classList.remove('hidden');
    } else {
      playerAudioCover.parentElement.classList.add('hidden');
    }
    inAppAudio.src = streamUrl;
    inAppAudio.load();
    inAppAudio.play().catch(() => {});
  }

  mediaPlayerModal.classList.remove('hidden');
  mediaPlayerModal.classList.add('flex');
};

window.cancelJob = async (jobId) => {
  try {
    const res = await fetch('/api/download/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Descarga cancelada con éxito', 'info');
    } else {
      showToast(data.error || 'No se pudo cancelar', 'error');
    }
  } catch (err) {
    showToast('Error al cancelar la descarga', 'error');
  }
};

// ==========================================================================
// 1. YouTube Actions & Inspect
// ==========================================================================
urlInputYt.addEventListener('input', () => {
  if (urlInputYt.value.trim().length > 0) {
    btnClearYt.classList.remove('hidden');
  } else {
    btnClearYt.classList.add('hidden');
  }
});

btnClearYt.addEventListener('click', () => {
  urlInputYt.value = '';
  btnClearYt.classList.add('hidden');
  urlInputYt.focus();
});

btnPasteYt.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInputYt.value = text.trim();
      btnClearYt.classList.remove('hidden');
      analyzeYouTubeUrl();
    }
  } catch (e) {
    showToast('Presiona Ctrl+V para pegar', 'info');
  }
});

urlInputYt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') analyzeYouTubeUrl();
});

btnAnalyzeYt.addEventListener('click', analyzeYouTubeUrl);

btnSampleYt.addEventListener('click', () => {
  urlInputYt.value = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  btnClearYt.classList.remove('hidden');
  analyzeYouTubeUrl();
});

async function analyzeYouTubeUrl() {
  const url = urlInputYt.value.trim();
  if (!url) {
    showToast('Ingresa un enlace de YouTube', 'error');
    return;
  }

  skeletonYt.classList.remove('hidden');
  youtubeCard.classList.add('hidden');
  btnAnalyzeYt.disabled = true;
  btnAnalyzeYt.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Analizando...</span>';

  try {
    const res = await fetch('/api/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fallo al inspeccionar video');

    inspectedData = data;
    displayYouTubeData(data);
    showToast(`Video detectado: ${data.title}`, 'yt');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    skeletonYt.classList.add('hidden');
    btnAnalyzeYt.disabled = false;
    btnAnalyzeYt.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><span>Analizar Video</span>';
  }
}

function displayYouTubeData(data) {
  ytThumbnail.src = data.thumbnail || '';
  ytTitle.textContent = data.title || 'Video de YouTube';
  ytUploader.querySelector('span').textContent = data.uploader || 'Canal de YouTube';
  ytDuration.textContent = data.durationFormatted || '0:00';
  
  if (data.viewCount) {
    const views = Number(data.viewCount).toLocaleString();
    ytViewsCount.textContent = `${views} visualizaciones`;
  } else {
    ytViewsCount.textContent = 'YouTube Video';
  }

  ytQualityChipsGrid.innerHTML = '';
  const qualities = data.qualities || [{ label: 'Mejor disponible', value: 'best' }];

  qualities.forEach((q, idx) => {
    const isBest = q.value === 'best';
    const chip = document.createElement('div');
    const isSelected = idx === 0;

    chip.className = `quality-chip p-3 text-center transition ${isSelected ? 'selected-yt' : ''}`;
    chip.setAttribute('data-quality', q.value);

    let badge = 'MP4';
    if (isBest) badge = '4K / Auto';
    else if (q.value >= 1080) badge = 'FHD 1080p';
    else if (q.value >= 720) badge = 'HD 720p';
    else badge = `${q.value}p SD`;

    chip.innerHTML = `
      <div class="text-xs font-black text-white flex items-center justify-center space-x-1">
        ${isBest ? '<i class="fa-solid fa-star text-amber-400 text-[10px]"></i>' : ''}
        <span>${q.label.split(' ')[0]}</span>
      </div>
      <div class="text-[10px] text-slate-400 font-semibold mt-0.5">${badge}</div>
    `;

    chip.addEventListener('click', () => {
      document.querySelectorAll('#ytQualityChipsGrid .quality-chip').forEach(c => c.classList.remove('selected-yt'));
      chip.classList.add('selected-yt');
      ytSelectedQuality = q.value;
      updateYtDownloadButtonText();
    });

    ytQualityChipsGrid.appendChild(chip);
  });

  ytSelectedQuality = qualities[0].value;
  updateYtDownloadButtonText();

  youtubeCard.classList.remove('hidden');
  youtubeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

btnModeVideo.addEventListener('click', () => {
  ytCurrentMode = 'video';
  btnModeVideo.classList.add('selected-yt');
  btnModeAudio.classList.remove('selected-yt');
  ytVideoChipsSection.classList.remove('hidden');
  ytAudioChipsSection.classList.add('hidden');
  updateYtDownloadButtonText();
});

btnModeAudio.addEventListener('click', () => {
  ytCurrentMode = 'audio';
  btnModeAudio.classList.add('selected-yt');
  btnModeVideo.classList.remove('selected-yt');
  ytVideoChipsSection.classList.add('hidden');
  ytAudioChipsSection.classList.remove('hidden');
  updateYtDownloadButtonText();
});

document.querySelectorAll('#ytAudioChipsGrid .quality-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#ytAudioChipsGrid .quality-chip').forEach(c => c.classList.remove('selected-yt'));
    chip.classList.add('selected-yt');
    ytSelectedAudioFormat = chip.getAttribute('data-format');
    updateYtDownloadButtonText();
  });
});

function updateYtDownloadButtonText() {
  if (ytCurrentMode === 'video') {
    const qLabel = ytSelectedQuality === 'best' ? 'Mejor Calidad' : `${ytSelectedQuality}p`;
    btnDownloadYtText.textContent = `Descargar Video (${qLabel} MP4)`;
  } else {
    btnDownloadYtText.textContent = `Descargar Audio (${ytSelectedAudioFormat.toUpperCase()} 320k)`;
  }
}

btnDownloadYt.addEventListener('click', async () => {
  if (!inspectedData || inspectedData.platform !== 'youtube') return;

  btnDownloadYt.disabled = true;
  btnDownloadYt.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Iniciando descarga...</span>';

  try {
    const res = await fetch('/api/download/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: inspectedData.url,
        mode: ytCurrentMode,
        quality: ytSelectedQuality,
        audioFormat: ytSelectedAudioFormat,
        title: inspectedData.title,
        thumbnail: inspectedData.thumbnail
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    showToast('Descarga iniciada con éxito', 'success');
    activeDownloadsSection.classList.remove('hidden');
    activeDownloadsSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btnDownloadYt.disabled = false;
    updateYtDownloadButtonText();
  }
});

// ==========================================================================
// 2. Spotify Actions & Inspect
// ==========================================================================
urlInputSpot.addEventListener('input', () => {
  if (urlInputSpot.value.trim().length > 0) {
    btnClearSpot.classList.remove('hidden');
  } else {
    btnClearSpot.classList.add('hidden');
  }
});

btnClearSpot.addEventListener('click', () => {
  urlInputSpot.value = '';
  btnClearSpot.classList.add('hidden');
  urlInputSpot.focus();
});

btnPasteSpot.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInputSpot.value = text.trim();
      btnClearSpot.classList.remove('hidden');
      analyzeSpotifyUrl();
    }
  } catch (e) {
    showToast('Presiona Ctrl+V para pegar', 'info');
  }
});

urlInputSpot.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') analyzeSpotifyUrl();
});

btnAnalyzeSpot.addEventListener('click', analyzeSpotifyUrl);

btnSampleSpot.addEventListener('click', () => {
  urlInputSpot.value = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
  btnClearSpot.classList.remove('hidden');
  analyzeSpotifyUrl();
});

async function analyzeSpotifyUrl() {
  const url = urlInputSpot.value.trim();
  if (!url) {
    showToast('Ingresa un enlace de Spotify', 'error');
    return;
  }

  stopPreviewAudio();
  skeletonSpot.classList.remove('hidden');
  spotifyCard.classList.add('hidden');
  btnAnalyzeSpot.disabled = true;
  btnAnalyzeSpot.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Analizando...</span>';

  try {
    const res = await fetch('/api/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fallo al inspeccionar Spotify');

    inspectedData = data;
    displaySpotifyData(data);
    showToast(`Pista detectada: ${data.title}`, 'spotify');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    skeletonSpot.classList.add('hidden');
    btnAnalyzeSpot.disabled = false;
    btnAnalyzeSpot.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><span>Analizar Música</span>';
  }
}

function displaySpotifyData(data) {
  spotCover.src = data.cover || '';
  spotTitle.textContent = data.title || 'Música de Spotify';
  spotArtistName.textContent = data.artist || 'Artista';
  spotTypeBadge.textContent = data.type || 'Música';
  spotYearBadge.textContent = data.tracks[0]?.year || 'Oficial';

  const count = data.trackCount || 1;
  spotTrackCountBadge.textContent = count === 1 ? '1 canción' : `${count} canciones`;

  document.querySelectorAll('#spotFormatChipsGrid .quality-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#spotFormatChipsGrid .quality-chip').forEach(c => {
        c.classList.remove('selected-spot');
        c.querySelector('.fa-circle-check')?.classList.add('hidden');
      });
      chip.classList.add('selected-spot');
      chip.querySelector('.fa-circle-check')?.classList.remove('hidden');
      spotSelectedFormat = chip.getAttribute('data-format');
      updateSpotDownloadButtonText();
    });
  });

  if (count > 1) {
    btnDownloadSpotText.textContent = `Descargar Selección (${count} canciones)`;
    spotTracksTableContainer.classList.remove('hidden');
    renderSpotifyTracks(data.tracks);
  } else {
    btnDownloadSpotText.textContent = 'Descargar Canción (320 kbps HD)';
    spotTracksTableContainer.classList.add('hidden');

    if (data.tracks[0]?.previewUrl) {
      btnPlaySinglePreview.classList.remove('hidden');
      btnPlaySinglePreview.onclick = () => toggleAudioPreview(data.tracks[0].previewUrl, btnPlaySinglePreview);
    } else {
      btnPlaySinglePreview.classList.add('hidden');
    }
  }

  spotifyCard.classList.remove('hidden');
  spotifyCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateSpotDownloadButtonText() {
  const count = inspectedData?.trackCount || 1;
  const fmt = spotSelectedFormat.toUpperCase();
  if (count > 1) {
    const checked = document.querySelectorAll('.spot-track-checkbox:checked').length;
    btnDownloadSpotText.textContent = `Descargar ${checked} Canciones (${fmt} 320k)`;
  } else {
    btnDownloadSpotText.textContent = `Descargar Canción (${fmt} 320 kbps)`;
  }
}

function renderSpotifyTracks(tracks) {
  spotTracksList.innerHTML = '';
  tracks.forEach((track, index) => {
    const row = document.createElement('div');
    row.className = 'spot-track-row flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-white/10 text-xs transition-all duration-200 group';
    row.setAttribute('data-name', `${track.name} ${track.artist}`.toLowerCase());

    const hasPreview = Boolean(track.previewUrl);

    row.innerHTML = `
      <div class="flex items-center space-x-3 overflow-hidden flex-1">
        <input type="checkbox" data-index="${index}" checked class="spot-track-checkbox w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900">
        <span class="text-slate-500 font-mono w-5 text-right font-medium">${index + 1}</span>
        
        ${hasPreview ? `
          <button type="button" class="btn-track-preview w-7 h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 flex items-center justify-center transition active:scale-90" title="Escuchar muestra (30s)">
            <i class="fa-solid fa-play text-[10px] ml-0.5"></i>
          </button>
        ` : `
          <span class="w-7"></span>
        `}

        <div class="truncate flex-1">
          <div class="font-bold text-white truncate group-hover:text-emerald-300 transition-colors">${track.name}</div>
          <div class="text-[11px] text-slate-400 truncate">${track.artist}</div>
        </div>
      </div>

      <div class="text-slate-400 font-mono text-xs pl-3 flex-shrink-0 flex items-center space-x-2">
        <span class="track-playing-wave hidden">
          <div class="sound-wave">
            <div class="sound-bar"></div>
            <div class="sound-bar"></div>
            <div class="sound-bar"></div>
            <div class="sound-bar"></div>
          </div>
        </span>
        <span>${track.durationFormatted || ''}</span>
      </div>
    `;

    if (hasPreview) {
      const pBtn = row.querySelector('.btn-track-preview');
      pBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAudioPreview(track.previewUrl, pBtn, row.querySelector('.track-playing-wave'));
      });
    }

    spotTracksList.appendChild(row);
  });

  updateSelectedCount();

  document.querySelectorAll('.spot-track-checkbox').forEach(cb => {
    cb.addEventListener('change', updateSelectedCount);
  });
}

spotTrackSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  document.querySelectorAll('.spot-track-row').forEach(row => {
    const text = row.getAttribute('data-name');
    if (text.includes(query)) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  });
});

spotSelectAll.addEventListener('change', (e) => {
  const isChecked = e.target.checked;
  document.querySelectorAll('.spot-track-checkbox').forEach(cb => {
    cb.checked = isChecked;
  });
  updateSelectedCount();
});

function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('.spot-track-checkbox');
  const checked = document.querySelectorAll('.spot-track-checkbox:checked');
  spotSelectedCount.textContent = `${checked.length} de ${checkboxes.length} seleccionadas`;
  updateSpotDownloadButtonText();
}

function toggleAudioPreview(url, buttonEl, waveEl = null) {
  if (currentPlayingPreview === url && !previewAudioPlayer.paused) {
    stopPreviewAudio();
    return;
  }

  stopPreviewAudio();

  currentPlayingPreview = url;
  previewAudioPlayer.src = url;
  previewAudioPlayer.play();

  buttonEl.innerHTML = '<i class="fa-solid fa-pause text-[10px]"></i>';
  buttonEl.classList.add('bg-emerald-500', 'text-slate-950');
  buttonEl.classList.remove('bg-emerald-500/10', 'text-emerald-400');
  if (waveEl) waveEl.classList.remove('hidden');

  previewAudioPlayer.onended = () => {
    stopPreviewAudio();
  };
}

function stopPreviewAudio() {
  previewAudioPlayer.pause();
  previewAudioPlayer.src = '';
  currentPlayingPreview = null;

  document.querySelectorAll('.btn-track-preview, #btnPlaySinglePreview').forEach(btn => {
    btn.innerHTML = '<i class="fa-solid fa-play text-[10px] ml-0.5"></i>';
    btn.classList.remove('bg-emerald-500', 'text-slate-950');
    btn.classList.add('bg-emerald-500/10', 'text-emerald-400');
  });

  document.querySelectorAll('.track-playing-wave').forEach(w => w.classList.add('hidden'));
}

btnDownloadSpot.addEventListener('click', async () => {
  if (!inspectedData || inspectedData.platform !== 'spotify') return;

  btnDownloadSpot.disabled = true;
  btnDownloadSpot.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Iniciando descarga...</span>';

  try {
    let payload = {};
    if (inspectedData.trackCount > 1) {
      const checkedBoxes = Array.from(document.querySelectorAll('.spot-track-checkbox:checked'));
      const selectedIndices = checkedBoxes.map(cb => parseInt(cb.getAttribute('data-index'), 10));
      const selectedTracks = selectedIndices.map(idx => inspectedData.tracks[idx]);

      if (selectedTracks.length === 0) {
        showToast('Selecciona al menos una canción de la lista', 'error');
        return;
      }

      payload = {
        tracks: selectedTracks,
        audioFormat: spotSelectedFormat
      };
    } else {
      payload = {
        track: inspectedData.tracks[0],
        audioFormat: spotSelectedFormat
      };
    }

    const res = await fetch('/api/download/spotify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    showToast('Descarga iniciada con la mejor calidad', 'success');
    activeDownloadsSection.classList.remove('hidden');
    activeDownloadsSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    btnDownloadSpot.disabled = false;
    updateSpotDownloadButtonText();
  }
});

// ==========================================================================
// 3. Render Active Jobs & History
// ==========================================================================
function renderActiveJobs() {
  if (activeJobs.size === 0) {
    activeDownloadsSection.classList.add('hidden');
    return;
  }

  activeDownloadsSection.classList.remove('hidden');
  activeJobsList.innerHTML = '';

  activeJobs.forEach((job) => {
    const isCompleted = job.status === 'completed';
    const isError = job.status === 'error';
    const isCancelled = job.status === 'cancelled';
    const isSpotify = job.platform === 'spotify';

    const card = document.createElement('div');
    card.className = `liquid-glass p-4 sm:p-5 rounded-3xl border transition-all duration-300 ${isCompleted ? 'border-emerald-500/50 shadow-emerald-500/10' : isError ? 'border-rose-500/50 shadow-rose-500/10' : isCancelled ? 'border-slate-800 opacity-60' : 'border-white/10'} shadow-2xl space-y-3.5`;

    let statusBadge = '';
    if (isCompleted) {
      statusBadge = '<span class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1.5"><i class="fa-solid fa-check"></i><span>Completado</span></span>';
    } else if (isError) {
      statusBadge = '<span class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center space-x-1.5"><i class="fa-solid fa-circle-exclamation"></i><span>Error</span></span>';
    } else if (isCancelled) {
      statusBadge = '<span class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700 flex items-center space-x-1.5"><i class="fa-solid fa-ban"></i><span>Cancelado</span></span>';
    } else {
      statusBadge = `<span class="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1.5"><i class="fa-solid fa-circle-notch fa-spin"></i><span>${job.status || 'Descargando'}</span></span>`;
    }

    const platformIcon = isSpotify 
      ? '<i class="fa-brands fa-spotify text-emerald-400 text-sm"></i>' 
      : '<i class="fa-brands fa-youtube text-rose-500 text-sm"></i>';

    const canCancel = !isCompleted && !isError && !isCancelled;

    card.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center space-x-3 overflow-hidden">
          <div class="w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center flex-shrink-0 border border-white/10 shadow-inner">
            ${platformIcon}
          </div>
          <div class="truncate">
            <span class="font-extrabold text-white text-xs sm:text-sm truncate block">${job.title}</span>
            <span class="text-[10px] text-slate-400 uppercase font-mono tracking-wider">${job.format} (${job.quality || 'HD'})</span>
          </div>
        </div>
        <div class="flex items-center space-x-2 flex-shrink-0">
          ${statusBadge}
          ${canCancel ? `
            <button onclick="cancelJob('${job.id}')" title="Cancelar descarga" class="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] font-bold transition flex items-center space-x-1 active:scale-95">
              <i class="fa-solid fa-xmark"></i>
              <span>Cancelar</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Live Glowing Progress Bar -->
      <div class="space-y-1.5">
        <div class="w-full bg-slate-950 rounded-full h-3 overflow-hidden p-0.5 border border-white/10">
          <div class="h-full rounded-full transition-all duration-300 ${isCompleted ? 'bg-emerald-500' : isError ? 'bg-rose-500' : isCancelled ? 'bg-slate-700' : isSpotify ? 'bg-emerald-500 progress-bar-glow' : 'bg-gradient-to-r from-rose-500 via-indigo-500 to-emerald-400 progress-bar-glow'}" style="width: ${job.percent}%"></div>
        </div>
        <div class="flex justify-between text-[11px] text-slate-400 font-mono">
          <span class="truncate">${job.message || 'Procesando...'}</span>
          <span class="font-bold text-slate-300 flex-shrink-0 pl-2">${job.percent}% ${job.speed ? '• ' + job.speed : ''} ${job.eta ? '• ETA: ' + job.eta : ''}</span>
        </div>
      </div>

      ${isCompleted && job.filePath ? `
        <div class="pt-1 flex items-center space-x-2 animate-fade-in flex-wrap gap-y-2">
          <button onclick="playFile('${encodeURIComponent(job.filePath)}', '${encodeURIComponent(job.title || '')}', '', '${encodeURIComponent(job.cover || '')}')" class="px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center space-x-1.5 active:scale-95">
            <i class="fa-solid fa-play text-[11px]"></i>
            <span>Reproducir</span>
          </button>
          <a href="/api/download-file?path=${encodeURIComponent(job.filePath)}" download class="px-3.5 py-1.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 text-xs font-bold transition flex items-center space-x-1.5 active:scale-95">
            <i class="fa-solid fa-download text-[11px]"></i>
            <span>Guardar en dispositivo</span>
          </a>
        </div>
      ` : ''}
    `;

    activeJobsList.appendChild(card);
  });
}

function renderHistory() {
  const query = historySearchInput ? historySearchInput.value.toLowerCase().trim() : '';

  const filtered = historyItems.filter(item => {
    if (!query) return true;
    const hay = `${item.title} ${item.artist} ${item.format}`.toLowerCase();
    return hay.includes(query);
  });

  if (filtered.length === 0) {
    emptyHistory.classList.remove('hidden');
    emptyHistory.querySelector('p').textContent = query ? 'No se encontraron resultados.' : 'Tu historial está vacío.';
    return;
  }

  emptyHistory.classList.add('hidden');
  historyList.innerHTML = '';

  filtered.forEach(item => {
    const isSpotify = item.type === 'spotify';
    const isVideo = item.type === 'youtube_video';

    const card = document.createElement('div');
    card.className = 'liquid-card flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 space-x-3 group';

    const icon = isSpotify 
      ? '<i class="fa-brands fa-spotify text-emerald-400 text-lg"></i>' 
      : isVideo 
        ? '<i class="fa-brands fa-youtube text-rose-500 text-lg"></i>'
        : '<i class="fa-solid fa-music text-indigo-400 text-lg"></i>';

    card.innerHTML = `
      <div class="flex items-center space-x-3.5 overflow-hidden flex-1">
        <div class="w-11 h-11 rounded-xl bg-slate-950 flex-shrink-0 flex items-center justify-center border border-white/10 overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
          ${item.cover ? `<img src="${item.cover}" class="w-full h-full object-cover">` : icon}
        </div>
        <div class="truncate flex-1">
          <div class="text-xs sm:text-sm font-bold text-white truncate group-hover:text-indigo-300 transition-colors">${item.title}</div>
          <div class="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
            <span class="truncate">${item.artist || item.fileName}</span>
            <span class="text-slate-600">•</span>
            <span class="text-slate-400 uppercase font-mono font-semibold">${item.format} (${item.quality || 'HD'})</span>
            <span class="text-slate-600">•</span>
            <span class="text-slate-400 font-mono">${item.fileSize}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center space-x-2 flex-shrink-0">
        <a href="/api/download-file?path=${encodeURIComponent(item.filePath)}" download title="Descargar a este dispositivo" class="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-sky-600 text-sky-400 hover:text-white transition flex items-center justify-center text-xs active:scale-95 shadow">
          <i class="fa-solid fa-download"></i>
        </a>
        <button onclick="playFile('${encodeURIComponent(item.filePath)}', '${encodeURIComponent(item.title || '')}', '${encodeURIComponent(item.artist || '')}', '${encodeURIComponent(item.cover || '')}')" title="Reproducir en la app" class="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-emerald-600 text-slate-300 hover:text-white transition flex items-center justify-center text-xs active:scale-95 shadow">
          <i class="fa-solid fa-play ml-0.5"></i>
        </button>
      </div>
    `;

    historyList.appendChild(card);
  });
}

if (historySearchInput) {
  historySearchInput.addEventListener('input', renderHistory);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// 1. Reloj y Fecha Local del Usuario
// ==========================================================================
function initLocalClock() {
  const timeEl = document.getElementById('localTimeText');
  const dateEl = document.getElementById('localDateText');
  if (!timeEl || !dateEl) return;

  function update() {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateEl.textContent = now.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  update();
  setInterval(update, 1000);
}

// ==========================================================================
// 2. Sistema de Sugerencias de Plataforma (Recuadro Emergente)
// ==========================================================================
function initSuggestionsSystem() {
  if (!btnOpenSuggestModal || !suggestionModal) return;

  btnOpenSuggestModal.addEventListener('click', () => {
    suggestionModal.classList.remove('hidden');
    suggestionModal.classList.add('flex');
    if (suggestMessageInput) suggestMessageInput.focus();
  });

  const closeModal = () => {
    suggestionModal.classList.add('hidden');
    suggestionModal.classList.remove('flex');
    if (suggestSuccessAlert) suggestSuccessAlert.classList.add('hidden');
  };

  if (btnCloseSuggestModal) btnCloseSuggestModal.addEventListener('click', closeModal);
  if (btnCancelSuggest) btnCancelSuggest.addEventListener('click', closeModal);

  suggestionModal.addEventListener('click', (e) => {
    if (e.target === suggestionModal) closeModal();
  });

  if (suggestionForm) {
    suggestionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = suggestMessageInput ? suggestMessageInput.value.trim() : '';
      if (!message) {
        showToast('Por favor escribe tu sugerencia.', 'error');
        return;
      }

      const name = suggestNameInput ? suggestNameInput.value.trim() : '';
      const contact = suggestContactInput ? suggestContactInput.value.trim() : '';

      if (btnSubmitSuggest) {
        btnSubmitSuggest.disabled = true;
        btnSubmitSuggest.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i><span>Enviando...</span>';
      }

      try {
        const res = await fetch('/api/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, contact, message })
        });
        
        let data = {};
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          throw new Error('El servidor aún no tiene la ruta de sugerencias. Asegúrate de haber subido la carpeta server a GitHub.');
        }

        if (!res.ok) throw new Error(data.error || 'Error al enviar');

        if (suggestSuccessAlert) suggestSuccessAlert.classList.remove('hidden');
        showToast('¡Recomendación enviada con éxito!', 'success');

        if (suggestionForm) suggestionForm.reset();

        setTimeout(() => {
          closeModal();
          if (btnSubmitSuggest) {
            btnSubmitSuggest.disabled = false;
            btnSubmitSuggest.innerHTML = '<i class="fa-solid fa-paper-plane text-[10px]"></i><span>Enviar Recomendación</span>';
          }
        }, 2200);

      } catch (err) {
        showToast(`Fallo al enviar: ${err.message}`, 'error');
        if (btnSubmitSuggest) {
          btnSubmitSuggest.disabled = false;
          btnSubmitSuggest.innerHTML = '<i class="fa-solid fa-paper-plane text-[10px]"></i><span>Enviar Recomendación</span>';
        }
      }
    });
  }
}

// ==========================================================================
// 3. Buzón Privado de Sugerencias para Lunysse
// ==========================================================================
let lunysseAdminKey = sessionStorage.getItem('lunysse_admin_key') || '';

async function loadAdminSuggestions() {
  if (!adminSuggestionsList) return;

  if (!lunysseAdminKey) {
    const input = prompt('Ingresa la clave de administrador para ver las recomendaciones (por defecto: lunysse2026):');
    if (!input) return;
    lunysseAdminKey = input.trim();
    sessionStorage.setItem('lunysse_admin_key', lunysseAdminKey);
  }

  adminSuggestionsList.innerHTML = '<div class="text-center py-10 text-slate-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando sugerencias...</div>';

  try {
    const res = await fetch(`/api/suggestions?key=${encodeURIComponent(lunysseAdminKey)}`);
    let data = {};
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      adminSuggestionsList.innerHTML = `<div class="text-center py-10 text-amber-400 text-xs font-semibold"><i class="fa-solid fa-clock-rotate-left mr-1.5"></i>El servidor aún no tiene la ruta de sugerencias. Sube la carpeta server a GitHub.</div>`;
      return;
    }

    if (!res.ok) {
      sessionStorage.removeItem('lunysse_admin_key');
      lunysseAdminKey = '';
      adminSuggestionsList.innerHTML = `<div class="text-center py-10 text-rose-400 text-xs font-semibold"><i class="fa-solid fa-circle-exclamation mr-1.5"></i>${data.error || 'Clave incorrecta'}</div>`;
      return;
    }

    const list = data.suggestions || [];
    if (adminSuggestionsCount) {
      adminSuggestionsCount.textContent = `${list.length} ${list.length === 1 ? 'sugerencia recibida' : 'sugerencias recibidas'}`;
    }

    if (list.length === 0) {
      adminSuggestionsList.innerHTML = `
        <div class="text-center py-12 text-slate-500 text-xs space-y-2">
          <i class="fa-solid fa-inbox text-3xl opacity-30 text-pink-400"></i>
          <p class="font-medium text-slate-400">Aún no hay recomendaciones.</p>
          <p class="text-slate-600 text-[11px]">Cuando los visitantes sugieran plataformas aparecerán aquí de forma privada.</p>
        </div>
      `;
      return;
    }

    adminSuggestionsList.innerHTML = '';
    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'liquid-card p-4 rounded-2xl border border-white/10 space-y-2 text-left';
      const dateStr = new Date(item.timestamp).toLocaleString();

      card.innerHTML = `
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center space-x-2">
            <span class="font-bold text-white">${escapeHtml(item.name || 'Anónimo')}</span>
            ${item.contact ? `<span class="text-pink-300 font-mono text-[10px] bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">${escapeHtml(item.contact)}</span>` : ''}
          </div>
          <span class="text-slate-500 font-mono text-[10px]">${dateStr}</span>
        </div>
        <p class="text-xs text-slate-200 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-white/5 font-sans">${escapeHtml(item.message)}</p>
      `;
      adminSuggestionsList.appendChild(card);
    });

  } catch (err) {
    adminSuggestionsList.innerHTML = `<div class="text-center py-10 text-rose-400 text-xs font-semibold">Error al cargar: ${err.message}</div>`;
  }
}

function openAdminModal() {
  if (!adminSuggestionsModal) return;
  adminSuggestionsModal.classList.remove('hidden');
  adminSuggestionsModal.classList.add('flex');
  loadAdminSuggestions();
}

function initAdminSuggestionsViewer() {
  if (!adminSuggestionsModal) return;

  const closeAdminModal = () => {
    adminSuggestionsModal.classList.add('hidden');
    adminSuggestionsModal.classList.remove('flex');
  };

  if (btnCloseAdminModal) btnCloseAdminModal.addEventListener('click', closeAdminModal);
  adminSuggestionsModal.addEventListener('click', (e) => {
    if (e.target === adminSuggestionsModal) closeAdminModal();
  });
  if (btnRefreshSuggestions) btnRefreshSuggestions.addEventListener('click', loadAdminSuggestions);

  // Truco secreto: 5 clics rápidos en el badge Lunysse abren el buzón privado
  if (badgeLunysse) {
    let clickCount = 0;
    let clickTimer = null;
    badgeLunysse.style.cursor = 'pointer';
    badgeLunysse.title = 'Lunysse Edition';
    badgeLunysse.addEventListener('click', () => {
      clickCount++;
      clearTimeout(clickTimer);
      if (clickCount >= 5) {
        clickCount = 0;
        openAdminModal();
      } else {
        clickTimer = setTimeout(() => { clickCount = 0; }, 1800);
      }
    });
  }

  // También se puede abrir con la URL ?admin=lunysse o #admin
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('admin') === 'lunysse' || window.location.hash === '#admin') {
    setTimeout(openAdminModal, 500);
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  updateTabIndicator(tabYoutube);

  // Clear any legacy theme flags in localStorage
  try {
    localStorage.removeItem('sylveader_kawaii_theme');
    localStorage.removeItem('sylveader_theme');
    document.body.classList.remove('theme-sylveon', 'theme-kawaii');
  } catch (e) {}

  // Initialize Canvas & Custom Player Engines
  spaceStarsEngine = new SpaceStarsEngine('spaceStarsCanvas');
  customPlayerController = new CustomMediaPlayerController();

  // Initialize Local Clock, Suggestions & Admin Viewer
  initLocalClock();
  initSuggestionsSystem();
  initAdminSuggestionsViewer();

  // Set initial ambient & starlight
  updateAmbientForTab('youtube');
});

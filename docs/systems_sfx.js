/*
  systems_sfx.js — centralized audio router (SFX + music)
  - No gameplay impact. Safe no-op until unlocked by user gesture.
*/

(() => {
  const EC = (window.EC = window.EC || {});

  const SFX_MAP = {
    break: 'assets/sfx/break.ogg',
    quirk: 'assets/sfx/quirk.ogg',
    swipe: 'assets/sfx/swipe.ogg',
    success: 'assets/sfx/success.ogg',
  };

  const MUSIC_MAP = {
    lobby: 'assets/sfx/lobby.ogg',
    weekly: 'assets/sfx/weekly.ogg',
    zen: 'assets/sfx/zen.ogg',
    tranquility: 'assets/sfx/tranquility.ogg',
    transcendence: 'assets/sfx/transcendence.ogg',
  };

  const SFX_COOLDOWN_MS = {
    break: 200,
    quirk: 300,
    swipe: 450,
    success: 600,
  };

  const SFX_POOL_N = 3;

  function _nowMs() {
    try { return (performance && performance.now) ? performance.now() : Date.now(); } catch (_) { return Date.now(); }
  }

  function _normPlanKey(raw) {
    return String(raw || '').toUpperCase().replace(/[\s-]+/g, '_');
  }

  function _boardMusicForPlan(planKey) {
    if (planKey === 'WEEKLY' || planKey.indexOf('WEEKLY_') === 0) return 'weekly';
    if (planKey === 'ZEN') return 'zen';
    if (planKey === 'TRANQUILITY') return 'tranquility';
    if (planKey === 'TRANSCENDENCE') return 'transcendence';
    return null;
  }

  const SFX = {
    _ready: false,
    _unlocked: false,
    _pools: {},
    _poolIdx: {},
    _lastMs: {},

    _musicEl: null,
    _musicId: null,
    _lastWinToken: '',
    _silenceUntilLobby: false,

    init() {
      if (SFX._ready) return;
      SFX._ready = true;

      for (const id in SFX_MAP) {
        const src = SFX_MAP[id];
        const arr = [];
        for (let i = 0; i < SFX_POOL_N; i++) {
          try {
            const a = new Audio(src);
            a.preload = 'auto';
            a.volume = 0.72;
            arr.push(a);
          } catch (_) {}
        }
        SFX._pools[id] = arr;
        SFX._poolIdx[id] = 0;
        SFX._lastMs[id] = -1e9;
      }

      try {
        const m = new Audio();
        m.preload = 'auto';
        m.loop = true;
        m.volume = 0.55;
        SFX._musicEl = m;
      } catch (_) {}

      try {
        EC._registerModule && EC._registerModule('systems_sfx', {
          provides: [
            'EC.SFX.playSfx', 'EC.SFX.playMusic', 'EC.SFX.stopMusic',
            'EC.SFX.stopAllAudio', 'EC.SFX.unlock', 'EC.SFX.updateRouting'
          ]
        });
      } catch (_) {}
    },

    unlock() {
      if (!SFX._ready) SFX.init();
      if (SFX._unlocked) return;
      SFX._unlocked = true;

      try {
        for (const id in SFX._pools) {
          const pool = SFX._pools[id];
          const a = pool && pool[0];
          if (!a) continue;
          const v = a.volume;
          a.volume = 0;
          const p = a.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              try { a.pause(); } catch (_) {}
              try { a.currentTime = 0; } catch (_) {}
            }).catch(() => {}).finally(() => {
              try { a.volume = v; } catch (_) {}
            });
          } else {
            try { a.pause(); } catch (_) {}
            try { a.currentTime = 0; } catch (_) {}
            try { a.volume = v; } catch (_) {}
          }
        }
      } catch (_) {}

      try {
        const m = SFX._musicEl;
        if (m) {
          const v = m.volume;
          m.volume = 0;
          const p = m.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              try { m.pause(); } catch (_) {}
              try { m.currentTime = 0; } catch (_) {}
            }).catch(() => {}).finally(() => {
              try { m.volume = v; } catch (_) {}
            });
          } else {
            try { m.pause(); } catch (_) {}
            try { m.currentTime = 0; } catch (_) {}
            try { m.volume = v; } catch (_) {}
          }
        }
      } catch (_) {}
    },

    playSfx(id) {
      if (!SFX._unlocked) return;
      const pool = SFX._pools[id];
      if (!pool || pool.length === 0) return;

      const now = _nowMs();
      const cd = (SFX_COOLDOWN_MS[id] != null) ? SFX_COOLDOWN_MS[id] : 0;
      const last = (typeof SFX._lastMs[id] === 'number') ? SFX._lastMs[id] : -1e9;
      if (cd > 0 && (now - last) < cd) return;
      SFX._lastMs[id] = now;

      let idx = (SFX._poolIdx[id] | 0) % pool.length;
      const a = pool[idx];
      SFX._poolIdx[id] = (idx + 1) % pool.length;
      if (!a) return;

      try { a.currentTime = 0; } catch (_) {}
      try {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    },

    playMusic(id) {
      if (!SFX._unlocked) return;
      const src = MUSIC_MAP[id];
      const m = SFX._musicEl;
      if (!src || !m) return;

      if (SFX._musicId === id) {
        if (m.paused) {
          try {
            const p = m.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          } catch (_) {}
        }
        return;
      }

      try { m.pause(); } catch (_) {}
      try { m.currentTime = 0; } catch (_) {}
      try { m.src = src; } catch (_) {}
      try { m.loop = true; } catch (_) {}
      SFX._musicId = id;

      try {
        const p = m.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    },

    stopMusic() {
      const m = SFX._musicEl;
      if (!m) {
        SFX._musicId = null;
        return;
      }
      try { m.pause(); } catch (_) {}
      try { m.currentTime = 0; } catch (_) {}
      SFX._musicId = null;
    },

    stopAllAudio() {
      SFX.stopMusic();
      for (const id in SFX._pools) {
        const pool = SFX._pools[id];
        if (!pool) continue;
        for (let i = 0; i < pool.length; i++) {
          const a = pool[i];
          if (!a) continue;
          try { a.pause(); } catch (_) {}
          try { a.currentTime = 0; } catch (_) {}
        }
      }
    },

    updateRouting() {
      const SIM = EC.SIM || {};
      const inLobby = !!SIM.inLobby;
      const levelState = String(SIM.levelState || '');
      const planKey = _normPlanKey(SIM._patientPlanKey || SIM._activePlanKey);
      const boardMusic = _boardMusicForPlan(planKey);
      const isWin = !inLobby && (levelState === 'win' || !!SIM.mvpWin);

      const winToken = isWin ? [SIM._patientId || '', planKey || '', levelState].join('|') : '';
      if (isWin && winToken && SFX._lastWinToken !== winToken) {
        SFX._lastWinToken = winToken;
        SFX._silenceUntilLobby = true;
        SFX.stopMusic();
        SFX.playSfx('success');
      }
      if (!isWin) SFX._lastWinToken = '';

      if (inLobby) {
        SFX._silenceUntilLobby = false;
        let lobbyInterstitial = false;
        try {
          if (EC.UI_LOBBY && typeof EC.UI_LOBBY.isAudioInterstitialActive === 'function') {
            lobbyInterstitial = !!EC.UI_LOBBY.isAudioInterstitialActive();
          }
        } catch (_) {}
        if (lobbyInterstitial) SFX.stopMusic();
        else SFX.playMusic('lobby');
        return;
      }

      if (SFX._silenceUntilLobby) {
        SFX.stopMusic();
        return;
      }

      if (levelState === 'playing' && boardMusic) {
        SFX.playMusic(boardMusic);
        return;
      }

      SFX.stopMusic();
    },

    // Back-compat aliases
    play(id) { SFX.playSfx(id); },
    tick() {},
    error() { SFX.playSfx('swipe'); },
  };

  EC.SFX = SFX;
})();

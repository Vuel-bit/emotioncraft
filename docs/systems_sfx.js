/*
  systems_sfx.js — centralized SFX manager (pooling + cooldown + mobile unlock)
  - No gameplay impact. Safe no-op until unlocked via real user gesture.
  - Uses HTMLAudioElement pools (no external libs).
*/

(() => {
  const EC = (window.EC = window.EC || {});

  const _MAP = {
    bong_001: 'assets/sfx/bong_001.ogg',
    drop_001: 'assets/sfx/drop_001.ogg',
    pluck_002: 'assets/sfx/pluck_002.ogg',
    highup: 'assets/sfx/highup.ogg',
  };

  const _COOLDOWN_MS = {
    bong_001: 150,
    drop_001: 80,
    pluck_002: 120,
    highup: 400,
  };

  const _POOL_N = 3;

  function _nowMs() {
    try { return (performance && performance.now) ? performance.now() : Date.now(); } catch (_) { return Date.now(); }
  }

  const SFX = {
    _ready: false,
    _unlocked: false,
    _pools: {},
    _poolIdx: {},
    _lastMs: {},

    init() {
      if (SFX._ready) return;
      SFX._ready = true;

      // Build small pools so rapid triggers do not cut each other off.
      for (const id in _MAP) {
        const src = _MAP[id];
        const arr = [];
        for (let i = 0; i < _POOL_N; i++) {
          try {
            const a = new Audio(src);
            a.preload = 'auto';
            a.volume = 0.70;
            arr.push(a);
          } catch (_) {
            // If Audio construction fails, keep pool empty; play() will no-op.
          }
        }
        SFX._pools[id] = arr;
        SFX._poolIdx[id] = 0;
        SFX._lastMs[id] = -1e9;
      }

      // Registry/hardening only.
      try { EC._registerModule && EC._registerModule('systems_sfx', { provides: ['EC.SFX.init', 'EC.SFX.unlock', 'EC.SFX.play'] }); } catch (_) {}
    },

    unlock() {
      if (!SFX._ready) SFX.init();
      if (SFX._unlocked) return;
      SFX._unlocked = true;

      // Warm-up: a silent play/pause on one element per pool.
      // This must be called from a real user gesture (pointerdown).
      try {
        for (const id in SFX._pools) {
          const pool = SFX._pools[id];
          if (!pool || !pool[0]) continue;
          const a = pool[0];
          const v = a.volume;
          a.volume = 0;
          const p = a.play();
          if (p && typeof p.then === 'function') {
            p.then(() => {
              try { a.pause(); } catch (_) {}
              try { a.currentTime = 0; } catch (_) {}
            }).catch(() => {
              // ignore
            }).finally(() => {
              try { a.volume = v; } catch (_) {}
            });
          } else {
            try { a.pause(); } catch (_) {}
            try { a.currentTime = 0; } catch (_) {}
            try { a.volume = v; } catch (_) {}
          }
        }
      } catch (_) {}
    },

    play(id) {
      if (!SFX._unlocked) return;
      const pool = SFX._pools[id];
      if (!pool || pool.length === 0) return;

      const now = _nowMs();
      const cd = (_COOLDOWN_MS[id] != null) ? _COOLDOWN_MS[id] : 0;
      const last = (typeof SFX._lastMs[id] === 'number') ? SFX._lastMs[id] : -1e9;
      if (cd > 0 && (now - last) < cd) return;
      SFX._lastMs[id] = now;

      // Round-robin selection.
      let idx = (SFX._poolIdx[id] | 0) % pool.length;
      let a = pool[idx];
      SFX._poolIdx[id] = (idx + 1) % pool.length;
      if (!a) return;

      try {
        // Reset so repeats start immediately.
        if (!a.paused) {
          // Don't force-stop: pool prevents most overlaps; reset best-effort.
          try { a.currentTime = 0; } catch (_) {}
        } else {
          try { a.currentTime = 0; } catch (_) {}
        }
      } catch (_) {}

      try {
        const p = a.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {
        // ignore
      }
    },

    // Compatibility no-ops for legacy guarded calls.
    tick() {},
    error() {},
  };

  EC.SFX = SFX;
})();

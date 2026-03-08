// systems_settings.js — persistent user settings (audio/gameplay)
(() => {
  const EC = (window.EC = window.EC || {});
  const MOD = (EC.SETTINGS = EC.SETTINGS || {});

  function _ui() { return (EC.UI_STATE = EC.UI_STATE || {}); }

  function _ensure() {
    const UI = _ui();
    const s = (UI._settings && typeof UI._settings === 'object') ? UI._settings : (UI._settings = {});

    if (typeof s.masterVolume !== 'number') s.masterVolume = 100;
    if (typeof s.musicVolume !== 'number') s.musicVolume = 100;
    if (typeof s.effectsVolume !== 'number') s.effectsVolume = 100;
    if (typeof s.confirmBeforeNewRun !== 'boolean') s.confirmBeforeNewRun = true;

    if (typeof s.tutorialHintsManual !== 'boolean') s.tutorialHintsManual = false;
    if (typeof s.hasPlayedBefore !== 'boolean') s.hasPlayedBefore = false;
    if (typeof s.tutorialHints !== 'boolean') s.tutorialHints = true;

    s.masterVolume = Math.max(0, Math.min(100, Math.round(s.masterVolume || 0)));
    s.musicVolume = Math.max(0, Math.min(100, Math.round(s.musicVolume || 0)));
    s.effectsVolume = Math.max(0, Math.min(100, Math.round(s.effectsVolume || 0)));

    if (!s.tutorialHintsManual) {
      s.tutorialHints = !s.hasPlayedBefore;
    }

    return s;
  }

  function _persist(reason) {
    try {
      if (EC.SAVE && typeof EC.SAVE._writeCurrentPat === 'function') {
        EC.SAVE._writeCurrentPat(reason || 'settings');
      }
    } catch (_) {}
  }

  MOD.init = function init() {
    _ensure();
  };

  MOD.get = function get() { return _ensure(); };

  MOD.applyLoaded = function applyLoaded(raw) {
    const s = _ensure();
    if (!raw || typeof raw !== 'object') return s;

    if (typeof raw.masterVolume === 'number') s.masterVolume = raw.masterVolume;
    if (typeof raw.musicVolume === 'number') s.musicVolume = raw.musicVolume;
    if (typeof raw.effectsVolume === 'number') s.effectsVolume = raw.effectsVolume;
    if (typeof raw.confirmBeforeNewRun === 'boolean') s.confirmBeforeNewRun = raw.confirmBeforeNewRun;

    if (typeof raw.tutorialHintsManual === 'boolean') s.tutorialHintsManual = raw.tutorialHintsManual;
    if (typeof raw.hasPlayedBefore === 'boolean') s.hasPlayedBefore = raw.hasPlayedBefore;
    if (typeof raw.tutorialHints === 'boolean') s.tutorialHints = raw.tutorialHints;

    return _ensure();
  };

  MOD.setVolume = function setVolume(key, val) {
    const s = _ensure();
    if (key !== 'masterVolume' && key !== 'musicVolume' && key !== 'effectsVolume') return;
    s[key] = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
    _persist('settingsVolume');
  };

  MOD.setConfirmBeforeNewRun = function setConfirmBeforeNewRun(on) {
    const s = _ensure();
    s.confirmBeforeNewRun = !!on;
    _persist('settingsConfirmNewRun');
  };

  MOD.setTutorialHints = function setTutorialHints(on) {
    const s = _ensure();
    s.tutorialHints = !!on;
    s.tutorialHintsManual = true;
    _persist('settingsTutorialHints');
  };


  MOD.syncHasPlayedFromPatients = function syncHasPlayedFromPatients() {
    const s = _ensure();
    if (s.hasPlayedBefore) return;
    try {
      if (!EC.PAT || typeof EC.PAT.list !== 'function') return;
      const arr = EC.PAT.list() || [];
      const played = arr.some((p) => p && (p.intakeDone || (Array.isArray(p.treatmentHistory) && p.treatmentHistory.length > 0) || (typeof p.lastOutcome === 'string' && p.lastOutcome !== '—')));
      if (!played) return;
      s.hasPlayedBefore = true;
      if (!s.tutorialHintsManual) s.tutorialHints = false;
      _persist('settingsPlayedFromSave');
    } catch (_) {}
  };

  MOD.markPlayedBefore = function markPlayedBefore() {
    const s = _ensure();
    if (s.hasPlayedBefore) return;
    s.hasPlayedBefore = true;
    _persist('settingsPlayedBefore');
  };

  MOD.getEffectiveMusic = function getEffectiveMusic() {
    const s = _ensure();
    return (s.masterVolume / 100) * (s.musicVolume / 100);
  };

  MOD.getEffectiveSfx = function getEffectiveSfx() {
    const s = _ensure();
    return (s.masterVolume / 100) * (s.effectsVolume / 100);
  };

  MOD.tutorialHintsEnabled = function tutorialHintsEnabled() {
    const s = _ensure();
    return !!s.tutorialHints;
  };

  MOD.confirmBeforeNewRunEnabled = function confirmBeforeNewRunEnabled() {
    const s = _ensure();
    return !!s.confirmBeforeNewRun;
  };

  MOD._exportForSave = function _exportForSave() {
    const s = _ensure();
    return {
      masterVolume: s.masterVolume,
      musicVolume: s.musicVolume,
      effectsVolume: s.effectsVolume,
      tutorialHints: !!s.tutorialHints,
      tutorialHintsManual: !!s.tutorialHintsManual,
      hasPlayedBefore: !!s.hasPlayedBefore,
      confirmBeforeNewRun: !!s.confirmBeforeNewRun,
    };
  };

  MOD.init();
})();

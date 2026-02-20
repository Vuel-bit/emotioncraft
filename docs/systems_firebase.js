/* Emotioncraft — Firebase + Auth + Save scaffolding (no gameplay state yet)
   - No ES modules; uses Firebase compat scripts (window.firebase).
   - Fails gracefully if Firebase scripts are missing/blocked.
   - Exposes: EC.FB (init + handles), EC.AUTH (sign-in/out + user + onChange), EC.SAVE (load/write/debouncedWrite).
*/
(() => {
  const EC = (window.EC = window.EC || {});

  const FB = (EC.FB = EC.FB || {});
  const AUTH = (EC.AUTH = EC.AUTH || {});
  const SAVE = (EC.SAVE = EC.SAVE || {});

  let _warned = false;
  function warnOnce(msg, err) {
    if (_warned) return;
    _warned = true;
    try { console.warn(msg, err || ''); } catch (_) {}
  }

  function hasFirebase() {
    return !!(window.firebase && typeof window.firebase.initializeApp === 'function');
  }

  // ----------------------------
  // Firebase init
  // ----------------------------
  FB.init = FB.init || function init() {
    if (FB._inited) return !!FB.ok;
    FB._inited = true;
    FB.ok = false;

    if (!hasFirebase()) {
      warnOnce('[EC] Firebase unavailable (scripts missing/blocked). Auth disabled.');
      return false;
    }

    const firebase = window.firebase;

    const cfg = {
      apiKey: "AIzaSyD9iZK9dKgPzwIyoZNmzCmWy2hWhJkwaoI",
      authDomain: "emotioncraft-44a14.firebaseapp.com",
      projectId: "emotioncraft-44a14",
      storageBucket: "emotioncraft-44a14.firebasestorage.app",
      messagingSenderId: "462561641066",
      appId: "1:462561641066:web:c2cb77934ef6d276824013",
    };

    try {
      // Avoid duplicate init if hot-reloaded or multiple bundles.
      if (firebase.apps && firebase.apps.length) {
        FB.app = firebase.app();
      } else {
        FB.app = firebase.initializeApp(cfg);
      }
      FB.auth = firebase.auth();
      FB.db = firebase.firestore();

      // Prefer local persistence (default), but don't crash if unavailable.
      try {
        if (FB.auth && firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
          FB.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        }
      } catch (_) {}

      FB.ok = true;
      _attachAuthListener();
      return true;
    } catch (e) {
      warnOnce('[EC] Firebase init failed. Auth disabled.', e);
      FB.ok = false;
      return false;
    }
  };

  // ----------------------------
  // Auth
  // ----------------------------
  AUTH.user = AUTH.user || null;
  // Runtime-only flag: becomes true after Firebase auth state has been resolved at least once.
  // Used by UI gating (e.g., intro autoplay) to avoid racing before we know whether the user is signed in.
  if (AUTH._ready !== true) AUTH._ready = false;
  AUTH._listeners = AUTH._listeners || [];

  function _notifyAuth() {
    const list = AUTH._listeners || [];
    for (let i = 0; i < list.length; i++) {
      try { list[i](AUTH.user); } catch (_) {}
    }
  }

  function _attachAuthListener() {
    if (!FB.ok || !FB.auth) return;
    if (AUTH._listenerAttached) return;
    AUTH._listenerAttached = true;

    try {
      FB.auth.onAuthStateChanged((u) => {
        // Mark auth as resolved as early as possible to unblock UI gating.
        AUTH._ready = true;
        AUTH.user = u || null;
        _notifyAuth();

        if (AUTH.user) {
          // On sign-in: load persisted state (schema v2) and apply if available.
          try {
            SAVE.load().then((data) => {
              try {
                // Mark that we've attempted to load the save doc (even if null) for UI gating.
                SAVE._loadedOnce = true;
                SAVE._lastLoadedDoc = data || null;
                const hasV2 = SAVE._onLoadedDoc(data);
                if (!hasV2) {
                  // No valid v2 save: write current runtime state as initial v2.
                  SAVE._writeCurrentPat('initV2');
                }
                // Optional hook to avoid intro autoplay racing before save doc apply.
                try {
                  if (EC.UI_INTRO && typeof EC.UI_INTRO.onSaveLoaded === 'function') EC.UI_INTRO.onSaveLoaded(data || null);
                } catch (_) {}
              } catch (_) {
                try { SAVE._writeCurrentPat('initV2'); } catch (_) {}
              }
            });
          } catch (_) {}
        }
      });
    } catch (e) {
      warnOnce('[EC] Firebase auth listener failed. Auth disabled.', e);
    }
  }

  AUTH.onChange = AUTH.onChange || function onChange(cb) {
    if (typeof cb !== 'function') return;
    AUTH._listeners = AUTH._listeners || [];
    AUTH._listeners.push(cb);
    try { cb(AUTH.user); } catch (_) {}
  };

  AUTH.signInGoogle = AUTH.signInGoogle || function signInGoogle() {
    if (!FB.ok || !hasFirebase() || !FB.auth) {
      warnOnce('[EC] signInGoogle called but Firebase is not available.');
      return Promise.reject(new Error('Firebase unavailable'));
    }
    const firebase = window.firebase;
    const provider = new firebase.auth.GoogleAuthProvider();

    // Try popup; fallback to redirect if popup fails (blocked/closed/etc.).
    return FB.auth.signInWithPopup(provider).catch((err) => {
      try {
        if (FB.auth && typeof FB.auth.signInWithRedirect === 'function') {
          return FB.auth.signInWithRedirect(provider);
        }
      } catch (_) {}
      throw err;
    });
  };

  AUTH.signOut = AUTH.signOut || function signOut() {
    if (!FB.ok || !FB.auth) return Promise.resolve();
    try { return FB.auth.signOut(); } catch (_) { return Promise.resolve(); }
  };

  // ----------------------------
  // Save (scaffolding only)
  // users/{uid}/save/main
  // ----------------------------
  function _docRef() {
    if (!FB.ok || !FB.db) return null;
    const u = AUTH.user;
    if (!u || !u.uid) return null;
    try {
      return FB.db.collection('users').doc(u.uid).collection('save').doc('main');
    } catch (_) {
      return null;
    }
  }

  SAVE.load = SAVE.load || function load() {
    const ref = _docRef();
    if (!ref) return Promise.resolve(null);
    return ref.get()
      .then((snap) => (snap && snap.exists) ? (snap.data() || null) : null)
      .catch((e) => {
        warnOnce('[EC] SAVE.load failed.', e);
        return null;
      });
  };

  SAVE.write = SAVE.write || function write(data, opts) {
    const ref = _docRef();
    if (!ref || !hasFirebase()) return Promise.resolve(false);
    const firebase = window.firebase;
    const merge = (opts && Object.prototype.hasOwnProperty.call(opts, 'merge')) ? !!opts.merge : true;
    const payload = Object.assign({}, data || {});
    if (payload.schemaVersion === undefined) payload.schemaVersion = 1;
    try { payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp(); } catch (_) {}
    return ref.set(payload, { merge })
      .then(() => true)
      .catch((e) => {
        warnOnce('[EC] SAVE.write failed.', e);
        return false;
      });
  };

  SAVE._debounceMs = SAVE._debounceMs || 500;
  SAVE.debouncedWrite = SAVE.debouncedWrite || function debouncedWrite(data, opts) {
    if (!FB.ok) return Promise.resolve(false);
    try { clearTimeout(SAVE._t); } catch (_) {}
    return new Promise((resolve) => {
      SAVE._t = setTimeout(() => {
        SAVE.write(data, opts).then(resolve);
      }, SAVE._debounceMs);
    });
  };

  SAVE._pendingDoc = SAVE._pendingDoc || null;
  SAVE._applyAttempts = SAVE._applyAttempts || 0;

  SAVE._tryApplyPending = SAVE._tryApplyPending || function _tryApplyPending() {
    if (!SAVE._pendingDoc) return false;
    const d = SAVE._pendingDoc;
    if (EC.PAT && typeof EC.PAT.applySaveBlob === 'function' && d && d.pat && typeof d.pat === 'object') {
      try {
        EC.PAT.applySaveBlob(d.pat);
        SAVE._pendingDoc = null;
        SAVE._applyAttempts = 0;
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  };

  SAVE._onLoadedDoc = SAVE._onLoadedDoc || function _onLoadedDoc(data) {
    if (!data || typeof data !== 'object') return false;
    const v = (typeof data.schemaVersion === 'number') ? data.schemaVersion : 0;

    // Apply persisted UI one-time popup flags immediately (independent of patients readiness).
    if (v >= 2 && data.ui && typeof data.ui === 'object' && data.ui.seenFirstPopups && typeof data.ui.seenFirstPopups === 'object') {
      const UI = EC.UI_STATE || (EC.UI_STATE = {});
      UI._seenFirstPopups = UI._seenFirstPopups || {};
      try {
        Object.keys(data.ui.seenFirstPopups).forEach((k) => {
          if (data.ui.seenFirstPopups[k]) UI._seenFirstPopups[String(k)] = true;
        });
      } catch (_) {}
    }

    // One-time intro cutscene flag (Back-Alley Psychiatry)
    if (v >= 2 && data.ui && typeof data.ui === 'object' && data.ui.seenIntroBAP === true) {
      const UI = EC.UI_STATE || (EC.UI_STATE = {});
      UI._seenIntroBAP = true;
    }

    // One-time intro cutscene flag (Back-Alley Psychiatry) v3
    if (v >= 2 && data.ui && typeof data.ui === 'object' && data.ui.seenIntroBAP_v3 === true) {
      const UI = EC.UI_STATE || (EC.UI_STATE = {});
      UI._seenIntroBAP_v3 = true;
    }

    if (v >= 2 && data.pat && typeof data.pat === 'object') {
      SAVE._pendingDoc = data;
      // Try immediately; if patients system not ready yet, retry a few times.
      const okNow = SAVE._tryApplyPending();
      if (!okNow) {
        if (SAVE._applyAttempts < 20) {
          SAVE._applyAttempts++;
          try { setTimeout(() => { try { SAVE._tryApplyPending(); } catch (_) {} }, 75); } catch (_) {}
        }
      }
      return true;
    }

    return false;
  };

  SAVE._writeCurrentPat = SAVE._writeCurrentPat || function _writeCurrentPat(reason) {
    if (!AUTH.user) return Promise.resolve(false);

    // If patients system isn't ready yet, retry shortly so we can include `pat`.
    if (!EC.PAT || typeof EC.PAT.getSaveBlob !== 'function') {
      if ((SAVE._patWriteAttempts || 0) < 20) {
        SAVE._patWriteAttempts = (SAVE._patWriteAttempts || 0) + 1;
        try { setTimeout(() => { try { SAVE._writeCurrentPat('retry'); } catch (_) {} }, 75); } catch (_) {}
      }
      const UI = EC.UI_STATE || {};
      const seenFirstPopups = Object.assign({}, (UI && UI._seenFirstPopups) || {});
      const seenIntroBAP = !!(UI && UI._seenIntroBAP);
      const seenIntroBAP_v3 = !!(UI && UI._seenIntroBAP_v3);
      return SAVE.debouncedWrite({ schemaVersion: 2, ui: { seenFirstPopups, seenIntroBAP, seenIntroBAP_v3 } }, { merge: true });
    }

    SAVE._patWriteAttempts = 0;
    const pat = EC.PAT.getSaveBlob();
    const UI = EC.UI_STATE || {};
    const seenFirstPopups = Object.assign({}, (UI && UI._seenFirstPopups) || {});
    const seenIntroBAP = !!(UI && UI._seenIntroBAP);
    const seenIntroBAP_v3 = !!(UI && UI._seenIntroBAP_v3);
    return SAVE.debouncedWrite({ schemaVersion: 2, pat, ui: { seenFirstPopups, seenIntroBAP, seenIntroBAP_v3 } }, { merge: true });
  };

  SAVE._touchOnSignIn = SAVE._touchOnSignIn || function _touchOnSignIn() {
    // Ensure schema v2 exists. Merge in current runtime state (authoritative roster lives in code).
    return SAVE._writeCurrentPat('signIn');
  };

  // Auto-init early during boot (safe + no-throw).
  try { FB.init(); } catch (_) {}
})();

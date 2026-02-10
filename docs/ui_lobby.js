/* Emotioncraft — Patient Lobby UI
   Renders a simple overlay list of hardcoded patients and starts sessions.

   No gameplay logic beyond calling EC.PAT.start().
   No ES modules; window.EC namespace.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const SIM = (EC.SIM = EC.SIM || {});

  function $(id) { return document.getElementById(id); }

  function ensureElements() {
    return {
      overlay: $("lobbyOverlay"),
      list: $("patientList"),
      startBtn: $("btnLobbyStart"),
      resumeBtn: $("btnLobbyResume"),
      hint: $("lobbyHint"),
      portraitImg: $("lobbyPortraitImg"),
      detailsName: $("lobbyDetailsName"),
      detailsTagline: $("lobbyDetailsTagline"),
      detailsMeta: $("lobbyDetailsMeta"),
      detailsQuirks: $("lobbyDetailsQuirks"),
    };
  }

  function _hasPortrait(p) {
    const src = (p && typeof p.portrait === 'string') ? p.portrait : '';
    if (!src) return false;
    if (src === 'placeholder') return false;
    return true;
  }

  function renderDetails(els, p) {
    if (!p) return;
    try {
      if (els.detailsName) els.detailsName.textContent = p.name || '—';
      if (els.detailsTagline) els.detailsTagline.textContent = p.tagline || '';

      const mv = [];
      if (p.mindsetLabel) mv.push(`Mood: ${(p.moodLabel || p.mindsetLabel)} (${(p.moodTemplate || p.mindsetTemplate || 'Flat')})`);
      if (p.vibeLabel) mv.push(`Vibe: ${p.vibeLabel}`);
      if (p.planName) mv.push(`Plan: ${p.planName}`);
      if (els.detailsMeta) els.detailsMeta.textContent = mv.join(' • ');

      const qLines = [];
      qLines.push(`Quirks: ${p.quirkSummary || '—'}`);
      if (p.quirkLineTexts && p.quirkLineTexts.length) qLines.push(...p.quirkLineTexts);
      if (els.detailsQuirks) els.detailsQuirks.innerHTML = qLines.join('<br>');

      if (els.portraitImg) {
        if (_hasPortrait(p)) {
          els.portraitImg.src = p.portrait;
          els.portraitImg.style.opacity = '1';
        } else {
          // Neutral placeholder (no new artwork)
          els.portraitImg.removeAttribute('src');
          els.portraitImg.style.opacity = '0';
        }
      }
    } catch (_) {}
  }

  function renderList(els) {
    if (!els.list || !EC.PAT || typeof EC.PAT.list !== 'function') return;
    const items = EC.PAT.list();
    els.list.innerHTML = '';
    items.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'patientItem';
      row.dataset.pid = p.id;

      const left = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'patientTitle';
      title.textContent = p.name;
      const meta = document.createElement('div');
      meta.className = 'patientMeta';
      const mood = (p.moodLabel || p.mindsetLabel) ? `Mood: ${p.moodLabel || p.mindsetLabel}` : '';
      const vibe = p.vibeLabel ? `Vibe: ${p.vibeLabel}` : '';
      const plan = p.planName ? `Plan: ${p.planName}` : '';
      const tagline = p.tagline ? p.tagline : '';
      meta.textContent = [tagline, [mood, vibe, plan].filter(Boolean).join(' • ')].filter(Boolean).join(' — ');
      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'patientBadges';
      const pill1 = document.createElement('div');
      pill1.className = 'pill';
      pill1.textContent = `Quirks: ${p.quirkCount}`;
      right.appendChild(pill1);

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener('click', () => {
        EC.UI_STATE = EC.UI_STATE || {};
        EC.UI_STATE.selectedPatientId = p.id;
        const rows = els.list.querySelectorAll('.patientItem');
        rows.forEach((r) => r.classList.remove('selected'));
        row.classList.add('selected');
        if (els.startBtn) els.startBtn.disabled = false;
        renderDetails(els, p);
      });

      // Auto-select first item if none selected.
      if (idx === 0) {
        const sel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null;
        if (!sel) {
          EC.UI_STATE = EC.UI_STATE || {};
          EC.UI_STATE.selectedPatientId = p.id;
          row.classList.add('selected');
          if (els.startBtn) els.startBtn.disabled = false;
          renderDetails(els, p);
        } else if (sel === p.id) {
          row.classList.add('selected');
          if (els.startBtn) els.startBtn.disabled = false;
          renderDetails(els, p);
        }
      } else {
        const sel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null;
        if (sel === p.id) {
          row.classList.add('selected');
          if (els.startBtn) els.startBtn.disabled = false;
          renderDetails(els, p);
        }
      }

      els.list.appendChild(row);
    });
  }

  function show(els) {
    if (els.overlay) els.overlay.classList.add('show');
  }
  function hide(els) {
    if (els.overlay) els.overlay.classList.remove('show');
  }

  function init() {
    const els = ensureElements();
    EC.UI_STATE = EC.UI_STATE || {};
    EC.UI_STATE.selectedPatientId = EC.UI_STATE.selectedPatientId || null;
    renderList(els);

    // Resume button (only shown when a session is paused and resumable)
    if (els.resumeBtn) {
      els.resumeBtn.addEventListener('click', () => {
        if (EC.PAT && typeof EC.PAT.resumeFromLobby === 'function') {
          EC.PAT.resumeFromLobby();
        } else {
          SIM.inLobby = false;
        }
        hide(els);
      });
    }
    if (els.startBtn) {
      // Disabled until a patient is selected (renderList may auto-select first).
      els.startBtn.disabled = !EC.UI_STATE.selectedPatientId;
      els.startBtn.addEventListener('click', () => {
        const pid = EC.UI_STATE.selectedPatientId;
        if (!pid || !EC.PAT) return;
        EC.PAT.start(pid);
        SIM.inLobby = false;
        hide(els);
      });
    }

    // Start in lobby by default.
    SIM.inLobby = true;
    show(els);
  }

  function render() {
    const els = ensureElements();
    if (!els.overlay) return;
    const want = !!(SIM && SIM.inLobby);
    if (want) {
      // Toggle Resume visibility based on whether there's a paused, resumable session.
      const isWin = (SIM.levelState === 'win') || !!SIM.mvpWin;
      const isLose = (SIM.levelState === 'lose') || !!SIM.mvpLose || !!SIM.gameOver;
      const resumable = !!(SIM._patientActive && !isWin && !isLose);
      if (els.resumeBtn) {
        els.resumeBtn.style.display = resumable ? '' : 'none';
      }
      if (els.startBtn) {
        els.startBtn.textContent = resumable ? 'Start New Session' : 'Start Session';
      }
      // Update subtitle to reflect pause mode.
      try {
        const subEl = els.overlay.querySelector('.sub');
        if (subEl && subEl.tagName && subEl.tagName.toLowerCase() === 'div') {
          subEl.textContent = resumable ? 'Session paused. Resume or start a new patient.' : 'Select a patient to begin a session.';
        }
      } catch (_) { /* ignore */ }

      // Ensure list stays current.
      const stamp = (EC.UI_STATE && EC.UI_STATE._lobbyDirtyStamp) ? EC.UI_STATE._lobbyDirtyStamp : 0;
      if (EC.UI_STATE && EC.UI_STATE._lobbyLastStamp !== stamp) {
        EC.UI_STATE._lobbyLastStamp = stamp;
        renderList(els);
      }
      show(els);
    } else {
      hide(els);
    }
  }

  EC.UI_LOBBY = {
    init,
    render,
  };
})();

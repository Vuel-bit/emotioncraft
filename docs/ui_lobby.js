/* Emotioncraft — Patient Lobby UI
   Renders a simple overlay list of hardcoded patients and starts sessions.

   No gameplay logic beyond calling EC.PAT.start().
   No ES modules; window.EC namespace.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const SIM = (EC.SIM = EC.SIM || {});

  // Plan-pick flow: when intake is done, Start opens plan choice without reserving/removing.
  let pendingPlanPickPatientId = null;

  // Plan choice overlay state: prevents render tick from auto-hiding while open.
  let _planChoiceOpen = false;

  // Post-run progression modals
  let _rewardShowingFor = null;
  let _congratsShowingFor = null;
  let _intakeCongratsShowingFor = null;

  function $(id) { return document.getElementById(id); }

  function ensureElements() {
    return {
      overlay: $("lobbyOverlay"),
      list: $("patientList"),
      startBtn: $("btnLobbyStart"),
      resumeBtn: $("btnLobbyResume"),
      hint: $("lobbyHint"),
      authWrap: $("lobbyAuth"),
      btnAuthSignIn: $("btnAuthSignIn"),
      btnAuthSignOut: $("btnAuthSignOut"),
      authUser: $("authUser"),
      portraitImg: $("lobbyPortraitImg"),
      detailsName: $("lobbyDetailsName"),
      detailsTagline: $("lobbyDetailsTagline"),
      detailsMeta: $("lobbyDetailsMeta"),
      detailsQuirks: $("lobbyDetailsQuirks"),
      // Created dynamically
      rewardOverlay: document.getElementById('weeklyRewardOverlay'),
      congratsOverlay: document.getElementById('zenCongratsOverlay'),
    };
  }

  function _nextMood(cur) {
    const map = { 'Spent': 'Drained', 'Drained': 'Steady', 'Overwhelmed': 'Antsy', 'Antsy': 'Steady', 'Steady': 'Steady' };
    return map[String(cur || 'Steady')] || 'Steady';
  }

  function _nextVibe(cur) {
    const map = { 'Crisis': 'Blah', 'Blah': 'Mid', 'Freaking': 'Anxious', 'Anxious': 'Mid', 'Mid': 'Mid' };
    return map[String(cur || 'Mid')] || 'Mid';
  }

  function ensureWeeklyRewardUI(els) {
    if (!els) return;
    let ov = document.getElementById('weeklyRewardOverlay');
    if (ov) { els.rewardOverlay = ov; return; }

    ov = document.createElement('div');
    ov.id = 'weeklyRewardOverlay';
    ov.style.display = 'none';
    ov.style.position = 'fixed';
    ov.style.left = '0';
    ov.style.top = '0';
    ov.style.right = '0';
    ov.style.bottom = '0';
    ov.style.zIndex = '70';
    ov.style.background = 'rgba(0,0,0,0.72)';
    ov.style.alignItems = 'center';
    ov.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.width = 'min(520px, 94vw)';
    card.style.maxHeight = 'min(80vh, 680px)';
    card.style.overflow = 'auto';
    card.style.background = 'rgba(20, 28, 43, 0.96)';
    card.style.border = '1px solid rgba(255,255,255,0.12)';
    card.style.borderRadius = '16px';
    card.style.padding = '14px';
    card.style.boxShadow = '0 18px 60px rgba(0,0,0,0.45)';

    const title = document.createElement('div');
    title.id = 'weeklyRewardTitle';
    title.style.fontSize = '14px';
    title.style.fontWeight = '800';
    title.style.marginBottom = '6px';
    title.textContent = 'Weekly success — choose one improvement';
    card.appendChild(title);

    const sub = document.createElement('div');
    sub.id = 'weeklyRewardSub';
    sub.style.fontSize = '12px';
    sub.style.opacity = '0.85';
    sub.style.marginBottom = '12px';
    sub.textContent = '';
    card.appendChild(sub);

    const body = document.createElement('div');
    body.id = 'weeklyRewardBody';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';
    card.appendChild(body);

    ov.appendChild(card);
    document.body.appendChild(ov);
    els.rewardOverlay = ov;
  }

  function ensureZenCongratsUI(els) {
    if (!els) return;
    let ov = document.getElementById('zenCongratsOverlay');
    if (ov) { els.congratsOverlay = ov; return; }

    ov = document.createElement('div');
    ov.id = 'zenCongratsOverlay';
    ov.style.display = 'none';
    ov.style.position = 'fixed';
    ov.style.left = '0';
    ov.style.top = '0';
    ov.style.right = '0';
    ov.style.bottom = '0';
    ov.style.zIndex = '70';
    ov.style.background = 'rgba(0,0,0,0.72)';
    ov.style.alignItems = 'center';
    ov.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.width = 'min(420px, 92vw)';
    card.style.background = 'rgba(20, 28, 43, 0.96)';
    card.style.border = '1px solid rgba(255,255,255,0.12)';
    card.style.borderRadius = '16px';
    card.style.padding = '14px';
    card.style.boxShadow = '0 18px 60px rgba(0,0,0,0.45)';

    const title = document.createElement('div');
    title.id = 'zenCongratsTitle';
    title.style.fontSize = '14px';
    title.style.fontWeight = '800';
    title.style.marginBottom = '8px';
    title.textContent = 'Transcended';
    card.appendChild(title);

    const msg = document.createElement('div');
    msg.id = 'zenCongratsMsg';
    msg.style.fontSize = '12px';
    msg.style.opacity = '0.85';
    msg.style.marginBottom = '12px';
    msg.textContent = '';
    card.appendChild(msg);

    const ok = document.createElement('button');
    ok.id = 'btnZenCongratsOk';
    ok.className = 'lobbyBtn primary';
    ok.textContent = 'OK';
    ok.addEventListener('click', () => {
      try { if (EC.PAT && EC.PAT.clearPendingZenCongrats) EC.PAT.clearPendingZenCongrats(); } catch (_) {}
      _congratsShowingFor = null;
      ov.style.display = 'none';
    });
    card.appendChild(ok);

    ov.appendChild(card);
    document.body.appendChild(ov);
    els.congratsOverlay = ov;
  }

  function showWeeklyReward(els, pid) {
    ensureWeeklyRewardUI(els);
    if (!els.rewardOverlay) return;

    const p = (EC.PAT && EC.PAT.get) ? EC.PAT.get(pid) : null;
    if (!p) return;

    const title = document.getElementById('weeklyRewardTitle');
    const sub = document.getElementById('weeklyRewardSub');
    const body = document.getElementById('weeklyRewardBody');
    if (title) title.textContent = 'Weekly success — choose one improvement';
    if (sub) sub.textContent = p.name ? `Patient: ${p.name}` : '';
    if (!body) return;

    body.innerHTML = '';

    // Reduce a quirk intensity
    const secQ = document.createElement('div');
    const qh = document.createElement('div');
    qh.style.fontSize = '12px';
    qh.style.fontWeight = '800';
    qh.textContent = 'Reduce a Quirk intensity';
    secQ.appendChild(qh);
    const qs = Array.isArray(p.quirks) ? p.quirks : [];
    if (!qs.length) {
      const none = document.createElement('div');
      none.style.fontSize = '12px';
      none.style.opacity = '0.75';
      none.textContent = 'No quirks.';
      secQ.appendChild(none);
    } else {
      qs.forEach((q, i) => {
        const btn = document.createElement('button');
        btn.className = 'lobbyBtn';
        const tier = (typeof q.intensityTier === 'number') ? q.intensityTier : 0;
        const disabled = tier <= 0;
        btn.disabled = disabled;
        btn.textContent = `${_quirkLabel(q.type)} (${tier})`;
        btn.addEventListener('click', () => {
          try { if (EC.PAT && EC.PAT.applyWeeklyReward) EC.PAT.applyWeeklyReward({ kind: 'QUIRK', index: i }); } catch (_) {}
          _rewardShowingFor = null;
          els.rewardOverlay.style.display = 'none';
          try { renderList(els); } catch (_) {}
          try { const sel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null; if (sel && EC.PAT && EC.PAT.get) renderDetails(els, EC.PAT.get(sel)); } catch (_) {}
        });
        secQ.appendChild(btn);
      });
    }
    body.appendChild(secQ);

    // Mood toward Steady
    const secM = document.createElement('div');
    const mb = document.createElement('button');
    mb.className = 'lobbyBtn primary';
    const curMood = (p.mood && p.mood.label) ? p.mood.label : (p.moodLabel || 'Steady');
    mb.textContent = `Mood toward Steady (${curMood} → ${_nextMood(curMood)})`;
    mb.addEventListener('click', () => {
      try { if (EC.PAT && EC.PAT.applyWeeklyReward) EC.PAT.applyWeeklyReward({ kind: 'MOOD' }); } catch (_) {}
      _rewardShowingFor = null;
      els.rewardOverlay.style.display = 'none';
      try { renderList(els); } catch (_) {}
      try { const sel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null; if (sel && EC.PAT && EC.PAT.get) renderDetails(els, EC.PAT.get(sel)); } catch (_) {}
    });
    secM.appendChild(mb);
    body.appendChild(secM);

    // Vibe toward Mid
    const secV = document.createElement('div');
    const vb = document.createElement('button');
    vb.className = 'lobbyBtn primary';
    const curVibe = (p.vibe && p.vibe.label) ? p.vibe.label : (p.vibeLabel || 'Mid');
    vb.textContent = `Vibe toward Mid (${curVibe} → ${_nextVibe(curVibe)})`;
    vb.addEventListener('click', () => {
      try { if (EC.PAT && EC.PAT.applyWeeklyReward) EC.PAT.applyWeeklyReward({ kind: 'VIBE' }); } catch (_) {}
      _rewardShowingFor = null;
      els.rewardOverlay.style.display = 'none';
      try { renderList(els); } catch (_) {}
      try { const sel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null; if (sel && EC.PAT && EC.PAT.get) renderDetails(els, EC.PAT.get(sel)); } catch (_) {}
    });
    secV.appendChild(vb);
    body.appendChild(secV);

    // Remove a trait
    const secT = document.createElement('div');
    const th = document.createElement('div');
    th.style.fontSize = '12px';
    th.style.fontWeight = '800';
    th.textContent = 'Remove a Trait';
    secT.appendChild(th);
    const ts = Array.isArray(p.traits) ? p.traits : [];
    if (!ts.length) {
      const none = document.createElement('div');
      none.style.fontSize = '12px';
      none.style.opacity = '0.75';
      none.textContent = 'No traits to remove.';
      secT.appendChild(none);
    } else {
      ts.forEach((t, i) => {
        const btn = document.createElement('button');
        btn.className = 'lobbyBtn';
        btn.textContent = String(t);
        btn.addEventListener('click', () => {
          try { if (EC.PAT && EC.PAT.applyWeeklyReward) EC.PAT.applyWeeklyReward({ kind: 'TRAIT', index: i }); } catch (_) {}
          _rewardShowingFor = null;
          els.rewardOverlay.style.display = 'none';
          try { renderList(els); } catch (_) {}
          try { const sel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null; if (sel && EC.PAT && EC.PAT.get) renderDetails(els, EC.PAT.get(sel)); } catch (_) {}
        });
        secT.appendChild(btn);
      });
    }
    body.appendChild(secT);

    els.rewardOverlay.style.display = 'flex';
  }

  function hideWeeklyReward(els) {
    ensureWeeklyRewardUI(els);
    if (els.rewardOverlay) els.rewardOverlay.style.display = 'none';
  }

  function showZenCongrats(els, pid) {
    ensureZenCongratsUI(els);
    if (!els.congratsOverlay) return;
    const p = (EC.PAT && EC.PAT.get) ? EC.PAT.get(pid) : null;
    const msg = document.getElementById('zenCongratsMsg');
    if (msg) msg.textContent = p && p.name ? `${p.name} has transcended and will no longer appear in rotation.` : 'This patient has transcended and will no longer appear in rotation.';
    els.congratsOverlay.style.display = 'flex';
  }

  function hideZenCongrats(els) {
    ensureZenCongratsUI(els);
    if (els.congratsOverlay) els.congratsOverlay.style.display = 'none';
  }

  function ensureIntakeCongratsUI(els) {
    if (!els) return;
    let ov = document.getElementById('intakeCongratsOverlay');
    if (ov) { els.intakeCongratsOverlay = ov; return; }

    ov = document.createElement('div');
    ov.id = 'intakeCongratsOverlay';
    ov.style.display = 'none';
    ov.style.position = 'fixed';
    ov.style.left = '0';
    ov.style.top = '0';
    ov.style.right = '0';
    ov.style.bottom = '0';
    ov.style.zIndex = '70';
    ov.style.background = 'rgba(0,0,0,0.72)';
    ov.style.alignItems = 'center';
    ov.style.justifyContent = 'center';

    const card = document.createElement('div');
    card.style.width = 'min(520px, 94vw)';
    card.style.maxHeight = 'min(70vh, 520px)';
    card.style.overflow = 'auto';
    card.style.background = 'rgba(20, 28, 43, 0.96)';
    card.style.border = '1px solid rgba(255,255,255,0.12)';
    card.style.borderRadius = '16px';
    card.style.padding = '18px 18px 14px 18px';
    card.style.boxShadow = '0 16px 60px rgba(0,0,0,0.55)';

    const title = document.createElement('div');
    title.style.fontSize = '20px';
    title.style.fontWeight = '800';
    title.style.letterSpacing = '0.2px';
    title.style.marginBottom = '10px';
    title.textContent = 'Intake complete';

    const body = document.createElement('div');
    body.id = 'intakeCongratsBody';
    body.style.fontSize = '14px';
    body.style.lineHeight = '1.35';
    body.style.opacity = '0.92';
    body.style.marginBottom = '14px';
    body.textContent = '';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '10px';

    const ok = document.createElement('button');
    ok.className = 'btn primary';
    ok.textContent = 'OK';
    ok.addEventListener('click', () => {
      if (EC.PAT && EC.PAT.clearPendingIntakeCongrats) EC.PAT.clearPendingIntakeCongrats();
      hideIntakeCongrats(els);
    });

    btnRow.appendChild(ok);
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(btnRow);
    ov.appendChild(card);
    document.body.appendChild(ov);

    els.intakeCongratsOverlay = ov;
    els.intakeCongratsBodyEl = body;
  }

  function showIntakeCongrats(els, pid) {
    ensureIntakeCongratsUI(els);
    if (!els || !els.intakeCongratsOverlay) return;
    let name = '';
    try {
      const p = (EC.PAT && typeof EC.PAT.get === 'function') ? EC.PAT.get(pid) : null;
      name = p && p.name ? String(p.name) : '';
    } catch (_) {}
    if (els.intakeCongratsBodyEl) {
      els.intakeCongratsBodyEl.textContent = name
        ? `${name} is no longer an intake patient.`
        : 'This patient is no longer an intake patient.';
    }
    els.intakeCongratsOverlay.style.display = 'flex';
  }

  function hideIntakeCongrats(els) {
    ensureIntakeCongratsUI(els);
    if (els.intakeCongratsOverlay) els.intakeCongratsOverlay.style.display = 'none';
  }

  function authLabel(u) {
    if (!u) return '';
    return u.displayName || u.email || 'Signed in';
  }

  function updateAuthUI(els) {
    if (!els || !els.authWrap) return;
    const fbOk = !!(EC.FB && EC.FB.ok);
    const hasAuth = !!(EC.AUTH && typeof EC.AUTH.signInGoogle === 'function' && typeof EC.AUTH.signOut === 'function');
    const u = (EC.AUTH && EC.AUTH.user) ? EC.AUTH.user : null;

    // If Firebase is unavailable, fail gracefully: disable sign-in.
    if (!fbOk || !hasAuth) {
      if (els.btnAuthSignIn) {
        els.btnAuthSignIn.style.display = '';
        els.btnAuthSignIn.disabled = true;
        els.btnAuthSignIn.textContent = 'Sign in (unavailable)';
      }
      if (els.btnAuthSignOut) els.btnAuthSignOut.style.display = 'none';
      if (els.authUser) {
        els.authUser.textContent = '';
        els.authUser.style.display = 'none';
      }
      return;
    }

    if (!u) {
      if (els.btnAuthSignIn) {
        els.btnAuthSignIn.style.display = '';
        els.btnAuthSignIn.disabled = false;
        els.btnAuthSignIn.textContent = 'Sign in with Google';
      }
      if (els.btnAuthSignOut) els.btnAuthSignOut.style.display = 'none';
      if (els.authUser) {
        els.authUser.textContent = '';
        els.authUser.style.display = 'none';
      }
    } else {
      if (els.btnAuthSignIn) els.btnAuthSignIn.style.display = 'none';
      if (els.authUser) {
        els.authUser.textContent = authLabel(u);
        els.authUser.style.display = '';
      }
      if (els.btnAuthSignOut) {
        els.btnAuthSignOut.style.display = '';
        els.btnAuthSignOut.disabled = false;
      }
    }
  }

  function _hasPortrait(p) {
    const src = (p && typeof p.portrait === 'string') ? p.portrait : '';
    if (!src) return false;
    if (src === 'placeholder') return false;
    return true;
  }

      function _tierColor(t) {
    const n = (typeof t === 'number') ? t : 0;
    if (n >= 2) return 'rgba(255, 92, 92, 0.95)';   // red-ish
    if (n === 1) return 'rgba(230, 216, 92, 0.95)'; // yellow-ish
    return 'rgba(123, 220, 123, 0.95)';             // green-ish
  }

  function _quirkLabel(type) {
    const s = String(type || '').toUpperCase();
    if (s === 'LOCKS_IN') return 'Locks In';
    if (s === 'CRASHES') return 'Crashes';
    if (s === 'SPIRALS') return 'Spirals';
    if (s === 'AMPED') return 'Amped';
    // Fallback: titlecase with spaces
    return String(type || 'Quirk')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
  }

  function renderDetails(els, p) {
    if (!p) return;
    try {
      if (els.detailsName) els.detailsName.textContent = p.name || '—';
      if (els.detailsTagline) els.detailsTagline.textContent = p.tagline || '';

      const mood = p.moodLabel || '—';
      const vibe = p.vibeLabel || '—';
      const traits = (p.traits && p.traits.length) ? p.traits.join(', ') : 'none';
      const last = (typeof p.lastOutcome === 'string' && p.lastOutcome.length) ? p.lastOutcome : '—';

      if (els.detailsMeta) {
        els.detailsMeta.innerHTML = [
          `Mood: ${mood}`,
          `Vibe: ${vibe}`,
          `Traits: ${traits}`,
          `Last: ${last}`,
        ].join('<br>');
      }

      if (els.detailsQuirks) {
        els.detailsQuirks.innerHTML = '';
        const wrap = document.createElement('div');
        const head = document.createElement('span');
        head.textContent = 'Quirks: ';
        wrap.appendChild(head);

        const qs = Array.isArray(p.quirks) ? p.quirks : [];
        if (!qs.length) {
          const none = document.createElement('span');
          none.textContent = 'none';
          none.style.opacity = '0.75';
          wrap.appendChild(none);
        } else {
          qs.forEach((q, i) => {
            const sp = document.createElement('span');
            sp.textContent = _quirkLabel(q.type);
            sp.style.color = _tierColor(q.intensityTier);
            sp.style.fontWeight = '700';
            if (i > 0) sp.style.marginLeft = '10px';
            wrap.appendChild(sp);
          });
        }
        els.detailsQuirks.appendChild(wrap);
      }

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
    const items = EC.PAT.list() || [];
    els.list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.opacity = '0.75';
      empty.textContent = 'No patients available.';
      els.list.appendChild(empty);
      if (els.startBtn) els.startBtn.disabled = true;
      return;
    }

    const wantedSel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null;
    let didSelect = false;

    items.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'patientItem';
      row.dataset.pid = p.id;

      const left = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'patientTitle';
      title.textContent = p.name;
      const meta = document.createElement('div');
      meta.className = 'patientMeta';
      const mood = p.moodLabel ? `Mood: ${p.moodLabel}` : '';
      const vibe = p.vibeLabel ? `Vibe: ${p.vibeLabel}` : '';
      const tagline = p.tagline ? p.tagline : '';
      meta.textContent = [tagline, [mood, vibe].filter(Boolean).join(' • ')].filter(Boolean).join(' — ');
      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'patientBadges';
      const pill1 = document.createElement('div');
      pill1.className = 'pill';
      pill1.textContent = (p.intakeDone ? 'Returning' : 'Intake');
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

      if (wantedSel && wantedSel === p.id) {
        row.classList.add('selected');
        didSelect = true;
      }

      els.list.appendChild(row);
    });

    // Ensure we always have a selection for the viewer.
    if (!didSelect) {
      const first = items[0];
      if (first && first.id) {
        EC.UI_STATE = EC.UI_STATE || {};
        EC.UI_STATE.selectedPatientId = first.id;
        const rows = els.list.querySelectorAll('.patientItem');
        if (rows && rows[0]) rows[0].classList.add('selected');
        if (els.startBtn) els.startBtn.disabled = false;
        renderDetails(els, first);
      } else {
        if (els.startBtn) els.startBtn.disabled = true;
      }
    } else {
      // Refresh viewer for current selection.
      try {
        const p = items.find((it) => it.id === wantedSel);
        if (p) {
          if (els.startBtn) els.startBtn.disabled = false;
          renderDetails(els, p);
        }
      } catch (_) {}
    }
  }

  function init() {
    const els = ensureElements();
    EC.UI_STATE = EC.UI_STATE || {};
    EC.UI_STATE.selectedPatientId = EC.UI_STATE.selectedPatientId || null;
    renderList(els);

    // Auth UI (minimal)
    try {
      if (els.btnAuthSignIn) {
        els.btnAuthSignIn.addEventListener('click', () => {
          try {
            if (EC.AUTH && typeof EC.AUTH.signInGoogle === 'function') {
              const p = EC.AUTH.signInGoogle();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          } catch (_) {}
        });
      }
      if (els.btnAuthSignOut) {
        els.btnAuthSignOut.addEventListener('click', () => {
          try {
            if (EC.AUTH && typeof EC.AUTH.signOut === 'function') {
              const p = EC.AUTH.signOut();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          } catch (_) {}
        });
      }
      if (EC.AUTH && typeof EC.AUTH.onChange === 'function') {
        EC.AUTH.onChange(() => updateAuthUI(els));
      }
      updateAuthUI(els);
    } catch (_) {}

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
            // Disabled until a patient is selected (renderList may auto-select first).
      els.startBtn.disabled = !EC.UI_STATE.selectedPatientId;

      ensurePlanChoiceUI(els);

      // Start / Begin
      els.startBtn.addEventListener('click', () => {
        const pid = EC.UI_STATE.selectedPatientId;
        if (!pid || !EC.PAT) return;

        const p = (EC.PAT.get && typeof EC.PAT.get === 'function') ? EC.PAT.get(pid) : null;
        if (!p) return;

        // Intake gating: first session is always INTAKE (Begin starts immediately).
        if (!p.intakeDone) {
          // Rotation rule: reserve patient (remove from slots + refill) before starting.
          if (EC.PAT.beginFromLobby && typeof EC.PAT.beginFromLobby === 'function') {
            EC.PAT.beginFromLobby(pid);
          }
          // Refresh slot list immediately.
          try { renderList(els); } catch (_) {}

          if (EC.PAT.startPending && typeof EC.PAT.startPending === 'function') {
            EC.PAT.startPending('INTAKE');
          } else if (EC.PAT.startRun && typeof EC.PAT.startRun === 'function') {
            EC.PAT.startRun(pid, 'INTAKE');
          } else if (EC.PAT.start) {
            EC.PAT.start(pid, 'INTAKE');
          }
          pendingPlanPickPatientId = null;
          SIM.inLobby = false;
          hidePlanChoice(els);
          hide(els);
          return;
        }

        // Otherwise: choose plan (Weekly vs Zen) WITHOUT reserving/removing yet.
        pendingPlanPickPatientId = pid;
        showPlanChoice(els, p.name);
      });

      // Plan choice buttons (bind once).
      if (els.planWeeklyBtn && !els.planWeeklyBtn._ecBound) {
        els.planWeeklyBtn._ecBound = true;
        els.planWeeklyBtn.addEventListener('click', () => {
          const pid = pendingPlanPickPatientId;
          pendingPlanPickPatientId = null;
          hidePlanChoice(els);
          if (pid && EC.PAT && EC.PAT.beginFromLobby) EC.PAT.beginFromLobby(pid);
          if (EC.PAT && EC.PAT.startPending) EC.PAT.startPending('WEEKLY');
          SIM.inLobby = false;
          hide(els);
        });
      }
      if (els.planZenBtn && !els.planZenBtn._ecBound) {
        els.planZenBtn._ecBound = true;
        els.planZenBtn.addEventListener('click', () => {
          const pid = pendingPlanPickPatientId;
          pendingPlanPickPatientId = null;
          hidePlanChoice(els);
          if (pid && EC.PAT && EC.PAT.beginFromLobby) EC.PAT.beginFromLobby(pid);
          if (EC.PAT && EC.PAT.startPending) EC.PAT.startPending('ZEN');
          SIM.inLobby = false;
          hide(els);
        });
      }

      if (els.planCancelBtn && !els.planCancelBtn._ecBound) {
        els.planCancelBtn._ecBound = true;
        els.planCancelBtn.addEventListener('click', () => {
          pendingPlanPickPatientId = null;
          hidePlanChoice(els);
        });
      }
    }

    // Start in lobby by default.
    SIM.inLobby = true;
    show(els);
  }

    function ensurePlanChoiceUI(els) {
    if (!els) return;
    let ov = document.getElementById('planChoiceOverlay');
    let titleEl = document.getElementById('planChoiceTitle');
    let btnWeekly = document.getElementById('btnPlanWeekly');
    let btnZen = document.getElementById('btnPlanZen');
    let btnCancel = document.getElementById('btnPlanCancel');

    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'planChoiceOverlay';
      ov.style.display = 'none';
      ov.style.position = 'fixed';
      ov.style.left = '0';
      ov.style.top = '0';
      ov.style.right = '0';
      ov.style.bottom = '0';
      ov.style.zIndex = '60';
      ov.style.background = 'rgba(0,0,0,0.65)';
      ov.style.alignItems = 'center';
      ov.style.justifyContent = 'center';

      // Click-outside cancels (does not reserve/remove patient).
      ov.addEventListener('click', (e) => {
        if (e && e.target === ov) {
          pendingPlanPickPatientId = null;
          ov.style.display = 'none';
        }
      });

      const card = document.createElement('div');
      card.style.width = 'min(420px, 92vw)';
      card.style.background = 'rgba(20, 28, 43, 0.96)';
      card.style.border = '1px solid rgba(255,255,255,0.12)';
      card.style.borderRadius = '16px';
      card.style.padding = '14px';
      card.style.boxShadow = '0 18px 60px rgba(0,0,0,0.45)';

      titleEl = document.createElement('div');
      titleEl.id = 'planChoiceTitle';
      titleEl.style.fontSize = '14px';
      titleEl.style.fontWeight = '700';
      titleEl.style.marginBottom = '10px';
      titleEl.textContent = 'Choose a plan';
      card.appendChild(titleEl);

      const btnWrap = document.createElement('div');
      btnWrap.style.display = 'flex';
      btnWrap.style.flexDirection = 'column';
      btnWrap.style.gap = '10px';

      btnWeekly = document.createElement('button');
      btnWeekly.id = 'btnPlanWeekly';
      btnWeekly.className = 'lobbyBtn primary';
      btnWeekly.textContent = 'Weekly Treatment';

      btnZen = document.createElement('button');
      btnZen.id = 'btnPlanZen';
      btnZen.className = 'lobbyBtn';
      btnZen.textContent = 'Zen (Timed)';

      btnCancel = document.createElement('button');
      btnCancel.id = 'btnPlanCancel';
      btnCancel.className = 'lobbyBtn';
      btnCancel.textContent = 'Cancel';

      btnWrap.appendChild(btnWeekly);
      btnWrap.appendChild(btnZen);
      btnWrap.appendChild(btnCancel);
      card.appendChild(btnWrap);

      ov.appendChild(card);
      document.body.appendChild(ov);
    }

    els.planOverlay = ov;
    els.planTitleEl = titleEl;
    els.planWeeklyBtn = btnWeekly;
    els.planZenBtn = btnZen;
    els.planCancelBtn = btnCancel;
  }

  function showPlanChoice(els, patientName) {
    ensurePlanChoiceUI(els);
    if (!els || !els.planOverlay) return;
    if (els.planTitleEl) {
      els.planTitleEl.textContent = patientName ? `Choose a plan for ${patientName}` : 'Choose a plan';
    }
    els.planOverlay.style.display = 'flex';
    _planChoiceOpen = true;
  }

  function hidePlanChoice(els) {
    ensurePlanChoiceUI(els);
    if (!els || !els.planOverlay) return;
    els.planOverlay.style.display = 'none';
    _planChoiceOpen = false;
  }

  function show(els) {
    if (els.overlay) els.overlay.classList.add('show');
    // Do NOT auto-hide the plan choice overlay every tick; only hide when not open.
    if (!_planChoiceOpen) hidePlanChoice(els);
  }

  function hide(els) {
    if (els.overlay) els.overlay.classList.remove('show');
    hidePlanChoice(els);
  }

function render() {
    const els = ensureElements();
    if (!els.overlay) return;
    const want = !!(SIM && SIM.inLobby);
    if (want) {
      // Keep auth UI fresh while lobby is visible.
      try { updateAuthUI(els); } catch (_) {}
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

      // Post-run progression modals
      try {
        const rwid = (EC.PAT && EC.PAT.getPendingWeeklyRewardId) ? EC.PAT.getPendingWeeklyRewardId() : null;
        if (rwid) {
          if (_rewardShowingFor !== rwid) {
            _rewardShowingFor = rwid;
            showWeeklyReward(els, rwid);
          }
        } else if (_rewardShowingFor) {
          _rewardShowingFor = null;
          hideWeeklyReward(els);
        }

        const czid = (EC.PAT && EC.PAT.getPendingZenCongratsId) ? EC.PAT.getPendingZenCongratsId() : null;
        if (czid) {
          if (_congratsShowingFor !== czid) {
            _congratsShowingFor = czid;
            showZenCongrats(els, czid);
            // Ensure list reflects removals.
            renderList(els);
          }
        } else if (_congratsShowingFor) {
          _congratsShowingFor = null;
          hideZenCongrats(els);
        }
        // Intake completion congrats (one-time)
        const iid = (EC.PAT && EC.PAT.getPendingIntakeCongratsId) ? EC.PAT.getPendingIntakeCongratsId() : null;
        if (iid) {
          if (_intakeCongratsShowingFor !== iid) {
            _intakeCongratsShowingFor = iid;
            showIntakeCongrats(els, iid);
          }
        } else if (_intakeCongratsShowingFor) {
          _intakeCongratsShowingFor = null;
          hideIntakeCongrats(els);
        }
      } catch (_) {}
      show(els);
    } else {
      hide(els);
      // Ensure modals are closed when lobby is hidden.
      try { hideWeeklyReward(els); } catch (_) {}
      try { hideZenCongrats(els); } catch (_) {}
      try { hideIntakeCongrats(els); } catch (_) {}
      _rewardShowingFor = null;
      _congratsShowingFor = null;
    }
  }

  EC.UI_LOBBY = {
    init,
    render,
  };
})();
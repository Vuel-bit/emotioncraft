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
      hint: $("lobbyHint"),
    };
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
      meta.textContent = `${p.trait} • ${p.treatment}`;
      left.appendChild(title);
      left.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'patientBadges';
      const pill1 = document.createElement('div');
      pill1.className = 'pill';
      pill1.textContent = `Dispositions: ${p.dispositionCount}`;
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
        if (els.hint) els.hint.textContent = `Selected: ${p.name}`;
      });

      // Auto-select first item if none selected.
      if (idx === 0) {
        const sel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null;
        if (!sel) {
          EC.UI_STATE = EC.UI_STATE || {};
          EC.UI_STATE.selectedPatientId = p.id;
          row.classList.add('selected');
          if (els.startBtn) els.startBtn.disabled = false;
          if (els.hint) els.hint.textContent = `Selected: ${p.name}`;
        } else if (sel === p.id) {
          row.classList.add('selected');
          if (els.startBtn) els.startBtn.disabled = false;
        }
      } else {
        const sel = (EC.UI_STATE && EC.UI_STATE.selectedPatientId) ? EC.UI_STATE.selectedPatientId : null;
        if (sel === p.id) {
          row.classList.add('selected');
          if (els.startBtn) els.startBtn.disabled = false;
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

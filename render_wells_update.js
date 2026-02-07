// Emotioncraft render_wells_update.js — MVP wells per-frame updates (Chunk 3)
(() => {
  const EC = (window.EC = window.EC || {});
  const clamp = EC.clamp;
  const R = (EC.TUNE && EC.TUNE.RENDER) || {};
  // Render tunables live in EC.TUNE.RENDER (see core_tuning.js)
  const MVP_WELL_COLORS = R.MVP_WELL_COLORS;
  const MVP_WELL_NAME = R.MVP_WELL_NAME;

  function mixRgb(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    const r = (ar + (br - ar) * t) | 0;
    const g = (ag + (bg - ag) * t) | 0;
    const bl = (ab + (bb - ab) * t) | 0;
    return (r << 16) | (g << 8) | bl;
  }

  function mixTowardWhite(rgb, k) {
    k = clamp(k, 0, 1);
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    const nr = (r + (255 - r) * k) | 0;
    const ng = (g + (255 - g) * k) | 0;
    const nb = (b + (255 - b) * k) | 0;
    return (nr << 16) | (ng << 8) | nb;
  }

  EC.RENDER_WELLS_UPDATE = EC.RENDER_WELLS_UPDATE || {};

  function computeMvpWellRadius(A, minR, maxR, Amax) {
    const a = Math.max(0, A || 0);
    const t = (Amax > 0) ? clamp(a / Amax, 0, 1) : 0;
    const r2 = (minR * minR) + (maxR * maxR - minR * minR) * t;
    return Math.sqrt(r2);
  }
  
  function drawSpinIndicator(g, r, s, tNow) {
    // Clean, consistent circular arrow glyph:
    // - Fixed arc span
    // - Single arrowhead at the end
    // - Direction flips with sign(s)
    // - Thickness/opacity scale with |s|
    const mag = Math.min(1, Math.max(0, Math.abs(s || 0)));
    if (mag <= 0.001) return;
    const cw = (s || 0) > 0;
  
    const pad = Math.max(4, r * 0.18);
    const arcR = Math.max(6, r - pad);
    const thickness = Math.max(2, r * 0.06) + (r * 0.06) * mag;
    const alpha = 0.22 + 0.55 * mag;
  
    const arcLen = Math.PI * 1.45;
    const startAngle = -Math.PI * 0.85;
    const endAngle = cw ? (startAngle + arcLen) : (startAngle - arcLen);
  
    g.lineStyle(thickness, 0x0b0f16, alpha, 0.5);
    g.arc(0, 0, arcR, startAngle, endAngle, !cw);
  
    // Arrowhead at the end of the arc
    const ex = Math.cos(endAngle) * arcR;
    const ey = Math.sin(endAngle) * arcR;
    const head = Math.max(5, r * 0.14);
    // Tangent direction at end of arc
    const tanAng = endAngle + (cw ? Math.PI / 2 : -Math.PI / 2);
    const left = tanAng + Math.PI * 0.80;
    const right = tanAng - Math.PI * 0.80;
    const lx = ex + Math.cos(left) * head;
    const ly = ey + Math.sin(left) * head;
    const rx = ex + Math.cos(right) * head;
    const ry = ey + Math.sin(right) * head;
  
    g.beginFill(0x0b0f16, Math.min(1, alpha + 0.10));
    g.moveTo(ex, ey);
    g.lineTo(lx, ly);
    g.lineTo(rx, ry);
    g.closePath();
    g.endFill();
  }
  
  function drawGhostSpinIndicator(g, r, s) {
    // Static preview glyph for target spin:
    // - No rotation animation
    // - Arc length scales with |s|
    // - Low alpha so it's clearly "ghost"
    const mag = Math.min(1, Math.max(0, Math.abs(s || 0)));
    if (mag <= 0.001) return;
    const cw = (s || 0) > 0;
  
    const pad = Math.max(6, r * 0.22);
    const arcR = Math.max(6, r - pad);
    const thickness = Math.max(1.5, r * 0.045);
    const alpha = 0.16 + 0.22 * mag;
  
    const arcLen = (Math.PI * 1.45) * mag; // proportional to |spin|
    const startAngle = -Math.PI * 0.85;
    const endAngle = cw ? (startAngle + arcLen) : (startAngle - arcLen);
  
    g.lineStyle(thickness, 0xffffff, alpha, 0.5);
    g.arc(0, 0, arcR, startAngle, endAngle, !cw);
  
    // Arrowhead at the end of the arc (subtle)
    const ex = Math.cos(endAngle) * arcR;
    const ey = Math.sin(endAngle) * arcR;
    const head = Math.max(4, r * 0.12);
    const tanAng = endAngle + (cw ? Math.PI / 2 : -Math.PI / 2);
    const left = tanAng + Math.PI * 0.80;
    const right = tanAng - Math.PI * 0.80;
    const lx = ex + Math.cos(left) * head;
    const ly = ey + Math.sin(left) * head;
    const rx = ex + Math.cos(right) * head;
    const ry = ey + Math.sin(right) * head;
  
    g.beginFill(0xffffff, Math.min(1, alpha + 0.05));
    g.moveTo(ex, ey);
    g.lineTo(lx, ly);
    g.lineTo(rx, ry);
    g.closePath();
    g.endFill();
  }
  const MVP_SPIN_DEADZONE = R.SPIN_DEADZONE_NORM;
  const MVP_MAX_OMEGA = R.SPIN_MAX_OMEGA; // rad/sec at |spin|=1
  
  
  function updateMvpBoardView() {
    const SIM = EC.SIM;
    if (!SIM || !SIM.wellsA || SIM.wellsA.length !== 6) return;
    const RSTATE = (EC.RENDER_STATE = EC.RENDER_STATE || { flags: {}, layout: {}, mvpPrevSpinT: null });
    if (EC.RENDER_WELLS_INIT && EC.RENDER_WELLS_INIT.ensure) EC.RENDER_WELLS_INIT.ensure();
    if (!EC.RENDER || !EC.RENDER.mvpWells) return;
    // Defensive: if views didn't fully build (e.g., during a reset), don't hard-crash.
    if (EC.RENDER.mvpWells.length !== 6) {
      if (EC.assert) EC.assert(false, 'EC.RENDER.mvpWells must be length 6 after init (got ' + EC.RENDER.mvpWells.length + ')');
      return;
    }
  
    const geom = SIM.mvpGeom;
    if (!geom) return;
  
    const hues = (EC.CONST && EC.CONST.HUES) || EC.HUES || ['red','purple','blue','green','yellow','orange'];
    const A_MIN = EC.TUNE.A_MIN;
    const A_MAX = EC.TUNE.A_MAX;
    const Amax = A_MAX;
    const Smin = EC.TUNE.S_MIN;
    const Smax = EC.TUNE.S_MAX;
  
    // dt in seconds (smooth, framerate-independent spin animation)
    const tNow = (typeof SIM.mvpTime === 'number') ? SIM.mvpTime : 0;
    let dt = 0;
    const prev = (typeof RSTATE.mvpPrevSpinT === 'number') ? RSTATE.mvpPrevSpinT : tNow;
    dt = tNow - prev;
    RSTATE.mvpPrevSpinT = tNow;
    if (!isFinite(dt) || dt < 0) dt = 0;
    // Cap dt to avoid huge jumps after tab switches
    if (dt > R.SPIN_DT_CAP) dt = R.SPIN_DT_CAP;
  
    // Disposition render states (telegraph/active) — multiple wells supported.
    const DISP_LIST = (EC.DISP && typeof EC.DISP.getRenderStates === 'function')
      ? EC.DISP.getRenderStates()
      : ((EC.DISP && typeof EC.DISP.getRenderState === 'function') ? [EC.DISP.getRenderState()] : []);

    // Build a per-well map with ACTIVE preferred over TELEGRAPH (never more than one per well by rule).
    const dispByWell = new Array(6).fill(null);
    for (let k = 0; k < (DISP_LIST ? DISP_LIST.length : 0); k++) {
      const d = DISP_LIST[k];
      if (!d || typeof d.targetIndex !== 'number') continue;
      const idx = d.targetIndex | 0;
      if (idx < 0 || idx >= 6) continue;
      if (!dispByWell[idx]) {
        dispByWell[idx] = d;
      } else {
        // Prefer active if conflict
        const a = dispByWell[idx];
        if (a && a.phase !== 'active' && d.phase === 'active') dispByWell[idx] = d;
      }
    }

    for (let i = 0; i < 6; i++) {
      const hue = hues[i];
      const view = EC.RENDER.mvpWells[i];
      if (!view) continue;
      const { g, spinG, dispHalo, ghostG, ghostSpinG, name, amountLabel, spinText } = view;
  
      const ang = geom.baseAngle + i * (Math.PI * 2 / 6);
      const cx = geom.cx + Math.cos(ang) * geom.ringR;
      const cy = geom.cy + Math.sin(ang) * geom.ringR;
  
      const r = computeMvpWellRadius(SIM.wellsA[i], geom.wellMinR, geom.wellMaxR, Amax);
  
      // Base circle + rim
      g.position.set(cx, cy);
      g.clear();
      const baseCol = MVP_WELL_COLORS[hue] ?? 0x777777;
      const DISP = dispByWell[i];
      const dispPhase = DISP ? DISP.phase : 'none';
      const dispIntensity = (DISP && typeof DISP.intensity01 === 'number') ? DISP.intensity01 : 0;
      const dispType = (DISP && typeof DISP.type === 'string') ? DISP.type : '';

      const isDispTarget = (dispPhase !== "none");
      let fillCol = baseCol;
      // Optional subtle brightening during ACTIVE disposition (secondary cue)
      if (isDispTarget && dispPhase === 'active') {
        const gain = (typeof R.DISP_ACTIVE_BRIGHT_GAIN === 'number') ? R.DISP_ACTIVE_BRIGHT_GAIN : 0;
        fillCol = mixTowardWhite(fillCol, clamp(dispIntensity, 0, 1) * gain);
      }
      g.beginFill(fillCol, 1);
      g.drawCircle(0, 0, r);
      g.endFill();
  
      // Outline + selection
      const sel = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : -1;
      if (i === sel) {
        g.lineStyle(3, 0xffffff, 0.65);
        g.drawCircle(0, 0, r + 2);
      } else {
        g.lineStyle(2, 0x000000, 0.25);
        g.drawCircle(0, 0, r + 1);
      }

      // Disposition telegraph/active marker (halo + active progress ring)
      if (dispHalo) {
        dispHalo.position.set(cx, cy);
        dispHalo.clear();
        const isTarget = (dispPhase !== 'none');
        dispHalo.visible = !!isTarget;

        if (isTarget) {
          const haloR = r + R.DISP_HALO_PAD;
          const baseW = Math.max(R.DISP_HALO_W_MIN, r * R.DISP_HALO_W_SCALE);

          const warnCol = (typeof R.DISP_WARN_HALO_COLOR === 'number') ? R.DISP_WARN_HALO_COLOR : 0xff3d7f; // magenta-red warning
          const activeCol = (typeof R.DISP_ACTIVE_HALO_COLOR === 'number') ? R.DISP_ACTIVE_HALO_COLOR : 0xf5f5ff; // whitish
          const headGlowCol = (typeof R.DISP_HEAD_GLOW_COLOR === 'number') ? R.DISP_HEAD_GLOW_COLOR : 0xffffff;
          const headGlowAlphaMax = (typeof R.DISP_HEAD_GLOW_ALPHA_MAX === 'number') ? R.DISP_HEAD_GLOW_ALPHA_MAX : 0.85;
          const headGlowSpanDeg = (typeof R.DISP_HEAD_GLOW_DEG === 'number') ? R.DISP_HEAD_GLOW_DEG : 16;
          const headGlowWScale = (typeof R.DISP_HEAD_GLOW_WIDTH_SCALE === 'number') ? R.DISP_HEAD_GLOW_WIDTH_SCALE : 1.6;

          if (dispPhase === 'telegraph') {
            // Outline only (warning color); no fill arc; no countdown.
            const pulse = 0.5 + 0.5 * Math.sin((tNow || 0) * (Math.PI * 2) * R.DISP_TELE_PULSE_HZ);
            // Ensure warning halo is reliably visible even early in the telegraph window.
            const inten = Math.max(0.35, clamp(dispIntensity, 0, 1));
            const a = R.DISP_TELE_ALPHA_BASE + R.DISP_TELE_ALPHA_GAIN * (0.35 + 0.65 * pulse) * inten;
            const w = baseW * (0.75 + 0.75 * pulse);
            dispHalo.lineStyle(w, warnCol, clamp(a, 0, 1));
            dispHalo.drawCircle(0, 0, haloR);
          } else if (dispPhase === 'active') {
            // Whitish outline + monotonic progress ring (time-based; fills once to full circle).
            // Keep outline secondary so the neon fill remains fully saturated.
            const inten = clamp(dispIntensity, 0, 1);
            const outlineA = 0.55;
            const outlineW = Math.max(2, baseW * 0.55);

            // Outline (thin; does not wash out the fill)
            dispHalo.lineStyle(outlineW, activeCol, outlineA);
            dispHalo.drawCircle(0, 0, haloR);

            // Painted progress ring: segments keep their historical color forever.
            const prog01 = (DISP && typeof DISP.progress01 === 'number') ? clamp(DISP.progress01, 0, 1) : 0;
            if (prog01 > 0) {
              const arcW = Math.max(3, baseW * 0.92);
              const start = (DISP && typeof DISP.startAngleRad === 'number') ? DISP.startAngleRad : (Math.PI / 2);
              const dirSign = (DISP && typeof DISP.dirSign === 'number') ? (DISP.dirSign < 0 ? -1 : 1) : 1;
              const anti = (dirSign < 0);

              const cG = (typeof R.DISP_TENSION_GREEN === 'number') ? R.DISP_TENSION_GREEN : 0x00ff66;
              const cY = (typeof R.DISP_TENSION_YELLOW === 'number') ? R.DISP_TENSION_YELLOW : 0xfff000;
              const cR = (typeof R.DISP_TENSION_RED === 'number') ? R.DISP_TENSION_RED : 0xff0044;
              const alpha = (typeof R.DISP_ACTIVE_FILL_ALPHA === 'number') ? R.DISP_ACTIVE_FILL_ALPHA : 1.0;

              const isDiscrete = !!(DISP && DISP.isDiscrete);
              function segColor(val) {
                if (isDiscrete) {
                  // val is 0/1/2 (low/med/high)
                  if (val >= 1.5) return cR;
                  if (val >= 0.5) return cY;
                  return cG;
                }
                // val is intensity01 (0..1)
                const x = clamp(val, 0, 1);
                if (x <= 0.5) return mixRgb(cG, cY, x / 0.5);
                return mixRgb(cY, cR, (x - 0.5) / 0.5);
              }

              // Draw accumulated segments (immutable history)
              const n = (DISP && typeof DISP.segN === 'number') ? (DISP.segN | 0) : 0;
              const p0 = DISP && DISP.segP0;
              const p1 = DISP && DISP.segP1;
              const pv = DISP && DISP.segVal;
              if (n > 0 && p0 && p1 && pv) {
                const twoPi = Math.PI * 2;
                for (let si = 0; si < n; si++) {
                  const a0 = start + dirSign * (twoPi * p0[si]);
                  const a1 = start + dirSign * (twoPi * p1[si]);
                  const col = segColor(pv[si]);
                  dispHalo.lineStyle(arcW, col, alpha);
                  dispHalo.arc(0, 0, haloR, a0, a1, anti);
                }
              }

              // Head glow: rides at leading edge; color tracks *current* intensity
              const totalLen = (Math.PI * 2) * prog01;
              const bell = Math.sin(Math.PI * prog01);
              const glowA = clamp(bell, 0, 1) * headGlowAlphaMax * (0.35 + 0.65 * clamp(dispIntensity, 0, 1));
              if (glowA > 0.01) {
                const colNow = segColor(isDiscrete ? ((DISP && DISP.phaseLevel === 'high') ? 2 : ((DISP && DISP.phaseLevel === 'med') ? 1 : 0)) : dispIntensity);
                const headAng = start + dirSign * totalLen;
                const span = (headGlowSpanDeg * Math.PI) / 180;
                const g0 = headAng - span * 0.5;
                const g1 = headAng + span * 0.5;
                dispHalo.lineStyle(arcW * headGlowWScale, colNow, glowA);
                dispHalo.arc(0, 0, haloR, g0, g1, false);
              }
            }
          }
        }
      }

      // Rotating spin visual (below label)
      spinG.position.set(cx, cy);
      spinG.clear();
      // Standardized spin range is -100..100; normalize to -1..1 for visuals.
      const sRaw = clamp((SIM.wellsS[i] || 0), Smin, Smax);
      const sNorm = clamp(sRaw / Math.max(1e-6, Math.abs(Smax)), -1, 1);
      const sEff = (Math.abs(sNorm) < MVP_SPIN_DEADZONE) ? 0 : sNorm;
      drawSpinIndicator(spinG, r, sEff, tNow);
  
      const omega = sEff * MVP_MAX_OMEGA;
      if (omega !== 0 && dt > 0) {
        spinG.rotation = (spinG.rotation || 0) + omega * dt;
        const twoPi = Math.PI * 2;
        if (spinG.rotation > twoPi || spinG.rotation < -twoPi) spinG.rotation = spinG.rotation % twoPi;
      }
  
      // Ghost Target preview removed: wells should only show actual applied state.
      if (ghostG && ghostSpinG) {
        ghostG.position.set(cx, cy);
        ghostSpinG.position.set(cx, cy);
        ghostG.rotation = 0;
        ghostSpinG.rotation = 0;
        ghostG.clear();
        ghostSpinG.clear();
        ghostG.visible = false;
        ghostSpinG.visible = false;
      }
  
      // Name label inside the well (static; does not rotate)
      name.text = MVP_WELL_NAME[hue] || '';
      const fsName = clamp(Math.round(r * R.NAME_FONT_SCALE), R.NAME_FONT_MIN, R.NAME_FONT_MAX);
      if (name.style && name.style.fontSize !== fsName) name.style.fontSize = fsName;
      if (name.style && name.style.wordWrapWidth !== Math.max(R.NAME_WORDWRAP_MIN, Math.round(r * R.NAME_WORDWRAP_SCALE))) {
        name.style.wordWrapWidth = Math.max(R.NAME_WORDWRAP_MIN, Math.round(r * R.NAME_WORDWRAP_SCALE));
      }
      name.position.set(cx, cy);
  
      // Under-well test labels: Amount + Spin (Spin colored)
      const aVal = Math.round(SIM.wellsA[i] || 0);
      const sVal = (SIM.wellsS[i] || 0);
  
      amountLabel.text = `A: ${aVal}`;
      amountLabel.style.fontSize = Math.max(R.LABEL_FONT_MIN, Math.min(R.LABEL_FONT_MAX, Math.floor(r * R.LABEL_FONT_SCALE)));
  
      const sInt = Math.round(sVal);
      spinText.text = `S: ${(sInt >= 0 ? '+' : '')}${sInt}`;
      spinText.style.fontSize = Math.max(R.LABEL_FONT_MIN, Math.min(R.LABEL_FONT_MAX, Math.floor(r * R.LABEL_FONT_SCALE)));
      // Color by sign: green (positive), red (negative), neutral (zero)
      if (spinText.style) {
        if (sInt > 0) spinText.style.fill = R.SPIN_POS_COLOR;
        else if (sInt < 0) spinText.style.fill = R.SPIN_NEG_COLOR;
        else spinText.style.fill = R.SPIN_ZERO_COLOR;
      }
  
      // Place labels with special-case planes for top/bottom wells to avoid psyche overlap.
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
  
      // Default: amount slightly outward; spin below the well.
      let aX = cx + ux * (r + R.LABEL_OUTWARD_PAD);
      let aY = cy + uy * (r + R.LABEL_OUTWARD_PAD);
      let sX = cx;
      // Tighten spin spacing for mid wells (still readable, never touching rim)
      const midSpinGap = Math.max(R.MID_SPIN_GAP_MIN, Math.round(r * R.MID_SPIN_GAP_SCALE));
      let sY = cy + r + midSpinGap;
  
      // Vitality (top / red / index 0): put Amount (left) + Spin (right) on a shared top plane,
      // aligned to the top of the current well, with text top edge not above the well top.
      if (i === 0) {
        const topPlaneY = cy - r;
        const hA = amountLabel.height || 0;
        const hS = spinText.height || 0;
        const yCenter = topPlaneY + Math.max(hA, hS) * 0.5; // top edge flush to well top
        // Push labels outward so they never overlap the well circle.
        const gap = Math.max(R.PLANE_GAP_MIN, Math.round(r * R.PLANE_GAP_SCALE));
        const halfW = Math.max(amountLabel.width || 0, spinText.width || 0) * 0.5;
        const xOff = Math.max(R.PLANE_XOFF_MIN, r + halfW + gap);
        aX = cx - xOff;
        sX = cx + xOff;
        aY = yCenter;
        sY = yCenter;
      }
  
      // Insight (bottom / green / index 3): mirror with a shared bottom plane aligned to
      // the bottom of the Insight well at Amount=100 (max radius).
      if (i === 3) {
        const bottomPlaneY = cy + (geom.wellMaxR || r);
        const hA = amountLabel.height || 0;
        const hS = spinText.height || 0;
        const yCenter = bottomPlaneY - Math.max(hA, hS) * 0.5; // bottom edge flush to plane
        // Push labels outward so they never overlap the well circle.
        const gap = Math.max(R.PLANE_GAP_MIN, Math.round(r * R.PLANE_GAP_SCALE));
        const halfW = Math.max(amountLabel.width || 0, spinText.width || 0) * 0.5;
        const xOff = Math.max(R.PLANE_XOFF_MIN, r + halfW + gap);
        aX = cx - xOff;
        sX = cx + xOff;
        aY = yCenter;
        sY = yCenter;
      }
  
      amountLabel.position.set(aX, aY);
      spinText.position.set(sX, sY);
  
    }
  }
  
  // Expose for core loop
  EC.updateMvpBoardView = updateMvpBoardView;
})();

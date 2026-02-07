// Emotioncraft render_wells_init.js — MVP wells PIXI object creation (Chunk 3)
(() => {
  const EC = (window.EC = window.EC || {});
  const { Container, Graphics, Text } = PIXI;

  EC.RENDER_WELLS_INIT = EC.RENDER_WELLS_INIT || {};

  // MVP 6-well ring (Chunk 4)
  // -----------------------------
  const MVP_WELL_COLORS = {
    red:    0xff4650,
    purple: 0xa46bff,
    blue:   0x5a96ff,
    green:  0x45d07a,
    yellow: 0xffdc55,
    orange: 0xff8f3d,
  };
  const MVP_WELL_LABEL = { red:'R', purple:'P', blue:'B', green:'G', yellow:'Y', orange:'O' };
  const MVP_WELL_NAME = {
    red: 'Vitality',
    yellow: 'Clarity',
    blue: 'Calm',
    purple: 'Resolve',
    green: 'Insight',
    orange: 'Direction',
  };
  
  function ensureMvpWellViews() {
    if (!EC.RENDER || !EC.RENDER.root) return;
    if (!EC.RENDER.mvpWellLayer) {
      const layer = new Container();
      layer.eventMode = 'passive';
      EC.RENDER.mvpWellLayer = layer;
      EC.RENDER.root.addChild(layer);
    }
    if (!EC.RENDER.mvpWells) {
      EC.RENDER.mvpWells = [];
      const hues = (EC.CONST && EC.CONST.HUES) || EC.HUES || ['red','purple','blue','green','yellow','orange'];
      for (let i = 0; i < 6; i++) {
        const hue = hues[i];
  
        const g = new Graphics();
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointertap', () => {
          if (!EC.SIM) return;
          EC.SIM.selectedWellIndex = i;
        });
  
        // Rotating spin visual (rotates, label does not)
        const spinG = new Graphics();
        spinG.eventMode = 'none';
  
        // Ghost preview overlay (target state; only visible for selected well)
        const ghostG = new Graphics();
        ghostG.eventMode = 'none';
        const ghostSpinG = new Graphics();
        ghostSpinG.eventMode = 'none';
  
        // Name label inside the well
        const name = new Text(MVP_WELL_NAME[hue] || '', {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: 14,
          fontWeight: '700',
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 4,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 120,
        });
        name.anchor.set(0.5);
        name.eventMode = 'none';
  
        // Under-well debug label (A/S). Keep for testing.
        const amountLabel = new Text('', {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: 12,
          fill: 0xffffff,
          align: 'center',
        });
        // NOTE: typo fix — was `label` (undefined), should be `amountLabel`.
        amountLabel.anchor.set(0.5);
        amountLabel.eventMode = 'none';
  
        // Extra (unused) spin readout for future
        const spinText = new Text('', {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: 11,
          fill: 0xffffff,
          align: 'center',
        });
        spinText.anchor.set(0.5);
        spinText.eventMode = 'none';
  
        // Disposition FX (telegraph/active marker) — created once, updated in render_wells_update
        const dispHalo = new Graphics();
        dispHalo.eventMode = 'none';
        dispHalo.visible = false;
        // IMPORTANT: Keep halo fill colors saturated.
        // Additive blending tends to wash neon colors toward white on bright overlaps,
        // so we force normal blending for the disposition halo.
        try {
          if (typeof PIXI !== 'undefined' && PIXI.BLEND_MODES) {
            dispHalo.blendMode = PIXI.BLEND_MODES.NORMAL;
          }
        } catch (e) {
          // ignore
        }

        EC.RENDER.mvpWellLayer.addChild(g);
        EC.RENDER.mvpWellLayer.addChild(spinG);
        EC.RENDER.mvpWellLayer.addChild(dispHalo);
        EC.RENDER.mvpWellLayer.addChild(ghostG);
        EC.RENDER.mvpWellLayer.addChild(ghostSpinG);
        EC.RENDER.mvpWellLayer.addChild(name);
        EC.RENDER.mvpWellLayer.addChild(amountLabel);
        EC.RENDER.mvpWellLayer.addChild(spinText);
  
        EC.RENDER.mvpWells.push({ g, spinG, dispHalo, ghostG, ghostSpinG, name, amountLabel, spinText });
      }
    }
  }
  // Module exports
  EC.RENDER_WELLS_INIT.MVP_WELL_COLORS = MVP_WELL_COLORS;
  EC.RENDER_WELLS_INIT.MVP_WELL_LABEL = MVP_WELL_LABEL;
  EC.RENDER_WELLS_INIT.MVP_WELL_NAME = MVP_WELL_NAME;
  EC.RENDER_WELLS_INIT.ensure = ensureMvpWellViews;
  // Layout rebuild hooks (no-ops for now; kept for future safety)
  EC.RENDER_WELLS_INIT.rebuildLayoutIfNeeded = EC.RENDER_WELLS_INIT.rebuildLayoutIfNeeded || function() {};
  EC.RENDER_WELLS_INIT.resetViewsIfNeeded = EC.RENDER_WELLS_INIT.resetViewsIfNeeded || function() {};
})();

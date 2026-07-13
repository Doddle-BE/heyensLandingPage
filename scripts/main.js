// Main — scene dispatch on ?scene= (wasps default; starfield preserved), then
// owns the per-scene RAF loop, perf fallback, resize, visibilitychange.
// COORDINATE CONTRACT: all logic in CSS pixel space; DPR is render-only.

(function () {
  // ---- Scene dispatch (Option model) -------------------------------------
  // ?scene= selects the scene; wasps is the default. The static <head> carries
  // the wasp identity; the starfield branch swaps the chrome back to the sky's.
  const activeScene = new URLSearchParams(location.search).get('scene') === 'starfield' ? 'starfield' : 'wasps';

  if (activeScene === 'wasps') {
    const waspCanvas = document.getElementById('starfield');
    const wHint = document.getElementById('hint');
    if (wHint && matchMedia('(pointer: coarse)').matches) wHint.textContent = 'swipe to part them · tap to scatter';

    // Reduced motion: one settled still frame (no loop), mirroring the sky.
    // CSS overlay remains the no-JS fallback.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const wStill = (typeof waspCreate === 'function') ? waspCreate(waspCanvas) : null;
      if (!wStill) return;
      document.body.classList.add('gl-still');
      let wTicks = 0;
      (function drawWaspStill() {
        wStill.resize(); wStill.renderStill();
        if (++wTicks < 12) requestAnimationFrame(drawWaspStill);
      })();
      let wStillTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(wStillTimer);
        wStillTimer = setTimeout(() => { wStill.resize(); wStill.renderStill(); }, 150);
      });
      return;
    }

    const wasp = (typeof waspCreate === 'function') ? waspCreate(waspCanvas) : null;
    if (!wasp) return;                       // no 2D context: CSS overlay remains

    let wHintTimer = null;
    inputBind(() => { if (wHint && !wHintTimer) wHintTimer = setTimeout(() => wHint.classList.add('fade'), 2600); });

    // Loop mirrors the sky's glLoop: 60fps active / 30fps unfocused, adaptive
    // slow-frame degrade, DPR-change detection, resize debounce, visibility.
    let wPrev = null, wLastRender = 0, wLastInput = performance.now(), wDpr = window.devicePixelRatio || 1;
    let wSlow = 0, wCanDegrade = true, wEma = 16.7;
    const W_ACTIVE = 1000 / 60, W_BG = 1000 / 30;
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) {
      window.addEventListener(ev, () => { wLastInput = performance.now(); }, { passive: true });
    }
    function waspLoop(t) {
      requestAnimationFrame(waspLoop);
      const focused = document.hasFocus() || performance.now() - wLastInput < 10000;
      const targetMs = focused ? W_ACTIVE : W_BG;
      if (t - wLastRender < targetMs - 1) return;
      wLastRender = Math.max(wLastRender + targetMs, t - targetMs);
      if (wPrev != null) {
        const dt = t - wPrev;
        wEma += (Math.min(dt, 100) - wEma) * 0.05;
        const slowThreshold = Math.max(SLOW_FRAME_THRESHOLD_MS, wEma * 1.7);
        if (wCanDegrade && !document.hidden) {
          if (dt > slowThreshold) { if (++wSlow >= 20) { wCanDegrade = wasp.degrade(); wSlow = 0; } }
          else if (wSlow > 0) wSlow--;
        }
      }
      wPrev = t;
      const dprNow = window.devicePixelRatio || 1;
      if (dprNow !== wDpr) { wDpr = dprNow; wasp.resize(); }
      mouseDecay();
      wasp.frame(t, mouse, pulses, look);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { wPrev = null; wLastRender = 0; } });
    let wResizeTimer = null;
    window.addEventListener('resize', () => { clearTimeout(wResizeTimer); wResizeTimer = setTimeout(() => wasp.resize(), 150); });
    requestAnimationFrame(waspLoop);
    return;
  }

  // ---- Starfield: swap chrome back to the star identity, then fall through
  // to the existing (unchanged) sky renderer below. -----------------------
  document.title = '\u2726';
  { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', '#05060c'); }
  { const f = document.querySelector('link[rel="icon"]'); if (f) f.setAttribute('href', "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='6' fill='%23FFDCA0'/></svg>"); }
  { const h = document.getElementById('hint'); if (h) h.textContent = 'drag to look around \u00b7 click to make a wish'; }
  const canvas = document.getElementById('starfield');

  // Reduced motion: render ONE settled GL frame (no loop, no choreography)
  // instead of the CSS box-shadow stars. CSS overlay remains the no-GL fallback.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const still = (typeof sfglCreate === 'function') ? sfglCreate(canvas) : null;
    if (!still || !still.renderStill) return;
    document.body.classList.add('gl-still');
    // Present-race workaround: a single draw right after the canvas becomes
    // visible can land before its first composite and show black. Re-draw the
    // identical frame (fixed internal timestamp) for a few rAF ticks, then stop.
    let stillTicks = 0;
    function drawStill() {
      still.resize();
      still.renderStill();
      if (++stillTicks < 12) requestAnimationFrame(drawStill);
    }
    requestAnimationFrame(drawStill);
    let stillResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(stillResizeTimer);
      stillResizeTimer = setTimeout(() => {
        still.resize();
        still.renderStill();
      }, 150);
    });
    return;
  }

  const hintEl = document.getElementById('hint');
  if (hintEl && matchMedia('(pointer: coarse)').matches) {
    hintEl.textContent = 'swipe to look around · tap to make a wish';
  }
  let hintFadeTimer = null;
  function scheduleHintFade() {
    if (!hintEl || hintFadeTimer) return;
    hintFadeTimer = setTimeout(() => hintEl.classList.add('fade'), 2600);
  }

  // ------------------------------------------------------------ WebGL path
  const sky = (typeof sfglCreate === 'function') ? sfglCreate(canvas) : null;
  if (sky) {
    inputBind(scheduleHintFade);

    let prevTimestamp = null;
    let slowFrameCount = 0;
    let frameEma = 16.7;            // rolling rendered-frame-time estimate
    let canDegrade = true;
    let lastDpr = window.devicePixelRatio || 1;

    // Frame cap: 60fps active (120Hz+ buys heat, not beauty), 30fps when the
    // page is visible but nobody is interacting with an unfocused window.
    const FRAME_MS_ACTIVE = 1000 / 60;
    const FRAME_MS_BG = 1000 / 30;
    let lastRender = 0;
    let lastInputMs = performance.now();
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) {
      window.addEventListener(ev, () => { lastInputMs = performance.now(); }, { passive: true });
    }

    function glLoop(t) {
      requestAnimationFrame(glLoop);
      const focused = document.hasFocus() || performance.now() - lastInputMs < 10000;
      const targetMs = focused ? FRAME_MS_ACTIVE : FRAME_MS_BG;
      if (t - lastRender < targetMs - 1) return;
      lastRender = Math.max(lastRender + targetMs, t - targetMs);   // accumulate, clamp catch-up

      if (!prevTimestamp) {
        prevTimestamp = t;
        return;
      }
      const dt = t - prevTimestamp;
      prevTimestamp = t;

      // Adaptive slow-frame detection: a fixed ms threshold would ratchet
      // quality down forever on 30Hz/power-saver displays. Degrade only when
      // frames run well past the display's own rolling cadence.
      frameEma += (Math.min(dt, 100) - frameEma) * 0.05;
      const slowThreshold = Math.max(SLOW_FRAME_THRESHOLD_MS, frameEma * 1.7);
      if (canDegrade && !document.hidden) {
        if (dt > slowThreshold) {
          if (++slowFrameCount >= 20) {
            canDegrade = sky.degrade();
            slowFrameCount = 0;
          }
        } else if (slowFrameCount > 0) {
          slowFrameCount--;
        }
      }

      // Monitor swap can change DPR without a resize event.
      const dprNow = window.devicePixelRatio || 1;
      if (dprNow !== lastDpr) {
        lastDpr = dprNow;
        sky.resize();
      }

      mouseDecay();
      sky.frame(t, mouse, pulses, look);
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        prevTimestamp = null;
        lastRender = 0;             // render immediately on return
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => sky.resize(), 150);
    });

    requestAnimationFrame(glLoop);
    return;
  }

  // ----------------------------------------------------- Legacy 2D fallback
  // Re-query: a failed GL init swaps the claimed canvas for a fresh clone.
  const canvas2d = document.getElementById('starfield');
  const ctx = canvas2d.getContext('2d', { alpha: false });
  if (!ctx) {
    document.body.style.background = '#05060c';
    return;
  }

  let prevTimestamp = null;
  let slowFrameCount = 0;
  let cleanFrameCount = 0;
  let isReduced = false;
  let currentDensity = DENSITY;

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas2d.clientWidth || window.innerWidth;
    const h = canvas2d.clientHeight || window.innerHeight;
    canvas2d.width  = Math.round(w * dpr);
    canvas2d.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function init() {
    const { w, h } = setupCanvas();
    sfInit(w, h, currentDensity);
    inputBind(scheduleHintFade);
  }

  function loop(t) {
    // First-frame skip — prevents dt explosion on startup and after tab return
    if (!prevTimestamp) {
      prevTimestamp = t;
      requestAnimationFrame(loop);
      return;
    }

    const dt = Math.min(t - prevTimestamp, 33);
    prevTimestamp = t;

    if (dt > SLOW_FRAME_THRESHOLD_MS) {
      slowFrameCount++;
      cleanFrameCount = 0;
    } else {
      cleanFrameCount++;
      slowFrameCount = 0;
    }

    // Halve density after 3 slow frames, restore after 60 clean frames
    if (slowFrameCount >= 3 && !isReduced) {
      currentDensity = FALLBACK_DENSITY;
      sfInit(canvas2d.clientWidth, canvas2d.clientHeight, currentDensity);
      isReduced = true;
      slowFrameCount = 0;
      cleanFrameCount = 0;
    } else if (cleanFrameCount >= 60 && isReduced) {
      currentDensity = DENSITY;
      sfInit(canvas2d.clientWidth, canvas2d.clientHeight, currentDensity);
      isReduced = false;
      cleanFrameCount = 0;
    }

    mouseDecay();
    look.dx = 0; look.dy = 0; look.zoom = 0; look.pinch = 1;   // free-look has no 2D meaning
    sfUpdate(mouse, pulses, dt);
    sfRender(ctx, t, mouse, pulses);

    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) prevTimestamp = null;
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const { w, h } = setupCanvas();
      sfResize(w, h);
    }, 100);
  });

  init();
  requestAnimationFrame(loop);
})();

// Main — scene dispatch on ?scene= (wasps default; starfield preserved), then
// owns the per-scene RAF loop, perf fallback, resize, visibilitychange.
// COORDINATE CONTRACT: all logic in CSS pixel space; DPR is render-only.

(function () {
  // ---- Scene dispatch (Option model) -------------------------------------
  // ?scene= selects the scene; wasps is the default. The static <head> carries
  // the wasp identity; the starfield branch swaps the chrome back to the sky's.
  const activeScene = new URLSearchParams(location.search).get('scene') === 'starfield' ? 'starfield' : 'wasps';

  // ---- Failure reporting --------------------------------------------------
  // A dead scene must never look like an intentionally empty page: say why in
  // the console and paint the scene's own backdrop so the canvas isn't a void.
  const FALLBACK_BG = { wasps: '#cfe4f5', starfield: '#05060c' };
  function sceneFailed(scene, reason, err) {
    if (err !== undefined) console.error(`main: ${scene} scene unavailable — ${reason}`, err);
    else console.error(`main: ${scene} scene unavailable — ${reason}`);
    // The canvas carries its own background and covers the viewport, so the
    // body colour alone would stay hidden behind it.
    document.body.style.background = FALLBACK_BG[scene];
    const c = document.getElementById('starfield');
    if (c) c.style.background = FALLBACK_BG[scene];
  }

  // Guards a renderer call. Without this a throw inside frame() repeats on
  // every rAF forever; returns false so the caller can stop the loop.
  function guard(scene, reason, fn) {
    try {
      fn();
      return true;
    } catch (err) {
      sceneFailed(scene, reason, err);
      return false;
    }
  }

  // Builds a renderer without letting an init throw take down the page.
  // Returns null both for "factory missing" and "factory failed"; callers that
  // have a fallback path (the sky's 2D field) decide what null means.
  function createScene(factory, label) {
    if (typeof factory !== 'function') {
      console.error(`main: ${label} is not loaded`);
      return null;
    }
    try {
      return factory(document.getElementById('starfield'));
    } catch (err) {
      console.error(`main: ${label} threw during init —`, err);
      return null;
    }
  }

  // input.js and config.js are plain globals: if either script fails to load,
  // report that instead of dying on an opaque ReferenceError mid-frame.
  if (typeof inputBind !== 'function' || typeof mouseDecay !== 'function' ||
      typeof SLOW_FRAME_THRESHOLD_MS !== 'number') {
    sceneFailed(activeScene, 'input.js / config.js failed to load');
    return;
  }

  if (activeScene === 'wasps') {
    const wHint = document.getElementById('hint');
    if (wHint && matchMedia('(pointer: coarse)').matches) wHint.textContent = 'swipe to part them · tap to scatter';

    // Reduced motion: one settled still frame (no loop), mirroring the sky.
    // CSS overlay remains the no-JS fallback.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const wStill = createScene(typeof waspCreate === 'function' ? waspCreate : null, 'waspCreate');
      if (!wStill) {                         // no 2D context: CSS overlay remains
        sceneFailed('wasps', 'still renderer could not be created');
        return;
      }
      document.body.classList.add('gl-still');
      let wTicks = 0;
      (function drawWaspStill() {
        if (!guard('wasps', 'still frame failed', () => { wStill.resize(); wStill.renderStill(); })) return;
        if (++wTicks < 12) requestAnimationFrame(drawWaspStill);
      })();
      let wStillTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(wStillTimer);
        wStillTimer = setTimeout(() => {
          guard('wasps', 'still frame failed after resize', () => { wStill.resize(); wStill.renderStill(); });
        }, 150);
      });
      return;
    }

    const wasp = createScene(typeof waspCreate === 'function' ? waspCreate : null, 'waspCreate');
    if (!wasp) {                             // no 2D context: CSS overlay remains
      sceneFailed('wasps', 'renderer could not be created');
      return;
    }

    let wHintTimer = null;
    inputBind(() => { if (wHint && !wHintTimer) wHintTimer = setTimeout(() => wHint.classList.add('fade'), 2600); });

    // Loop mirrors the sky's glLoop: 60fps active / 30fps unfocused, adaptive
    // slow-frame degrade, DPR-change detection, resize debounce, visibility.
    let wPrev = null, wLastRender = 0, wLastInput = performance.now(), wDpr = window.devicePixelRatio || 1;
    let wSlow = 0, wCanDegrade = true, wEma = 16.7, wRunning = true;
    const W_ACTIVE = 1000 / 60, W_BG = 1000 / 30;
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) {
      window.addEventListener(ev, () => { wLastInput = performance.now(); }, { passive: true });
    }
    function waspLoop(t) {
      if (!wRunning) return;
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
          if (dt > slowThreshold) {
            if (++wSlow >= 20) {
              wSlow = 0;
              // A failed degrade must not keep re-firing: treat it as "no more
              // headroom" and stop asking.
              if (!guard('wasps', 'degrade failed', () => { wCanDegrade = wasp.degrade(); })) wCanDegrade = false;
            }
          }
          else if (wSlow > 0) wSlow--;
        }
      }
      wPrev = t;
      const dprNow = window.devicePixelRatio || 1;
      if (dprNow !== wDpr) { wDpr = dprNow; wRunning = guard('wasps', 'resize failed', () => wasp.resize()); }
      if (!wRunning) return;
      mouseDecay();
      wRunning = guard('wasps', 'renderer threw while drawing a frame', () => wasp.frame(t, mouse, pulses, look));
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { wPrev = null; wLastRender = 0; } });
    let wResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(wResizeTimer);
      wResizeTimer = setTimeout(() => { if (wRunning) wRunning = guard('wasps', 'resize failed', () => wasp.resize()); }, 150);
    });
    requestAnimationFrame(waspLoop);
    return;
  }

  // ---- Starfield: swap chrome back to the star identity, then fall through
  // to the existing (unchanged) sky renderer below. -----------------------
  document.title = '\u2726';
  { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', '#05060c'); }
  { const f = document.querySelector('link[rel="icon"]'); if (f) f.setAttribute('href', "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='6' fill='%23FFDCA0'/></svg>"); }
  { const h = document.getElementById('hint'); if (h) h.textContent = 'drag to look around \u00b7 click to make a wish'; }

  // Reduced motion: render ONE settled GL frame (no loop, no choreography)
  // instead of the CSS box-shadow stars. CSS overlay remains the no-GL fallback.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const still = createScene(typeof sfglCreate === 'function' ? sfglCreate : null, 'sfglCreate');
    if (!still || !still.renderStill) {      // no WebGL2: CSS overlay remains
      sceneFailed('starfield', 'still renderer could not be created');
      return;
    }
    document.body.classList.add('gl-still');
    // Present-race workaround: a single draw right after the canvas becomes
    // visible can land before its first composite and show black. Re-draw the
    // identical frame (fixed internal timestamp) for a few rAF ticks, then stop.
    let stillTicks = 0;
    function drawStill() {
      if (!guard('starfield', 'still frame failed', () => { still.resize(); still.renderStill(); })) return;
      if (++stillTicks < 12) requestAnimationFrame(drawStill);
    }
    requestAnimationFrame(drawStill);
    let stillResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(stillResizeTimer);
      stillResizeTimer = setTimeout(() => {
        guard('starfield', 'still frame failed after resize', () => { still.resize(); still.renderStill(); });
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
  // A null sky is expected on machines without WebGL2 — the 2D field below is
  // the designed fallback, and createScene has already logged the reason.
  const sky = createScene(typeof sfglCreate === 'function' ? sfglCreate : null, 'sfglCreate');
  if (sky) {
    inputBind(scheduleHintFade);

    let prevTimestamp = null;
    let slowFrameCount = 0;
    let frameEma = 16.7;            // rolling rendered-frame-time estimate
    let canDegrade = true;
    let running = true;
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
      if (!running) return;
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
            slowFrameCount = 0;
            // A failed degrade must not keep re-firing: treat it as "no more
            // headroom" and stop asking.
            if (!guard('starfield', 'degrade failed', () => { canDegrade = sky.degrade(); })) canDegrade = false;
          }
        } else if (slowFrameCount > 0) {
          slowFrameCount--;
        }
      }

      // Monitor swap can change DPR without a resize event.
      const dprNow = window.devicePixelRatio || 1;
      if (dprNow !== lastDpr) {
        lastDpr = dprNow;
        running = guard('starfield', 'resize failed', () => sky.resize());
        if (!running) return;
      }

      mouseDecay();
      running = guard('starfield', 'renderer threw while drawing a frame', () => sky.frame(t, mouse, pulses, look));
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
      resizeTimer = setTimeout(() => { if (running) running = guard('starfield', 'resize failed', () => sky.resize()); }, 150);
    });

    requestAnimationFrame(glLoop);
    return;
  }

  // ----------------------------------------------------- Legacy 2D fallback
  // Re-query: a failed GL init swaps the claimed canvas for a fresh clone.
  const canvas2d = document.getElementById('starfield');
  let ctx = null;
  try {
    ctx = canvas2d.getContext('2d', { alpha: false });
  } catch (err) {
    console.error('main: 2D context request threw —', err);
  }
  if (!ctx) {
    sceneFailed('starfield', 'no 2D canvas context');
    return;
  }
  let running2d = true;

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
    if (!running2d) return;
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
    running2d = guard('starfield', '2D field threw while drawing a frame', () => {
      sfUpdate(mouse, pulses, dt);
      sfRender(ctx, t, mouse, pulses);
    });
    if (!running2d) return;

    requestAnimationFrame(loop);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) prevTimestamp = null;
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      guard('starfield', '2D resize failed', () => {
        const { w, h } = setupCanvas();
        sfResize(w, h);
      });
    }, 100);
  });

  if (!guard('starfield', '2D field failed to initialise', init)) return;
  requestAnimationFrame(loop);
})();

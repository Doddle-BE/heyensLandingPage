// Main — scene dispatch on ?scene= (wasps default; starfield preserved): loads
// only the active scene's renderer, then drives it through one shared RAF loop
// (perf fallback, resize, visibilitychange).
// COORDINATE CONTRACT: all logic in CSS pixel space; DPR is render-only.

(function () {
  // ---- Scene dispatch (Option model) -------------------------------------
  // ?scene= selects the scene; wasps is the default. The static <head> carries
  // the wasp identity; the starfield branch swaps the chrome back to the sky's.
  const requested = (new URLSearchParams(location.search).get('scene') || '').trim().toLowerCase();
  const activeScene = requested === 'starfield' ? 'starfield' : 'wasps';
  const SCENE_SRC = {
    wasps: ['scripts/wasps.js'],
    starfield: ['scripts/starfield.js', 'scripts/starfield-gl.js'],
  };

  // Drives the per-scene palette (page background, hint colour, cursor) before
  // anything paints, so the sky's chrome never flashes under the wasp scene.
  document.body.classList.add(`scene-${activeScene}`);

  loadScripts(SCENE_SRC[activeScene])
    .then(activeScene === 'wasps' ? runWasps : runStarfield)
    .catch(() => { /* scene script unreachable: the CSS overlay stands in */ });

  // The scene renderers are plain globals (no build step), so they are appended
  // as classic scripts and awaited rather than imported.
  function loadScripts(srcs) {
    return Promise.all(srcs.map((src) => new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error(src));
      document.head.appendChild(el);
    })));
  }

  // ---- Shared scene loop --------------------------------------------------
  // Both scenes expose { frame, resize, degrade }, so they share one policy:
  // 60fps active / 30fps unfocused, adaptive slow-frame degrade, DPR-change
  // detection, debounced resize, visibility reset.
  function runSceneLoop(scene) {
    const FRAME_MS_ACTIVE = 1000 / 60;
    const FRAME_MS_BG = 1000 / 30;
    let prevTimestamp = null;
    let lastRender = 0;
    let lastInputMs = performance.now();
    let slowFrameCount = 0;
    let frameEma = 16.7;            // rolling rendered-frame-time estimate
    let canDegrade = true;
    let lastDpr = window.devicePixelRatio || 1;

    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) {
      window.addEventListener(ev, () => { lastInputMs = performance.now(); }, { passive: true });
    }

    function loop(t) {
      requestAnimationFrame(loop);
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
            canDegrade = scene.degrade();
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
        scene.resize();
      }

      mouseDecay();
      scene.frame(t, mouse, pulses, look);
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
      resizeTimer = setTimeout(() => scene.resize(), 150);
    });

    requestAnimationFrame(loop);
  }

  // Present-race workaround shared by both still frames: a single draw right
  // after the canvas becomes visible can land before its first composite and
  // show black. Re-draw the identical frame for a few rAF ticks, then stop.
  function runStill(scene) {
    document.body.classList.add('gl-still');
    let ticks = 0;
    (function drawStill() {
      scene.resize();
      scene.renderStill();
      if (++ticks < 12) requestAnimationFrame(drawStill);
    })();
    let stillResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(stillResizeTimer);
      stillResizeTimer = setTimeout(() => { scene.resize(); scene.renderStill(); }, 150);
    });
  }

  function hintFader(el) {
    let timer = null;
    return () => {
      if (!el || timer) return;
      timer = setTimeout(() => el.classList.add('fade'), 2600);
    };
  }

  // ---- Wasps --------------------------------------------------------------
  function runWasps() {
    const canvas = document.getElementById('starfield');
    const hintEl = document.getElementById('hint');
    if (hintEl && matchMedia('(pointer: coarse)').matches) {
      hintEl.textContent = 'swipe to part them · tap to scatter';
    }

    const wasps = (typeof waspCreate === 'function') ? waspCreate(canvas) : null;
    if (!wasps) return;                      // no 2D context: CSS overlay remains

    // Reduced motion: one settled still frame (no loop), mirroring the sky.
    // CSS overlay remains the no-JS fallback.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runStill(wasps);
      return;
    }

    inputBind(hintFader(hintEl));
    runSceneLoop(wasps);
  }

  // ---- Starfield ----------------------------------------------------------
  function runStarfield() {
    // Swap the chrome back to the star identity, then run the (unchanged) sky.
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
      runStill(still);
      return;
    }

    const hintEl = document.getElementById('hint');
    if (hintEl && matchMedia('(pointer: coarse)').matches) {
      hintEl.textContent = 'swipe to look around · tap to make a wish';
    }
    const scheduleHintFade = hintFader(hintEl);

    // ------------------------------------------------------------ WebGL path
    const sky = (typeof sfglCreate === 'function') ? sfglCreate(canvas) : null;
    if (sky) {
      inputBind(scheduleHintFade);
      runSceneLoop(sky);
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
  }
})();

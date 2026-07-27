// Test harness — loads the browser scripts into a vm context with a minimal
// DOM/window stub, mirroring how index.html loads them as classic <script>s.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts');

// A 2D context recorder: every call is captured so tests can assert on the
// draw sequence without a real canvas.
function createCtx2D() {
  const calls = [];
  const methods = [
    'fillRect', 'strokeRect', 'clearRect', 'beginPath', 'closePath', 'moveTo',
    'lineTo', 'arc', 'ellipse', 'stroke', 'fill', 'save', 'restore',
    'translate', 'rotate', 'scale', 'setTransform',
  ];
  const ctx = {
    calls,
    countOf(name) { return calls.filter((c) => c.name === name).length; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  for (const name of methods) {
    ctx[name] = (...args) => { calls.push({ name, args }); };
  }
  return ctx;
}

function createCanvas(ctx2d) {
  return {
    width: 0,
    height: 0,
    clientWidth: 800,
    clientHeight: 600,
    getContext: () => ctx2d,
  };
}

// Minimal EventTarget: tests dispatch through `emit`.
function createEventHub() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const l = listeners.get(type);
      if (l) listeners.set(type, l.filter((f) => f !== fn));
    },
    emit(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn(event);
    },
    hasListener(type) { return (listeners.get(type) || []).length > 0; },
  };
}

/**
 * @param {object} opts
 * @param {string[]} opts.scripts  script filenames to load, in order
 * @param {number}   opts.now      initial performance.now() value
 * @param {boolean}  opts.coarse   matchMedia('(pointer: coarse)') result
 */
function loadScripts(opts = {}) {
  const { scripts = [], now = 0, coarse = false } = opts;

  const ctx2d = createCtx2D();
  const canvas = createCanvas(ctx2d);
  const hub = createEventHub();
  const classList = new Set();
  const clock = { now };

  const document = {
    body: {
      classList: {
        add: (c) => classList.add(c),
        remove: (c) => classList.delete(c),
        contains: (c) => classList.has(c),
      },
      style: {},
    },
    hidden: false,
    hasFocus: () => true,
    getElementById: () => canvas,
    querySelector: () => null,
    addEventListener: hub.addEventListener,
    removeEventListener: hub.removeEventListener,
  };

  const sandbox = {
    Math,
    console,
    performance: { now: () => clock.now },
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
    matchMedia: (q) => ({ matches: coarse && q.includes('coarse') }),
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => {},
    document,
    location: { search: '' },
    URLSearchParams,
    addEventListener: hub.addEventListener,
    removeEventListener: hub.removeEventListener,
  };
  sandbox.window = sandbox;

  const context = vm.createContext(sandbox);
  for (const name of scripts) {
    const file = path.join(SCRIPTS_DIR, name);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }

  // Top-level `const`/`let` in a classic script land in the context's global
  // lexical scope, not on the global object — reach them by evaluating.
  const evaluate = (expr) => vm.runInContext(expr, context);

  return {
    context,
    evaluate,
    canvas,
    ctx2d,
    classList,
    clock,
    emit: hub.emit,
    hasListener: hub.hasListener,
    setNow(t) { clock.now = t; },
  };
}

module.exports = { loadScripts, createCtx2D, createCanvas };

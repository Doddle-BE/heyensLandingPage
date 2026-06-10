// Starfield tunables (2D canvas fallback).
// All coordinates in CSS pixel space.

// Defaults mirror the design's DEFAULTS block
const DENSITY       = 300;   // total stars
const CURSOR_REACH  = 340;   // px — stars inside this ring become graph candidates
const LINK_DIST     = 110;   // px — max pair distance that still draws a link
const DRIFT         = 0.22;  // 0..1 — how fast stars drift
const TWINKLE       = 0.28;  // 0..1 — alpha oscillation depth
const NODE_GLOW     = 0.40;  // 0..1 — additive halo strength on anchor stars
const USE_GRID      = true;  // spatial grid for O(N) candidate search

// Star seeding
const ANCHOR_PROB   = 0.08;  // ~8% of stars are bright anchor nodes
const BIG_STAR_PROB = 0.14;  // ~14% of stars are larger

// Cursor push (displaces star positions, not velocity — short-range nudge)
const PUSH_RADIUS   = 90;
const CURSOR_VEL_MAX = 40;   // mouse.vel is clamped to this for falloff math
const MOUSE_VEL_DECAY = 0.92;

// Click pulse
const PULSE_MAX_R   = 280;
const PULSE_LIFE_MS = 900;
const PULSE_RING_WIDTH = 30;
const PULSE_MAX_COUNT = 6;

// Perf fallback
const SLOW_FRAME_THRESHOLD_MS = 25;
const FALLBACK_DENSITY = 150;

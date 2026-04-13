// Layer configuration
const LAYER_COUNT = 3;
const STAR_COUNT = [300, 500, 800];
const FALLBACK_STAR_COUNT = [150, 250, 400];

// Depth / projection
const Z_NEAR = 1;
const Z_FAR = 1000;
const FOCAL_LENGTH = 300;

// Base radii per layer (larger = closer / brighter)
const BASE_RADIUS = [3.0, 1.8, 1.0];

// Cursor interaction
const INFLUENCE_RADIUS = 120;
const BASE_REPULSE = 2;
const MAX_CURSOR_VEL = 40;

// Supernova
const SUPERNOVA_IMPULSE = 8;
const MAX_STAR_VEL = 15;

// Performance fallback
const SLOW_FRAME_THRESHOLD_MS = 25; // ~1.5× at 60Hz

// Float32Array field layout — 12 fields per star (8 active + 4 reserved for Phase 2)
const FIELDS = 12;

// Active fields
const FIELD_X     = 0;
const FIELD_Y     = 1;
const FIELD_Z     = 2;
const FIELD_VX    = 3;
const FIELD_VY    = 4;
const FIELD_ALPHA = 5;
const FIELD_LAYER = 6;
const FIELD_PHASE = 7;

// Phase 2 — Clifford attractor sigil fields
const FIELD_TARGET_X = 8;
const FIELD_TARGET_Y = 9;
const FIELD_MODE     = 10;
const FIELD_TIMER    = 11;

// Sigil — Clifford attractor parameters
const SIGIL_IDLE_MS      = 4000;   // ms of no cursor movement before sigil forms
const SIGIL_STAR_COUNT   = 250;    // stars assigned to sigil
const SIGIL_SPRING_K     = 0.003;  // spring stiffness (per ms²)
const SIGIL_DAMPING      = 0.92;   // velocity damping per frame
const SIGIL_SETTLE_VEL   = 0.05;   // px/ms threshold to consider a star settled
const SIGIL_DISSOLVE_MS  = 1000;   // ms for dissolve drift back to normal
const SIGIL_BBOX_W       = 400;    // attractor bounding box width in CSS px
const SIGIL_BBOX_H       = 300;    // attractor bounding box height in CSS px

// Clifford attractor parameters — produces a dense asymmetric shape
const CLIFFORD_A = -1.4;
const CLIFFORD_B =  1.6;
const CLIFFORD_C =  1.0;
const CLIFFORD_D =  0.7;
const CLIFFORD_SAMPLES = 500; // pre-computed points

// Sigil state enum
const SIGIL_NORMAL    = 0;
const SIGIL_FORMING   = 1;
const SIGIL_FORMED    = 2;
const SIGIL_DISSOLVING = 3;
const SIGIL_DETONATING = 4;

// Base layer velocities (pixels/ms in screen space — applied during init)
const LAYER_BASE_VX = [0.01, 0.025, 0.05];
const LAYER_BASE_VY = [0.005, 0.012, 0.025];

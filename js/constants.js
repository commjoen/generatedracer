// Game constants

export const WORLD_W = 3000;
export const WORLD_H = 2000;

// Track
export const TRACK_WIDTH = 200;  // road width in world pixels
export const TRACK_BORDER = 18;  // curb width each side

// Car dimensions (length × width when facing right)
export const CAR_LENGTH = 52;
export const CAR_WIDTH  = 28;

// Race setup
export const NUM_LAPS    = 3;
export const NUM_AI      = 5;
export const MAX_PLAYERS = 6;

// Car colours (index 0 = human player)
export const CAR_COLORS = [
  '#e74c3c',  // Red   – player
  '#3498db',  // Blue
  '#2ecc71',  // Green
  '#f39c12',  // Orange
  '#9b59b6',  // Purple
  '#1abc9c',  // Teal
];
export const CAR_NAMES = ['YOU', 'CPU 1', 'CPU 2', 'CPU 3', 'CPU 4', 'CPU 5'];
export const ORDINALS  = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

// Physics (world-pixels / second)
export const MAX_SPEED         = 520;
export const MAX_REVERSE_SPEED = 160;
export const ACCELERATION      = 380;
export const BRAKING           = 560;
export const COAST_FRICTION    = 90;
export const TURN_RATE         = 2.6;   // rad/s at full speed

// Traction multipliers
export const OFFTRACK_SPEED_CAP     = 0.55;  // fraction of MAX_SPEED when on grass
export const OFFTRACK_FRICTION_MULT = 3.5;   // extra friction multiplier on grass

// AI
export const AI_LOOK_AHEAD  = 3;   // control-points ahead to target
export const AI_STEER_GAIN  = 2.5; // proportional steering gain
// Per-AI speed fractions (index 0 unused – that is the player)
export const AI_SPEED_FACTORS = [1, 0.88, 0.91, 0.93, 0.86, 0.89];

// Camera
export const CAM_LERP        = 0.10;  // smoothing (0 = locked, 1 = instant)
export const VIEWPORT_WORLD_W = 1100; // world units visible horizontally
export const VIEWPORT_WORLD_H = 750;  // world units visible vertically

// Multiplayer
export const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Networking tick rate
export const NET_TICK_MS = 50;  // 20 Hz state broadcast

// Turbo boost
export const TURBO_DURATION   = 2.5;  // seconds active
export const TURBO_COOLDOWN   = 8.0;  // seconds cooldown
export const TURBO_SPEED_MULT = 1.6;  // speed multiplier when boosting

// Projectiles
export const PROJECTILE_SPEED        = 900;   // px/s
export const PROJECTILE_MAX_DIST     = 1400;  // px before despawn
export const PROJECTILE_HIT_RADIUS   = 28;    // px
export const PROJECTILE_STUN_TIME    = 1.5;   // seconds stunned
export const PROJECTILE_COOLDOWN     = 2.5;   // seconds between shots
export const PROJECTILE_SPAWN_OFFSET = 8;     // px beyond car nose for spawn

// Turbo flame visual
export const TURBO_FLAME_BASE = 22;  // base flame length (px)
export const TURBO_FLAME_RAND = 12;  // random length variation (px)

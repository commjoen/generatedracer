/**
 * track.js – track definition, spline generation, and rendering.
 *
 * The track is a closed Catmull-Rom spline through CONTROL_POINTS.
 * Pre-computed SPLINE_POINTS are used for rendering and collision queries.
 */

import { TRACK_WIDTH, TRACK_BORDER } from './constants.js';

// ---------------------------------------------------------------------------
// Control points (world space, 3000 × 2000)
// Driving direction: clockwise.  Start/finish line: segment 0→1.
// ---------------------------------------------------------------------------
export const CONTROL_POINTS = [
  { x: 1500, y: 300  },  //  0  start / finish
  { x: 2200, y: 270  },  //  1  top-right straight
  { x: 2680, y: 440  },  //  2  right-hairpin entry
  { x: 2850, y: 800  },  //  3  right-hairpin apex
  { x: 2720, y: 1150 },  //  4  right lower
  { x: 2450, y: 1400 },  //  5  chicane right
  { x: 2050, y: 1560 },  //  6  chicane left
  { x: 1700, y: 1700 },  //  7  back straight
  { x: 1500, y: 1750 },  //  8  bottom centre
  { x: 1300, y: 1700 },  //  9  back straight left
  { x:  950, y: 1560 },  // 10  left chicane
  { x:  550, y: 1400 },  // 11  left turn
  { x:  280, y: 1150 },  // 12  left lower
  { x:  150, y:  800 },  // 13  left-hairpin apex
  { x:  320, y:  440 },  // 14  left-hairpin exit
  { x:  800, y:  270 },  // 15  top-left straight
];

// ---------------------------------------------------------------------------
// Catmull-Rom interpolation
// ---------------------------------------------------------------------------
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (
      2 * p1.x
      + (-p0.x + p2.x) * t
      + ( 2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
      + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    ),
    y: 0.5 * (
      2 * p1.y
      + (-p0.y + p2.y) * t
      + ( 2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
      + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    ),
  };
}

// ---------------------------------------------------------------------------
// Pre-generate the smooth spline  (SEGMENTS_PER_CP points per segment)
// ---------------------------------------------------------------------------
const SEGMENTS_PER_CP = 24;

function buildSpline() {
  const pts = CONTROL_POINTS;
  const n   = pts.length;
  const out = [];

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    for (let j = 0; j < SEGMENTS_PER_CP; j++) {
      out.push(catmullRom(p0, p1, p2, p3, j / SEGMENTS_PER_CP));
    }
  }
  return out;
}

export const SPLINE_POINTS = buildSpline();

// Cumulative arc-length along the spline (same index as SPLINE_POINTS)
export const SPLINE_DIST = (() => {
  const d = [0];
  for (let i = 1; i < SPLINE_POINTS.length; i++) {
    const dx = SPLINE_POINTS[i].x - SPLINE_POINTS[i - 1].x;
    const dy = SPLINE_POINTS[i].y - SPLINE_POINTS[i - 1].y;
    d.push(d[i - 1] + Math.hypot(dx, dy));
  }
  return d;
})();

export const TRACK_LENGTH = SPLINE_DIST[SPLINE_DIST.length - 1];

// ---------------------------------------------------------------------------
// Checkpoint indices (evenly spaced along the spline, used for lap counting)
// ---------------------------------------------------------------------------
export const NUM_CHECKPOINTS = 6;
export const CHECKPOINT_INDICES = Array.from(
  { length: NUM_CHECKPOINTS },
  (_, k) => Math.round((k / NUM_CHECKPOINTS) * SPLINE_POINTS.length) % SPLINE_POINTS.length,
);

// ---------------------------------------------------------------------------
// Spatial query helpers
// ---------------------------------------------------------------------------

/** Return the index of the nearest SPLINE_POINT to (x, y). */
export function nearestSplineIdx(x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < SPLINE_POINTS.length; i++) {
    const dx = SPLINE_POINTS[i].x - x;
    const dy = SPLINE_POINTS[i].y - y;
    const d  = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Return the perpendicular distance from (x,y) to the nearest spline segment. */
export function distToTrack(x, y) {
  const idx = nearestSplineIdx(x, y);
  const p   = SPLINE_POINTS[idx];
  return Math.hypot(x - p.x, y - p.y);
}

/** True if (x,y) is within the drivable surface. */
export function isOnTrack(x, y) {
  return distToTrack(x, y) <= TRACK_WIDTH / 2;
}

/**
 * Progress along the track [0, 1).
 * Used for position/lap counting.
 */
export function trackProgress(x, y) {
  const idx = nearestSplineIdx(x, y);
  return SPLINE_DIST[idx] / TRACK_LENGTH;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** Draw a perpendicular line across the track at spline index `idx`. */
function drawGate(ctx, idx, color, lineWidth) {
  const n  = SPLINE_POINTS.length;
  const p  = SPLINE_POINTS[idx];
  const p2 = SPLINE_POINTS[(idx + 1) % n];

  const dx  = p2.x - p.x;
  const dy  = p2.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx  = -dy / len;  // normal direction
  const ny  =  dx / len;

  const hw = TRACK_WIDTH / 2;

  ctx.beginPath();
  ctx.moveTo(p.x + nx * hw, p.y + ny * hw);
  ctx.lineTo(p.x - nx * hw, p.y - ny * hw);
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.stroke();
}

/** Draw the full track onto `ctx` (called once or each frame). */
export function drawTrack(ctx) {
  const pts = SPLINE_POINTS;
  const n   = pts.length;

  // -- Grass background is drawn by main.js (fillRect with green) --

  // Red/white curbs (slightly wider stroke)
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = '#cc2200';
  ctx.lineWidth   = TRACK_WIDTH + TRACK_BORDER * 2;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';
  ctx.stroke();

  // Road surface
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = '#4a4a4a';
  ctx.lineWidth   = TRACK_WIDTH;
  ctx.stroke();

  // Centre dashed line
  ctx.setLineDash([40, 30]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth   = 3;
  ctx.stroke();
  ctx.setLineDash([]);

  // Checkpoint markers (subtle yellow lines)
  for (let k = 1; k < NUM_CHECKPOINTS; k++) {
    drawGate(ctx, CHECKPOINT_INDICES[k], 'rgba(255,220,0,0.35)', 4);
  }

  // Start / finish line (white)
  drawGate(ctx, CHECKPOINT_INDICES[0], '#ffffff', 6);
}

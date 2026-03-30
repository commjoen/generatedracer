/**
 * race.js – Race state manager.
 *
 * Responsibilities:
 *  • Lap counting via checkpoints
 *  • Track progress (used for position ranking)
 *  • Timing (overall and per-lap)
 *  • Detecting race finish
 */

import {
  CHECKPOINT_INDICES, NUM_CHECKPOINTS, SPLINE_POINTS, trackProgress,
} from './track.js';
import { NUM_LAPS, ORDINALS } from './constants.js';

export class RaceManager {
  /**
   * @param {import('./car.js').Car[]} cars
   */
  constructor(cars) {
    this.cars       = cars;
    this.startTime  = null;  // set when race starts
    this.finished   = false;
    this.winnerId   = null;

    // Per-car state
    this._state = cars.map(() => ({
      lap:               0,
      checkpointsPassed: new Set(),
      prevProgress:      -1,       // track progress in previous frame
      lapStartTime:      null,
      bestLapTime:       null,
      finishTime:        null,
      ordinal:           '',
    }));
  }

  /** Call once when the countdown ends and racing begins. */
  start() {
    const now = performance.now();
    this.startTime = now;
    this._state.forEach((s) => { s.lapStartTime = now; });
  }

  /**
   * Update race state for all cars.
   * @param {number} _dt  – frame delta (seconds, unused but kept for symmetry)
   */
  update(_dt) {
    if (!this.startTime) return;
    const now = performance.now();

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const s   = this._state[i];
      if (s.finishTime !== null) continue; // already finished

      const prog = trackProgress(car.x, car.y);

      // -- Checkpoint detection -----------------------------------------------
      for (let k = 0; k < NUM_CHECKPOINTS; k++) {
        const cpIdx = CHECKPOINT_INDICES[k];

        if (k === 0) continue; // start/finish handled below

        if (!s.checkpointsPassed.has(k)) {
          // Check proximity to the checkpoint gate
          const cpPt = SPLINE_POINTS[cpIdx];
          const dist = Math.hypot(car.x - cpPt.x, car.y - cpPt.y);
          if (dist < 120) {
            s.checkpointsPassed.add(k);
          }
        }
      }

      // -- Start/finish line (checkpoint 0) / lap completion ------------------
      // Detect crossing from progress ~1 → ~0 (wrap-around)
      const allCheckpointsDone = s.checkpointsPassed.size >= NUM_CHECKPOINTS - 1;
      const wrapped = s.prevProgress > 0.85 && prog < 0.15;

      if (wrapped && allCheckpointsDone) {
        s.lap++;
        const lapTime = now - s.lapStartTime;
        if (s.bestLapTime === null || lapTime < s.bestLapTime) {
          s.bestLapTime = lapTime;
        }
        s.lapStartTime      = now;
        s.checkpointsPassed = new Set();

        if (s.lap >= NUM_LAPS) {
          s.finishTime = now;
          car.finished = true;
          if (this.winnerId === null) this.winnerId = i;
        }
      }

      s.prevProgress = prog;
      car.lap        = s.lap;
    }

    // -- Position ranking -------------------------------------------------------
    const ranking = this.cars
      .map((c, i) => {
        const s    = this._state[i];
        const prog = trackProgress(c.x, c.y);
        // sortKey: larger = further along. Finished cars rank above all racing cars.
        const sortKey = s.finishTime !== null
          ? NUM_LAPS + 1 + i * 0.0001  // finished: sorted by index (proxy for finish order)
          : (s.lap + prog);
        return { i, sortKey };
      })
      .sort((a, b) => b.sortKey - a.sortKey);

    ranking.forEach((r, pos) => {
      this.cars[r.i].position = pos + 1;
      this._state[r.i].ordinal = ORDINALS[pos] ?? `${pos + 1}th`;
    });

    // Race is done when all cars finished or enough time has passed
    if (this.cars.every((c, i) => this._state[i].finishTime !== null)) {
      this.finished = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Getters used by HUD / main
  // ---------------------------------------------------------------------------

  getLap(carIdx) {
    return this._state[carIdx]?.lap ?? 0;
  }

  getOrdinal(carIdx) {
    return this._state[carIdx]?.ordinal ?? '';
  }

  getBestLap(carIdx) {
    return this._state[carIdx]?.bestLapTime ?? null;
  }

  getFinishTime(carIdx) {
    return this._state[carIdx]?.finishTime ?? null;
  }

  /**
   * Build results array for the end screen, sorted by finish position.
   */
  getResults() {
    return this.cars
      .map((c, i) => ({
        id:         i,
        name:       c.id === 0 ? 'YOU' : `CPU ${i}`,
        position:   c.position,
        lap:        this._state[i].lap,
        bestLap:    this._state[i].bestLapTime,
        finishTime: this._state[i].finishTime,
        finished:   this._state[i].finishTime !== null,
      }))
      .sort((a, b) => a.position - b.position);
  }
}

// ---------------------------------------------------------------------------
// Utility: format milliseconds as M:SS.mmm
// ---------------------------------------------------------------------------
export function formatTime(ms) {
  if (ms === null || ms === undefined) return '--:--.---';
  const totalSec = ms / 1000;
  const m    = Math.floor(totalSec / 60);
  const s    = Math.floor(totalSec % 60);
  const msec = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(msec).padStart(3, '0')}`;
}

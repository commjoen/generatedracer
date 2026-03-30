/**
 * ai.js – AI controller for computer-controlled cars.
 *
 * Each AI follows the CONTROL_POINTS waypoints.
 * Steering is proportional to the angle error toward the next waypoint.
 * Speed is governed by per-AI speed factors with some rubber-banding.
 */

import { CONTROL_POINTS } from './track.js';
import { AI_LOOK_AHEAD, AI_STEER_GAIN, AI_SPEED_FACTORS, MAX_SPEED } from './constants.js';

export class AiController {
  /**
   * @param {import('./car.js').Car} car
   * @param {number} playerProgress  – shared reference is updated externally
   */
  constructor(car) {
    this.car = car;
    // Which waypoint the AI is currently aiming for
    this._targetIdx = this._findNearestWaypoint();
    this._speedFactor = AI_SPEED_FACTORS[car.id] ?? 0.88;
  }

  _findNearestWaypoint() {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < CONTROL_POINTS.length; i++) {
      const dx = CONTROL_POINTS[i].x - this.car.x;
      const dy = CONTROL_POINTS[i].y - this.car.y;
      const d  = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /**
   * Compute and write input to `this.car.input`.
   * @param {number} dt
   * @param {number} playerProgress  – 0-1 track progress of the human player
   */
  update(dt, playerProgress) {
    const car = this.car;
    const n   = CONTROL_POINTS.length;
    const target = CONTROL_POINTS[(this._targetIdx + AI_LOOK_AHEAD) % n];

    // Angle toward target
    const dx      = target.x - car.x;
    const dy      = target.y - car.y;
    const desired = Math.atan2(dy, dx);
    let   err     = desired - car.angle;

    // Normalize to [-π, π]
    while (err >  Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;

    // Advance waypoint when close enough
    const distSq = dx * dx + dy * dy;
    if (distSq < 120 * 120) {
      this._targetIdx = (this._targetIdx + 1) % n;
    }

    // Rubber-banding: slow down if well ahead of player, speed up if far behind
    // (track progress is cyclic; we do a simple signed difference)
    let rbFactor = 1;
    if (playerProgress !== undefined) {
      // Compute rough AI progress from _targetIdx
      const aiProgress = this._targetIdx / n;
      let diff = aiProgress - playerProgress;
      if (diff >  0.5) diff -= 1;
      if (diff < -0.5) diff += 1;
      // diff > 0 means AI is ahead: slow down slightly
      // diff < 0 means AI is behind: speed up slightly
      rbFactor = 1 - diff * 0.4;
      rbFactor = Math.max(0.7, Math.min(1.15, rbFactor));
    }

    const steer = Math.max(-1, Math.min(1, err * AI_STEER_GAIN));
    const targetSpeed = MAX_SPEED * this._speedFactor * rbFactor;
    const gas   = car.speed < targetSpeed ? 1 : 0;
    const brake = Math.abs(err) > 1.1 ? 0.4 : 0;  // brake when turning hard

    car.input.steer = steer;
    car.input.gas   = gas;
    car.input.brake = brake;
  }
}

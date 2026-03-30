/**
 * projectile.js – Projectile / shell fired by players.
 */

import {
  PROJECTILE_SPEED, PROJECTILE_MAX_DIST,
  PROJECTILE_HIT_RADIUS, PROJECTILE_STUN_TIME,
} from './constants.js';

export class Projectile {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} angle     – direction in radians
   * @param {number} ownerId   – car id that fired this
   */
  constructor(x, y, angle, ownerId) {
    this.x            = x;
    this.y            = y;
    this.angle        = angle;
    this.ownerId      = ownerId;
    this.active       = true;
    this.distTraveled = 0;
  }

  /**
   * Advance the projectile and check for hits.
   * @param {number} dt
   * @param {import('./car.js').Car[]} cars
   */
  update(dt, cars) {
    if (!this.active) return;

    const step = PROJECTILE_SPEED * dt;
    this.x += Math.cos(this.angle) * step;
    this.y += Math.sin(this.angle) * step;
    this.distTraveled += step;

    if (this.distTraveled > PROJECTILE_MAX_DIST) {
      this.active = false;
      return;
    }

    for (const car of cars) {
      if (car.id === this.ownerId) continue;
      if (car.finished) continue;
      const dist = Math.hypot(car.x - this.x, car.y - this.y);
      if (dist < PROJECTILE_HIT_RADIUS) {
        car.stunTimer = PROJECTILE_STUN_TIME;
        this.active   = false;
        return;
      }
    }
  }

  /** Render projectile onto world-space context. */
  draw(ctx) {
    if (!this.active) return;
    ctx.save();

    // Outer glow
    ctx.shadowBlur  = 14;
    ctx.shadowColor = '#ff8800';

    // Shell
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Bright core
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#fff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

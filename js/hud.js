/**
 * hud.js – HUD overlay renderer.
 *
 * Updates DOM elements each frame; does NOT use the canvas so it
 * composes well with the WebGL/canvas layer.
 */

import { MAX_SPEED, NUM_LAPS } from './constants.js';
import { formatTime } from './race.js';

export class Hud {
  constructor() {
    this._pos      = document.getElementById('hud-position');
    this._lap      = document.getElementById('hud-lap');
    this._time     = document.getElementById('hud-time');
    this._speed    = document.getElementById('hud-speed');
    this._lapBest  = document.getElementById('hud-bestlap');
  }

  /**
   * @param {import('./car.js').Car}        playerCar
   * @param {import('./race.js').RaceManager} race
   */
  update(playerCar, race) {
    const carIdx   = playerCar.id;
    const lap      = Math.min(race.getLap(carIdx) + 1, NUM_LAPS);
    const elapsed  = race.startTime ? performance.now() - race.startTime : 0;
    const bestLap  = race.getBestLap(carIdx);
    // 1 world-pixel ≈ 0.1 m  →  km/h = px/s * 0.1 * 3.6 = px/s * 0.36
    const kmh      = Math.round(Math.abs(playerCar.speed) * 0.36);

    this._pos.textContent     = race.getOrdinal(carIdx) || '1st';
    this._lap.textContent     = `Lap ${lap} / ${NUM_LAPS}`;
    this._time.textContent    = formatTime(elapsed);
    this._speed.textContent   = kmh;
    this._lapBest.textContent = bestLap ? `Best: ${formatTime(bestLap)}` : '';
  }

  show() {
    const el = document.getElementById('hud');
    if (el) el.classList.remove('hidden');
  }

  hide() {
    const el = document.getElementById('hud');
    if (el) el.classList.add('hidden');
  }
}

/**
 * hud.js – HUD overlay renderer.
 *
 * Updates DOM elements each frame; does NOT use the canvas so it
 * composes well with the WebGL/canvas layer.
 */

import { MAX_SPEED, NUM_LAPS } from './constants.js';
import { formatTime } from './race.js';

export class Hud {
  /**
   * @param {string} id  – id of the HUD container element (e.g. 'hud' or 'hud2')
   */
  constructor(id = 'hud') {
    this._el       = document.getElementById(id);
    this._pos      = document.getElementById(`${id}-position`);
    this._lap      = document.getElementById(`${id}-lap`);
    this._time     = document.getElementById(`${id}-time`);
    this._speed    = document.getElementById(`${id}-speed`);
    this._lapBest  = document.getElementById(`${id}-bestlap`);
    this._turbo    = document.getElementById(`${id}-turbo`);
    this._shoot    = document.getElementById(`${id}-shoot`);
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

    // Turbo indicator
    if (this._turbo) {
      if (playerCar.turboActive) {
        this._turbo.textContent = '⚡ BOOST!';
        this._turbo.className   = 'hud-pill hud-turbo hud-turbo-active';
      } else if (playerCar.turboCooldown > 0) {
        this._turbo.textContent = `⚡ ${Math.ceil(playerCar.turboCooldown)}s`;
        this._turbo.className   = 'hud-pill hud-turbo hud-turbo-charging';
      } else {
        this._turbo.textContent = '⚡ Ready';
        this._turbo.className   = 'hud-pill hud-turbo hud-turbo-ready';
      }
    }

    // Shoot indicator
    if (this._shoot) {
      if (playerCar.shootCooldown > 0) {
        this._shoot.textContent = `🔫 ${Math.ceil(playerCar.shootCooldown)}s`;
        this._shoot.className   = 'hud-pill hud-shoot hud-shoot-charging';
      } else {
        this._shoot.textContent = '🔫 Ready';
        this._shoot.className   = 'hud-pill hud-shoot hud-shoot-ready';
      }
    }
  }

  show() {
    if (this._el) this._el.classList.remove('hidden');
  }

  hide() {
    if (this._el) this._el.classList.add('hidden');
  }
}

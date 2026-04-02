/**
 * input.js – Unified input handler.
 *
 * Supports:
 *  • Keyboard  (Arrow keys and/or WASD, configurable via keySet)
 *  • Touch     (virtual D-pad buttons rendered by index.html)
 *  • Gamepad   (Web Gamepad API – axes + buttons, covers Tesla MCU)
 */

export class InputHandler {
  /**
   * @param {'all'|'wasd'|'arrows'} keySet
   *   'all'    – both WASD and Arrow keys (single-player default)
   *   'wasd'   – WASD + E (turbo) + Q (shoot)
   *   'arrows' – Arrow keys + L (turbo) + P (shoot)
   */
  constructor(keySet = 'all') {
    this.keySet = keySet;

    // Logical state
    this.left  = false;
    this.right = false;
    this.gas   = false;
    this.brake = false;
    this.turbo = false;
    this.shoot = false;

    // Touch state (set from DOM event listeners in main.js via touchButtons map)
    this.touch = { left: false, right: false, gas: false, brake: false, turbo: false, shoot: false };

    // Gamepad state (polled each frame via update())
    this._gamepadIndex = null;

    this._bindKeyboard();
    if (keySet !== 'arrows') {
      this._bindGamepadEvents();
    }
  }

  _bindKeyboard() {
    const down = (e) => {
      const k = e.code;
      if (this.keySet === 'all' || this.keySet === 'wasd') {
        if (k === 'KeyA') this.left  = true;
        if (k === 'KeyD') this.right = true;
        if (k === 'KeyW') this.gas   = true;
        if (k === 'KeyS') this.brake = true;
        if (k === 'KeyE') this.turbo = true;
        if (k === 'KeyQ') this.shoot = true;
      }
      if (this.keySet === 'all' || this.keySet === 'arrows') {
        if (k === 'ArrowLeft')  this.left  = true;
        if (k === 'ArrowRight') this.right = true;
        if (k === 'ArrowUp')    this.gas   = true;
        if (k === 'ArrowDown')  this.brake = true;
        if (k === 'KeyL')       this.turbo = true;
        if (k === 'KeyP')       this.shoot = true;
      }
    };
    const up = (e) => {
      const k = e.code;
      if (this.keySet === 'all' || this.keySet === 'wasd') {
        if (k === 'KeyA') this.left  = false;
        if (k === 'KeyD') this.right = false;
        if (k === 'KeyW') this.gas   = false;
        if (k === 'KeyS') this.brake = false;
        if (k === 'KeyE') this.turbo = false;
        if (k === 'KeyQ') this.shoot = false;
      }
      if (this.keySet === 'all' || this.keySet === 'arrows') {
        if (k === 'ArrowLeft')  this.left  = false;
        if (k === 'ArrowRight') this.right = false;
        if (k === 'ArrowUp')    this.gas   = false;
        if (k === 'ArrowDown')  this.brake = false;
        if (k === 'KeyL')       this.turbo = false;
        if (k === 'KeyP')       this.shoot = false;
      }
    };
    this._onKeyDown = down;
    this._onKeyUp   = up;
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
  }

  _bindGamepadEvents() {
    this._onGpadConn   = (e) => { this._gamepadIndex = e.gamepad.index; };
    this._onGpadDisconn = ()  => { this._gamepadIndex = null; };
    window.addEventListener('gamepadconnected',    this._onGpadConn);
    window.addEventListener('gamepaddisconnected', this._onGpadDisconn);
  }

  /** Remove all event listeners (call when discarding this handler). */
  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    if (this._onGpadConn)    window.removeEventListener('gamepadconnected',    this._onGpadConn);
    if (this._onGpadDisconn) window.removeEventListener('gamepaddisconnected', this._onGpadDisconn);
  }

  /** Call once per frame to poll Gamepad API. */
  pollGamepad() {
    if (this._gamepadIndex === null) return;
    const gp = navigator.getGamepads
      ? navigator.getGamepads()[this._gamepadIndex]
      : null;
    if (!gp) return;

    // Standard gamepad layout (https://w3c.github.io/gamepad/#remapping)
    const axisX  = gp.axes[0] ?? 0;   // left stick X
    const rt     = gp.buttons[7]?.value ?? 0;  // right trigger
    const lt     = gp.buttons[6]?.value ?? 0;  // left trigger
    const dLeft  = gp.buttons[14]?.pressed ?? false;
    const dRight = gp.buttons[15]?.pressed ?? false;
    const dUp    = gp.buttons[12]?.pressed ?? false;
    const dDown  = gp.buttons[13]?.pressed ?? false;

    this._gpLeft  = axisX < -0.2 || dLeft;
    this._gpRight = axisX >  0.2 || dRight;
    this._gpGas   = rt > 0.1 || dUp;
    this._gpBrake = lt > 0.1 || dDown;
    this._gpAxis  = axisX; // continuous value for smoother steering
  }

  /** Bind the four on-screen touch buttons. */
  bindTouchButtons(leftEl, rightEl, gasEl, brakeEl) {
    const bind = (el, key) => {
      const startFn = (e) => { e.preventDefault(); this.touch[key] = true;  };
      const endFn   = (e) => { e.preventDefault(); this.touch[key] = false; };
      el.addEventListener('touchstart', startFn, { passive: false });
      el.addEventListener('touchend',   endFn,   { passive: false });
      el.addEventListener('touchcancel',endFn,   { passive: false });
      // Mouse fallback (for desktop testing of touch layout)
      el.addEventListener('mousedown', startFn);
      el.addEventListener('mouseup',   endFn);
      el.addEventListener('mouseleave',endFn);
    };
    bind(leftEl,  'left');
    bind(rightEl, 'right');
    bind(gasEl,   'gas');
    bind(brakeEl, 'brake');
  }

  /** Bind the turbo and shoot HUD action buttons. */
  bindActionButtons(turboEl, shootEl) {
    const bind = (el, key) => {
      const startFn = (e) => { e.preventDefault(); this.touch[key] = true;  };
      const endFn   = (e) => { e.preventDefault(); this.touch[key] = false; };
      el.addEventListener('touchstart', startFn, { passive: false });
      el.addEventListener('touchend',   endFn,   { passive: false });
      el.addEventListener('touchcancel',endFn,   { passive: false });
      // Mouse fallback (for desktop testing)
      el.addEventListener('mousedown', startFn);
      el.addEventListener('mouseup',   endFn);
      el.addEventListener('mouseleave',endFn);
    };
    bind(turboEl, 'turbo');
    bind(shootEl, 'shoot');
  }

  /**
   * Compose final input values for the car:
   *   steer: -1 (left) … +1 (right)
   *   gas:    0 … 1
   *   brake:  0 … 1
   *   turbo:  boolean
   *   shoot:  boolean
   */
  get() {
    const left  = this.left  || this.touch.left  || this._gpLeft  || false;
    const right = this.right || this.touch.right || this._gpRight || false;
    const gas   = this.gas   || this.touch.gas   || this._gpGas   || false;
    const brake = this.brake || this.touch.brake || this._gpBrake || false;

    // Use continuous axis if gamepad present, else digital
    let steer = 0;
    if (this._gamepadIndex !== null && this._gpAxis !== undefined) {
      steer = Math.abs(this._gpAxis) > 0.2 ? this._gpAxis : 0;
    } else {
      if (left)  steer -= 1;
      if (right) steer += 1;
    }

    return {
      steer,
      gas:   gas   ? 1 : 0,
      brake: brake ? 1 : 0,
      turbo: this.turbo || this.touch.turbo,
      shoot: this.shoot || this.touch.shoot,
    };
  }
}

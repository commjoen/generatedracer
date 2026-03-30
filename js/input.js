/**
 * input.js – Unified input handler.
 *
 * Supports:
 *  • Keyboard  (Arrow keys and WASD)
 *  • Touch     (virtual D-pad buttons rendered by index.html)
 *  • Gamepad   (Web Gamepad API – axes + buttons, covers Tesla MCU)
 */

export class InputHandler {
  constructor() {
    // Logical state
    this.left  = false;
    this.right = false;
    this.gas   = false;
    this.brake = false;

    // Touch state (set from DOM event listeners in main.js via touchButtons map)
    this.touch = { left: false, right: false, gas: false, brake: false };

    // Gamepad state (polled each frame via update())
    this._gamepadIndex = null;

    this._bindKeyboard();
    this._bindGamepadEvents();
  }

  _bindKeyboard() {
    const down = (e) => {
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA': this.left  = true;  break;
        case 'ArrowRight': case 'KeyD': this.right = true;  break;
        case 'ArrowUp':    case 'KeyW': this.gas   = true;  break;
        case 'ArrowDown':  case 'KeyS': this.brake = true;  break;
      }
    };
    const up = (e) => {
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA': this.left  = false; break;
        case 'ArrowRight': case 'KeyD': this.right = false; break;
        case 'ArrowUp':    case 'KeyW': this.gas   = false; break;
        case 'ArrowDown':  case 'KeyS': this.brake = false; break;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
  }

  _bindGamepadEvents() {
    window.addEventListener('gamepadconnected', (e) => {
      this._gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this._gamepadIndex = null;
    });
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

  /**
   * Compose final input values for the car:
   *   steer: -1 (left) … +1 (right)
   *   gas:    0 … 1
   *   brake:  0 … 1
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
    };
  }
}

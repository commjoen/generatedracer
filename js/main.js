/**
 * main.js – Entry point, game loop, state machine.
 *
 * States:  MENU → COUNTDOWN → RACING → FINISHED
 *          MENU → MULTIPLAYER_MENU → (host or guest) → COUNTDOWN → …
 *          MENU → SPLITSCREEN → COUNTDOWN → …
 */

import { Car, resolveCarCollision } from './car.js';
import { drawTrack, CONTROL_POINTS } from './track.js';
import { InputHandler } from './input.js';
import { AiController } from './ai.js';
import { RaceManager, formatTime } from './race.js';
import { Hud } from './hud.js';
import { Network } from './network.js';
import { Projectile } from './projectile.js';
import {
  WORLD_W, WORLD_H, NUM_AI, MAX_PLAYERS, CAR_NAMES, ORDINALS,
  CAM_LERP, VIEWPORT_WORLD_W, VIEWPORT_WORLD_H, NUM_LAPS,
  PROJECTILE_COOLDOWN, CAR_LENGTH, PROJECTILE_SPAWN_OFFSET,
} from './constants.js';
import { trackProgress } from './track.js';

// ---------------------------------------------------------------------------
// Starting grid positions (world space, angle=0 → facing right)
// ---------------------------------------------------------------------------
const START_POSITIONS = [
  { x: 1490, y: 268, angle: 0 },
  { x: 1490, y: 335, angle: 0 },
  { x: 1420, y: 268, angle: 0 },
  { x: 1420, y: 335, angle: 0 },
  { x: 1350, y: 268, angle: 0 },
  { x: 1350, y: 335, angle: 0 },
];

// ---------------------------------------------------------------------------
// Game state machine
// ---------------------------------------------------------------------------
const STATE = {
  MENU:        'menu',
  MULTI_MENU:  'multi_menu',
  COUNTDOWN:   'countdown',
  RACING:      'racing',
  FINISHED:    'finished',
};

let state = STATE.MENU;

// ---------------------------------------------------------------------------
// Core objects
// ---------------------------------------------------------------------------
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const input   = new InputHandler('all');      // single-player / online: both keys
const inputP1 = new InputHandler('wasd');     // splitscreen player 1
const inputP2 = new InputHandler('arrows');   // splitscreen player 2
const hud     = new Hud('hud');
const hud2    = new Hud('hud2');
const network = new Network();

let cars      = [];
let aiControllers = [];
let race      = null;
let projectiles   = [];           // active Projectile instances
let playerCarIdx  = 0;            // local player's car index (P1)
let playerCarIdx2 = 1;            // second player's car index (splitscreen)
let isSplitscreen = false;
let camera    = { x: START_POSITIONS[0].x, y: START_POSITIONS[0].y };
let camera2   = { x: START_POSITIONS[1].x, y: START_POSITIONS[1].y };

let countdownValue  = 3;
let countdownTimer  = 0;
let lastTimestamp   = null;

// Net tick accumulator (for host)
let netTickAcc = 0;
const NET_TICK = 50; // ms between state broadcasts

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// Car / race initialisation
// ---------------------------------------------------------------------------
function initRace(numAI = NUM_AI, twoHumans = false) {
  cars = [];
  aiControllers = [];
  projectiles   = [];
  playerCarIdx  = 0;
  playerCarIdx2 = 1;

  const numHumans = twoHumans ? 2 : 1;
  const total = Math.min(numHumans + numAI, MAX_PLAYERS);

  for (let i = 0; i < total; i++) {
    const sp  = START_POSITIONS[i];
    const car = new Car(i, sp.x, sp.y, sp.angle);
    cars.push(car);

    if (i >= numHumans) {
      // AI car
      aiControllers.push(new AiController(car));
    }
  }

  race = new RaceManager(cars);
}

// ---------------------------------------------------------------------------
// Input → touch button binding
// ---------------------------------------------------------------------------
input.bindTouchButtons(
  document.getElementById('btn-left'),
  document.getElementById('btn-right'),
  document.getElementById('btn-gas'),
  document.getElementById('btn-brake'),
);

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function showScreen(id) {
  ['mainMenu', 'multiMenu', 'raceOver', 'countdown', 'hud', 'hud2', 'touchControls']
    .forEach((s) => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
}

function showHudAndControls() {
  document.getElementById('hud').classList.remove('hidden');
  if (isSplitscreen) {
    document.getElementById('hud2').classList.remove('hidden');
    document.body.classList.add('splitscreen');
  }
  // Show touch controls on touch devices (single player only)
  if (!isSplitscreen && window.matchMedia('(pointer: coarse)').matches) {
    document.getElementById('touchControls').classList.remove('hidden');
  }
}

function hideAllScreens() {
  ['mainMenu', 'multiMenu', 'raceOver', 'countdown']
    .forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
}

// ---------------------------------------------------------------------------
// Countdown sequence
// ---------------------------------------------------------------------------
function startCountdown() {
  state          = STATE.COUNTDOWN;
  countdownValue = 3;
  countdownTimer = 0;

  const cdEl  = document.getElementById('countdown');
  const numEl = document.getElementById('countdownNum');
  cdEl.classList.remove('hidden');
  numEl.textContent = '3';
  numEl.style.color = '#ff4444';
}

// ---------------------------------------------------------------------------
// Game start / restart
// ---------------------------------------------------------------------------
function startSinglePlayer() {
  isSplitscreen = false;
  document.body.classList.remove('splitscreen');
  initRace(NUM_AI, false);
  hideAllScreens();
  showHudAndControls();
  startCountdown();
}

function startSplitscreen() {
  isSplitscreen = true;
  document.body.classList.add('splitscreen');
  initRace(4, true);   // 4 AI + 2 human players
  camera  = { x: START_POSITIONS[0].x, y: START_POSITIONS[0].y };
  camera2 = { x: START_POSITIONS[1].x, y: START_POSITIONS[1].y };
  hideAllScreens();
  showHudAndControls();
  startCountdown();
}

function restartGame() {
  network.destroy();
  if (isSplitscreen) {
    startSplitscreen();
  } else {
    startSinglePlayer();
  }
}

// ---------------------------------------------------------------------------
// Race finished screen
// ---------------------------------------------------------------------------
function showFinished() {
  state = STATE.FINISHED;
  hud.hide();
  hud2.hide();
  document.body.classList.remove('splitscreen');
  document.getElementById('touchControls').classList.add('hidden');

  const results  = race.getResults();
  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = results.map((r) => {
    const lap     = formatTime(r.bestLap);
    const total   = r.finishTime
      ? formatTime(r.finishTime - race.startTime)
      : `Lap ${r.lap + 1}/${NUM_LAPS}`;
    let name;
    if (isSplitscreen) {
      name = r.id === 0 ? 'P1 (WASD)' : r.id === 1 ? 'P2 (↑↓←→)' : `CPU ${r.id}`;
    } else {
      name = r.id === playerCarIdx ? 'YOU' : `CPU ${r.id}`;
    }
    const isHuman = isSplitscreen ? (r.id === 0 || r.id === 1) : r.id === playerCarIdx;
    return `<div class="result-row${isHuman ? ' result-human' : ''}">
      <span class="pos">${ORDINALS[r.position - 1] || `${r.position}th`}</span>
      <span class="name">${name}</span>
      <span class="info">${total} (best lap: ${lap})</span>
    </div>`;
  }).join('');

  document.getElementById('raceOver').classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Main game loop
// ---------------------------------------------------------------------------
function loop(ts) {
  requestAnimationFrame(loop);

  const dt = lastTimestamp !== null
    ? Math.min((ts - lastTimestamp) / 1000, 0.05) // cap at 50 ms
    : 1 / 60;
  lastTimestamp = ts;

  // Gamepad polling every frame
  input.pollGamepad();

  if (state === STATE.COUNTDOWN) {
    updateCountdown(dt);
  } else if (state === STATE.RACING) {
    updateRacing(dt, ts);
  }

  render();
}

function updateCountdown(dt) {
  countdownTimer += dt;
  const cdEl  = document.getElementById('countdown');
  const numEl = document.getElementById('countdownNum');

  if (countdownTimer >= 1) {
    countdownTimer -= 1;
    countdownValue--;

    if (countdownValue <= 0) {
      numEl.textContent  = 'GO!';
      numEl.style.color  = '#44ff44';
      numEl.style.animation = 'none';
      // Show GO! for half a second then hide
      setTimeout(() => {
        cdEl.classList.add('hidden');
      }, 500);
      state = STATE.RACING;
      race.start();
      hud.show();
      if (isSplitscreen) hud2.show();
    } else {
      numEl.textContent = countdownValue;
      numEl.style.color = countdownValue === 1 ? '#ffaa00' : '#ff4444';
    }
  }
}

function updateRacing(dt, ts) {
  // ---- Human player input ---------------------------------------------------
  const playerInput = isSplitscreen ? inputP1.get() : input.get();
  cars[playerCarIdx].input = playerInput;

  // Splitscreen: second player input
  if (isSplitscreen) {
    const p2Input = inputP2.get();
    cars[playerCarIdx2].input = p2Input;

    // Player 2 shooting
    if (p2Input.shoot && cars[playerCarIdx2].shootCooldown <= 0) {
      fireProjectile(cars[playerCarIdx2]);
    }
  }

  // If guest, override with input from host (already applied); send our input
  if (network.isGuest && network.connected) {
    network.sendInput(playerInput);
  }

  // Player 1 shooting
  if (playerInput.shoot && cars[playerCarIdx].shootCooldown <= 0) {
    fireProjectile(cars[playerCarIdx]);
  }

  // ---- AI input -------------------------------------------------------------
  const plProgress = cars[playerCarIdx]
    ? trackProgress(cars[playerCarIdx].x, cars[playerCarIdx].y)
    : 0;
  aiControllers.forEach((ai) => ai.update(dt, plProgress));

  // ---- Physics --------------------------------------------------------------
  if (!network.isGuest) {
    cars.forEach((c) => c.update(dt));

    // Car-to-car collisions
    for (let a = 0; a < cars.length; a++) {
      for (let b = a + 1; b < cars.length; b++) {
        resolveCarCollision(cars[a], cars[b]);
      }
    }
  }

  // ---- Projectiles ----------------------------------------------------------
  projectiles = projectiles.filter((p) => {
    p.update(dt, cars);
    return p.active;
  });

  // ---- Race state -----------------------------------------------------------
  race.update(dt);

  // ---- HUD ------------------------------------------------------------------
  hud.update(cars[playerCarIdx], race);
  if (isSplitscreen) hud2.update(cars[playerCarIdx2], race);

  // ---- Network: host broadcasts state --------------------------------------
  if (network.isHost && network.connected) {
    netTickAcc += dt * 1000;
    if (netTickAcc >= NET_TICK) {
      netTickAcc -= NET_TICK;
      network.broadcastState(cars);
    }
  }

  // ---- Race finished? -------------------------------------------------------
  if (race.finished) {
    showFinished();
  }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
function updateCamera(player, cam) {
  cam.x += (player.x - cam.x) * CAM_LERP;
  cam.y += (player.y - cam.y) * CAM_LERP;
}

// ---------------------------------------------------------------------------
// Fire a projectile from the front of a car
// ---------------------------------------------------------------------------
function fireProjectile(car) {
  const spawnX = car.x + Math.cos(car.angle) * (CAR_LENGTH / 2 + PROJECTILE_SPAWN_OFFSET);
  const spawnY = car.y + Math.sin(car.angle) * (CAR_LENGTH / 2 + PROJECTILE_SPAWN_OFFSET);
  projectiles.push(new Projectile(spawnX, spawnY, car.angle, car.id));
  car.shootCooldown = PROJECTILE_COOLDOWN;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  const W = canvas.width;
  const H = canvas.height;

  if (state === STATE.RACING || state === STATE.FINISHED ||
      state === STATE.COUNTDOWN) {

    if (isSplitscreen) {
      // ---- Splitscreen: render two viewports side by side ------------------
      const halfW = Math.floor(W / 2);

      // Left half – Player 1 (WASD)
      if (cars[playerCarIdx]) updateCamera(cars[playerCarIdx], camera);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, halfW, H);
      ctx.clip();
      renderViewport(camera, 0, 0, halfW, H);
      ctx.restore();

      // Right half – Player 2 (Arrows)
      if (cars[playerCarIdx2]) updateCamera(cars[playerCarIdx2], camera2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(halfW, 0, halfW, H);
      ctx.clip();
      renderViewport(camera2, halfW, 0, halfW, H);
      ctx.restore();

      // Dividing line
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth   = 3;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, H);
      ctx.stroke();

      // Player labels at top of each half
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font      = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('P1 · WASD · E=Boost · Q=Shoot', halfW / 2, H - 10);
      ctx.fillText('P2 · ↑↓←→ · L=Boost · P=Shoot', halfW + halfW / 2, H - 10);

    } else {
      // ---- Single viewport --------------------------------------------------
      if (cars[playerCarIdx]) updateCamera(cars[playerCarIdx], camera);
      renderViewport(camera, 0, 0, W, H);
    }

  } else {
    // Menu screens – just clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    // Draw a static preview of the track
    ctx.save();
    const previewScale = Math.min(W / 3200, H / 2200) * 0.85;
    ctx.setTransform(
      previewScale, 0, 0, previewScale,
      (W - 3000 * previewScale) / 2,
      (H - 2000 * previewScale) / 2,
    );
    ctx.fillStyle = '#1a4a10';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    drawTrack(ctx);
    ctx.restore();
  }
}

/**
 * Render the full world into a viewport region.
 * @param {{x:number,y:number}} cam     – camera centre in world space
 * @param {number} offsetX              – left edge of viewport in screen px
 * @param {number} offsetY              – top  edge of viewport in screen px
 * @param {number} viewW                – viewport width  in screen px
 * @param {number} viewH                – viewport height in screen px
 */
function renderViewport(cam, offsetX, offsetY, viewW, viewH) {
  const scale = Math.min(viewW / VIEWPORT_WORLD_W, viewH / VIEWPORT_WORLD_H);

  ctx.save();
  ctx.setTransform(
    scale, 0, 0, scale,
    offsetX + viewW / 2 - cam.x * scale,
    offsetY + viewH / 2 - cam.y * scale,
  );

  // Grass background
  ctx.fillStyle = '#2d6a1f';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Track
  drawTrack(ctx);

  // Projectiles
  projectiles.forEach((p) => p.draw(ctx));

  // Cars (back to front by Y for painter's algorithm)
  const sorted = [...cars].sort((a, b) => a.y - b.y);
  const now    = performance.now();
  sorted.forEach((c) => c.draw(ctx, now));

  // Car name labels
  cars.forEach((c) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font      = 'bold 18px Arial';
    ctx.textAlign = 'center';
    let label;
    if (isSplitscreen) {
      label = c.id === 0 ? 'P1' : c.id === 1 ? 'P2' : `CPU ${c.id}`;
    } else {
      label = c.id === playerCarIdx ? 'YOU' : `CPU ${c.id}`;
    }
    ctx.fillText(label, c.x, c.y - 28);
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// QR code helpers
// ---------------------------------------------------------------------------

/**
 * Generate a QR code inside #sdpQR for the given connection-code text,
 * and show the #sdpActions section (QR + copy button).
 * Silently does nothing if QRCode is unavailable.
 * @param {string} codeText  The base64 SDP offer or answer code.
 */
function showSdpQR(codeText) {
  const actionsEl = document.getElementById('sdpActions');
  const qrEl      = document.getElementById('sdpQR');
  if (!actionsEl || !qrEl) return;

  // Clear any previously rendered QR
  qrEl.innerHTML = '';

  if (typeof QRCode !== 'undefined') {
    const canvas = document.createElement('canvas');
    try {
      QRCode.toCanvas(canvas, codeText, 200);
      qrEl.appendChild(canvas);
    } catch (_) {
      // Data too long or other error – hide QR silently
      qrEl.innerHTML = '';
    }
  }

  actionsEl.classList.remove('hidden');
}

/** Hide the QR / copy-button section and clear the canvas. */
function hideSdpQR() {
  const actionsEl = document.getElementById('sdpActions');
  const qrEl      = document.getElementById('sdpQR');
  if (actionsEl) actionsEl.classList.add('hidden');
  if (qrEl)      qrEl.innerHTML = '';
}

// Copy-to-clipboard button
document.getElementById('btn-copy-sdp').addEventListener('click', () => {
  const code = document.getElementById('sdpOutput').value;
  if (!code) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('btn-copy-sdp');
      const orig = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => {
      document.getElementById('sdpOutput').select();
      document.execCommand('copy');
    });
  } else {
    document.getElementById('sdpOutput').select();
    document.execCommand('copy');
  }
});

// ---------------------------------------------------------------------------
// Multiplayer wiring
// ---------------------------------------------------------------------------
function setupNetworkCallbacks() {
  network.onConnected = () => {
    document.getElementById('multiStatus').textContent =
      '✅ Connected! Waiting for host to start…';
  };

  network.onStateUpdate = (carSnapshots) => {
    // Guest: apply received world state to all cars except our own
    carSnapshots.forEach((s) => {
      const car = cars[s.id];
      if (car && s.id !== playerCarIdx) car.applySnapshot(s);
    });
  };

  network.onRaceStart = (guestCarIdx) => {
    // Guest is assigned a specific car index by the host
    playerCarIdx = guestCarIdx;
    hideAllScreens();
    showHudAndControls();
    startCountdown();
  };

  network.onInputReceived = (inp) => {
    // Host: apply guest input to their car
    if (cars[1]) cars[1].input = inp;
  };

  network.onError = (msg) => {
    document.getElementById('multiStatus').textContent = `❌ ${msg}`;
  };
}

// ---------------------------------------------------------------------------
// Menu button wiring
// ---------------------------------------------------------------------------
document.getElementById('btn-single').addEventListener('click', startSinglePlayer);

document.getElementById('btn-splitscreen').addEventListener('click', startSplitscreen);

document.getElementById('btn-multi').addEventListener('click', () => {
  showScreen('multiMenu');
  state = STATE.MULTI_MENU;
});

document.getElementById('btn-back-multi').addEventListener('click', () => {
  hideSdpQR();
  showScreen('mainMenu');
  state = STATE.MENU;
});

document.getElementById('btn-restart').addEventListener('click', restartGame);
document.getElementById('btn-menu').addEventListener('click', () => {
  network.destroy();
  isSplitscreen = false;
  document.body.classList.remove('splitscreen');
  showScreen('mainMenu');
  state = STATE.MENU;
});

// -- Host --
document.getElementById('btn-host').addEventListener('click', async () => {
  const statusEl = document.getElementById('multiStatus');
  const outEl    = document.getElementById('sdpOutput');
  const inEl     = document.getElementById('sdpInput');
  const connectEl = document.getElementById('btn-sdp-connect');

  hideSdpQR();
  statusEl.textContent = '⏳ Generating offer code…';
  setupNetworkCallbacks();

  try {
    const offerCode = await network.createOffer();
    outEl.value     = offerCode;
    statusEl.textContent = '📋 Copy or scan the code below and share it with your opponent.\nThen paste their answer code here.';
    showSdpQR(offerCode);
    connectEl.classList.remove('hidden');
    connectEl.textContent = 'Accept Answer';
    connectEl.onclick = async () => {
      const answerCode = inEl.value.trim();
      if (!answerCode) { statusEl.textContent = '⚠️ Paste the answer code first.'; return; }
      try {
        await network.acceptAnswer(answerCode);
        statusEl.textContent = '🔗 Connecting…';
        // Init race and wait for connection
        initRace(4); // 4 AI + 2 humans
        network.onConnected = () => {
          statusEl.textContent = '✅ Connected! Starting race…';
          setTimeout(() => {
            network.broadcastStart(1); // guest drives car index 1
            hideAllScreens();
            showHudAndControls();
            startCountdown();
          }, 1000);
        };
      } catch (e) {
        statusEl.textContent = `❌ ${e.message}`;
      }
    };
  } catch (e) {
    statusEl.textContent = `❌ ${e.message}`;
  }
});

// -- Guest --
document.getElementById('btn-join').addEventListener('click', async () => {
  const statusEl  = document.getElementById('multiStatus');
  const outEl     = document.getElementById('sdpOutput');
  const inEl      = document.getElementById('sdpInput');
  const connectEl = document.getElementById('btn-sdp-connect');

  hideSdpQR();
  statusEl.textContent = 'Paste the host\'s offer code in the box below, then click Connect.';
  connectEl.classList.remove('hidden');
  connectEl.textContent = 'Connect';

  setupNetworkCallbacks();
  initRace(4);

  connectEl.onclick = async () => {
    const offerCode = inEl.value.trim();
    if (!offerCode) { statusEl.textContent = '⚠️ Paste the offer code first.'; return; }
    statusEl.textContent = '⏳ Generating answer…';
    try {
      const answerCode = await network.joinRoom(offerCode);
      outEl.value = answerCode;
      statusEl.textContent = '📋 Copy or scan the answer code below and send it to the host.';
      showSdpQR(answerCode);
    } catch (e) {
      statusEl.textContent = `❌ ${e.message}`;
    }
  };
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
showScreen('mainMenu');
state = STATE.MENU;

// Warm up the track renderer (pre-builds spline data structures)
initRace(NUM_AI);

requestAnimationFrame(loop);

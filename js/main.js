/**
 * main.js – Entry point, game loop, state machine.
 *
 * States:  MENU → COUNTDOWN → RACING → FINISHED
 *          MENU → MULTIPLAYER_MENU → (host or guest) → COUNTDOWN → …
 */

import { Car, resolveCarCollision } from './car.js';
import { drawTrack, CONTROL_POINTS } from './track.js';
import { InputHandler } from './input.js';
import { AiController } from './ai.js';
import { RaceManager, formatTime } from './race.js';
import { Hud } from './hud.js';
import { Network } from './network.js';
import {
  WORLD_W, WORLD_H, NUM_AI, MAX_PLAYERS, CAR_NAMES, ORDINALS,
  CAM_LERP, VIEWPORT_WORLD_W, VIEWPORT_WORLD_H, NUM_LAPS,
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
const input   = new InputHandler();
const hud     = new Hud();
const network = new Network();

let cars      = [];
let aiControllers = [];
let race      = null;
let playerCarIdx = 0;  // index of the local player's car
let camera    = { x: START_POSITIONS[0].x, y: START_POSITIONS[0].y };

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
function initRace(numAI = NUM_AI) {
  cars = [];
  aiControllers = [];
  playerCarIdx = 0;

  for (let i = 0; i < Math.min(numAI + 1, MAX_PLAYERS); i++) {
    const sp  = START_POSITIONS[i];
    const car = new Car(i, sp.x, sp.y, sp.angle);
    cars.push(car);

    if (i > 0) {
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
  ['mainMenu', 'multiMenu', 'raceOver', 'countdown', 'hud', 'touchControls']
    .forEach((s) => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
}

function showHudAndControls() {
  document.getElementById('hud').classList.remove('hidden');
  // Show touch controls on touch devices
  if (window.matchMedia('(pointer: coarse)').matches) {
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
  initRace(NUM_AI);
  hideAllScreens();
  showHudAndControls();
  startCountdown();
}

function restartGame() {
  network.destroy();
  startSinglePlayer();
}

// ---------------------------------------------------------------------------
// Race finished screen
// ---------------------------------------------------------------------------
function showFinished() {
  state = STATE.FINISHED;
  hud.hide();
  document.getElementById('touchControls').classList.add('hidden');

  const results  = race.getResults();
  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = results.map((r) => {
    const lap     = formatTime(r.bestLap);
    const total   = r.finishTime
      ? formatTime(r.finishTime - race.startTime)
      : `Lap ${r.lap + 1}/${NUM_LAPS}`;
    const isPlayer = r.id === playerCarIdx;
    return `<div class="result-row">
      <span class="pos">${ORDINALS[r.position - 1] || `${r.position}th`}</span>
      <span class="name">${isPlayer ? 'YOU' : `CPU ${r.id}`}</span>
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
    } else {
      numEl.textContent = countdownValue;
      numEl.style.color = countdownValue === 1 ? '#ffaa00' : '#ff4444';
    }
  }
}

function updateRacing(dt, ts) {
  // ---- Human player input ---------------------------------------------------
  const playerInput = input.get();
  cars[playerCarIdx].input = playerInput;

  // If guest, override with input from host (already applied); send our input
  if (network.isGuest && network.connected) {
    network.sendInput(playerInput);
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

  // ---- Race state -----------------------------------------------------------
  race.update(dt);

  // ---- HUD ------------------------------------------------------------------
  hud.update(cars[playerCarIdx], race);

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
function updateCamera(player) {
  camera.x += (player.x - camera.x) * CAM_LERP;
  camera.y += (player.y - camera.y) * CAM_LERP;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render() {
  const W = canvas.width;
  const H = canvas.height;

  // Scale so VIEWPORT_WORLD_W × VIEWPORT_WORLD_H fits in canvas
  const scale = Math.min(W / VIEWPORT_WORLD_W, H / VIEWPORT_WORLD_H);

  if (state === STATE.RACING || state === STATE.FINISHED ||
      state === STATE.COUNTDOWN) {
    // Update camera toward player car
    if (cars[playerCarIdx]) updateCamera(cars[playerCarIdx]);

    ctx.save();

    // Center viewport on camera
    ctx.setTransform(
      scale, 0, 0, scale,
      W / 2 - camera.x * scale,
      H / 2 - camera.y * scale,
    );

    // Grass background
    ctx.fillStyle = '#2d6a1f';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Track
    drawTrack(ctx);

    // Cars (back to front by Y for painter's algorithm)
    const sorted = [...cars].sort((a, b) => a.y - b.y);
    sorted.forEach((c) => c.draw(ctx));

    // Car name labels
    cars.forEach((c) => {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font      = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(c.id === 0 ? 'YOU' : `CPU ${c.id}`, c.x, c.y - 28);
    });

    ctx.restore();
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

document.getElementById('btn-multi').addEventListener('click', () => {
  showScreen('multiMenu');
  state = STATE.MULTI_MENU;
});

document.getElementById('btn-back-multi').addEventListener('click', () => {
  showScreen('mainMenu');
  state = STATE.MENU;
});

document.getElementById('btn-restart').addEventListener('click', restartGame);
document.getElementById('btn-menu').addEventListener('click', () => {
  network.destroy();
  showScreen('mainMenu');
  state = STATE.MENU;
});

// -- Host --
document.getElementById('btn-host').addEventListener('click', async () => {
  const statusEl = document.getElementById('multiStatus');
  const outEl    = document.getElementById('sdpOutput');
  const inEl     = document.getElementById('sdpInput');
  const connectEl = document.getElementById('btn-sdp-connect');

  statusEl.textContent = '⏳ Generating offer code…';
  setupNetworkCallbacks();

  try {
    const offerCode = await network.createOffer();
    outEl.value     = offerCode;
    statusEl.textContent = '📋 Copy the code above and share it with your opponent.\nThen paste their answer code below.';
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
      statusEl.textContent = '📋 Copy the answer code above and send it to the host.';
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

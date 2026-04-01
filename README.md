# 🏎️ GenerateRacer

A browser-based kart racing game – think Mario Kart meets Wacky Wheels,
running entirely in your browser.  No installation, no account, no plugins.

🟢 **[Play now on GitHub Pages](https://commjoen.github.io/generatedracer/)**

---

## Features

| Feature | Details |
|---|---|
| 🏁 Single player | Race against **5 AI opponents** with rubber-banding difficulty |
| 🌐 Online multiplayer | Peer-to-peer via **WebRTC** – exchange a short code with a friend, no server needed |
| ⌨️ Keyboard | Arrow keys **or** WASD |
| 📱 Touchscreen | On-screen D-pad (mobile & tablet) |
| 🎮 Gamepad | Web Gamepad API – left stick, triggers, D-pad (covers Tesla MCU steering wheel) |
| 🏆 Race format | 3 laps, 6 drivers, real-time positions & lap times |
| 🐳 Docker | Run locally in one command |
| ⭐ GitHub Stars | Star widget + live star count in the main menu |
| 🔢 Versioning | `APP_VERSION` constant; version shown in the main menu |
| 🔒 Security | Dependabot + Renovate for dependency updates; CSP-compatible static deployment |

---

## How to play

### Keyboard
| Key | Action |
|---|---|
| ↑ / W | Accelerate |
| ↓ / S | Brake / Reverse |
| ← / A | Steer left |
| → / D | Steer right |

### Touch / Tesla
Use the on-screen buttons (◀ ▶ ▲ ▼) that appear at the bottom of the screen
on touch devices.  The Tesla MCU browser supports the **Gamepad API**,
so any connected wheel maps automatically.

### Gamepad
- **Left stick X** – steer
- **RT** – accelerate
- **LT** – brake
- **D-pad** – also works for steering and gas/brake

---

## Online multiplayer

No dedicated server is needed – connection is peer-to-peer (WebRTC).

1. **Host** clicks *Host a Game* → copy the generated offer code
2. **Host** sends the code to their friend (chat, text, etc.)
3. **Guest** clicks *Join a Game* → pastes the offer code → click *Connect*
4. **Guest** copies their answer code and sends it back to the host
5. **Host** pastes the answer code → click *Accept Answer*
6. The race starts automatically once connected

> **Note:** WebRTC with STUN only works over most home networks.
> If the connection fails, try a different network or use a VPN.

---

## Local development

The game is pure HTML5 + vanilla ES modules with **no build step**.
Serve the repository root over HTTP (required for ES modules):

```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx)
npx serve .
```

Then open <http://localhost:8080>.

---

## 🐳 Docker

Run the game locally in a single command – no Python or Node.js required:

```bash
# Pull and run the latest image from GitHub Container Registry
docker run -p 8080:80 ghcr.io/commjoen/generatedracer:latest
```

Then open <http://localhost:8080>.

### Build & run locally with Docker Compose

```bash
git clone https://github.com/commjoen/generatedracer.git
cd generatedracer
docker compose up
```

Then open <http://localhost:8080>.

---

## Deployment

### GitHub Pages

The repository is configured to **auto-deploy to GitHub Pages** on every push
to `main` via `.github/workflows/deploy.yml`.

Go to **Settings → Pages → Source → GitHub Actions** to enable it.

### Releases & Container Registry

Pushing a tag in the form `v1.2.3` (or triggering the workflow manually) will:

1. Build the Docker image
2. Push it to **GitHub Container Registry** (`ghcr.io/commjoen/generatedracer`)
   with tags `latest`, `1`, `1.2`, and `1.2.3`
3. Create a **GitHub Release** with auto-generated release notes

```bash
# Tag and push a new release
git tag v1.0.0
git push origin v1.0.0
```

---

## Versioning

The current version is declared in `js/constants.js`:

```js
export const APP_VERSION = '1.0.0';
export const REPO_URL    = 'https://github.com/commjoen/generatedracer';
```

The version is displayed in the bottom of the main menu and in every
Docker image tag.  Bump `APP_VERSION` before tagging a new release.

---

## Security & maintenance

| Tool | Purpose |
|---|---|
| **Dependabot** | Keeps GitHub Actions up to date (`.github/dependabot.yml`) |
| **Renovate** | Auto-merges minor/patch dependency bumps (`renovate.json`) |
| No npm dependencies | Zero supply-chain attack surface for the game itself |

---

## Architecture

```
index.html          Main page, canvas, menus, touch controls
game.css            Responsive styles (mobile, tablet, Tesla, desktop)
js/
  constants.js      Tunable game constants (incl. APP_VERSION, REPO_URL)
  track.js          Catmull-Rom spline track, rendering, collision
  car.js            Car class – arcade physics, drawing
  ai.js             AI controller – waypoint following + rubber-banding
  input.js          Unified input (keyboard / touch / Gamepad API)
  race.js           Lap counting, positions, timing
  hud.js            HUD DOM updates
  network.js        WebRTC peer-to-peer multiplayer
  main.js           Game loop, state machine, wiring
Dockerfile          nginx-based container image for local / self-hosted use
docker-compose.yml  One-command local run
.github/
  workflows/deploy.yml    GitHub Pages deployment
  workflows/release.yml   Automated releases + ghcr.io Docker image push
  dependabot.yml          Dependency update automation
renovate.json             Renovate bot configuration
```

---

## License

[MIT](LICENSE)

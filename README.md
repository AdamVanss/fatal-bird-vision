# Fatal Bird Vision

A browser-based 3D bird flight game controlled by your body. Fly through ring gates, collect apples, and beat the clock, powered by **MediaPipe pose tracking** and a **temporal gesture model** (PyTorch → ONNX).

This repo contains the full stack: the web game, the pose pipeline, and the ML training/export scripts. If you want to help build or improve it, this README is the place to start.

![Fatal Bird Vision](apps/web/public/favicon.svg)

## What we're building

The goal is a museum-style, pose-controlled flight experience that runs in the browser:

- **Webcam input:** MediaPipe detects your upper body and draws a skeleton overlay
- **Body steering:** align your torso dot with the center reticle to fly straight; move up/down/left/right to steer
- **Gesture recognition:** arm movements drive flap, glide, and dive (heuristics today; ONNX model optional)
- **Three.js game:** rail-shooter flight through a tunnel course with rings, apples, and scoring

## Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| [Node.js](https://nodejs.org/) | 18+ | Web app, Vite dev server |
| [Python](https://www.python.org/) | 3.10+ | ML training & ONNX export |
| Webcam | n/a | Pose tracking (required to play) |

Optional: a GPU helps MediaPipe run faster, but CPU fallback is supported.

## Getting started

Clone the repo, then install dependencies:

```bash
git clone <repo-url>
cd fatal-bird-vision

# Web app
cd apps/web
npm install

# ML (only needed if you will train or export models)
cd ../../ml
pip install -r requirements.txt
```

### Run locally

From the repo root:

```bash
npm run dev
```

Or from `apps/web`:

```bash
npm run dev
```

Open **http://localhost:5173**, allow camera access, click **Start Flight**, align your body dot with the center reticle, hold a **T-pose** to calibrate, then fly.

### Run on another device on your network

Browsers require **localhost** or **HTTPS** for webcam access. To test on a laptop or phone on the same Wi‑Fi:

```bash
npm run dev:network
```

Use the **`https://` Network** URL printed in the terminal (e.g. `https://192.168.1.42:5173`).

1. Server and client must be on the **same network**
2. Accept the **self-signed certificate** warning on first visit (Advanced → Proceed)
3. Allow **camera** when prompted

Production preview on the LAN:

```bash
npm run build
npm run preview:network
```

## How to play

| Input | Action |
|-------|--------|
| **Align body dot with center reticle** | Fly straight / tunnel center |
| **Move body up / down** | Climb / descend |
| **Move body left / right** | Strafe |
| **Flap arms** | Extra lift |
| **Space** | Flap (keyboard) |
| **A / D** | Steer left / right (keyboard) |
| **W / S** | Up / down (keyboard) |
| **R** | Restart course |

Stand 2–3 m from the camera with your upper body visible. Even lighting helps tracking.

## Project structure

```
fatal-bird-vision/
├── apps/web/                 # Browser game (Vite + TypeScript + Three.js)
│   ├── src/
│   │   ├── game/             # Bird, flight, course, tunnel, camera, scoring
│   │   ├── pose/             # MediaPipe, skeleton overlay, body steering, ONNX inference
│   │   ├── input/            # Keyboard fallback
│   │   └── constants.ts      # Shared tuning values (flight speed, tunnel size, etc.)
│   └── public/models/        # ONNX model served to the browser
├── ml/                       # PyTorch training pipeline
│   ├── train.py              # Train multi-head TCN
│   ├── export_onnx.py        # Export to browser-ready ONNX
│   ├── eval.py               # Accuracy & confusion matrix
│   ├── dataset.py            # Loading, windowing, synthetic bootstrap data
│   └── model.py              # Network architecture
├── models/                   # Canonical model artifacts (.pt, .onnx, .meta.json)
└── package.json              # Root scripts (dev, build, train)
```

### Key files for contributors

| Area | Start here |
|------|------------|
| Game loop & UI | `apps/web/src/game/Game.ts` |
| Flight physics | `apps/web/src/game/FlightController.ts` |
| Body steering | `apps/web/src/pose/BodySteering.ts` |
| Pose detection | `apps/web/src/pose/PoseDetector.ts` |
| Gesture → controls | `apps/web/src/pose/GestureInference.ts` |
| Course layout | `apps/web/src/game/Course.ts` |
| ML model | `ml/model.py`, `ml/train.py` |

## Architecture

```
Webcam
  → MediaPipe PoseLandmarker
  → normalized landmark buffer (30 frames)
  → body center steering (torso dot vs reticle)
  → heuristic / ONNX gesture inference (flap, etc.)
  → FlightController (X/Y strafe + forward rail)
  → Three.js scene (bird, tunnel, rings, apples)
```

The bird moves on a **rail** (constant forward speed). Player input adjusts lateral (X) and vertical (Y) position within tunnel bounds. The ONNX model is optional; live control uses heuristics from the latest pose frames when the bundled model is synthetic-only.

## Working on the ML pipeline

The default model is trained on procedural gesture sequences. For better real-world accuracy, record your own data in-game:

1. Click **Record Gestures** on the start screen
2. For each label (flap, glide, dive, bank_left, bank_right), perform the motion for 3 seconds
3. Click **Export Dataset JSON**
4. Train and export:

```bash
cd ml
python train.py --data path/to/gesture_dataset.json --epochs 40
python export_onnx.py
python eval.py
```

5. Copy artifacts into the web app:

```bash
cp ../models/gesture_model.onnx ../apps/web/public/models/
cp ../models/gesture_model.meta.json ../apps/web/public/models/
```

Restart the dev server and hard-refresh the browser.

### Model outputs

| Head | Range | Game mapping |
|------|-------|--------------|
| `flap_energy` | 0–1 | Upward thrust |
| `bank` | −1…1 | Lateral bias (legacy; body steering is primary) |
| `pitch_intent` | −1…1 | Vertical bias (legacy) |
| `gesture_logits` | 6 classes | Debug HUD label |

Root shortcuts: `npm run train`, `npm run export-model`.

## Development commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server (http://localhost:5173) |
| `npm run dev:network` | HTTPS dev server on 0.0.0.0 (LAN testing) |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve production build locally |
| `npm run preview:network` | Serve production build on LAN (HTTPS) |
| `npm run train` | Run `ml/train.py` |
| `npm run export-model` | Run `ml/export_onnx.py` |

## Contributing

Contributions are welcome, whether that's gameplay, visuals, pose tracking, ML, docs, or bug fixes.

**Suggested workflow**

1. Open an issue or comment on an existing one before large changes (helps avoid duplicate work)
2. Fork / branch from `main`
3. Make focused changes with a clear commit message
4. Test locally: `npm run dev` and verify camera + flight feel
5. If you touch ML: run `eval.py` and note accuracy in the PR
6. Open a pull request with a short description of what changed and why

**Areas where help is especially useful**

- Gesture model accuracy (recorded datasets, training improvements)
- Course design (ring/apple layouts, difficulty tuning)
- Visual polish (bird model, tunnel, UI)
- Accessibility and fallback controls
- Performance on lower-end devices / mobile browsers
- Documentation and onboarding

**Conventions**

- TypeScript in `apps/web`: match existing style in nearby files
- Tune gameplay via `apps/web/src/constants.ts` when possible instead of magic numbers
- Keep the web app runnable without retraining ML (bundled ONNX + heuristics fallback)

If you're unsure where to start, open an issue describing your interest (e.g. "3D art", "ML", "game feel") and we can point you at a good first task.

## Scoring

- **Rings:** 100 pts each
- **Apples:** 50 pts each
- **Time bonus:** up to 5 pts/sec remaining (120s reference)

## License

MIT. Use freely for demos, learning, and collaboration.

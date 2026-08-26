import * as THREE from "three";
import { Bird } from "./Bird";
import { FlightController } from "./FlightController";
import { CameraRig } from "./CameraRig";
import { World, type MapId } from "./World";
import { Course, courseToTunnelWaypoints, DEFAULT_COURSE } from "./Course";
import { FlightTunnel } from "./FlightTunnel";
import { ScoreManager, HUD } from "./ScoreManager";
import { FloatingText } from "./FloatingText";
import { WinCelebration } from "./WinCelebration";
import { WebcamManager } from "../pose/WebcamManager";
import { PoseDetector, SkeletonOverlay } from "../pose/PoseDetector";
import { BodySteering, isTPose, type BodySteerResult } from "../pose/BodySteering";
import { KeyboardInput } from "../input/KeyboardInput";
import type { FlightInput, PlayerRun, RecordedSample } from "../types";
import {
  BIRD_SKINS,
  DIFFICULTIES,
  PLAYER_NAME_MAX,
  SPEED_BURST_EXTRA,
  SPEED_BURST_SECONDS,
  T_POSE_HOLD_SECONDS,
  TRACKING_LOST_DELAY,
  type DifficultyId,
} from "../constants";
import { fetchPlayers, savePlayerRun, topScores } from "../players";
import { GameAudio } from "../audio/GameAudio";
import { RunRecorder } from "./RunRecorder";
import { SkinPreview } from "./SkinPreview";
import { loadBirdGltf } from "./birdKit";

export type GameState = "menu" | "calibrating" | "playing" | "finished" | "collect";

const IDLE_INPUT: FlightInput = {
  flapEnergy: 0,
  bank: 0,
  pitchIntent: 0,
  bodySteerX: 0,
  bodySteerY: 0,
  gestureClass: "neutral",
  confidence: 0,
  source: "heuristic",
};

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly bird = new Bird();
  private readonly flight = new FlightController();
  private readonly cameraRig: CameraRig;
  private readonly world = new World();
  private readonly course = new Course();
  private readonly tunnel = new FlightTunnel(
    courseToTunnelWaypoints(DEFAULT_COURSE),
  );
  private readonly score: ScoreManager;
  private readonly hud = new HUD();
  private readonly webcam = new WebcamManager();
  private readonly pose = new PoseDetector();
  private readonly skeleton = new SkeletonOverlay("skeleton-overlay");
  private readonly bodySteering = new BodySteering();
  private readonly keyboard = new KeyboardInput();
  private readonly win = new WinCelebration();
  private readonly audio = new GameAudio();
  private readonly clips = new RunRecorder();
  private readonly skinPreview = new SkinPreview();
  private floatingTexts: FloatingText[] = [];

  state: GameState = "menu";
  private tPoseHold = 0;
  private recordedSamples: RecordedSample[] = [];
  private collectLabel: string | null = null;
  private collectFrames: number[][] = [];
  private collectTimer = 0;
  private lastTime = 0;
  private animId = 0;
  private currentInput: FlightInput = { ...IDLE_INPUT };
  private lastSteerX = 0;
  private lastSteerY = 0;
  private keyboardWasSteering = false;
  private playerName = "";
  private difficulty: DifficultyId = "normal";
  private mapId: MapId = "canyon";
  private skinIndex = 0;
  private skinToken = 0;
  private boardReturn: "start" | "finish" = "start";
  private boardHighlight: string | null = null;
  private boardFilter: DifficultyId | "all" = "all";
  private boardPlayers: PlayerRun[] = [];
  private lostTimer = 0;
  private hadBodyTrack = false;
  private trackingLost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;

    this.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 900);
    this.cameraRig = new CameraRig(this.camera);

    this.score = new ScoreManager(this.course.hoopCount);

    this.world.scene.add(this.bird.group);
    this.course.addToScene(this.world.scene);
    this.flight.setTunnel(this.tunnel);

    window.addEventListener("resize", () => this.onResize());
    this.onResize();
  }

  async init(): Promise<void> {
    const skinCanvas = document.getElementById("skin-canvas") as HTMLCanvasElement | null;
    if (skinCanvas) this.skinPreview.mount(skinCanvas);
    try {
      await Promise.all([
        this.world.loadTextures(),
        this.applySkin(0, false),
      ]);
    } catch (err) {
      console.warn("World or bird failed to load:", err);
    }
    this.bindUI();
    this.resetBird();
    this.cameraRig.snapTo(this.bird);
    this.lastTime = performance.now();
    this.loop();

    await Promise.all([
      this.pose.init().catch((err) => console.warn("Pose init failed:", err)),
      this.webcam.start().catch((err) => console.warn("Webcam failed:", err)),
    ]);
  }

  private bindUI(): void {
    document.getElementById("btn-start")!.addEventListener("click", () => {
      void this.armAudio("play");
      this.tryStartFromKiosk();
    });
    document.getElementById("btn-restart")!.addEventListener("click", () => {
      void this.armAudio("play");
      this.startGame();
    });
    document.getElementById("btn-next-player")!.addEventListener("click", () => {
      void this.armAudio("menu");
      this.returnToKiosk();
    });
    document.getElementById("btn-collect")!.addEventListener("click", () => {
      this.enterCollectMode();
    });
    document.getElementById("btn-back-game")!.addEventListener("click", () => {
      this.exitCollectMode();
    });
    document.getElementById("btn-export-data")!.addEventListener("click", () => {
      this.exportDataset();
    });
    document.getElementById("btn-scores")!.addEventListener("click", () => {
      this.audio.ui();
      this.openBoard("start");
    });
    document.getElementById("btn-finish-scores")!.addEventListener("click", () => {
      this.openBoard("finish");
    });
    document.getElementById("btn-board-close")!.addEventListener("click", () => {
      this.closeBoard();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const board = document.getElementById("board-screen");
      if (board && !board.classList.contains("hidden")) this.closeBoard();
    });

    window.addEventListener("keydown", (e) => {
      if (this.state !== "menu") return;
      if (document.getElementById("start-screen")?.classList.contains("hidden")) return;
      if (isNameField(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void this.cycleSkin(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void this.cycleSkin(1);
      }
    });

    document.getElementById("btn-skin-prev")?.addEventListener("click", () => {
      void this.cycleSkin(-1);
    });
    document.getElementById("btn-skin-next")?.addEventListener("click", () => {
      void this.cycleSkin(1);
    });

    document.getElementById("player-name")!.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        void this.armAudio("play");
        this.tryStartFromKiosk();
      }
    });

    document.querySelectorAll("[data-diff]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.diff as DifficultyId;
        this.audio.ui();
        this.selectDifficulty(id);
      });
    });

    document.querySelectorAll("[data-map]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.map as MapId;
        this.audio.ui();
        this.selectMap(id);
      });
    });

    document.querySelectorAll("[data-board-diff]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).dataset.boardDiff as DifficultyId | "all";
        this.boardFilter = id === "all" || DIFFICULTIES[id as DifficultyId] ? id : "all";
        this.audio.ui();
        this.syncBoardFilters();
        this.renderBoard(this.boardPlayers);
      });
    });

    document.querySelectorAll("[data-label]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.collectLabel = (btn as HTMLElement).dataset.label ?? null;
        this.collectFrames = [];
        this.collectTimer = 3;
        const status = document.getElementById("collect-status")!;
        status.textContent = `Recording ${this.collectLabel}… hold the pose`;
      });
    });

    document.getElementById("overlay")!.addEventListener(
      "pointerdown",
      () => {
        void this.armAudio("menu");
      },
      { once: true },
    );
  }

  private selectDifficulty(id: DifficultyId): void {
    if (!DIFFICULTIES[id]) return;
    this.difficulty = id;
    document.querySelectorAll("[data-diff]").forEach((el) => {
      const on = (el as HTMLElement).dataset.diff === id;
      el.classList.toggle("selected", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  private selectMap(id: MapId): void {
    if (id !== "canyon" && id !== "city") return;
    this.mapId = id;
    document.querySelectorAll("[data-map]").forEach((el) => {
      const on = (el as HTMLElement).dataset.map === id;
      el.classList.toggle("selected", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  private cycleSkin(dir: -1 | 1): void {
    void this.applySkin(this.skinIndex + dir, true);
  }

  private async applySkin(index: number, playUi: boolean): Promise<void> {
    const count = BIRD_SKINS.length;
    this.skinIndex = ((index % count) + count) % count;
    const skin = BIRD_SKINS[this.skinIndex];
    const token = ++this.skinToken;
    if (playUi) this.audio.ui();
    const nameEl = document.getElementById("skin-name");
    if (nameEl) nameEl.textContent = skin.name;
    const dots = document.getElementById("skin-dots");
    if (dots) {
      dots.innerHTML = BIRD_SKINS.map(
        (_, i) => `<span class="${i === this.skinIndex ? "on" : ""}"></span>`,
      ).join("");
    }
    try {
      await loadBirdGltf(skin.url);
      if (token !== this.skinToken) return;
      await Promise.all([this.skinPreview.show(skin.id), this.bird.setSkin(skin.id)]);
    } catch (err) {
      console.warn("Bird skin failed to load:", err);
    }
  }

  private setMenuPreview(on: boolean): void {
    this.skinPreview.setActive(on);
    document.getElementById("overlay")?.classList.toggle("is-menu", on);
    if (on) requestAnimationFrame(() => this.skinPreview.resize());
  }

  private readKioskName(): string {
    const input = document.getElementById("player-name") as HTMLInputElement;
    return input.value.replace(/\s+/g, " ").trim().slice(0, PLAYER_NAME_MAX);
  }

  private tryStartFromKiosk(): void {
    const name = this.readKioskName();
    const hint = document.getElementById("name-hint");
    if (!name) {
      hint?.classList.remove("hidden");
      document.getElementById("player-name")?.focus();
      return;
    }
    hint?.classList.add("hidden");
    this.playerName = name;
    this.startGame();
  }

  private startGame(): void {
    if (!this.playerName) {
      this.tryStartFromKiosk();
      return;
    }
    const diff = DIFFICULTIES[this.difficulty];
    void this.clips.flush({
      name: this.playerName,
      difficulty: this.difficulty,
    });
    this.win.stop();
    this.world.setMap(this.mapId);
    this.course.finish.replant((x, z) => this.world.height(x, z));
    this.resetBird(diff.speed);
    this.course.reset(diff.movingRings);
    this.flight.reset();
    this.flight.setForwardSpeed(diff.speed);
    this.keyboard.reset();
    this.bodySteering.reset();
    this.score.start(diff.multiplier);
    this.hud.setPilot(this.playerName, diff.label, diff.multiplier);
    this.clearFloatingTexts();
    this.cameraRig.snapTo(this.bird);
    this.state = "calibrating";
    this.tPoseHold = 0;
    this.lastSteerX = 0;
    this.lastSteerY = 0;
    this.keyboardWasSteering = false;
    this.lostTimer = 0;
    this.hadBodyTrack = false;
    this.trackingLost = false;
    this.audio.resetLostCue();
    this.flight.setHalted(false);
    document.getElementById("lost-banner")!.classList.add("hidden");
    document.getElementById("overlay")!.classList.add("hidden");
    document.getElementById("overlay")!.classList.remove("is-finish", "is-menu");
    document.getElementById("start-screen")!.classList.add("hidden");
    document.getElementById("finish-screen")!.classList.add("hidden");
    document.getElementById("board-screen")!.classList.add("hidden");
    document.getElementById("calibration-banner")!.classList.remove("hidden");
    document.getElementById("hud")!.classList.remove("hidden");
    this.skinPreview.setActive(false);
    this.setCalibrateCopy("Spread your arms. Hold a T-pose.");
  }

  private returnToKiosk(): void {
    void this.clips.flush({
      name: this.playerName,
      difficulty: this.difficulty,
    });
    this.win.stop();
    this.state = "menu";
    this.clearFloatingTexts();
    this.trackingLost = false;
    this.flight.setHalted(false);
    document.getElementById("lost-banner")!.classList.add("hidden");
    document.getElementById("finish-screen")!.classList.add("hidden");
    document.getElementById("board-screen")!.classList.add("hidden");
    document.getElementById("start-screen")!.classList.remove("hidden");
    document.getElementById("overlay")!.classList.remove("hidden");
    document.getElementById("overlay")!.classList.remove("is-finish");
    document.getElementById("hud")!.classList.add("hidden");
    this.setMenuPreview(true);
    const input = document.getElementById("player-name") as HTMLInputElement;
    input.value = "";
    this.playerName = "";
    this.boardHighlight = null;
    input.focus();
  }

  private enterCollectMode(): void {
    this.state = "collect";
    this.setMenuPreview(false);
    document.getElementById("start-screen")!.classList.add("hidden");
    document.getElementById("board-screen")!.classList.add("hidden");
    document.getElementById("collect-screen")!.classList.remove("hidden");
    document.getElementById("overlay")!.classList.remove("hidden");
    document.getElementById("gesture-debug")!.classList.remove("hidden");
  }

  private exitCollectMode(): void {
    this.state = "menu";
    this.collectLabel = null;
    document.getElementById("collect-screen")!.classList.add("hidden");
    document.getElementById("start-screen")!.classList.remove("hidden");
    document.getElementById("gesture-debug")!.classList.add("hidden");
    this.setMenuPreview(true);
  }

  private resetBird(speed = DIFFICULTIES[this.difficulty].speed): void {
    const start = this.tunnel.getCenterAt(0);
    this.bird.position.set(start.x, start.y, 0);
    this.bird.velocity.set(0, 0, speed);
  }

  private exportDataset(): void {
    const blob = new Blob([JSON.stringify(this.recordedSamples, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gesture_dataset_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    document.getElementById("collect-status")!.textContent =
      `Exported ${this.recordedSamples.length} samples`;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.skinPreview.resize();
  }

  private updateFlightInput(dt: number): void {
    if (this.keyboard.isSteering()) {
      if (!this.keyboardWasSteering) {
        this.keyboard.setOffset(this.bodySteering.offsetX, this.bodySteering.offsetY);
        this.keyboardWasSteering = true;
      }
      const kb = this.keyboard.poll(dt);
      this.currentInput = kb;
      this.lastSteerX = kb.bodySteerX;
      this.lastSteerY = kb.bodySteerY;
      return;
    }

    if (this.keyboardWasSteering) {
      this.bodySteering.setOffset(this.lastSteerX, this.lastSteerY);
      this.keyboardWasSteering = false;
    }

    this.lastSteerX = this.bodySteering.offsetX;
    this.lastSteerY = this.bodySteering.offsetY;
    this.currentInput = {
      ...IDLE_INPUT,
      bodySteerX: this.lastSteerX,
      bodySteerY: this.lastSteerY,
      confidence: this.pose.tracking ? 0.9 : 0.4,
      source: "heuristic",
    };
  }

  private setCalibrateCopy(text: string, progress = 0): void {
    const copy = document.getElementById("calibration-copy");
    if (copy) copy.textContent = text;
    document.getElementById("calibration-progress")!.style.setProperty(
      "--progress",
      `${progress * 100}%`,
    );
  }

  private updateCalibration(
    dt: number,
    frame: ReturnType<PoseDetector["detectFromVideo"]>,
  ): void {
    const kbSkip = this.keyboard.isSteering();
    if (kbSkip) {
      this.bodySteering.captureRest(this.pose.lastRawLandmarks);
      document.getElementById("calibration-banner")!.classList.add("hidden");
      this.state = "playing";
      this.clips.start(this.webcam.stream);
      return;
    }

    if (!frame) {
      this.tPoseHold = Math.max(0, this.tPoseHold - dt * 0.6);
      this.setCalibrateCopy(
        "Step back until we can see your body. (WASD to skip)",
        0,
      );
      return;
    }

    this.pose.calibrateFromFrame(frame);
    if (!isTPose(frame.rawLandmarks)) {
      this.tPoseHold = Math.max(0, this.tPoseHold - dt * 0.85);
      this.setCalibrateCopy(
        "Spread both arms out. Hold a T-pose. (WASD to skip)",
        this.tPoseHold / T_POSE_HOLD_SECONDS,
      );
      return;
    }

    this.tPoseHold += dt;
    this.setCalibrateCopy(
      "Hold still…",
      this.tPoseHold / T_POSE_HOLD_SECONDS,
    );

    if (this.tPoseHold >= T_POSE_HOLD_SECONDS) {
      this.bodySteering.captureRest(frame.rawLandmarks);
      document.getElementById("calibration-banner")!.classList.add("hidden");
      this.state = "playing";
      this.clips.start(this.webcam.stream);
    }
  }

  private updateCollect(dt: number, frame: import("../types").NormalizedFrame | null): void {
    if (!this.collectLabel || !frame) return;
    this.collectTimer -= dt;
    this.collectFrames.push(Array.from(frame.landmarks));

    const status = document.getElementById("collect-status")!;
    status.textContent = `Recording ${this.collectLabel}… ${Math.ceil(this.collectTimer)}s`;

    if (this.collectTimer <= 0) {
      this.recordedSamples.push({
        label: this.collectLabel as RecordedSample["label"],
        frames: this.collectFrames,
        timestamp: new Date().toISOString(),
      });
      status.textContent = `Saved ${this.collectLabel} (${this.collectFrames.length} frames)`;
      this.collectLabel = null;
      this.collectFrames = [];
    }
  }

  private loop = (): void => {
    this.animId = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const frame = this.pose.detectFromVideo(this.webcam.video);
    const landmarks = frame?.rawLandmarks ?? this.pose.lastRawLandmarks;
    const accumulating =
      this.state === "playing" &&
      !this.keyboard.isSteering() &&
      this.pose.tracking;
    const steerPreview = accumulating
      ? this.bodySteering.tick(dt, landmarks)
      : this.bodySteering.preview(landmarks);

    this.skeleton.draw(
      this.webcam.video,
      landmarks,
      steerPreview?.center ?? null,
      steerPreview?.aligned ?? false,
      steerPreview?.rest ?? null,
      steerPreview ? { x: steerPreview.leanX, y: steerPreview.leanY } : null,
    );
    this.updateSteerReticle(steerPreview);

    if (this.state === "calibrating") {
      this.updateCalibration(dt, frame);
    }

    if (this.state === "collect") {
      this.updateCollect(dt, frame?.normalized ?? null);
    }

    if (this.state !== "finished") {
      this.updateFlightInput(dt);
    }

    if (this.state === "playing") {
      this.tickPlaying(dt);
    } else if (this.state === "menu" || this.state === "calibrating") {
      this.bird.updateVisuals(dt, 0.3, 0);
      this.cameraRig.update(this.bird, dt);
    }

    this.hud.tick();
    this.floatingTexts = this.floatingTexts.filter((popup) => {
      if (popup.update(dt)) return true;
      popup.dispose();
      return false;
    });
    this.world.update(dt, this.bird.position.z, this.camera.position);
    this.bird.setNightFill(this.world.nightAmount);
    if (this.state === "menu") this.skinPreview.update(dt);
    this.renderer.render(this.world.scene, this.camera);
  };

  private updateSteerReticle(steer: BodySteerResult | null): void {
    const reticle = document.getElementById("steer-reticle");
    const cue = document.getElementById("lean-cue");
    const aligned = steer?.aligned ?? false;
    const restX = this.bodySteering.hasRest
      ? this.bodySteering.restX
      : (steer?.center.x ?? 0.5);
    const restY = this.bodySteering.hasRest
      ? this.bodySteering.restY
      : (steer?.center.y ?? 0.5);
    // Reticle is not CSS-mirrored; invert X so it sits on the rest pose in the preview.
    const left = `${(1 - restX) * 100}%`;
    const top = `${restY * 100}%`;

    if (reticle) {
      reticle.style.left = left;
      reticle.style.top = top;
      reticle.classList.toggle("aligned", aligned);
    }
    document.getElementById("game-reticle")?.classList.toggle("aligned", aligned);

    if (cue) {
      const mag = steer ? Math.hypot(steer.leanX, steer.leanY) : 0;
      cue.style.left = left;
      cue.style.top = top;
      cue.classList.toggle("visible", mag > 0.08);
      if (steer && mag > 0.08) {
        const deg = (Math.atan2(-steer.leanX, steer.leanY) * 180) / Math.PI;
        cue.style.setProperty("--lean-rot", `${deg}deg`);
      }
    }
  }

  private tickPlaying(dt: number): void {
    this.updateTrackingRecovery(dt);
    const diff = DIFFICULTIES[this.difficulty];
    this.flight.update(this.bird, this.currentInput, dt);
    this.cameraRig.update(this.bird, dt);
    if (!this.trackingLost) this.score.update(dt);
    this.course.update(dt, diff.ringMoveRate || 1);

    for (const ring of this.course.rings) {
      const result = ring.checkPass(this.bird.position);
      if (result === "hit") {
        if (ring.speedGate) {
          this.score.addBoost();
          this.flight.boost(SPEED_BURST_SECONDS, SPEED_BURST_EXTRA);
          this.audio.boost();
          this.floatingTexts.push(
            new FloatingText(
              this.world.scene,
              `BOOST +${this.score.lastAward}`,
              this.bird.group,
              "#67e8f9",
            ),
          );
        } else {
          this.score.addRing();
          this.audio.hoop(this.score.streak);
          this.floatingTexts.push(
            new FloatingText(
              this.world.scene,
              `+${this.score.lastAward} XP`,
              this.bird.group,
            ),
          );
        }
      } else if (result === "miss") {
        if (!ring.speedGate) {
          this.score.noteMiss();
          this.cameraRig.punch(0.7);
          this.audio.miss();
          this.floatingTexts.push(
            new FloatingText(this.world.scene, "MISS", this.bird.group, "#f87171"),
          );
        }
      }
    }

    this.hud.updateScore(this.score);
    this.world.setNightTarget(this.score.ringsCollected >= 10);

    if (this.keyboard.wantsRestart()) {
      this.startGame();
      return;
    }

    if (this.score.isComplete(this.course.finishZ, this.bird.position.z)) {
      this.finishRun();
    }
  }

  private updateTrackingRecovery(dt: number): void {
    if (this.pose.tracking) this.hadBodyTrack = true;
    const usingKeys = this.keyboard.isSteering();
    const lost =
      this.hadBodyTrack && !usingKeys && !this.pose.tracking;
    if (lost) {
      this.lostTimer += dt;
      if (this.lostTimer >= TRACKING_LOST_DELAY && !this.trackingLost) {
        this.trackingLost = true;
        this.flight.setHalted(true);
        document.getElementById("lost-banner")!.classList.remove("hidden");
        this.audio.lost();
      }
    } else {
      this.lostTimer = 0;
      if (this.trackingLost) {
        this.trackingLost = false;
        this.flight.setHalted(false);
        document.getElementById("lost-banner")!.classList.add("hidden");
        this.audio.found();
      }
    }
  }

  private clearFloatingTexts(): void {
    for (const popup of this.floatingTexts) popup.dispose();
    this.floatingTexts = [];
  }

  private finishRun(): void {
    this.state = "finished";
    this.score.stop();
    this.trackingLost = false;
    this.flight.setHalted(false);
    document.getElementById("lost-banner")!.classList.add("hidden");
    this.win.burst();
    this.audio.win();
    void this.clips.flush({
      name: this.playerName,
      difficulty: this.difficulty,
    });
    const stats = this.score.toStats();
    const diff = DIFFICULTIES[this.difficulty];
    const clock = formatClock(stats.elapsedSeconds);
    const photo = captureFinishPhoto(
      this.webcam.video,
      this.playerName,
      stats.score,
      diff.label,
    );
    const photoEl = document.getElementById("finish-photo") as HTMLImageElement | null;
    if (photoEl) {
      if (photo) {
        photoEl.src = photo;
        photoEl.classList.remove("hidden");
        this.audio.shutter();
      } else {
        photoEl.removeAttribute("src");
        photoEl.classList.add("hidden");
      }
    }
    document.getElementById("finish-stats")!.textContent =
      `${this.playerName}  ${diff.label}  ${clock}  ${stats.score.toLocaleString("en-US")}`;
    const recap = document.getElementById("finish-recap");
    if (recap) {
      recap.innerHTML = `
        <li><span>Longest chain</span><strong>${stats.bestStreak}</strong></li>
        <li><span>Rings missed</span><strong>${stats.misses}</strong></li>
        <li><span>Rings scored</span><strong>${stats.ringsCollected}/${stats.ringsTotal}</strong></li>
        <li><span>Speed gates</span><strong>${stats.boosts}</strong></li>
      `;
    }
    document.getElementById("board-screen")!.classList.add("hidden");
    document.getElementById("overlay")!.classList.remove("hidden");
    document.getElementById("overlay")!.classList.remove("is-menu");
    document.getElementById("overlay")!.classList.add("is-finish");
    document.getElementById("finish-screen")!.classList.remove("hidden");
    void this.persistRun(stats);
  }

  private async persistRun(stats: {
    ringsCollected: number;
    ringsTotal: number;
    elapsedSeconds: number;
    score: number;
  }): Promise<void> {
    await savePlayerRun({
      name: this.playerName,
      difficulty: this.difficulty,
      multiplier: DIFFICULTIES[this.difficulty].multiplier,
      score: stats.score,
      ringsCollected: stats.ringsCollected,
      ringsTotal: stats.ringsTotal,
      elapsedSeconds: stats.elapsedSeconds,
    });
    this.boardHighlight = `${this.playerName}|${stats.score}`;
  }

  private openBoard(from: "start" | "finish"): void {
    this.boardReturn = from;
    this.setMenuPreview(false);
    document.getElementById("start-screen")!.classList.add("hidden");
    document.getElementById("finish-screen")!.classList.add("hidden");
    document.getElementById("collect-screen")!.classList.add("hidden");
    document.getElementById("overlay")!.classList.remove("hidden");
    document.getElementById("overlay")!.classList.remove("is-finish");
    document.getElementById("board-screen")!.classList.remove("hidden");
    document.getElementById("btn-board-close")?.focus();
    this.syncBoardFilters();
    void this.refreshBoard();
  }

  private closeBoard(): void {
    const board = document.getElementById("board-screen");
    if (!board || board.classList.contains("hidden")) return;
    board.classList.add("hidden");
    if (this.boardReturn === "finish") {
      document.getElementById("overlay")!.classList.add("is-finish");
      document.getElementById("finish-screen")!.classList.remove("hidden");
    } else {
      document.getElementById("start-screen")!.classList.remove("hidden");
      document.getElementById("player-name")?.focus();
      this.setMenuPreview(true);
    }
  }

  private renderBoard(players: PlayerRun[]): void {
    const list = document.getElementById("board-list");
    const status = document.getElementById("board-status");
    if (!list || !status) return;
    const filtered =
      this.boardFilter === "all"
        ? players
        : players.filter((run) => run.difficulty === this.boardFilter);
    const top = topScores(filtered, 12);
    if (!top.length) {
      list.innerHTML = "";
      status.textContent =
        this.boardFilter === "all"
          ? "No scores yet. Finish a game and your name lands here."
          : `No ${DIFFICULTIES[this.boardFilter].label} scores yet.`;
      status.classList.remove("hidden");
      return;
    }
    status.classList.add("hidden");
    list.innerHTML = top
      .map((run, i) => {
        const label = DIFFICULTIES[run.difficulty]?.label ?? run.difficulty;
        const key = `${run.name}|${run.score}`;
        const mine = this.boardHighlight === key;
        const lead = i === 0 ? " lead" : "";
        const mineClass = mine ? " mine" : "";
        const clock = formatClock(run.elapsedSeconds);
        return `<li class="score-row${lead}${mineClass}" style="--i:${i}">
          <span class="score-rank">${i + 1}</span>
          <span class="score-who">
            <span class="score-name">${escapeHtml(run.name)}</span>
            <span class="score-meta">${escapeHtml(label)}  ${run.ringsCollected} rings  ${clock}</span>
          </span>
          <span class="score-pts">${run.score.toLocaleString("en-US")}</span>
        </li>`;
      })
      .join("");
  }

  private async refreshBoard(): Promise<void> {
    const status = document.getElementById("board-status");
    if (status) {
      status.textContent = "Loading scores";
      status.classList.remove("hidden");
    }
    const players = await fetchPlayers();
    this.boardPlayers = players;
    this.renderBoard(players);
  }

  private syncBoardFilters(): void {
    document.querySelectorAll("[data-board-diff]").forEach((el) => {
      const on = (el as HTMLElement).dataset.boardDiff === this.boardFilter;
      el.classList.toggle("selected", on);
    });
  }

  private async armAudio(mode: "menu" | "play"): Promise<void> {
    await this.audio.unlock();
    this.audio.setMusic(mode);
  }

  dispose(): void {
    cancelAnimationFrame(this.animId);
    this.clearFloatingTexts();
    this.win.stop();
    this.clips.discard();
    this.webcam.stop();
    this.audio.dispose();
    this.skinPreview.dispose();
  }
}

function isNameField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.id === "player-name" || target.tagName === "INPUT");
}

function captureFinishPhoto(
  video: HTMLVideoElement,
  name: string,
  score: number,
  difficulty: string,
): string | null {
  if (video.readyState < 2 || video.videoWidth < 16) return null;
  const w = 640;
  const h = 480;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const fade = ctx.createLinearGradient(0, h * 0.52, 0, h);
  fade.addColorStop(0, "rgba(5,5,5,0)");
  fade.addColorStop(1, "rgba(5,5,5,0.84)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#5fd832";
  ctx.font = "600 22px Geist, system-ui, sans-serif";
  ctx.fillText(name, 24, h - 54);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 34px Geist, system-ui, sans-serif";
  ctx.fillText(score.toLocaleString("en-US"), 24, h - 18);
  ctx.fillStyle = "#9a9a9a";
  ctx.font = "500 13px 'JetBrains Mono', ui-monospace, monospace";
  const labelW = ctx.measureText(difficulty).width;
  ctx.fillText(difficulty, w - 24 - labelW, h - 22);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

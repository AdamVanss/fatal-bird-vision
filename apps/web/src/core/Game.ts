import * as THREE from "three";
import { Bird } from "../bird/Bird";
import { FlightController } from "../flight/FlightController";
import { CameraRig } from "../flight/CameraRig";
import { World } from "../course/World";
import {
  Course,
  courseToTunnelWaypoints,
  DEFAULT_COURSE,
  lastGateZ,
} from "../course/Course";
import { FlightTunnel } from "../course/FlightTunnel";
import { CollisionRunner } from "../course/CollisionRunner";
import { FlightEffects } from "../effects/FlightEffects";
import { ScoreManager, HUD } from "../scoring/ScoreManager";
import { WebcamManager } from "../pose/WebcamManager";
import { PoseDetector, SkeletonOverlay, type PoseFrame } from "../pose/PoseDetector";
import { FlightInputSource } from "../input/FlightInputSource";
import { AIBrainHUD } from "../pose/AIBrainHUD";
import { AudioManager } from "../audio/AudioManager";
import type { RecordedSample, FlightInput } from "../types";
import { neutralInput } from "../types";
import { ParticleSystem } from "../effects/ParticleSystem";
import { ComboSystem } from "../scoring/ComboSystem";
import { FloatingText } from "../scoring/FloatingText";
import { FireTrail } from "../effects/FireTrail";
import { SpeedBoostEffect } from "../flight/SpeedBoostEffect";
import { LightingManager } from "../effects/LightingManager";
import {
  BASE_CAMERA_FOV,
  CALIBRATION_FRAMES,
  CAMERA,
  COMBO_IGNITE_MULTIPLIER,
  COMBO_MAX_MULTIPLIER,
  FLIGHT,
  LOOP_MAX_DT,
  SCORING,
  TUNNEL,
  VISUAL_PARTICLE_COUNTS,
} from "../constants";

export type GameState = "menu" | "calibrating" | "playing" | "finished" | "collect";

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
    lastGateZ(DEFAULT_COURSE) + TUNNEL.finishOverrun,
  );
  private readonly score: ScoreManager;
  private readonly hud = new HUD();
  private readonly particleSystem = new ParticleSystem();
  private lightingManager!: LightingManager;
  private readonly webcam = new WebcamManager();
  private readonly pose = new PoseDetector();
  private readonly skeleton = new SkeletonOverlay("skeleton-overlay");
  private readonly inputSource: FlightInputSource;
  private readonly collisions: CollisionRunner;
  private readonly effects: FlightEffects;
  private readonly audio = new AudioManager();
  private readonly aiBrainHUD = new AIBrainHUD(document.body);
  private readonly combo = new ComboSystem();
  private readonly fireTrail = new FireTrail();
  private readonly speedBoost = new SpeedBoostEffect();
  private floatingTexts: FloatingText[] = [];

  state: GameState = "menu";
  private calibrationFrames = 0;
  private recordedSamples: RecordedSample[] = [];
  private collectLabel: string | null = null;
  private collectFrames: number[][] = [];
  private collectTimer = 0;
  private lastTime = 0;
  private animId = 0;
  private currentInput: FlightInput = neutralInput();

  private readonly calibrationBannerEl =
    document.getElementById("calibration-banner")!;
  private readonly calibrationProgressEl =
    document.getElementById("calibration-progress")!;
  private readonly gestureLabelEl = document.getElementById("gesture-label")!;
  private readonly gestureConfidenceEl =
    document.getElementById("gesture-confidence")!;

  private readonly handleResize = (): void => this.onResize();
  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "KeyB") this.aiBrainHUD.toggle();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CAMERA.pixelRatioCap));
    this.renderer.shadowMap.enabled = true;

    this.camera = new THREE.PerspectiveCamera(
      BASE_CAMERA_FOV,
      1,
      CAMERA.near,
      CAMERA.far,
    );
    this.cameraRig = new CameraRig(this.camera);

    this.score = new ScoreManager(
      this.course.rings.length,
      this.course.apples.length,
    );

    this.inputSource = new FlightInputSource(this.pose);
    this.collisions = new CollisionRunner(this.course);
    this.effects = new FlightEffects(this.bird, this.particleSystem, this.audio);

    this.world.scene.add(this.bird.group);
    this.world.scene.add(this.tunnel.mesh);
    this.course.addToScene(this.world.scene);
    this.world.scene.add(this.particleSystem.group);
    this.world.scene.add(this.fireTrail.points);
    this.lightingManager = new LightingManager(this.world.scene);
    this.flight.setTunnel(this.tunnel);

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleKeyDown);
    this.handleResize();
  }

  async init(): Promise<void> {
    await this.webcam.start();
    await this.pose.init();
    await this.bird.loadModel();
    this.bindUI();
    this.lastTime = performance.now();
    this.loop();
  }

  private bindUI(): void {
    document.getElementById("btn-start")!.addEventListener("click", () => {
      this.startGame();
    });
    document.getElementById("btn-restart")!.addEventListener("click", () => {
      this.startGame();
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

    document.querySelectorAll("[data-label]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.collectLabel = (btn as HTMLElement).dataset.label ?? null;
        this.collectFrames = [];
        this.collectTimer = 3;
        const status = document.getElementById("collect-status")!;
        status.textContent = `Recording ${this.collectLabel}… hold the pose`;
      });
    });
  }

  private startGame(): void {
    this.resetBird();
    this.cameraRig.reset(this.bird);
    this.course.reset();
    this.flight.reset();
    this.score.start();
    this.particleSystem.reset();
    this.lightingManager.reset();
    this.effects.reset();
    this.combo.reset();
    this.fireTrail.reset();
    this.speedBoost.reset();
    this.restoreCameraFov();
    for (const ft of this.floatingTexts) ft.dispose();
    this.floatingTexts = [];
    this.state = "calibrating";
    this.calibrationFrames = 0;
    // Fire-and-forget; inits the Web Audio graph and resumes it within the
    // user's click, then fades the wind bed in for the flight.
    void this.audio.init();
    this.audio.startWindAmbient();
    document.getElementById("overlay")!.classList.add("hidden");
    document.getElementById("start-screen")!.classList.add("hidden");
    document.getElementById("finish-screen")!.classList.add("hidden");
    document.getElementById("calibration-banner")!.classList.remove("hidden");
  }

  private enterCollectMode(): void {
    this.state = "collect";
    document.getElementById("start-screen")!.classList.add("hidden");
    document.getElementById("collect-screen")!.classList.remove("hidden");
    document.getElementById("overlay")!.classList.remove("hidden");
  }

  private exitCollectMode(): void {
    this.state = "menu";
    this.collectLabel = null;
    document.getElementById("collect-screen")!.classList.add("hidden");
    document.getElementById("start-screen")!.classList.remove("hidden");
  }

  private resetBird(): void {
    const start = this.tunnel.getCenterAt(0);
    this.bird.position.set(start.x, start.y, 0);
    this.bird.velocity.set(0, 0, FLIGHT.forwardSpeed);
  }

  private restoreCameraFov(): void {
    this.camera.fov = BASE_CAMERA_FOV;
    this.camera.updateProjectionMatrix();
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
  }

  private updateCalibration(frame: PoseFrame | null): void {
    if (!frame) return;
    this.pose.calibrateFromFrame(frame);
    this.calibrationFrames += 1;
    const progress = (this.calibrationFrames / CALIBRATION_FRAMES) * 100;
    this.calibrationProgressEl.style.setProperty("--progress", `${progress}%`);

    if (this.calibrationFrames >= CALIBRATION_FRAMES) {
      this.calibrationBannerEl.classList.add("hidden");
      this.state = "playing";
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
    const dt = Math.min((now - this.lastTime) / 1000, LOOP_MAX_DT);
    this.lastTime = now;

    const frame = this.pose.detectFromVideo(this.webcam.video);
    this.skeleton.draw(
      this.webcam.video,
      frame?.rawLandmarks ?? this.pose.lastRawLandmarks,
    );

    this.updatePoseHud(frame);

    if (this.state === "calibrating") {
      this.updateCalibration(frame);
    }

    if (this.state === "collect") {
      this.updateCollect(dt, frame?.normalized ?? null);
    }

    if (this.state !== "finished") {
      this.currentInput = this.inputSource.poll();
      this.aiBrainHUD.update(this.currentInput);
      this.hud.updateGesture(
        this.pose.tracking ? this.currentInput.gestureClass : "no pose",
        this.pose.tracking ? this.currentInput.confidence : 0,
      );
    }

    if (this.state === "playing") {
      this.tickPlaying(dt);
    }

    this.particleSystem.update(dt);
    this.fireTrail.update(dt);
    this.floatingTexts = this.floatingTexts.filter((popup) => {
      if (popup.update(dt)) return true;
      popup.dispose();
      return false;
    });
    const progress =
      this.state === "playing"
        ? THREE.MathUtils.clamp(this.bird.position.z / this.tunnel.finishZ, 0, 1)
        : 0;
    this.lightingManager.update(progress, dt);

    this.renderer.render(this.world.scene, this.camera);
  };

  private updatePoseHud(frame: PoseFrame | null): void {
    if (frame || this.pose.tracking) return;
    if (this.state === "calibrating") {
      this.calibrationBannerEl.classList.remove("hidden");
    }
    this.gestureLabelEl.textContent = "no pose — step back, show upper body";
    this.gestureConfidenceEl.textContent = "";
  }

  private tickPlaying(dt: number): void {
    const input = this.currentInput;
    this.updateBoostedFlight(dt, input);
    this.handleCollisions(dt);
    this.updateComboTrail(dt);
    this.effects.update(dt, input);

    this.hud.updateScore(this.score);

    // The restart check deliberately precedes the finish checks: on the frame
    // a restart happens, finish detection is skipped.
    if (this.inputSource.wantsRestart()) {
      this.startGame();
      return;
    }

    if (this.score.isCourseComplete(this.tunnel.finishZ, this.bird.position.z)) {
      this.finishCourse(true);
    } else if (this.score.elapsedSeconds >= SCORING.timeBonusBaseSeconds) {
      this.finishCourse(false);
    }
  }

  private updateBoostedFlight(dt: number, input: FlightInput): void {
    this.speedBoost.update(dt, input);
    this.flight.setSpeedMultiplier(this.speedBoost.getSpeedMultiplier());
    this.flight.update(this.bird, input, dt);
    this.cameraRig.update(this.bird, dt);
    const fov = BASE_CAMERA_FOV + this.speedBoost.getFovOffset();
    if (fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.score.update(dt);
  }

  private handleCollisions(dt: number): void {
    const hits = this.collisions.update(dt, this.bird.position);
    if (hits.ringHit) this.onRingScored();
    if (hits.appleHit) this.onAppleScored();
  }

  private onRingScored(): void {
    this.score.addRing();
    this.combo.onRingHit();
    const mult = this.combo.getMultiplier();
    const points = Math.floor(SCORING.ringPoints * mult);
    // addRing already covers the base 100; the multiplier delta lands as bonus
    this.score.addBonus(points - SCORING.ringPoints);
    this.audio.playRing();
    this.particleSystem.emit(
      VISUAL_PARTICLE_COUNTS.ring,
      this.bird.position,
      "ring",
    );
    this.floatingTexts.push(
      new FloatingText(this.world.scene, `+${points} x${mult}`, this.bird.group),
    );
  }

  private onAppleScored(): void {
    this.score.addApple();
    this.audio.playApple();
    this.particleSystem.emit(
      VISUAL_PARTICLE_COUNTS.apple,
      this.bird.position,
      "apple",
    );
  }

  private updateComboTrail(dt: number): void {
    this.combo.update(this.bird.position, this.course.rings, this.tunnel);
    const mult = this.combo.getMultiplier();
    this.fireTrail.setIntensity(
      mult >= COMBO_IGNITE_MULTIPLIER
        ? (mult - COMBO_IGNITE_MULTIPLIER) /
            (COMBO_MAX_MULTIPLIER - COMBO_IGNITE_MULTIPLIER)
        : 0,
    );
    this.fireTrail.emit(this.bird.position, dt);
  }

  private finishCourse(completed: boolean): void {
    this.state = "finished";
    this.score.stop();
    this.restoreCameraFov();
    this.audio.stopWindAmbient();
    this.particleSystem.emit(
      completed ? VISUAL_PARTICLE_COUNTS.finish : VISUAL_PARTICLE_COUNTS.timeout,
      this.bird.position,
      completed ? "finish" : "timeout",
    );
    const stats = this.score.toStats();
    document.getElementById("finish-stats")!.textContent =
      `Rings ${stats.ringsCollected}/${stats.ringsTotal} · Apples ${stats.applesCollected}/${stats.applesTotal} · Time ${stats.elapsedSeconds.toFixed(1)}s · Score ${stats.score}`;
    document.getElementById("overlay")!.classList.remove("hidden");
    document.getElementById("finish-screen")!.classList.remove("hidden");
  }

  dispose(): void {
    cancelAnimationFrame(this.animId);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.inputSource.dispose();
    this.pose.close();
    this.webcam.stop();
    this.audio.dispose();
    this.aiBrainHUD.dispose();
    this.bird.dispose();
    this.particleSystem.dispose();
    this.fireTrail.dispose();
    for (const ft of this.floatingTexts) ft.dispose();
    this.floatingTexts = [];
    this.lightingManager.dispose();
    this.renderer.dispose();
  }
}
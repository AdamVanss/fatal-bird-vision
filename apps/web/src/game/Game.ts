import * as THREE from "three";
import { Bird } from "./Bird";
import { FlightController } from "./FlightController";
import { CameraRig } from "./CameraRig";
import { World } from "./World";
import { Course, courseToTunnelWaypoints, DEFAULT_COURSE } from "./Course";
import { FlightTunnel } from "./FlightTunnel";
import { ScoreManager, HUD } from "./ScoreManager";
import { WebcamManager } from "../pose/WebcamManager";
import { PoseDetector, SkeletonOverlay } from "../pose/PoseDetector";
import { GestureInference } from "../pose/GestureInference";
import { BodySteering } from "../pose/BodySteering";
import { KeyboardInput } from "../input/KeyboardInput";
import type { RecordedSample } from "../types";
import { CALIBRATION_FRAMES, FLIGHT } from "../constants";

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
  );
  private readonly score: ScoreManager;
  private readonly hud = new HUD();
  private readonly webcam = new WebcamManager();
  private readonly pose = new PoseDetector();
  private readonly skeleton = new SkeletonOverlay("skeleton-overlay");
  private readonly gesture = new GestureInference();
  private readonly bodySteering = new BodySteering();
  private readonly keyboard = new KeyboardInput();

  state: GameState = "menu";
  private calibrationFrames = 0;
  private recordedSamples: RecordedSample[] = [];
  private collectLabel: string | null = null;
  private collectFrames: number[][] = [];
  private collectTimer = 0;
  private lastTime = 0;
  private animId = 0;
  private currentInput: import("../types").FlightInput = {
    flapEnergy: 0,
    bank: 0,
    pitchIntent: 0,
    bodySteerX: 0,
    bodySteerY: 0,
    gestureClass: "neutral",
    confidence: 0,
    source: "heuristic",
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    this.cameraRig = new CameraRig(this.camera);

    this.score = new ScoreManager(
      this.course.rings.length,
      this.course.apples.length,
    );

    this.world.scene.add(this.bird.group);
    this.world.scene.add(this.tunnel.meshGroup);
    this.course.addToScene(this.world.scene);
    this.flight.setTunnel(this.tunnel);

    window.addEventListener("resize", () => this.onResize());
    this.onResize();
  }

  async init(): Promise<void> {
    await this.webcam.start();
    await this.pose.init();
    await this.bird.loadModel();
    await this.gesture.init();
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
    this.course.reset();
    this.flight.reset();
    this.score.start();
    this.state = "calibrating";
    this.calibrationFrames = 0;
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

  private updateFlightInput(): void {
    const kb = this.keyboard.poll();
    if (kb.flapEnergy > 0 || kb.bodySteerX !== 0 || kb.bodySteerY !== 0) {
      this.currentInput = kb;
      return;
    }

    if (!this.pose.tracking) {
      this.currentInput = {
        flapEnergy: 0,
        bank: 0,
        pitchIntent: 0,
        bodySteerX: 0,
        bodySteerY: 0,
        gestureClass: "neutral",
        confidence: 0,
        source: "heuristic",
      };
      return;
    }

    const current = this.pose.buffer.getLatest();
    if (!current) {
      this.currentInput = {
        flapEnergy: 0,
        bank: 0,
        pitchIntent: 0,
        bodySteerX: 0,
        bodySteerY: 0,
        gestureClass: "neutral",
        confidence: 0,
        source: "heuristic",
      };
      return;
    }

    const heuristic = this.gesture.heuristicFromFrames(
      current,
      this.pose.buffer.getPrevious(),
    );
    const steer = this.bodySteering.compute(this.pose.lastRawLandmarks);

    this.currentInput = {
      ...heuristic,
      bodySteerX: steer?.steerX ?? 0,
      bodySteerY: steer?.steerY ?? 0,
    };
  }

  private updateCalibration(frame: ReturnType<PoseDetector["detectFromVideo"]>): void {
    if (!frame) return;
    this.pose.calibrateFromFrame(frame);
    this.calibrationFrames += 1;
    const progress = (this.calibrationFrames / CALIBRATION_FRAMES) * 100;
    document.getElementById("calibration-progress")!.style.setProperty(
      "--progress",
      `${progress}%`,
    );

    if (this.calibrationFrames >= CALIBRATION_FRAMES) {
      document.getElementById("calibration-banner")!.classList.add("hidden");
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
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const frame = this.pose.detectFromVideo(this.webcam.video);
    const steerPreview = this.bodySteering.compute(
      frame?.rawLandmarks ?? this.pose.lastRawLandmarks,
    );
    this.skeleton.draw(
      this.webcam.video,
      frame?.rawLandmarks ?? this.pose.lastRawLandmarks,
      steerPreview?.center ?? null,
      steerPreview?.aligned ?? false,
    );
    this.updateSteerReticle(steerPreview?.aligned ?? false);

    this.updatePoseHud(frame);

    if (this.state === "calibrating") {
      this.updateCalibration(frame);
    }

    if (this.state === "collect") {
      this.updateCollect(dt, frame?.normalized ?? null);
    }

    if (this.state !== "finished") {
      this.updateFlightInput();
      this.hud.updateGesture(
        this.pose.tracking ? this.currentInput.gestureClass : "no pose",
        this.pose.tracking ? this.currentInput.confidence : 0,
      );
    }

    if (this.state === "playing") {
      this.tickPlaying(dt);
    }

    this.renderer.render(this.world.scene, this.camera);
  };

  private updateSteerReticle(aligned: boolean): void {
    const webcamReticle = document.getElementById("steer-reticle");
    const gameReticle = document.getElementById("game-reticle");
    webcamReticle?.classList.toggle("aligned", aligned);
    gameReticle?.classList.toggle("aligned", aligned);
  }

  private updatePoseHud(frame: ReturnType<PoseDetector["detectFromVideo"]>): void {
    const banner = document.getElementById("calibration-banner");
    const label = document.getElementById("gesture-label");
    if (!frame && !this.pose.tracking && label) {
      if (this.state === "calibrating") {
        banner?.classList.remove("hidden");
      }
      label.textContent = "no pose — step back, show upper body";
      document.getElementById("gesture-confidence")!.textContent = "";
    }
  }

  private tickPlaying(dt: number): void {
    const input = this.currentInput;
    this.flight.update(this.bird, input, dt);
    this.cameraRig.update(this.bird, dt);
    this.score.update(dt);

    for (const ring of this.course.rings) {
      if (ring.checkPass(this.bird.position)) this.score.addRing();
    }
    for (const apple of this.course.apples) {
      apple.update(dt);
      if (apple.tryCollect(this.bird.position)) this.score.addApple();
    }

    this.hud.updateScore(this.score);

    if (this.keyboard.wantsRestart()) {
      this.startGame();
      return;
    }

    if (this.score.isCourseComplete(this.tunnel.finishZ, this.bird.position.z)) {
      this.finishCourse();
    }
  }

  private finishCourse(): void {
    this.state = "finished";
    this.score.stop();
    const stats = this.score.toStats();
    document.getElementById("finish-stats")!.textContent =
      `Rings ${stats.ringsCollected}/${stats.ringsTotal} · Apples ${stats.applesCollected}/${stats.applesTotal} · Time ${stats.elapsedSeconds.toFixed(1)}s · Score ${stats.score}`;
    document.getElementById("overlay")!.classList.remove("hidden");
    document.getElementById("finish-screen")!.classList.remove("hidden");
  }

  dispose(): void {
    cancelAnimationFrame(this.animId);
    this.webcam.stop();
  }
}

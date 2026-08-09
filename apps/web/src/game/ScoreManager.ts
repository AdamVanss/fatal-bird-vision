import type { CourseStats } from "../types";
import { SCORING } from "../constants";

export class ScoreManager {
  ringsCollected = 0;
  applesCollected = 0;
  elapsedSeconds = 0;
  readonly ringsTotal: number;
  readonly applesTotal: number;
  private running = false;

  constructor(ringsTotal: number, applesTotal: number) {
    this.ringsTotal = ringsTotal;
    this.applesTotal = applesTotal;
  }

  start(): void {
    this.running = true;
    this.ringsCollected = 0;
    this.applesCollected = 0;
    this.elapsedSeconds = 0;
  }

  stop(): void {
    this.running = false;
  }

  update(dt: number): void {
    if (this.running) this.elapsedSeconds += dt;
  }

  addRing(): void {
    this.ringsCollected += 1;
  }

  addApple(): void {
    this.applesCollected += 1;
  }

  get score(): number {
    const timeBonus = Math.max(
      0,
      Math.floor(120 - this.elapsedSeconds) * SCORING.timeBonusPerSecond,
    );
    return (
      this.ringsCollected * SCORING.ringPoints +
      this.applesCollected * SCORING.applePoints +
      timeBonus
    );
  }

  isCourseComplete(finishZ: number, birdZ: number): boolean {
    return birdZ >= finishZ;
  }

  toStats(): CourseStats {
    return {
      ringsCollected: this.ringsCollected,
      ringsTotal: this.ringsTotal,
      applesCollected: this.applesCollected,
      applesTotal: this.applesTotal,
      elapsedSeconds: this.elapsedSeconds,
      score: this.score,
    };
  }
}

export class HUD {
  private readonly appleEl = document.getElementById("apple-count")!;
  private readonly ringEl = document.getElementById("ring-count")!;
  private readonly scoreEl = document.getElementById("score-total")!;
  private readonly timerEl = document.getElementById("timer")!;
  private readonly gestureLabel = document.getElementById("gesture-label")!;
  private readonly gestureConf = document.getElementById("gesture-confidence")!;

  updateScore(sm: ScoreManager): void {
    this.appleEl.textContent = `${sm.applesCollected}/${sm.applesTotal}`;
    this.ringEl.textContent = `Rings ${sm.ringsCollected}/${sm.ringsTotal}`;
    this.scoreEl.textContent = `Score ${sm.score}`;
    const m = Math.floor(sm.elapsedSeconds / 60);
    const s = Math.floor(sm.elapsedSeconds % 60);
    this.timerEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }

  updateGesture(label: string, confidence: number): void {
    this.gestureLabel.textContent = label;
    this.gestureConf.textContent = `${Math.round(confidence * 100)}% conf`;
  }
}

import type { CourseStats } from "../types";
import { SCORING, SPEED_GATE_XP, streakAward } from "../constants";

export class ScoreManager {
  ringsCollected = 0;
  elapsedSeconds = 0;
  lastAward = 0;
  multiplier = 1;
  streak = 0;
  bestStreak = 0;
  misses = 0;
  boosts = 0;
  readonly ringsTotal: number;
  private running = false;
  private points = 0;

  constructor(ringsTotal: number) {
    this.ringsTotal = ringsTotal;
  }

  start(multiplier = 1): void {
    this.running = true;
    this.ringsCollected = 0;
    this.elapsedSeconds = 0;
    this.points = 0;
    this.lastAward = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.misses = 0;
    this.boosts = 0;
    this.multiplier = multiplier;
  }

  stop(): void {
    this.running = false;
  }

  update(dt: number): void {
    if (this.running) this.elapsedSeconds += dt;
  }

  addRing(): number {
    this.streak += 1;
    this.ringsCollected += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const award = streakAward(this.streak, this.multiplier);
    this.points += award;
    this.lastAward = award;
    return award;
  }

  addBoost(): number {
    this.boosts += 1;
    const award = Math.round(SPEED_GATE_XP * this.multiplier);
    this.points += award;
    this.lastAward = award;
    return award;
  }

  breakStreak(): void {
    if (this.streak > 0) this.misses += 1;
    this.streak = 0;
  }

  noteMiss(): void {
    this.misses += 1;
    this.streak = 0;
  }

  get score(): number {
    const timeBonus = Math.max(
      0,
      Math.floor(90 - this.elapsedSeconds) *
        SCORING.timeBonusPerSecond *
        this.multiplier,
    );
    return Math.round(this.points + timeBonus);
  }

  isComplete(finishZ: number, birdZ: number): boolean {
    return birdZ >= finishZ;
  }

  toStats(): CourseStats {
    return {
      ringsCollected: this.ringsCollected,
      ringsTotal: this.ringsTotal,
      elapsedSeconds: this.elapsedSeconds,
      score: this.score,
      bestStreak: this.bestStreak,
      misses: this.misses,
      boosts: this.boosts,
    };
  }
}

export class HUD {
  private readonly ringEl = document.getElementById("ring-count")!;
  private readonly scoreEl = document.getElementById("score-total")!;
  private readonly timerEl = document.getElementById("timer")!;
  private readonly streakEl = document.getElementById("streak-readout");
  private readonly chipEl = document.getElementById("player-chip");
  private readonly popEl = document.getElementById("score-pop");
  private popUntil = 0;

  setPilot(name: string, difficultyLabel: string, multiplier: number): void {
    if (!this.chipEl) return;
    const mult =
      multiplier === 1 ? "1×" : `${multiplier.toString().replace(/\.0$/, "")}×`;
    this.chipEl.textContent = `${name} · ${difficultyLabel} · ${mult}`;
  }

  updateScore(sm: ScoreManager): void {
    this.ringEl.textContent = `${sm.ringsCollected}/${sm.ringsTotal} rings`;
    this.scoreEl.textContent = `${sm.score}`;
    const m = Math.floor(sm.elapsedSeconds / 60);
    const s = Math.floor(sm.elapsedSeconds % 60);
    this.timerEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    if (this.streakEl) {
      if (sm.streak >= 1) {
        this.streakEl.textContent = `chain ${sm.streak}`;
        this.streakEl.classList.remove("hidden");
        this.streakEl.classList.toggle("hot", sm.streak >= 4);
      } else {
        this.streakEl.textContent = "";
        this.streakEl.classList.add("hidden");
        this.streakEl.classList.remove("hot");
      }
    }
  }

  celebrate(points: number): void {
    this.showPop(`+${points} XP`, false);
  }

  celebrateMiss(): void {
    this.showPop("Miss", true);
  }

  celebrateBoost(points: number): void {
    this.showPop(`Boost +${points}`, false);
  }

  tick(): void {
    if (this.popEl && performance.now() > this.popUntil) {
      this.popEl.classList.remove("show", "miss");
      this.popEl.classList.add("hidden");
    }
  }

  private showPop(text: string, miss: boolean): void {
    if (!this.popEl) return;
    this.popEl.textContent = text;
    this.popEl.classList.toggle("miss", miss);
    this.popEl.classList.remove("hidden");
    this.popEl.classList.remove("show");
    void this.popEl.offsetWidth;
    this.popEl.classList.add("show");
    this.popUntil = performance.now() + (miss ? 700 : 900);
  }
}

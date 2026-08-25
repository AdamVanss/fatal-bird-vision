import { GESTURE_CLASSES } from "../constants";
import type { FlightInput } from "../types";

/** Sparkline stroke — canvas drawing can't read CSS variables */
const ACCENT = "#3ecf8e";

const SPARK_WIDTH = 60;
const SPARK_HEIGHT = 24;
const SPARK_SAMPLES = 30;

const CLASS_LABELS: Record<string, string> = {
  neutral: "NEUTRAL",
  flap: "FLAP",
  glide: "GLIDE",
  bank_left: "BANK L",
  bank_right: "BANK R",
};

/**
 * Visualizes the live gesture decision. No model runs per-frame — the panel
 * synthesizes the 5-class confidence distribution from the existing
 * FlightInput: the winning gestureClass takes `confidence`, the remaining
 * probability mass is spread across the other classes.
 */
export class AIBrainHUD {
  private readonly container: HTMLDivElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly fills: HTMLDivElement[] = [];
  private readonly labels: HTMLSpanElement[] = [];
  private readonly winningLabel: HTMLSpanElement;
  private readonly spark: HTMLCanvasElement;
  private readonly history: number[] = [];
  private collapsed = false;

  constructor(parent: HTMLElement) {
    this.container = document.createElement("div");
    this.container.className = "ai-brain";

    const head = document.createElement("div");
    head.className = "ai-brain-head";

    const title = document.createElement("span");
    title.className = "ai-brain-title";
    title.textContent = "AI Brain";
    head.appendChild(title);

    this.toggleButton = document.createElement("button");
    this.toggleButton.type = "button";
    this.toggleButton.className = "ai-brain-toggle";
    this.toggleButton.textContent = "–";
    this.toggleButton.setAttribute("aria-label", "Hide AI Brain panel");
    this.toggleButton.addEventListener("click", () => this.toggle());
    head.appendChild(this.toggleButton);

    this.container.appendChild(head);

    for (const gesture of GESTURE_CLASSES) {
      const row = document.createElement("div");
      row.className = "ai-brain-row";

      const label = document.createElement("span");
      label.className = "ai-brain-label";
      label.textContent = CLASS_LABELS[gesture] ?? gesture;

      const fill = document.createElement("div");
      fill.className = "ai-brain-fill";

      const track = document.createElement("div");
      track.className = "ai-brain-track";
      track.appendChild(fill);

      row.append(label, track);
      this.container.appendChild(row);

      this.fills.push(fill);
      this.labels.push(label);
    }

    this.winningLabel = document.createElement("span");
    this.winningLabel.className = "ai-brain-winner";
    this.winningLabel.textContent = "—";
    this.container.appendChild(this.winningLabel);

    this.spark = document.createElement("canvas");
    this.spark.width = SPARK_WIDTH;
    this.spark.height = SPARK_HEIGHT;
    this.spark.className = "ai-brain-spark";
    this.container.appendChild(this.spark);

    parent.appendChild(this.container);
  }

  update(input: FlightInput | undefined): void {
    const winnerIdx = input && input.confidence > 0
      ? Math.max(
          0,
          GESTURE_CLASSES.indexOf(input.gestureClass),
        )
      : 0;
    const hasSignal = Boolean(input && input.confidence > 0);
    const confidence = hasSignal
      ? Math.min(0.95, Math.max(0.05, input!.confidence))
      : 0;

    for (let i = 0; i < GESTURE_CLASSES.length; i++) {
      const isWinner = hasSignal && i === winnerIdx;
      const prob = isWinner
        ? confidence
        : (1 - confidence) / (GESTURE_CLASSES.length - 1 || 1);
      this.fills[i].style.width = `${prob * 100}%`;
      this.fills[i].classList.toggle("winner", isWinner);
      this.labels[i].classList.toggle("winner", isWinner);
    }

    this.winningLabel.textContent = hasSignal
      ? `WIN: ${CLASS_LABELS[input!.gestureClass] ?? input!.gestureClass}`
      : "—";

    if (hasSignal && input) {
      this.pushSpark(input.flapEnergy);
    } else {
      this.pushSpark(0);
    }
  }

  show(): void {
    this.setCollapsed(false);
  }

  hide(): void {
    this.setCollapsed(true);
  }

  toggle(): void {
    this.setCollapsed(!this.collapsed);
  }

  dispose(): void {
    this.container.remove();
  }

  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.container.classList.toggle("collapsed", collapsed);
    this.toggleButton.textContent = collapsed ? "+" : "–";
    this.toggleButton.setAttribute(
      "aria-label",
      collapsed ? "Show AI Brain panel" : "Hide AI Brain panel",
    );
  }

  private pushSpark(value: number): void {
    this.history.push(value);
    if (this.history.length > SPARK_SAMPLES) this.history.shift();
    this.drawSpark();
  }

  private drawSpark(): void {
    const ctx = this.spark.getContext("2d");
    if (!ctx || this.history.length < 2) return;
    ctx.clearRect(0, 0, SPARK_WIDTH, SPARK_HEIGHT);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = SPARK_WIDTH / (SPARK_SAMPLES - 1);
    for (let i = 0; i < this.history.length; i++) {
      const x = i * step;
      const y = SPARK_HEIGHT - this.history[i] * SPARK_HEIGHT;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

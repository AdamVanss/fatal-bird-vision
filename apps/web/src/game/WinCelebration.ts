const COLORS = [
  "#5fd832",
  "#c8ff6a",
  "#ffd12a",
  "#ffffff",
  "#e8b86a",
  "#6ec82d",
  "#f4ece2",
  "#9aee5a",
];

type Kind = "rect" | "ribbon" | "circle" | "tri";

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  spin: number;
  vs: number;
  color: string;
  kind: Kind;
  flutter: number;
  drag: number;
}

const KINDS: Kind[] = ["rect", "ribbon", "circle", "tri"];

/** Full-screen confetti while the finish panel is up. */
export class WinCelebration {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private pieces: Piece[] = [];
  private running = false;
  private last = 0;
  private animId = 0;
  private rainAcc = 0;
  private dpr = 1;

  constructor(canvasId = "confetti-canvas") {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d")!;
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  burst(): void {
    this.resize();
    this.pieces = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.spawnBurst(reduced ? 48 : 220);
    if (!reduced) this.spawnCannons(70);
    this.canvas.classList.add("show");
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      this.rainAcc = 0;
      this.tick();
    }
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animId);
    this.pieces = [];
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.classList.remove("show");
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  private spawnBurst(count: number): void {
    const w = window.innerWidth;
    for (let i = 0; i < count; i++) {
      this.pieces.push(
        this.makePiece(Math.random() * w, -24 - Math.random() * 140, {
          vx: (Math.random() - 0.5) * 220,
          vy: 90 + Math.random() * 280,
        }),
      );
    }
  }

  private spawnCannons(count: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < count; i++) {
      const left = i % 2 === 0;
      this.pieces.push(
        this.makePiece(left ? w * 0.08 : w * 0.92, h * 0.62, {
          vx: (left ? 1 : -1) * (280 + Math.random() * 340),
          vy: -420 - Math.random() * 280,
        }),
      );
    }
  }

  private spawnRain(count: number): void {
    const w = window.innerWidth;
    for (let i = 0; i < count; i++) {
      this.pieces.push(
        this.makePiece(Math.random() * w, -16 - Math.random() * 40, {
          vx: (Math.random() - 0.5) * 80,
          vy: 40 + Math.random() * 90,
        }),
      );
    }
  }

  private makePiece(
    x: number,
    y: number,
    vel: { vx: number; vy: number },
  ): Piece {
    const kind = KINDS[(Math.random() * KINDS.length) | 0];
    const ribbon = kind === "ribbon";
    return {
      x,
      y,
      vx: vel.vx,
      vy: vel.vy,
      w: ribbon ? 4 + Math.random() * 5 : 7 + Math.random() * 9,
      h: ribbon ? 16 + Math.random() * 18 : 8 + Math.random() * 11,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 10,
      spin: Math.random() * Math.PI * 2,
      vs: 6 + Math.random() * 10,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      kind,
      flutter: 8 + Math.random() * 14,
      drag: 0.988 + Math.random() * 0.008,
    };
  }

  private tick = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) {
      this.rainAcc += dt;
      if (this.rainAcc > 0.085 && this.pieces.length < 420) {
        this.rainAcc = 0;
        this.spawnRain(10);
      }
    }

    const { ctx } = this;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    let alive = 0;
    for (const p of this.pieces) {
      p.vy += 640 * dt;
      p.vx += Math.sin(now * 0.001 * p.flutter + p.rot) * 70 * dt;
      p.vx *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.spin += p.vs * dt;
      if (p.y < cssH + 50 && p.x > -40 && p.x < cssW + 40) alive += 1;

      const flip = Math.cos(p.spin);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(Math.max(0.18, Math.abs(flip)), 1);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.72 + Math.abs(flip) * 0.28;
      this.drawPiece(ctx, p);
      ctx.restore();
    }

    if (alive === 0 && reduced) {
      this.running = false;
      ctx.clearRect(0, 0, cssW, cssH);
      this.canvas.classList.remove("show");
      return;
    }
    this.animId = requestAnimationFrame(this.tick);
  };

  private drawPiece(ctx: CanvasRenderingContext2D, p: Piece): void {
    const hw = p.w / 2;
    const hh = p.h / 2;
    if (p.kind === "circle") {
      ctx.beginPath();
      ctx.ellipse(0, 0, hw, hh * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    if (p.kind === "tri") {
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
      ctx.fill();
      return;
    }
    ctx.fillRect(-hw, -hh, p.w, p.h);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(-hw, -hh, p.w * 0.38, p.h);
  }
}

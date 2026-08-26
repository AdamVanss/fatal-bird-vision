/** Procedural kiosk audio. Unlocks on the first pointer gesture. */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicSrc: AudioBufferSourceNode | null = null;
  private warnedLost = false;

  async unlock(): Promise<void> {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) this.ctx = new Ctx();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.master) this.buildGraph();
  }

  setMusic(mode: "off" | "menu" | "play" | "win"): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const vol =
      mode === "off" ? 0 : mode === "menu" ? 0.1 : mode === "win" ? 0.08 : 0.13;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setTargetAtTime(vol, now, 0.35);
  }

  hoop(streak: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    const freq = Math.min(980, 392 * Math.pow(1.0595, Math.max(0, streak - 1)));
    this.tone(freq, t, 0.14, 0.11, "triangle");
    this.tone(freq * 2, t, 0.09, 0.05, "sine");
  }

  miss(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    this.tone(92, t, 0.22, 0.16, "square");
    this.tone(58, t + 0.04, 0.18, 0.1, "sine");
  }

  boost(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    this.sweep(220, 720, t, 0.28, 0.1);
    this.noiseBurst(t, 0.18, 0.07);
  }

  win(): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, t + i * 0.09, 0.28, 0.09, "triangle"));
    this.setMusic("win");
  }

  lost(): void {
    if (this.warnedLost) return;
    this.warnedLost = true;
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime;
    this.tone(196, t, 0.16, 0.06, "sine");
    this.tone(164, t + 0.14, 0.2, 0.06, "sine");
  }

  found(): void {
    this.warnedLost = false;
  }

  shutter(): void {
    this.noiseBurst(this.ctx?.currentTime ?? 0, 0.08, 0.09);
  }

  ui(): void {
    this.tone(640, this.ctx?.currentTime ?? 0, 0.06, 0.04, "sine");
  }

  resetLostCue(): void {
    this.warnedLost = false;
  }

  dispose(): void {
    try {
      this.musicSrc?.stop();
    } catch {
      /* already stopped */
    }
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.musicSrc = null;
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;

    const hipass = ctx.createBiquadFilter();
    hipass.type = "highpass";
    hipass.frequency.value = 720;
    hipass.Q.value = 0.65;
    this.musicGain.connect(hipass);
    hipass.connect(this.master);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.master);

    const src = ctx.createBufferSource();
    src.buffer = this.makeMusicLoop();
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSrc = src;
  }

  /** Music-box canyon tune. High register only, short plucks, no drone. */
  private makeMusicLoop(): AudioBuffer {
    const ctx = this.ctx!;
    const bpm = 118;
    const step = 60 / bpm / 2;
    const melody = [
      784, 0, 988, 1175, 988, 784, 659, 0, 784, 988, 1175, 1319, 1175, 988, 784,
      0, 659, 784, 988, 0, 880, 784, 659, 0, 784, 0, 659, 0, 523, 0, 0, 0,
    ];
    const sparkle = [
      0, 0, 0, 1568, 0, 0, 1319, 0, 0, 0, 1568, 0, 1760, 0, 0, 0, 0, 0, 1319, 0,
      0, 1175, 0, 0, 0, 1568, 0, 1319, 0, 1047, 0, 0,
    ];
    const seconds = melody.length * step;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    const pluck = (
      freq: number,
      start: number,
      amp: number,
      pan: number,
      decay: number,
    ) => {
      if (freq < 500) return;
      const a0 = Math.floor(start * ctx.sampleRate);
      const n = Math.floor(0.42 * ctx.sampleRate);
      for (let i = 0; i < n && a0 + i < length; i++) {
        const t = i / ctx.sampleRate;
        const env = Math.exp(-t * decay) * (1 - Math.exp(-t * 140));
        const sample =
          Math.sin(2 * Math.PI * freq * t) * 0.7 +
          Math.sin(2 * Math.PI * freq * 2.004 * t) * 0.16 +
          Math.sin(2 * Math.PI * freq * 3.01 * t) * 0.06;
        const v = sample * env * amp;
        left[a0 + i] += v * (1 - pan);
        right[a0 + i] += v * pan;
      }
    };

    melody.forEach((freq, i) => {
      pluck(freq, i * step, 0.34, 0.32, 14);
    });
    sparkle.forEach((freq, i) => {
      pluck(freq, i * step + 0.018, 0.12, 0.72, 18);
    });

    const echo = Math.floor(ctx.sampleRate * step * 3);
    for (let i = echo; i < length; i++) {
      left[i] += left[i - echo] * 0.18;
      right[i] += right[i - echo] * 0.14;
    }

    return buffer;
  }

  private tone(
    freq: number,
    when: number,
    dur: number,
    gain: number,
    type: OscillatorType,
  ): void {
    const ctx = this.ctx;
    const dest = this.sfxGain;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private sweep(from: number, to: number, when: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const dest = this.sfxGain;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(to, when + dur);
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private noiseBurst(when: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const dest = this.sfxGain;
    if (!ctx || !dest || when <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoise(dur + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(g);
    g.connect(dest);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}

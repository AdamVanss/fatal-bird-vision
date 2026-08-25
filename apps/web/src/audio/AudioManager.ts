/**
 * AudioManager — event-driven, non-blocking audio for Fatal Bird Vision.
 *
 * Creates a single Web Audio graph the first time it is needed, synthesizes
 * every one-shot SFX into an AudioBuffer, and prefers a generated wind loop
 * file (public/audio/) while falling back to a synthesized seamless wind
 * noise loop. Nothing here is allowed to throw into the render loop or block
 * the caller: every play call is a no-op until the graph is ready, and missing
 * or undecodable assets only log a warning.
 */

import { AUDIO, AUDIO_SYNTH } from "../constants";

const WIND_LOOP_URL = "/audio/background.wav";
const FLAP_URL = "/audio/flap.wav";

const WIND_STOP_TAIL_SECONDS = 0.05;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private sfx = new Map<string, AudioBuffer>();
  private windBuffer: AudioBuffer | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;

  private initialized = false;
  private windRequested = false;
  /** In-flight graph build — guards init() against overlapping calls */
  private initPromise: Promise<void> | null = null;

  /**
   * Builds the audio graph once. Safe to call repeatedly and concurrently:
   * overlapping calls share the same in-flight build instead of constructing
   * a second AudioContext over the first. The browser only permits audio
   * playback after a user gesture, so call this from the "Start Flight"
   * click handler; resuming here is enough to release sound.
   */
  async init(): Promise<void> {
    this.initPromise ??= this.buildGraph().catch((err) => {
      // Allow a later retry; buildGraph itself logs and degrades gracefully.
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }

  private async buildGraph(): Promise<void> {
    this.ensureContext();
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.resume();

    this.sfx.set(
      "flap",
      (await this.loadLoopFile(ctx, FLAP_URL, "flap")) ?? this.renderFlap(ctx),
    );
    this.sfx.set("ring", this.renderRing(ctx));
    this.sfx.set("apple", this.renderApple(ctx));

    this.windBuffer = (await this.loadWindFile(ctx)) ?? this.renderWind(ctx);

    this.initialized = true;
    if (this.windRequested) this.spawnWind();
  }

  playFlap(): void {
    this.oneShot("flap");
  }

  playRing(): void {
    this.oneShot("ring");
  }

  playApple(): void {
    this.oneShot("apple");
  }

  /** Fades in the looping wind bed. Safe to call before init() completes. */
  startWindAmbient(): void {
    this.windRequested = true;
    if (this.initialized && !this.windSource) this.spawnWind();
  }

  /** Fades out and stops the looping wind bed. Safe to call before init(). */
  stopWindAmbient(): void {
    this.windRequested = false;
    this.killWind();
  }

  dispose(): void {
    this.killWind();
    void this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.sfx.clear();
    this.windBuffer = null;
    this.initialized = false;
    this.windRequested = false;
    this.initPromise = null;
  }

  // ---- graph setup -------------------------------------------------------

  private ensureContext(): void {
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = AUDIO.masterVolume;
      this.masterGain.connect(this.ctx.destination);
    } catch (err) {
      this.ctx = null;
      this.masterGain = null;
      console.warn("AudioManager: no usable audio context — audio disabled.", err);
    }
  }

  // ---- one-shots ----------------------------------------------------------

  private oneShot(name: string): void {
    const ctx = this.ctx;
    const master = this.masterGain;
    const buffer = this.sfx.get(name);
    if (!ctx || !master || !buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(master);
    const now = ctx.currentTime;
    source.start(now);
    // Release the node shortly after it ends so builds don't accumulate.
    source.stop(now + buffer.duration + AUDIO.oneShotTailSeconds);
  }

  // ---- wind ----------------------------------------------------------------

  private spawnWind(): void {
    const ctx = this.ctx;
    const master = this.masterGain;
    const buffer = this.windBuffer;
    if (!ctx || !master || !buffer || this.windSource) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(master);

    const now = ctx.currentTime;
    source.start(now);
    gain.gain.setTargetAtTime(
      AUDIO.windVolume,
      now,
      AUDIO.windFadeInSeconds,
    );

    this.windSource = source;
    this.windGain = gain;
  }

  /**
   * Fades out and stops the wind bed. The stopping nodes stay referenced by
   * their own `onended` cleanup, so a quick restart can crossfade into a new
   * bed while the old one drains without leaking or double-owning state.
   */
  private killWind(): void {
    const source = this.windSource;
    const gain = this.windGain;
    const ctx = this.ctx;
    if (!source || !gain || !ctx) return;

    const now = ctx.currentTime;
    gain.gain.setTargetAtTime(0, now, AUDIO.windFadeOutSeconds);
    source.stop(now + AUDIO.windFadeOutSeconds + WIND_STOP_TAIL_SECONDS);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    this.windSource = null;
    this.windGain = null;
  }

  // ---- asset loading ------------------------------------------------------

  private async loadWindFile(ctx: AudioContext): Promise<AudioBuffer | null> {
    return this.loadLoopFile(ctx, WIND_LOOP_URL, "wind loop");
  }

  /** Fetches and decodes an optional loop asset; returns null (logs only) on any failure. */
  private async loadLoopFile(
    ctx: AudioContext,
    url: string,
    label: string,
  ): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      return ctx.decodeAudioData(bytes);
    } catch (err) {
      console.warn(
        `AudioManager: ${label} asset unavailable; using generated audio.`,
        err,
      );
      return null;
    }
  }

  // ---- offline rendering ---------------------------------------------------

  /**
   * Frames a one-shot: quick 6ms attack to avoid clicks, gentle exponential
   * (-ish) decay over `life`. At t=0 the amplitude is a touch below 1 so the
   * fade into a looped texture crosses zero-mean.
   */
  private renderFade(t: number, dur: number): number {
    const a = Math.min(1, t / 0.006);
    const r = Math.max(0, 1 - (t - 0.006) / Math.max(0.001, dur - 0.006));
    return a * r;
  }

  private renderOneShot(
    ctx: AudioContext,
    dur: number,
    sample: (t: number) => number,
  ): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.floor(dur * rate);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = sample(i / rate);
    }
    const buffer = ctx.createBuffer(1, length, rate);
    buffer.getChannelData(0).set(data);
    return buffer;
  }

  /**
   * Flap: a soft "behind you" feather rush. Lowpassed brown noise with a
   * gentle downward pitch swipe, far smaller than an explosion or gunshot so
   * it reads as wingbeats in the open air.
   */
  private renderFlap(ctx: AudioContext): AudioBuffer {
    const s = AUDIO_SYNTH.flap;
    let brown = 0;
    let lp = 0;
    return this.renderOneShot(ctx, s.duration, (t) => {
      brown += (Math.random() * 2 - 1) * s.noiseStep;
      brown *= s.noiseLeak;
      lp += (brown - lp) * s.filterBase * (1 - s.filterSweep * (t / s.duration));
      return lp * s.gain * this.renderFade(t, s.duration);
    });
  }

  /**
   * Ring: a far-off chime, like wind brushing a wind chime — one mellow
   * clang plus a soft octave hum, no bright high partials.
   */
  private renderRing(ctx: AudioContext): AudioBuffer {
    const s = AUDIO_SYNTH.ring;
    return this.renderOneShot(ctx, s.duration, (t) => {
      const clang =
        Math.sin(2 * Math.PI * s.clangHz * t) * Math.exp(-s.clangDecay * t);
      const hum =
        Math.sin(2 * Math.PI * s.humHz * t) * s.humGain * Math.exp(-s.humDecay * t);
      return (clang * s.clangGain + hum) * s.outGain * this.renderFade(t, s.duration);
    });
  }

  /**
   * Apple: a near-silent little "pluck" — a quick fingertip woody knock,
   *   no crunch, no impact. It reads as catching fruit, not combat.
   */
  private renderApple(ctx: AudioContext): AudioBuffer {
    const s = AUDIO_SYNTH.apple;
    return this.renderOneShot(ctx, s.duration, (t) => {
      const knock =
        Math.sin(2 * Math.PI * s.knockHz * t) * Math.exp(-s.knockDecay * t);
      return knock * this.renderFade(t, s.duration);
    });
  }

  /**
   * Wind: a calm breeze instead of an engine — four layers, one per helper:
   * slow-modulated brown-noise bed, sparse far bird chirps, a crossfaded loop
   * seam, and peak normalization for a stable, quiet average.
   */
  private renderWind(ctx: AudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const data = new Float32Array(
      Math.floor(AUDIO_SYNTH.wind.loopSeconds * rate),
    );

    this.mixBreeze(data, rate);
    this.mixFarBirdChirps(data, rate);
    crossfadeLoopSeam(data, AUDIO_SYNTH.wind.seamCrossfadeSamples);
    normalizeToPeak(data, AUDIO_SYNTH.wind.targetPeak);

    const buffer = ctx.createBuffer(1, data.length, rate);
    buffer.getChannelData(0).set(data);
    return buffer;
  }

  private mixBreeze(data: Float32Array, rate: number): void {
    const w = AUDIO_SYNTH.wind;
    let brown = 0;
    let lp = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      brown += (Math.random() * 2 - 1) * w.breezeNoiseStep;
      brown *= w.breezeLeak;
      lp += (brown - lp) * w.breezeFilter;
      const gust = w.gustFloor + w.gustDepth * Math.sin(2 * Math.PI * w.gustHz * t);
      data[i] = lp * w.breezeGain * gust;
    }
  }

  private mixFarBirdChirps(data: Float32Array, rate: number): void {
    const w = AUDIO_SYNTH.wind;
    for (const at of w.chirpTimes) {
      const n = Math.floor(at * rate);
      for (let i = 0; i < n + w.chirpTail * rate && i < data.length; i++) {
        const t = i - n > 0 ? (i - n) / rate : 0;
        const rel = Math.max(0, 1 - t * w.chirpFadeRate);
        const ph =
          Math.sin(2 * Math.PI * w.chirpHz * t) * Math.exp(-w.chirpDecay * t);
        data[i] += ph * w.chirpGain * rel;
      }
    }
  }
}

/** Crossfades the buffer tail into its head so the loop point clicks off */
function crossfadeLoopSeam(data: Float32Array, crossfadeSamples: number): void {
  const fade = Math.min(crossfadeSamples, data.length >> 3);
  for (let i = 0; i < fade; i++) {
    const mix = i / fade;
    data[i] = data[i] * mix + data[data.length - fade + i] * (1 - mix);
  }
}

function normalizeToPeak(data: Float32Array, target: number): void {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const scale = peak > 0 ? target / peak : 1;
  for (let i = 0; i < data.length; i++) data[i] *= scale;
}
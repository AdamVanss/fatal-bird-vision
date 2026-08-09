import * as ort from "onnxruntime-web";
import {
  GESTURE_CLASSES,
  INPUT_DIM,
  WINDOW_SIZE,
  type GestureClass,
} from "../constants";
import type { FlightInput, GestureModelOutput } from "../types";

const MODEL_URL = "/models/gesture_model.onnx";
const META_URL = "/models/gesture_model.meta.json";

export class GestureInference {
  private session: ort.InferenceSession | null = null;
  private loaded = false;
  private syntheticOnly = true;

  async init(): Promise<boolean> {
    try {
      const metaRes = await fetch(META_URL);
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { training_source?: string };
        this.syntheticOnly = meta.training_source !== "recorded";
      }

      ort.env.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
      this.session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
      });
      this.loaded = true;
      return true;
    } catch (err) {
      console.warn("ONNX model not loaded, using heuristic fallback:", err);
      this.loaded = false;
      return false;
    }
  }

  isSyntheticOnly(): boolean {
    return this.syntheticOnly;
  }

  isReady(): boolean {
    return this.loaded && this.session !== null;
  }

  async infer(window: Float32Array): Promise<GestureModelOutput | null> {
    if (!this.session || window.length !== WINDOW_SIZE * INPUT_DIM) return null;

    const input = new ort.Tensor(
      "float32",
      window,
      [1, WINDOW_SIZE, INPUT_DIM],
    );
    const results = await this.session.run({ landmarks: input });

    const flap = results.flap_energy?.data as Float32Array;
    const bank = results.bank?.data as Float32Array;
    const pitch = results.pitch_intent?.data as Float32Array;
    const logits = results.gesture_logits?.data as Float32Array;

    if (!flap || !bank || !pitch || !logits) return null;

    const probs = softmax(Array.from(logits));
    let maxIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[maxIdx]) maxIdx = i;
    }

    return {
      flapEnergy: clamp(flap[0], 0, 1),
      bank: clamp(bank[0], -1, 1),
      pitchIntent: clamp(pitch[0], -1, 1),
      classIndex: maxIdx,
      classProbabilities: new Float32Array(probs),
    };
  }

  toFlightInput(output: GestureModelOutput): FlightInput {
    const gestureClass = GESTURE_CLASSES[output.classIndex] ?? "neutral";
    const confidence = output.classProbabilities[output.classIndex] ?? 0;
    return {
      flapEnergy: output.flapEnergy,
      bank: output.bank,
      pitchIntent: output.pitchIntent,
      bodySteerX: output.bank,
      bodySteerY: -output.pitchIntent,
      gestureClass,
      confidence,
      source: "model",
    };
  }

  /** Instant control from the latest 1–2 pose frames (no 30-frame wait) */
  heuristicFromFrames(
    current: Float32Array,
    previous: Float32Array | null,
  ): FlightInput {
    const lWristY = current[4 * 3 + 1];
    const rWristY = current[5 * 3 + 1];
    const prevLWristY = previous ? previous[4 * 3 + 1] : lWristY;
    const prevRWristY = previous ? previous[5 * 3 + 1] : rWristY;

    const wristY = (lWristY + rWristY) / 2;
    const prevWristY = (prevLWristY + prevRWristY) / 2;
    const flapDelta = prevWristY - wristY;

    let flapEnergy = clamp(flapDelta * 14, 0, 1);
    if (wristY < -0.12) flapEnergy = Math.max(flapEnergy, 0.55);

    const bank = clamp((lWristY - rWristY) * 4, -1, 1);
    const pitchIntent = clamp(-wristY * 2.5, -1, 1);

    let gestureClass: GestureClass = "neutral";
    if (flapEnergy > 0.35) gestureClass = "flap";
    else if (wristY > 0.15) gestureClass = "dive";
    else if (Math.abs(lWristY - rWristY) < 0.07 && wristY < 0) gestureClass = "glide";
    else if (bank < -0.3) gestureClass = "bank_left";
    else if (bank > 0.3) gestureClass = "bank_right";

    return {
      flapEnergy,
      bank,
      pitchIntent,
      bodySteerX: 0,
      bodySteerY: 0,
      gestureClass,
      confidence: 0.75,
      source: "heuristic",
    };
  }

  /** Legacy path for full 30-frame ML window */
  heuristicFromWindow(window: Float32Array): FlightInput {
    const lastFrameOffset = (WINDOW_SIZE - 1) * INPUT_DIM;
    const prevFrameOffset = (WINDOW_SIZE - 3) * INPUT_DIM;
    const current = window.subarray(lastFrameOffset, lastFrameOffset + INPUT_DIM);
    const previous = window.subarray(prevFrameOffset, prevFrameOffset + INPUT_DIM);
    return this.heuristicFromFrames(current, previous);
  }
}

function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

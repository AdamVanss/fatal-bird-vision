const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export interface ClipMeta {
  name: string;
  difficulty: string;
}

/** Records the kiosk webcam for each flight and posts the file to /api/videos. */
export class RunRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private saving = false;

  start(stream: MediaStream | null): void {
    if (!stream || typeof MediaRecorder === "undefined") return;
    this.discard();
    const mime = pickMime();
    try {
      const rec = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 })
        : new MediaRecorder(stream);
      this.chunks = [];
      rec.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      });
      rec.start(1000);
      this.rec = rec;
    } catch (err) {
      console.warn("Webcam recording failed to start:", err);
      this.rec = null;
    }
  }

  async flush(meta: ClipMeta): Promise<void> {
    const rec = this.rec;
    if (!rec || rec.state === "inactive" || this.saving) {
      this.rec = null;
      return;
    }
    this.saving = true;
    const blob = await new Promise<Blob>((resolve) => {
      rec.addEventListener(
        "stop",
        () => {
          resolve(new Blob(this.chunks, { type: rec.mimeType || "video/webm" }));
        },
        { once: true },
      );
      rec.stop();
    });
    this.rec = null;
    this.chunks = [];
    this.saving = false;
    if (blob.size < 800) return;
    try {
      const query = new URLSearchParams({
        name: meta.name,
        difficulty: meta.difficulty,
      });
      const res = await fetch(`/api/videos?${query}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "video/webm" },
        body: blob,
      });
      if (!res.ok) console.warn("Could not save flight clip:", res.status);
    } catch (err) {
      console.warn("Could not save flight clip:", err);
    }
  }

  discard(): void {
    if (this.rec && this.rec.state !== "inactive") {
      try {
        this.rec.stop();
      } catch {
        /* already stopped */
      }
    }
    this.rec = null;
    this.chunks = [];
  }
}

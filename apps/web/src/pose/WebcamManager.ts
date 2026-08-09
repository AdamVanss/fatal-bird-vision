export class WebcamManager {
  readonly video: HTMLVideoElement;

  constructor(videoId = "webcam") {
    this.video = document.getElementById(videoId) as HTMLVideoElement;
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera API unavailable. Use HTTPS or localhost — run npm run dev:network on your laptop.",
      );
    }

    if (!window.isSecureContext) {
      throw new Error(
        "Camera requires a secure connection. On your laptop run: npm run dev:network then open the https:// address shown in the terminal (accept the certificate warning).",
      );
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access in your browser settings and reload."
          : err instanceof Error
            ? err.message
            : "Could not access webcam.";
      throw new Error(message);
    }
  }

  stop(): void {
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }
}

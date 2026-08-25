// Stylesheet loads via <link> in index.html <head> (render-blocking), so the
// page can't flash unstyled before this module graph resolves.
import { Game } from "./core/Game";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const game = new Game(canvas);

game.init().catch((err) => {
  console.error("Failed to start Fatal Bird Vision:", err);
  alert(
    "Could not start the game. Check camera permissions and reload the page.",
  );
});

window.addEventListener("beforeunload", () => game.dispose());

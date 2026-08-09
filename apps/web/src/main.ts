import "./style.css";
import { Game } from "./game/Game";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const game = new Game(canvas);

game.init().catch((err) => {
  console.error("Failed to start Fatal Bird Vision:", err);
  alert(
    "Could not start the game. Check camera permissions and reload the page.",
  );
});

window.addEventListener("beforeunload", () => game.dispose());

import { defineConfig } from "vite";
import { playersApi } from "./vite.players-plugin";

export default defineConfig({
  plugins: [playersApi()],
  server: {
    port: 5173,
  },
  publicDir: "public",
});

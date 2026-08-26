import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { playersApi } from "./vite.players-plugin";

/** LAN-accessible dev server with HTTPS (required for webcam on non-localhost). */
export default defineConfig({
  plugins: [basicSsl(), playersApi()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 4173,
    https: true,
    strictPort: true,
  },
  publicDir: "public",
});

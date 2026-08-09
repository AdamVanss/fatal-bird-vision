import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

/** LAN-accessible dev server with HTTPS (required for webcam on non-localhost). */
export default defineConfig({
  plugins: [basicSsl()],
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

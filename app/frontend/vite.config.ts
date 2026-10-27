import { defineConfig } from "vite";

// In dev the backend runs on :8765; the page talks to it through /api.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": process.env.LAB_API ?? "http://127.0.0.1:8765" },
  },
});

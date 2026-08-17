import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // The creator backend (apps/creator/server.ts) serves /api/*.
      "/api": {
        target: "http://localhost:8100",
        changeOrigin: true,
      },
    },
  },
});

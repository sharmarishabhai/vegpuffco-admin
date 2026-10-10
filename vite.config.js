import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        customer: "index.html",
        admin: "admin.html"
      }
    }
  },
  server: {
    proxy: {
      "/api": "http://localhost:8999",
      "/socket.io": {
        target: "http://localhost:8999",
        ws: true
      }
    }
  }
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // cast : vitest embarque sa propre version de Vite, les types de plugins diffèrent
  plugins: [react(), tailwindcss()] as never,
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } },
  },
  test: { environment: "jsdom", globals: true },
});

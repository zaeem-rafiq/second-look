import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.STATIC_HOSTING_BASE_PATH ?? "/",
  server: { port: 5173, strictPort: true },
});

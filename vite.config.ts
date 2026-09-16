import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.STATIC_HOSTING_BASE_PATH ?? "/",
  server: { port: Number(process.env.PORT ?? 5173), strictPort: true },
});

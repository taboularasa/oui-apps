import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Two entry points are served from the generated Go service's own origin:
// the application at /uat/, and the browser UAT harness at /uat/uat.html.
export default defineConfig({
  plugins: [react()],
  base: "/uat/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        uat: resolve(import.meta.dirname, "uat.html"),
      },
    },
  },
});

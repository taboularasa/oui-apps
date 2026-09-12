import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "/uat/",
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        uat: resolve(import.meta.dirname, "uat.html"),
      },
    },
  },
  preview: {
    proxy: {
      "/healthz": {
        target:
          process.env.PROFESSIONAL_SERVICES_BFF_ORIGIN ??
          "http://127.0.0.1:18092",
      },
      "/oui.professional_services.v1.ProfessionalServicesFrontendService": {
        target:
          process.env.PROFESSIONAL_SERVICES_BFF_ORIGIN ??
          "http://127.0.0.1:18092",
      },
    },
  },
});

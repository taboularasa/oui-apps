import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Connect, Plugin } from "vite";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(
    mode,
    new URL(".", import.meta.url).pathname,
    "VITE_",
  );
  return {
    base: environment.VITE_OUI_BASE || "/",
    plugins: [
      runtimeConfigPlugin(environment),
      react(),
      babel({
        presets: [reactCompilerPreset({ target: "19" })],
      }),
    ],
  };
});

function runtimeConfigPlugin(
  environment: Readonly<Record<string, string>>,
): Plugin {
  const install = (middlewares: Connect.Server) => {
    middlewares.use("/oui-runtime-config.json", (_request, response) => {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(
        JSON.stringify({
          ontoBffUrl: environment.VITE_ONTOBFF_URL ?? "",
          ...(environment.VITE_ONTOBFF_TEST_TOKEN === undefined
            ? {}
            : { testToken: environment.VITE_ONTOBFF_TEST_TOKEN }),
        }),
      );
    });
  };
  return {
    name: "oui-runtime-config",
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

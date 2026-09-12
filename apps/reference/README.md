# OUI reference application

The production entrypoint is a live integration with the generated OntoBFF browser client. It does not instantiate `TestConnectClient`; that transport exists only in `application.testing.ts`, browser-unit tests, and isolated stories.

At startup, `main.tsx` loads `oui-runtime-config.json` with `no-store`, calls the real OntoBFF `GetCompatibility`, admits the exact identities and capabilities, and only then calls `GetSession` and renders operational routes. A mismatch renders an operator-readable admission diagnostic instead of the application. The live entrypoint has no test-client fallback.

For local Vite development, copy `.env.example` and set `VITE_ONTOBFF_URL`. `VITE_ONTOBFF_TEST_TOKEN` is an optional development/UAT injection seam. It is served through the runtime configuration endpoint, never substituted into JavaScript source. Production hosting must provide the equivalent runtime JSON outside the immutable frontend bundle. Never put a credential in source, generated artifacts, an import manifest, or a build argument.

The released `GetSession` response identifies the actor, permissions, locale, and time zone, but does not disclose a tenant identifier. OUI therefore records tenant as explicitly `null`; it does not infer one. OntoBFF remains the tenant and authorization enforcement authority.

Run the exact browser-to-Go UAT with:

```sh
pnpm --filter @oui/reference-app test:e2e
```

The harness archives OntoBFF commit `d60ea8aa0e2b386608f1ea809463af396cd8e572` from the local Git object store, disables Go module network fallback, builds its generated Go BFF, builds OUI under `/uat/`, generates ephemeral localhost-only test credentials, and drives Chromium against the BFF-served bundle. Credentials remain only in the process environment and a temporary runtime JSON file, both removed when the harness exits.

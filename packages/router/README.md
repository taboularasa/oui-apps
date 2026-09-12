# `@oui/router`

`@oui/router` compiles validated OUI route and navigation definitions into a
TanStack Router v1 runtime.

The package:

- preserves canonical route and interaction identifiers in a generated
  manifest;
- validates path and structured search parameters at route boundaries;
- resolves interaction kinds through the sealed extension catalog;
- lazy-loads interaction modules behind OUI pending, error, unavailable, and
  not-found primitives; and
- accepts browser or memory history without making either canonical in the IR.

Render static-site deployments must apply the documented
[`/*` rewrite](../../docs/deployment/render-static-site.md) so nested URLs reach
the client router.

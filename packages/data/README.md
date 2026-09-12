# `@oui/data`

`@oui/data` owns the lifecycle for IR-declared Connect queries and commands.
Compiler-generated clients are adapted with `createGeneratedConnectClient` and
registered by canonical service-binding identifier; interaction code never
configures Connect transports directly.

The runtime provides:

- authentication, trace, correlation, locale, and time-zone metadata;
- deterministic IR-derived TanStack Query keys and freshness;
- safe-query retries with no automatic retry for consequential commands;
- command idempotency, cancellation, and declared query invalidation;
- stable validation, permission, conflict, stale-state, unavailable, cancelled,
  and internal errors; and
- an in-memory `TestConnectClient` that requires no network server.

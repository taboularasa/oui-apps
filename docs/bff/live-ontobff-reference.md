# Live OntoBFF reference path

## Released authority and import

OUI consumes only the released OntoBFF output from `taboularasa/ontobff` commit `d60ea8aa0e2b386608f1ea809463af396cd8e572`. The isolated import lives under `apps/reference/src/generated/ontobff/` and is described by its generated import manifest. The manifest records the upstream repository and commit, output-manifest identity, contract digest, descriptor digest, BFF-plan digest, and every imported file hash.

Use `pnpm ontobff:check` to reconstruct every imported byte with `git show` from the local object store and fail on drift. Use `pnpm ontobff:sync` only to refresh from that exact commit. The script has no network fallback. Imported files are generated artifacts: OUI never derives domain semantics from them, edits them, or feeds changes upstream.

## Startup and request path

The live path is:

1. load the runtime-only OntoBFF URL and optional generated test token;
2. instantiate OUI's `GeneratedConnectClient` adapter around the imported generated Protobuf-ES/Connect client;
3. call `GetCompatibility` and compare application, IR version and digest, BFF-plan digest, descriptor digest, contract digest, output-manifest identity, generated-runtime identities, required runtime range, and capabilities;
4. fail closed before operational routes render if any comparison fails;
5. call `GetSession` and map the disclosed actor, permissions, locale, and time zone into OUI availability context;
6. execute collection, detail, update, decision, and operation-stream calls through the generated contract.

Every operational request includes application identity, IR version and digest, plan, descriptor and contract digests, OUI runtime version, traceparent, tracestate, correlation ID, deadline, authorization, locale, time zone, and concurrency/idempotency metadata where applicable. An explicit retry retains its idempotency identity; a new authoritative result or changed input releases it.

OUI maps the Protobuf JSON names and nested sort message at its adapter boundary. It handles the decision result oneof, typed Connect error details (including `aborted` stale state and field violations), operation stream resume tokens, and sorting in query-cache identity. It does not infer semantics from generated code.

## Trust boundaries

- Ontology, ORSD, SHACL, provenance, and canonical specifications remain upstream semantic authority.
- The present semantic compiler does **not** claim to emit OUI IR or OntoBFF plans. The canonical fixture and released OntoBFF outputs are independently bound artifacts for this reference proof.
- OUI presents capability-derived availability; it is not an authorization boundary.
- OntoBFF owns authentication, authorization, transitions, concurrency, idempotency, audit, effects, and orchestration.
- Domain systems remain authoritative for business state.
- Generated/imported artifacts contain no credentials.
- Source, contract, descriptor, frontend bundle, BFF binary, test-result, UAT, deployment, and attestation identities form a directed, non-recursive evidence chain.

The released session contract does not expose tenant identity. OUI represents that absence as `null` and does not guess; OntoBFF continues to enforce tenant isolation.

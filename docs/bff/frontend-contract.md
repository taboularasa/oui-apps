# Frontend BFF contract conventions

## Boundary

The browser calls the Go BFF directly using generated Connect-ES clients.

```text
OUI browser application -> Connect protocol -> Go BFF
```

The BFF:

- authenticates the actor;
- enforces authorization;
- orchestrates domain and ontology services;
- validates commands;
- protects state transitions and invariants;
- normalizes frontend-facing errors;
- supplies stable resource versions;
- implements idempotency;
- emits audit and trace information; and
- returns view-oriented messages declared in Protobuf.

OUI presents these semantics but is not their enforcement boundary.

## Protocol

The minimum contract uses:

- Protobuf schema managed by Buf;
- generated Go server interfaces;
- generated Protobuf-ES message and service descriptors;
- Connect protocol over HTTP;
- unary RPCs for normal queries and commands; and
- server-streaming RPCs for subscribed or long-running operation updates.

Client-streaming and bidirectional streaming are optional capabilities and MUST be declared by the application IR before use.

## Request metadata

Metadata belongs in Connect request headers when it applies across messages.

| Metadata                                    | Requirement                               | Purpose                                |
| ------------------------------------------- | ----------------------------------------- | -------------------------------------- |
| Authentication credential or session cookie | REQUIRED                                  | Establish actor and session            |
| `traceparent`                               | REQUIRED when tracing is enabled          | W3C distributed trace context          |
| `tracestate`                                | OPTIONAL                                  | Vendor trace state                     |
| `Accept-Language`                           | REQUIRED                                  | Preferred response locale              |
| `X-OUI-Time-Zone`                           | REQUIRED                                  | IANA time zone for actor-facing values |
| `X-OUI-Application`                         | REQUIRED                                  | Stable OUI application identifier      |
| `X-OUI-IR-Version`                          | REQUIRED                                  | Compiled application IR version        |
| `Idempotency-Key`                           | REQUIRED for commands declared idempotent | Command retry identity                 |
| `If-Match`                                  | REQUIRED for version-protected commands   | Expected resource version              |

Headers MUST NOT be used to pass ordinary domain input that belongs in a typed request message.

The browser MUST NOT receive or send server credentials, private keys, or internal service tokens.

## Authentication and session

The BFF derives the actor from the authenticated session. A client-supplied actor identifier is never authoritative.

An unauthenticated request returns Connect `unauthenticated`. An authenticated actor without authority returns `permission_denied` with a typed permission detail when an explanation is safe to disclose.

OUI MAY use session information returned by a dedicated query for presentation. It MUST NOT infer authority from visible roles or navigation.

## Query contract

A query reads BFF-owned state without requesting a business effect.

Queries:

- MUST be safe to retry unless their Protobuf documentation says otherwise;
- SHOULD support request cancellation;
- MUST return stable resource identifiers;
- SHOULD return resource versions when commands can conflict;
- MUST distinguish an empty result from an unavailable result;
- MUST document freshness and consistency expectations;
- MUST use typed pagination when returning unbounded collections; and
- MUST NOT smuggle business effects into read methods.

## Command contract

A command requests a business effect.

Commands:

- MUST be authorized and validated by the BFF;
- MUST document idempotency behavior;
- MUST use a stable idempotency key when retry is supported;
- SHOULD accept an expected resource version for concurrency protection;
- MUST return an authoritative outcome or operation acknowledgement;
- MUST return typed details for expected business failures;
- MUST NOT rely on client validation;
- MUST produce an audit correlation identifier; and
- MUST make partial completion explicit.

OUI does not automatically retry commands. The IR, method contract, and BFF idempotency behavior must all permit a retry.

## Idempotency

An idempotent command associates an `Idempotency-Key` with:

- authenticated actor or tenant boundary;
- RPC method;
- normalized command identity; and
- a bounded retention period.

Repeating an equivalent command with the same key returns the original authoritative outcome.

Reusing a key for a materially different request returns Connect `already_exists` with a typed conflict detail.

The BFF MUST NOT treat transport retries as new business commands.

## Optimistic concurrency

Version-protected resources expose an opaque `version`.

A command carries the expected version through `If-Match`, a typed request field, or both according to the service contract. The BFF compares versions atomically with the requested state change.

A stale request returns Connect `aborted` with `StaleStateDetail`, including:

- resource identifier;
- expected version;
- current version when safe to disclose; and
- a recommended refresh action.

OUI presents recovery and does not overwrite state silently.

## Pagination

Unbounded collection queries use opaque cursor pagination:

```text
request:
  page_size
  page_token

response:
  items
  next_page_token
  result_version
```

Rules:

- tokens are opaque to OUI;
- `page_size` has a documented default and maximum;
- an empty `next_page_token` means no next page;
- invalid or expired tokens return `invalid_argument` with typed detail;
- sort and filter inputs are part of token identity;
- changing sort or filters starts a new pagination sequence; and
- `result_version` MAY identify the collection snapshot or consistency boundary.

Offset pagination MAY be declared for bounded collections but is not the default.

## Streaming

Server streams are used for:

- long-running operation status;
- explicitly subscribed resource updates; and
- bounded event feeds.

A stream contract MUST define:

- initial snapshot behavior;
- event ordering;
- resume token behavior;
- heartbeat behavior;
- terminal event behavior;
- cancellation;
- authorization re-evaluation;
- reconnect and replay limits; and
- what happens when replay is impossible.

OUI MUST treat a disconnected stream as unknown freshness, not as successful completion.

## Long-running commands

A command that cannot return its final outcome within the normal unary request returns an operation acknowledgement:

```text
operation_id
accepted_at
status
resume_token
audit_id
```

OUI observes the operation through a query or server stream.

Minimum operation states:

- `accepted`;
- `running`;
- `succeeded`;
- `failed`;
- `cancelled`; and
- `expired`.

A successful transport acknowledgement means accepted, not completed. OUI MUST preserve that distinction.

Progress values MUST be monotonic within one operation attempt unless the response explicitly declares a restarted attempt.

## Error model

The BFF uses Connect canonical codes and typed Protobuf error details.

| Connect code          | Expected meaning                                        |
| --------------------- | ------------------------------------------------------- |
| `invalid_argument`    | Request or validation failure                           |
| `unauthenticated`     | No valid actor session                                  |
| `permission_denied`   | Actor lacks authority                                   |
| `not_found`           | Resource does not exist or is intentionally undisclosed |
| `already_exists`      | Duplicate identity or idempotency conflict              |
| `failed_precondition` | Business precondition is unmet                          |
| `aborted`             | Concurrency or stale-state conflict                     |
| `resource_exhausted`  | Quota or bounded capacity is exceeded                   |
| `cancelled`           | Caller or server cancelled work                         |
| `deadline_exceeded`   | Work did not complete within the deadline               |
| `unavailable`         | Temporary dependency or BFF unavailability              |
| `internal`            | Unexpected server failure                               |

Expected error detail types:

- `ValidationErrorDetail`;
- `PermissionErrorDetail`;
- `ConflictErrorDetail`;
- `StaleStateDetail`;
- `PreconditionErrorDetail`;
- `UnavailableErrorDetail`; and
- `OperationErrorDetail`.

Every detail contains a stable machine-readable reason. Localized user messages MAY be supplied, but OUI MUST retain the stable reason for behavior and telemetry.

Internal stack traces, SQL errors, service topology, and secret values MUST NOT be returned.

## Validation errors

Validation details contain zero or more violations:

```text
field_path
constraint_id
reason
message
rejected_value_display
```

`field_path` refers to the frontend-facing request message shape. OUI maps known paths to fields and unknown paths to a form-level error.

The BFF remains authoritative even when OUI evaluated the same constraint locally.

## Permission errors

Permission details MAY contain:

- required capability;
- safe explanation;
- remediation route or action;
- whether requesting access is supported; and
- correlation identifier.

The detail MUST NOT reveal confidential role membership or policy internals.

## Cancellation and deadlines

OUI propagates `AbortSignal` cancellation through Connect clients.

Queries MAY be cancelled when a route or input becomes obsolete. Commands MAY be cancelled only when the method contract declares cancellation meaningful. Cancelling the client request does not imply that an accepted command was rolled back.

Client deadlines:

- MUST be shorter than infrastructure hard timeouts;
- MUST distinguish query and command expectations;
- MUST NOT be used as completion proof for long-running work; and
- SHOULD be observable in tracing.

## Locale and time

Protobuf messages carry machine values:

- timestamps as UTC instants;
- dates as date-only values;
- durations as durations;
- money as amount plus currency; and
- time zones as IANA identifiers when needed for interpretation.

The BFF does not return preformatted dates or money as the only representation. OUI formats values for the actor locale and time zone.

## Observability

Every response SHOULD be correlated with:

- distributed trace identifier;
- BFF request identifier;
- audit identifier for commands;
- application identifier;
- IR version; and
- authenticated tenant boundary.

OUI telemetry MUST NOT include sensitive field values by default.

## Reference service

The domain-neutral [`ReferenceFrontendService`](../../proto/oui/reference/v1/reference.proto) supports:

- `ListItems` for collection and pagination behavior;
- `GetItem` for detail and form initialization;
- `UpdateItem` for validation, concurrency, and mutation;
- `GetDecisionContext` for evidence-backed decisions;
- `DecideProposal` for consequential commands; and
- `WatchOperation` for long-running progress.

It exists for framework fixtures and conformance tests. It is not a production vertical model.

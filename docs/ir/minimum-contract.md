# Minimum application IR contract

## Purpose

This document defines the smallest domain-independent application IR surface OUI needs to produce the current vertical slice:

- application shell and navigation;
- collection inspection;
- resource detail;
- validated forms; and
- evidence-backed decisions.

It defines semantic concepts and invariants. It does not prescribe JSON, YAML, Protobuf, or another serialization. A concrete schema will be introduced after versioning and compatibility rules are settled.

## Boundary

The application IR declares what interactions exist and what they mean. OUI decides how supported declarations are realized through its interaction patterns and semantic components.

The IR MUST NOT:

- contain source ontology axioms;
- encode how domain-to-UX inference was performed;
- contain canonical specification-bundle source documents;
- prescribe React components;
- contain React Aria properties;
- contain Tailwind classes; or
- embed customer business logic that belongs in the BFF.

The IR MAY retain provenance references supplied by the upstream compiler so diagnostics can be traced to canonical sources.

## Conceptual model

```text
Application
|- metadata
|- presentation
|- service bindings
|- resources
|- queries
|- commands
|- interactions
|- routes
`- navigation
```

All concepts are declarations. Runtime resource instances and command results come from the BFF and are not embedded in the application IR.

## Common types

### Stable identifier

Every addressable declaration MUST have a stable identifier.

An identifier:

- MUST be unique within its declaration category;
- MUST remain stable across compilations when semantic identity has not changed;
- MUST be opaque to OUI;
- MUST use the same case-sensitive value in every reference; and
- MUST NOT derive meaning from display labels.

Identifiers SHOULD be namespaced to avoid collisions when modules are composed.

Examples:

```text
resource:work-item
interaction:work-item-collection
query:list-work-items
command:approve-proposal
```

### Reference

A reference is a typed pointer from one declaration to another.

A reference:

- MUST name the expected declaration category;
- MUST resolve before the application runtime starts;
- MUST NOT resolve by label or position; and
- MUST produce a diagnostic containing the referring declaration and field when unresolved.

### Localized text

Human-facing text MUST be representable as either:

- a stable message identifier with optional interpolation arguments; or
- an explicitly marked literal fallback.

OUI MUST NOT treat a label as semantic identity.

### Provenance

Any declaration MAY include provenance containing:

- source document identifier;
- source location;
- compiler rule identifier;
- inference mapping identifier; and
- evidence references.

Provenance is diagnostic metadata. It MUST NOT independently grant permission or make an action executable.

## Application

The application declaration is the IR root.

| Field             | Requirement | Meaning                                                                 |
| ----------------- | ----------- | ----------------------------------------------------------------------- |
| `id`              | REQUIRED    | Stable application identifier                                           |
| `irVersion`       | REQUIRED    | Version of the application IR contract                                  |
| `metadata`        | REQUIRED    | Human-facing application identity                                       |
| `routes`          | REQUIRED    | Route declarations; MAY be empty only for an invalid diagnostic fixture |
| `navigation`      | REQUIRED    | Navigation model; MAY contain no visible entries                        |
| `resources`       | REQUIRED    | Resource type declarations referenced by interactions                   |
| `queries`         | REQUIRED    | Query declarations; MAY be empty                                        |
| `commands`        | REQUIRED    | Command declarations; MAY be empty                                      |
| `interactions`    | REQUIRED    | Interaction declarations referenced by routes                           |
| `serviceBindings` | REQUIRED    | BFF services available to the application                               |
| `presentation`    | REQUIRED    | Theme, density, locale, and presentation capabilities                   |
| `permissions`     | OPTIONAL    | Application-level permission vocabulary                                 |
| `provenance`      | OPTIONAL    | Traceability to upstream sources                                        |

The root MUST contain each declaration collection even when that collection is empty. This lets validation distinguish an omitted compiler output from a deliberately empty capability set.

## Application metadata

| Field              | Requirement | Meaning                                  |
| ------------------ | ----------- | ---------------------------------------- |
| `name`             | REQUIRED    | Localized application name               |
| `shortName`        | OPTIONAL    | Compact application name                 |
| `description`      | OPTIONAL    | Localized purpose                        |
| `defaultLocale`    | REQUIRED    | Default BCP 47 locale                    |
| `supportedLocales` | REQUIRED    | Non-empty set containing `defaultLocale` |
| `defaultTimeZone`  | OPTIONAL    | IANA time-zone fallback                  |

Metadata describes the application. It MUST NOT change permissions or domain behavior.

## Route

A route binds a URL state to one primary interaction.

| Field                 | Requirement | Meaning                                           |
| --------------------- | ----------- | ------------------------------------------------- |
| `id`                  | REQUIRED    | Stable route identifier                           |
| `path`                | REQUIRED    | Path template                                     |
| `interaction`         | REQUIRED    | Reference to the primary interaction              |
| `title`               | OPTIONAL    | Localized title override                          |
| `pathParameters`      | REQUIRED    | Ordered path-parameter declarations; MAY be empty |
| `searchParameters`    | REQUIRED    | Search-state declarations; MAY be empty           |
| `parent`              | OPTIONAL    | Reference to a parent route                       |
| `requiredPermissions` | OPTIONAL    | Permission expression for route availability      |
| `presentation`        | OPTIONAL    | Non-semantic route presentation hints             |
| `provenance`          | OPTIONAL    | Upstream traceability                             |

Invariants:

- Route identifiers and normalized path templates MUST be unique.
- Parent references MUST be acyclic.
- Every path placeholder MUST have exactly one path-parameter declaration.
- A route MUST NOT weaken the permission requirements of its interaction.
- Unknown search parameters MUST have an explicit preserve, discard, or reject policy.

## Navigation

Navigation declares discoverable movement through application routes.

| Field           | Requirement | Meaning                                |
| --------------- | ----------- | -------------------------------------- |
| `items`         | REQUIRED    | Ordered navigation items; MAY be empty |
| `landmarkLabel` | REQUIRED    | Accessible localized label             |

A navigation item contains:

| Field                 | Requirement | Meaning                                    |
| --------------------- | ----------- | ------------------------------------------ |
| `id`                  | REQUIRED    | Stable item identifier                     |
| `label`               | REQUIRED    | Localized label                            |
| `route`               | OPTIONAL    | Target route reference                     |
| `children`            | REQUIRED    | Child items; MAY be empty                  |
| `requiredPermissions` | OPTIONAL    | Visibility expression                      |
| `iconHint`            | OPTIONAL    | Presentation hint from a finite vocabulary |

An item MUST provide a route, one or more children, or both. Hiding a navigation item MUST NOT be treated as authorization enforcement.

## Resource type

A resource type describes the shape needed to present and act on BFF-provided instances. It is not an ontology class definition or persistence schema.

| Field           | Requirement | Meaning                                 |
| --------------- | ----------- | --------------------------------------- |
| `id`            | REQUIRED    | Stable resource-type identifier         |
| `label`         | REQUIRED    | Singular localized label                |
| `pluralLabel`   | REQUIRED    | Plural localized label                  |
| `identityField` | REQUIRED    | Reference to one field                  |
| `fields`        | REQUIRED    | Non-empty field declarations            |
| `states`        | REQUIRED    | State declarations; MAY be empty        |
| `relationships` | REQUIRED    | Relationship declarations; MAY be empty |
| `display`       | OPTIONAL    | Default title and summary field hints   |
| `provenance`    | OPTIONAL    | Upstream traceability                   |

The identity field MUST be present, non-nullable, and stable for the lifetime of a resource instance exposed to OUI.

## Field

Fields describe values available to an interaction or accepted by a command.

| Field                 | Requirement | Meaning                                         |
| --------------------- | ----------- | ----------------------------------------------- |
| `id`                  | REQUIRED    | Stable field identifier within its owner        |
| `label`               | REQUIRED    | Localized label                                 |
| `valueType`           | REQUIRED    | Semantic value type                             |
| `cardinality`         | REQUIRED    | Minimum and maximum value count                 |
| `readOnly`            | REQUIRED    | Whether the field can be submitted by a form    |
| `validation`          | REQUIRED    | Validation constraints; MAY be empty            |
| `description`         | OPTIONAL    | Localized supporting text                       |
| `defaultValue`        | OPTIONAL    | Explicit default when semantically valid        |
| `sensitivity`         | OPTIONAL    | Display and logging classification              |
| `requiredPermissions` | OPTIONAL    | Permission expression for visibility or editing |
| `presentation`        | OPTIONAL    | Field presentation hints                        |

Minimum value types:

- `text`;
- `richText`;
- `boolean`;
- `integer`;
- `decimal`;
- `money`;
- `date`;
- `dateTime`;
- `duration`;
- `identifier`;
- `enum`;
- `reference`;
- `document`; and
- `structured`.

A value type MAY require additional semantic parameters. For example, `money` requires a currency source and `reference` requires a resource-type reference.

## Validation

Validation constraints express input requirements that OUI can evaluate or present. The BFF remains authoritative.

| Field        | Requirement | Meaning                                       |
| ------------ | ----------- | --------------------------------------------- |
| `id`         | REQUIRED    | Stable constraint identifier                  |
| `kind`       | REQUIRED    | Constraint kind from the supported vocabulary |
| `message`    | REQUIRED    | Localized failure message                     |
| `parameters` | REQUIRED    | Typed parameters; MAY be empty                |
| `timing`     | REQUIRED    | Input, blur, submit, or server                |
| `severity`   | REQUIRED    | Error or warning                              |
| `condition`  | OPTIONAL    | Expression controlling applicability          |

Minimum constraint kinds:

- required;
- minimum and maximum length;
- minimum and maximum value;
- pattern;
- allowed values;
- cardinality;
- field comparison; and
- server-only.

Client validation MUST NOT be represented as sufficient authorization or as proof that a command will succeed.

## State and transition

A state describes a resource status relevant to interactions.

| Field        | Requirement | Meaning                                                        |
| ------------ | ----------- | -------------------------------------------------------------- |
| `id`         | REQUIRED    | Stable state identifier                                        |
| `label`      | REQUIRED    | Localized label                                                |
| `terminal`   | REQUIRED    | Whether no normal transition leaves this state                 |
| `statusRole` | OPTIONAL    | Neutral, informative, positive, warning, critical, or inactive |

A transition describes a declared state change:

| Field                 | Requirement | Meaning                                    |
| --------------------- | ----------- | ------------------------------------------ |
| `id`                  | REQUIRED    | Stable transition identifier               |
| `from`                | REQUIRED    | Non-empty set of source-state references   |
| `to`                  | REQUIRED    | Target-state reference                     |
| `command`             | REQUIRED    | Executing command reference                |
| `requiredPermissions` | OPTIONAL    | Permission expression                      |
| `preconditions`       | REQUIRED    | Preconditions; MAY be empty                |
| `confirmation`        | OPTIONAL    | Consequence-aware confirmation requirement |

OUI MAY use transitions to present available actions. The BFF MUST enforce transition legality.

## Permission expression

Permission expressions describe declared UI availability and explainability.

Minimum expression forms:

- permission identifier;
- all of;
- any of; and
- not.

The IR MAY declare an unavailable-action explanation. OUI MUST NOT treat omission, hiding, or disabling as backend authorization.

## Service binding

A service binding identifies a generated BFF client available to OUI.

| Field          | Requirement | Meaning                                                                |
| -------------- | ----------- | ---------------------------------------------------------------------- |
| `id`           | REQUIRED    | Stable binding identifier                                              |
| `protocol`     | REQUIRED    | `connect` for the minimum contract                                     |
| `serviceType`  | REQUIRED    | Generated Protobuf service type identifier                             |
| `endpoint`     | REQUIRED    | Deployment configuration reference, not a secret or literal credential |
| `capabilities` | REQUIRED    | Unary, client stream, server stream, or bidirectional stream support   |

Service bindings MUST NOT contain authentication secrets.

## Query

A query obtains BFF-owned state without requesting a business-state transition.

| Field                 | Requirement | Meaning                         |
| --------------------- | ----------- | ------------------------------- |
| `id`                  | REQUIRED    | Stable query identifier         |
| `service`             | REQUIRED    | Service-binding reference       |
| `method`              | REQUIRED    | Generated method identifier     |
| `input`               | REQUIRED    | Input binding declaration       |
| `output`              | REQUIRED    | Output binding declaration      |
| `cache`               | REQUIRED    | Freshness and identity policy   |
| `pagination`          | OPTIONAL    | Cursor or bounded-page contract |
| `streaming`           | OPTIONAL    | Stream behavior                 |
| `requiredPermissions` | OPTIONAL    | Availability expression         |

A query declaration MUST identify all route, actor, session, literal, or prior-output values needed to construct its request.

## Command

A command requests a business effect through the BFF.

| Field                 | Requirement | Meaning                                    |
| --------------------- | ----------- | ------------------------------------------ |
| `id`                  | REQUIRED    | Stable command identifier                  |
| `service`             | REQUIRED    | Service-binding reference                  |
| `method`              | REQUIRED    | Generated method identifier                |
| `input`               | REQUIRED    | Input binding declaration                  |
| `output`              | REQUIRED    | Outcome binding declaration                |
| `idempotency`         | REQUIRED    | Required, supported, or prohibited         |
| `consequence`         | REQUIRED    | Reversible, compensatable, or irreversible |
| `invalidates`         | REQUIRED    | Query or resource references; MAY be empty |
| `requiredPermissions` | OPTIONAL    | Availability expression                    |
| `confirmation`        | OPTIONAL    | Declared confirmation requirement          |
| `progress`            | OPTIONAL    | Long-running operation contract            |

OUI MUST NOT retry a consequential command unless its idempotency contract permits the retry.

## Interaction

An interaction binds user intent to resources and executable BFF operations.

Common fields:

| Field                 | Requirement | Meaning                                    |
| --------------------- | ----------- | ------------------------------------------ |
| `id`                  | REQUIRED    | Stable interaction identifier              |
| `kind`                | REQUIRED    | Supported semantic interaction kind        |
| `intent`              | REQUIRED    | Stable intent identifier                   |
| `label`               | REQUIRED    | Localized label                            |
| `subject`             | OPTIONAL    | Resource-type reference                    |
| `queries`             | REQUIRED    | Query references; MAY be empty             |
| `commands`            | REQUIRED    | Command references; MAY be empty           |
| `requiredPermissions` | OPTIONAL    | Availability expression                    |
| `regions`             | REQUIRED    | Semantic composition regions; MAY be empty |
| `states`              | OPTIONAL    | Interaction lifecycle declaration          |
| `presentation`        | OPTIONAL    | Non-semantic hints                         |
| `provenance`          | OPTIONAL    | Upstream traceability                      |

Minimum interaction kinds for the current vertical slice:

- `collection`;
- `detail`;
- `form`; and
- `decision`.

Unsupported interaction kinds MUST be diagnosed. OUI MUST NOT silently substitute a superficially similar pattern.

## Interaction specializations

### Collection

Required:

- one collection query;
- item resource type;
- declared visible fields;
- item identity;
- supported filter, sort, group, pagination, and selection capabilities; and
- empty-state semantics.

Optional:

- bulk commands;
- alternate table, list, card, or matrix presentation hints;
- default sort and grouping;
- row or item detail route.

### Detail

Required:

- one subject query;
- subject resource type;
- title field or title expression; and
- declared information regions.

Optional:

- relationship queries;
- history query;
- inline commands;
- related routes.

### Form

Required:

- mode: create or edit;
- declared fields;
- submit command;
- initial-value source;
- validation behavior; and
- success outcome.

Optional:

- cancel route;
- autosave behavior;
- unsaved-change policy;
- conditional fields; and
- server validation mapping.

### Decision

Required:

- decision subject;
- decision alternatives;
- evidence declarations;
- authority or required permission;
- one command per executable alternative;
- preconditions; and
- outcome declaration.

Optional:

- policy explanation;
- recommendation;
- confidence display;
- mandatory reason;
- confirmation;
- dissent or abstention; and
- conflict recovery.

Evidence visibility requirements are semantic. A renderer hint MUST NOT hide evidence declared as required before action.

## Semantic declarations and renderer hints

Semantic declarations affect what the interaction means or whether it is valid. Renderer hints suggest a presentation that OUI MAY adapt.

| Semantic declaration                            | Renderer hint                     |
| ----------------------------------------------- | --------------------------------- |
| Decision evidence MUST be visible before action | Prefer evidence in a side panel   |
| Exactly one alternative may be selected         | Prefer radio controls             |
| A collection supports grouping                  | Prefer grouped table sections     |
| A reason is required on rejection               | Prefer a multiline text field     |
| A command is irreversible                       | Prefer high-emphasis confirmation |
| A field contains a date                         | Prefer a compact date picker      |

Rules:

- OUI MUST preserve semantic declarations.
- OUI MAY ignore, adapt, or reject renderer hints based on capability, viewport, modality, accessibility, or theme.
- A renderer hint MUST NOT weaken validation, permission, evidence, state, or consequence semantics.
- Hints MUST come from a finite, versioned vocabulary. Arbitrary CSS and component names are prohibited.

## Cross-reference validation

Before startup, OUI MUST validate:

- global uniqueness of application-scoped identifiers where required;
- uniqueness of owner-scoped field and state identifiers;
- existence and category correctness of every reference;
- route-parent acyclicity;
- interaction, query, command, resource, and service reachability;
- field references against their owning resource or form;
- state and transition references;
- permission references;
- command methods against available generated service descriptors when descriptors are present; and
- absence of semantic contradictions detectable from the minimum contract.

Unreferenced declarations MAY be valid, but SHOULD produce an informational diagnostic when they appear unintentionally unreachable.

## Vertical-slice examples

These examples are conceptual and omit serialization details.

### Collection

```text
interaction:items
  kind: collection
  intent: inspect-collection
  subject: resource:item
  query: query:list-items
  visible fields: identifier, title, status, owner
  capabilities: filter, sort, cursor-pagination, single-selection
  item route: route:item-detail
```

### Detail

```text
interaction:item-detail
  kind: detail
  intent: inspect-resource
  subject: resource:item
  query: query:get-item
  regions: summary, attributes, relationships, history
  commands: command:update-item
```

### Form

```text
interaction:item-edit
  kind: form
  intent: modify-resource
  subject: resource:item
  mode: edit
  initial query: query:get-item
  fields: title, owner, due-date
  submit command: command:update-item
  success: navigate route:item-detail
```

### Evidence-backed decision

```text
interaction:proposal-decision
  kind: decision
  intent: approve-proposal
  subject: resource:proposal
  query: query:get-decision-context
  evidence: summary, terms, history
  alternatives:
    approve -> command:approve-proposal
    reject  -> command:reject-proposal, reason required
  precondition: current state is pending
  authority: permission:decide-proposal
```

The examples use generic resources deliberately. Production vertical concepts bind to these interaction semantics upstream.

## Open architecture questions

The following questions require later issues or ADRs:

1. **Serialization:** Whether the application IR is encoded in Protobuf, JSON Schema-compatible JSON, or another canonical representation.
2. **Version negotiation:** How compiler and runtime compatibility ranges are represented and enforced.
3. **Expressions:** Which bounded expression language represents conditions, input bindings, titles, and permission logic.
4. **Generated configuration:** Which declarations remain runtime data and which become generated TypeScript for type safety and code splitting.
5. **Service descriptors:** Whether generated Protobuf descriptors are required at build time, runtime, or both.
6. **Localization packaging:** Whether message catalogs are embedded, generated as modules, or loaded separately.
7. **Extension trust:** Which extension capabilities may be customer-provided and how they are isolated.
8. **Diagnostic provenance:** The stable format for connecting a conformance failure to canonical bundle sources.
9. **Presentation vocabulary:** The first finite set of renderer hints and its compatibility policy.
10. **Partial support:** Whether an application with unsupported optional interactions may start in a degraded mode.

Until these are resolved, implementations MUST avoid choices that silently make one answer part of the public contract.

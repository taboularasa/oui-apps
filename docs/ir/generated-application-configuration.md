# Generated application configuration

## Purpose

The canonical application IR is semantic data. OUI also needs statically analyzable TypeScript modules for route typing, code splitting, generated Connect clients, extension imports, and build optimization.

This document defines the boundary between those inputs.

```text
application IR --------------------+
                                   |
generated TypeScript configuration +--> OUI application runtime
                                   |
generated Connect clients --------+
```

No generated TypeScript module becomes a second source of business meaning.

## Responsibilities

### Application IR

The application IR is authoritative for:

- application identity and supported IR version;
- required OUI capabilities;
- routes and navigation semantics;
- resources, fields, states, and relationships;
- interaction intent and semantic regions;
- queries and commands;
- validation and permission declarations;
- command consequences and confirmation requirements;
- evidence and decision requirements;
- presentation hints; and
- provenance.

Changing an application behavior requires changing the canonical specification bundle and recompiling the IR.

### Generated TypeScript configuration

Generated configuration is authoritative only for build-time bindings:

- importing the emitted IR artifact;
- binding IR route identifiers to statically generated TanStack Router modules;
- binding service identifiers to generated Connect service descriptors;
- binding supported interaction kinds to OUI pattern packages;
- importing selected accessible primitive adapters;
- importing the default or customer-selected theme package;
- registering explicitly approved extension modules;
- declaring lazy import boundaries;
- providing build-time asset locations; and
- supplying trace metadata that points back to IR declarations and canonical sources.

Generated configuration MUST NOT redefine validation, permissions, states, evidence requirements, command consequences, or another semantic declaration.

### Runtime configuration

Deployment-supplied runtime configuration provides environment-specific values:

- BFF base URL;
- authentication integration;
- telemetry endpoint;
- locale and time-zone defaults when not supplied by the session;
- feature availability controlled outside business semantics; and
- public asset base URL.

Runtime configuration MUST NOT contain secrets delivered to the browser. It MUST NOT alter required IR semantics.

## Generated application manifest

The root generated module exports one typed application manifest.

```ts
import type { GeneratedApplication } from "@oui/react";
import applicationIr from "./application.ir.json";
import { routeTree } from "./route-tree.generated";
import { serviceBindings } from "./services.generated";
import { interactionBindings } from "./interactions.generated";
import { extensionBindings } from "./extensions.generated";
import { defaultTheme } from "@oui/theme-default";

export const application = {
  ir: applicationIr,
  routes: routeTree,
  services: serviceBindings,
  interactions: interactionBindings,
  extensions: extensionBindings,
  theme: defaultTheme,
  trace: {
    compilationId: "compile:example",
    irDigest: "sha256:...",
  },
} satisfies GeneratedApplication;
```

The manifest is a closed, typed composition root. OUI MUST validate that its bindings correspond to declarations in `application.ir`.

## Required generated artifacts

### IR artifact

The build includes one immutable application IR artifact or an equivalent generated module.

Requirements:

- exact `irVersion`;
- deterministic content for equivalent canonical input;
- a content digest;
- no runtime credentials;
- no imported executable customer logic.

### Route tree

The generated route tree:

- maps every required IR route identifier exactly once;
- uses IR path and search-parameter declarations;
- maps each route to its declared interaction identifier;
- exposes static imports or lazy imports;
- contains no route-specific business rules; and
- retains source trace information.

Example:

```ts
export const workItemsRoute = createOUIRoute({
  id: "route:items",
  getParentRoute: () => authenticatedRoute,
  path: "/items",
  interactionId: "interaction:items",
  source: {
    irPath: "/routes/route:items",
    canonical: "application/routes/items",
  },
});
```

### Service bindings

Generated service bindings map IR service identifiers to Protobuf service descriptors:

```ts
export const serviceBindings = defineServices({
  "service:application": {
    service: ApplicationFrontendService,
    transport: "connect",
    source: {
      irPath: "/serviceBindings/service:application",
      proto: "oui/example/v1/application.proto",
    },
  },
});
```

Method availability comes from generated descriptors. Endpoint URLs and credentials do not.

### Interaction bindings

Interaction bindings connect supported IR kinds to OUI-owned pattern implementations:

```ts
export const interactionBindings = defineInteractions({
  collection: lazyInteraction(() => import("@oui/patterns/collection")),
  detail: lazyInteraction(() => import("@oui/patterns/detail")),
  form: lazyInteraction(() => import("@oui/patterns/form")),
  decision: lazyInteraction(() => import("@oui/patterns/decision")),
});
```

They register pattern capability, not domain-specific screens.

### Theme binding

The manifest selects one theme contract implementation:

```ts
import { theme as customerTheme } from "@customer/oui-theme";

export const themeBinding = defineTheme({
  theme: customerTheme,
  conformsTo: "oui.theme.semantic-tokens@1",
});
```

The selected theme cannot alter semantic interaction models.

### Extension bindings

Extensions are imported from an explicit allowlist:

```ts
export const extensionBindings = defineExtensions([
  {
    capability: "field:structured-address",
    module: () => import("@customer/structured-address"),
    contract: "oui.field-renderer@1",
    source: {
      canonical: "application/extensions/structured-address",
    },
  },
]);
```

Generated applications MUST NOT scan arbitrary directories or infer extension registration from package installation.

## Traceability

Every generated binding MUST retain:

- the stable IR identifier;
- the IR path;
- the compilation identifier;
- the IR content digest; and
- canonical source provenance when supplied upstream.

Diagnostics emitted from generated code MUST be reportable against an IR declaration rather than only a generated file line.

Generated source maps MAY supplement this trace but MUST NOT be the only provenance mechanism.

## Determinism

Equivalent IR and compiler inputs MUST produce byte-equivalent generated configuration after normalizing explicitly volatile metadata.

Generation rules:

- sort declarations by stable identifier unless semantic order is declared;
- use stable import aliases derived from identifiers;
- normalize path separators;
- use a fixed formatter version;
- exclude wall-clock timestamps from generated source;
- isolate compilation IDs and digests in designated trace fields;
- fail on duplicate output paths or aliases; and
- remove obsolete generated artifacts.

The generated output MUST include a header identifying it as generated and naming the regeneration command. The header MUST NOT contain a timestamp.

## Manual extension boundary

Manual code is permitted only through versioned OUI extension contracts.

Manual extensions:

- MUST live outside generated directories;
- MUST be imported by an explicit generated binding;
- MUST declare the OUI contract and version they implement;
- MUST pass the relevant conformance suite;
- MUST NOT replace a required core capability silently;
- MUST NOT mutate the parsed IR;
- MUST NOT bypass permission, validation, or command runtimes; and
- MUST retain a trace to the canonical extension declaration.

An override of a required binding is a compilation error unless the IR explicitly authorizes a compatible replacement.

## Prohibited generated content

Generated configuration MUST NOT contain:

- customer decision rules;
- inferred permission logic not present in the IR;
- inline gRPC calls from route modules;
- direct React component trees for domain screens;
- arbitrary CSS or Tailwind classes from IR values;
- credentials or private keys;
- environment-specific service URLs;
- handwritten code embedded as strings;
- silent fallback from unsupported interactions; or
- imports selected by untrusted runtime input.

## Validation

Before application startup, OUI validates:

1. the IR digest matches the manifest trace;
2. the IR version is supported;
3. every required route has one binding;
4. every bound interaction kind is registered;
5. every required service has a generated descriptor;
6. every method referenced by a query or command exists;
7. every extension declares a compatible contract;
8. the theme implements the required token contract; and
9. no binding points to an unknown IR identifier.

Missing required bindings are compatibility errors, not runtime loading states.

## Minimal generated application

```ts
import { createApplication } from "@oui/react";
import { ApplicationFrontendService } from "./gen/application_pb";
import ir from "./application.ir.json";
import { routeTree } from "./route-tree.generated";
import { collection, detail, decision, form } from "@oui/patterns";
import { reactAriaAdapter } from "@oui/react-aria";
import { defaultTheme } from "@oui/theme-default";

export const app = createApplication({
  ir,
  routes: routeTree,
  services: {
    "service:application": ApplicationFrontendService,
  },
  interactions: {
    collection,
    detail,
    form,
    decision,
  },
  primitives: reactAriaAdapter,
  theme: defaultTheme,
  extensions: [],
  trace: {
    compilationId: "compile:reference",
    irDigest: "sha256:reference",
  },
});
```

This module wires known implementations to IR identifiers. It does not decide what fields, actions, evidence, permissions, or transitions the application contains.

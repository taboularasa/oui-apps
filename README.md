# OUI example applications

This repository contains four applications built with OUI, a TypeScript frontend framework that renders a validated application intermediate representation (IR).

The examples show how the same routing, data, form, decision, accessibility, and theme packages can realize different operational applications without putting domain-specific behavior into the shared framework.

## Applications

| Application         | Package                          | What it demonstrates                                                                                  |
| ------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Reference workspace | `@oui/reference-app`             | Collections, details, editing, permissions, and evidence-backed decisions                             |
| Encounter workbench | `@oui/encounter-app`             | Customer and service-encounter lists, details, creation, editing, deletion, and lifecycle transitions |
| Obligation register | `@oui/obligation-app`            | Assets, recurring obligations, proof capture, and exception handling                                  |
| Conflict decision   | `@oui/professional-services-app` | Reviewing conflict-screening evidence before accepting or declining an engagement                     |

A screenshot from the Encounter Workbench is available at [`apps/encounter/e2e/encounter-detail.png`](apps/encounter/e2e/encounter-detail.png).

## Architecture boundary

```text
canonical specification
        |
        v
external semantic compiler
        |
        +--> application IR
        +--> BFF plan and generated service contract
                    |
                    v
            OUI application
```

OUI starts at the application IR. It validates and renders the declared interactions, then communicates through typed Connect/Protobuf clients. OUI does not infer domain meaning, mutate an ontology, or enforce business authority. A compatible backend remains authoritative for identity, authorization, state transitions, idempotency, and audit records.

The generated IR and client files in this repository are safe example snapshots. They are included so the applications and framework packages can be inspected, tested, and built without access to the private producer repositories. Live operation still requires a compatible backend and runtime configuration.

## Requirements

- Node.js 24 or 25
- pnpm 10.28.1

## Install and verify

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

## Run an application

Each development server expects the runtime configuration and compatible backend described by that application's source.

```sh
pnpm dev:reference
pnpm dev:encounter
pnpm dev:obligation
pnpm dev:professional-services
```

The reference application's Storybook provides a backend-free component and interaction catalog:

```sh
pnpm --filter @oui/reference-app storybook
```

## Repository layout

- `apps/`: the four application compositions and generated example bindings
- `packages/`: shared OUI runtime, router, forms, interaction patterns, accessible primitives, and theme packages
- `fixtures/reference/`: the domain-neutral reference IR and negative validation fixtures
- `docs/`: architecture decisions, IR contracts, and frontend/BFF boundary documentation
- `proto/`: the public reference service contract

## Public snapshot policy

This repository intentionally omits private deployment configuration, release-signing material, retained operational logs, conformance ledgers, and private integration automation. It contains no production credentials or customer data.

No license has been granted yet. The source is publicly visible, but normal copyright restrictions apply until the repository receives an explicit license.

### Encounter demo access

The Encounter application opens directly with the intentionally public
`public-demo` identity. Its backend must seed that identity with
`ENCOUNTER_BFF_TEST_TOKEN=public-demo`. The generated backend still enforces
the seeded actor's capabilities. The application discards credentials saved
by the former sign-in screen and removes legacy `token` query parameters.

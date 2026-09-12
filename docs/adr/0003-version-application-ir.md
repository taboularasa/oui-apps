# ADR 0003: Version the application IR with semantic compatibility rules

- **Status:** Accepted
- **Date:** 2026-08-13
- **Decision owners:** OUI maintainers

## Context

The upstream compiler and OUI runtime will be released independently. An application IR can be structurally valid yet use semantics that an installed runtime does not understand. Silently accepting that input could produce a frontend that appears functional while violating the canonical specification.

The runtime needs to determine compatibility before application startup, permit safe additive evolution, reject unknown required behavior, and report stable machine-readable diagnostics.

## Decision

Application IR versions use Semantic Versioning in `MAJOR.MINOR.PATCH` form.

- `MAJOR` changes when an existing valid application's meaning or required behavior may change incompatibly.
- `MINOR` changes when optional declarations or capabilities are added without changing the meaning of existing declarations.
- `PATCH` changes clarify the contract or correct defects without changing which IR documents are accepted.

Every application IR MUST declare an exact `irVersion`. Every OUI runtime MUST publish a supported IR range and MUST complete compatibility checks before application initialization.

Unknown required semantics fail startup. Unknown optional metadata and renderer hints may be ignored with diagnostics when the containing declaration explicitly marks them as optional.

The normative policy is defined in [`../ir/versioning-and-compatibility.md`](../ir/versioning-and-compatibility.md).

## Consequences

- Compiler and runtime releases can move independently within declared ranges.
- Additive capabilities can ship without forcing a new major version.
- Unsupported behavior cannot silently degrade into a misleading UI.
- Patch releases cannot be used to introduce new accepted syntax or semantics.
- IR producers must classify capabilities as required or optional.
- OUI must maintain stable compatibility diagnostic codes.

## Rejected alternatives

### Runtime package version equals IR version

Runtime implementation and public IR evolution have different release pressures. Coupling them would create unnecessary major releases and unclear compatibility.

### Calendar versioning

Dates communicate release time but do not directly communicate whether semantics are compatible.

### Best-effort parsing

Rendering whatever a runtime recognizes can omit required interactions or constraints. Degraded startup is allowed only when every unsupported element is explicitly optional and unreachable from required application behavior.

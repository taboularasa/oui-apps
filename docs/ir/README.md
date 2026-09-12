# Application IR

This directory defines the application intermediate representation consumed by OUI.

The IR is produced upstream. OUI does not interpret source ontologies, canonical specification bundles, or inference-model output. It validates the resulting application IR and realizes the interactions declared by it.

## Documents

- [Minimum contract](minimum-contract.md) — the smallest domain-independent semantic surface OUI requires.
- [Versioning and compatibility](versioning-and-compatibility.md) — evolution, negotiation, unknown input, deprecation, and diagnostics.
- [Generated application configuration](generated-application-configuration.md) — the boundary between semantic IR, build-time TypeScript bindings, and runtime deployment values.

## Normative language

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as requirement levels.

## Boundary

```text
canonical specification bundle
            |
            v
upstream compiler and inference
            |
            v
      application IR
            |
            v
           OUI
```

Changes to this contract must preserve the scope described in the root [`README.md`](../../README.md).

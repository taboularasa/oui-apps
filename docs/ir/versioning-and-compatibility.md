# IR versioning and compatibility

## Version format

Every application IR MUST include:

```text
irVersion: MAJOR.MINOR.PATCH
```

All three non-negative integer components are required. Prefixes, omitted components, build metadata, and pre-release identifiers are not part of the minimum contract.

Examples:

```text
1.0.0
1.3.2
2.0.0
```

## Runtime support declaration

An OUI runtime MUST publish:

- the supported major version;
- the minimum supported minor version;
- the maximum supported minor version it fully understands; and
- any excluded patch releases with known defects.

Conceptually:

```text
supportedIr:
  major: 1
  minimumMinor: 0
  maximumMinor: 3
  excluded:
    - 1.2.4
```

Patch releases within the supported minor range are compatible unless explicitly excluded due to a known contract defect.

## Startup negotiation

Before registering routes, services, or interactions, OUI MUST:

1. confirm `irVersion` is present and syntactically valid;
2. compare its major version with the supported major;
3. confirm the minor version is within the supported range;
4. reject an explicitly excluded patch;
5. inspect required capabilities;
6. inspect unknown declaration kinds and fields; and
7. produce a compatibility result.

The result is one of:

- `compatible`;
- `compatible_with_diagnostics`; or
- `incompatible`.

An incompatible application MUST NOT enter normal application startup.

## Change classification

### Patch change

A patch change:

- corrects an example or editorial defect;
- clarifies existing normative language;
- adds a diagnostic recommendation;
- corrects a schema implementation to match already normative behavior; or
- excludes a defective contract release.

A patch change MUST NOT:

- add a field;
- add an interaction or capability kind;
- change requiredness;
- change a default;
- change validation behavior; or
- alter the meaning of an existing value.

### Minor change

A minor change may:

- add an optional field;
- add an optional renderer hint;
- add an optional interaction or primitive capability;
- add a diagnostic code;
- add an enum value only where unknown values already have defined optional behavior; or
- deprecate an existing declaration without removing it.

A minor change MUST NOT change the behavior of an IR document valid under an earlier minor release.

### Major change

A major change is required when a change:

- removes or renames a declaration, field, or value;
- makes an optional field required;
- weakens or strengthens an existing invariant;
- changes a default or unknown-value policy;
- changes interaction, permission, validation, or command semantics;
- changes identifier or reference resolution;
- changes whether an application may start; or
- requires an existing producer or consumer to change to preserve meaning.

## Required capabilities

The application root MUST declare the finite OUI capabilities required to realize the application.

Each required capability contains:

| Field            | Requirement | Meaning                             |
| ---------------- | ----------- | ----------------------------------- |
| `id`             | REQUIRED    | Stable capability identifier        |
| `minimumVersion` | REQUIRED    | Minimum capability contract version |
| `reason`         | OPTIONAL    | Human-facing compiler explanation   |
| `source`         | OPTIONAL    | Provenance reference                |

Examples:

```text
interaction.collection
interaction.detail
interaction.form
interaction.decision
transport.connect.unary
presentation.theme.semantic-tokens
```

OUI MUST reject startup when a required capability is unknown or below its minimum version.

Optional capabilities MAY appear in declarations that also define fallback or omission behavior. A producer MUST NOT mark a capability optional when omitting it changes required application meaning.

## Unknown input

### Unknown interaction kind

- If referenced by a route, navigation item, required region, or required capability, startup is incompatible.
- If unreachable and explicitly optional, OUI MAY ignore it and report a diagnostic.
- OUI MUST NOT substitute another interaction kind by similarity.

### Unknown field

- An unknown required field is incompatible.
- An unknown optional metadata field MAY be ignored.
- An unknown renderer-hint field MAY be ignored when the hint is explicitly optional.
- An unknown field inside permission, validation, command, state, or evidence semantics is incompatible unless its containing contract defines safe omission.

### Unknown capability

- An unknown required capability is incompatible.
- An unknown optional capability MAY be ignored only when fallback or omission semantics are declared.
- The compatibility report MUST list ignored optional capabilities.

### Unknown enum value

Unknown values follow the containing field's explicit policy:

- `reject`;
- `preserve`;
- `ignore`; or
- `use_declared_fallback`.

There is no implicit fallback.

## Deprecation

A declaration may become deprecated in a minor release.

A deprecation MUST provide:

- the version in which it became deprecated;
- a replacement or explicit statement that no replacement exists;
- migration guidance;
- the earliest major version in which removal is permitted; and
- a stable diagnostic code.

Deprecated declarations remain fully supported until a major release removes them. OUI SHOULD report their use during validation without changing behavior.

The minimum deprecation window is one published minor release. Removal still requires a major release even when the window has elapsed.

## Diagnostics

Compatibility diagnostics have:

| Field            | Requirement |
| ---------------- | ----------- |
| `code`           | REQUIRED    |
| `severity`       | REQUIRED    |
| `message`        | REQUIRED    |
| `irPath`         | REQUIRED    |
| `actualVersion`  | OPTIONAL    |
| `supportedRange` | OPTIONAL    |
| `capability`     | OPTIONAL    |
| `source`         | OPTIONAL    |

Initial stable codes:

| Code                             | Severity         | Meaning                                        |
| -------------------------------- | ---------------- | ---------------------------------------------- |
| `IR_VERSION_MISSING`             | error            | The root has no `irVersion`                    |
| `IR_VERSION_INVALID`             | error            | The version is not valid `MAJOR.MINOR.PATCH`   |
| `IR_VERSION_UNSUPPORTED_MAJOR`   | error            | Runtime and IR major versions differ           |
| `IR_VERSION_UNSUPPORTED_MINOR`   | error            | The minor version is outside the runtime range |
| `IR_VERSION_EXCLUDED_PATCH`      | error            | The exact patch is explicitly excluded         |
| `IR_REQUIRED_CAPABILITY_UNKNOWN` | error            | A required capability is unavailable           |
| `IR_REQUIRED_CAPABILITY_VERSION` | error            | A capability version is too old                |
| `IR_UNKNOWN_INTERACTION_KIND`    | error or warning | An interaction kind is unsupported             |
| `IR_UNKNOWN_REQUIRED_FIELD`      | error            | A required semantic field is unknown           |
| `IR_UNKNOWN_OPTIONAL_FIELD`      | warning          | An optional field was ignored                  |
| `IR_UNKNOWN_ENUM_VALUE`          | error or warning | An enum value followed its declared policy     |
| `IR_DEPRECATED_DECLARATION`      | warning          | A supported deprecated declaration is present  |

Codes are append-only within a major version. Existing code meanings MUST NOT change.

## Compatibility examples

Assume a runtime supports IR major `1`, minor versions `1` through `3`, and all patches except `1.2.4`.

### Supported

```text
input: 1.3.2
required capabilities:
  interaction.collection >= 1.0.0
  interaction.detail >= 1.0.0

result: compatible
```

The major matches, the minor is supported, the patch is not excluded, and all required capabilities are available.

### Forward-unknown but safely optional

```text
input: 1.3.8
optional renderer hint:
  presentation.collection.experimental-density
fallback:
  omit hint

result: compatible_with_diagnostics
diagnostic:
  IR_UNKNOWN_OPTIONAL_FIELD
```

The runtime ignores the optional renderer hint. Required semantics remain unchanged.

### Incompatible major

```text
input: 2.0.0

result: incompatible
diagnostic:
  IR_VERSION_UNSUPPORTED_MAJOR
```

The application does not start.

### Incompatible required capability

```text
input: 1.3.0
required capability:
  interaction.spatial-planner >= 1.0.0

result: incompatible
diagnostic:
  IR_REQUIRED_CAPABILITY_UNKNOWN
```

The application does not start even though the IR version itself is in range.

### Excluded patch

```text
input: 1.2.4

result: incompatible
diagnostic:
  IR_VERSION_EXCLUDED_PATCH
```

The exact contract patch is known to be defective.

## Producer obligations

An upstream compiler MUST:

- emit an exact IR version;
- emit every required capability;
- classify optional capabilities honestly;
- avoid emitting declarations introduced after the selected IR version;
- include deprecation diagnostics during compilation when possible; and
- preserve provenance for compatibility failures.

## Consumer obligations

OUI MUST:

- negotiate before startup;
- fail closed for unknown required semantics;
- never infer compatibility from package versions alone;
- never silently substitute unsupported interaction behavior;
- expose compatibility diagnostics to build tooling; and
- make degraded operation explicit when optional declarations are ignored.

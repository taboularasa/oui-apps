# ADR 0002: Adopt a headless rendering architecture

- **Status:** Accepted
- **Date:** 2026-08-13
- **Decision owners:** OUI maintainers

## Context

OUI must realize a domain-independent application IR as complete customer frontends. Those frontends need substantial visual adaptability across brands, verticals, operating environments, devices, and accessibility needs.

At the same time, OUI's conformance promise depends on preserving interaction meaning and behavior. Required evidence cannot become optional because a theme omits a panel. Permission explanations cannot disappear because a renderer substitutes a disabled button. Keyboard, focus, validation, command, and state-announcement behavior cannot vary accidentally between customer themes.

The architecture therefore needs to separate replaceable presentation from non-replaceable semantic obligations.

## Decision

OUI will be headless at its architectural core.

OUI owns:

- IR semantics;
- application and interaction state;
- routing, query, command, and form lifecycles;
- permission and availability behavior;
- interaction-pattern contracts;
- accessibility obligations;
- conformance validation; and
- framework extension contracts.

Presentation is supplied through replaceable rendering and theme layers that conform to those contracts.

Headless does not mean structureless. Interaction patterns MAY require semantic regions, ordering constraints, relationships, focus movement, announcements, and evidence visibility when those properties are necessary to preserve intent or accessibility.

## Layering

The initial package boundaries will follow this conceptual model:

```text
@oui/core
  IR types, validation, registries, semantic interaction models,
  command lifecycles, permissions, and conformance

@oui/react
  React bindings, application composition, routing, queries,
  forms, and interaction controllers

@oui/react-aria
  Accessible primitive behavior adapters

@oui/patterns
  Semantic interaction compositions and their contracts

@oui/theme-default
  Default visual tokens, CSS, layouts, and presentation
```

Exact package names MAY change while preserving these dependency directions:

```text
core <- react <- patterns
          ^
          |
     react-aria

theme-default -> public pattern and primitive styling hooks
```

The core MUST NOT depend on React, React Aria, Tailwind, or the default theme.

## Headless interaction models

An interaction pattern exposes semantic state and operations independently of its visual realization.

For example, an evidence-backed decision model may expose:

```ts
interface DecisionModel {
  subject: DecisionSubject;
  evidence: readonly EvidenceItem[];
  alternatives: readonly DecisionAlternative[];
  selectedAlternative: string | null;
  availability: ActionAvailability;
  status: DecisionStatus;
  selectAlternative(id: string): void;
  execute(): Promise<DecisionOutcome>;
}
```

The contract, not the default layout, establishes that:

- evidence declared as required is available before execution;
- unavailable actions have an explanation;
- required reasons are collected;
- consequential actions follow declared confirmation behavior;
- execution observes command and idempotency rules;
- outcomes and errors are announced accessibly; and
- stale or conflicting state has a recovery path.

## Rendering contracts

A rendering contract defines:

- required semantic regions;
- required relationships between regions;
- allowed composition and ordering choices;
- accessible names, descriptions, roles, and states;
- focus entry, movement, restoration, and error-focus behavior;
- keyboard and pointer interaction behavior;
- status and outcome announcements;
- responsive adaptation constraints;
- supported theme tokens and styling hooks; and
- conformance tests a renderer must pass.

A renderer MAY:

- change colors, typography, spacing, shape, elevation, and motion;
- rearrange regions where the pattern permits;
- choose among allowed controls and layouts;
- adapt presentation to viewport, modality, locale, and density;
- add non-conflicting decoration or supporting content; and
- replace the default theme completely.

A renderer MUST NOT:

- omit required evidence or explanations;
- weaken validation or permission semantics;
- expose a command that the interaction model marks unavailable;
- change selection cardinality;
- bypass confirmation required by the IR;
- alter command consequence or retry behavior;
- remove required keyboard or assistive-technology behavior; or
- claim conformance without passing the rendering contract's checks.

## Accessible primitive adapters

React Aria Components remains the default behavior foundation selected by ADR 0001. OUI will wrap it behind OUI-owned primitive contracts.

Applications and interaction patterns MUST depend on OUI primitive contracts rather than React Aria APIs.

An alternative primitive adapter MAY be supplied when it:

- implements the complete required primitive contract;
- passes the same browser and accessibility conformance suite;
- does not change interaction semantics; and
- declares its supported OUI contract range.

This permits future adaptation without allowing each customer application to assemble incompatible behavior ad hoc.

## Styling and themes

Tailwind is an implementation detail of the default theme and design-system authoring workflow.

The following rules apply:

- IR MUST NOT contain Tailwind classes, CSS selectors, or component names.
- Core and React interaction models MUST NOT depend on Tailwind.
- Runtime themes use semantic CSS custom properties.
- OUI components expose stable parts, states, and semantic styling hooks.
- Customer configuration supplies semantic token values, not arbitrary internal class strings.
- Default-theme CSS is independently importable and replaceable.
- Theme replacement MUST NOT require forking semantic interaction logic.

## Extensions

OUI will distinguish:

1. **Theme extensions**, which alter tokens and styles.
2. **Renderer extensions**, which realize an existing semantic pattern.
3. **Pattern extensions**, which add a new interaction capability.

Each category has a different conformance burden. A theme cannot redefine behavior. A renderer must satisfy an existing pattern contract. A new pattern must declare and test a new semantic contract.

Extension registration MUST be explicit and versioned. Arbitrary component injection is not a substitute for a supported extension contract.

## Consequences

### Positive

- Customer visual identity can change without changing IR semantics.
- OUI's core can be tested without a DOM or styling system.
- Accessibility behavior has one contract across themes.
- React Aria and Tailwind remain replaceable implementation choices.
- Interaction patterns become reusable across visual systems.
- Generated applications contain less bespoke React code.
- Conformance can identify whether a defect belongs to semantics, behavior, rendering, or theme.

### Negative

- OUI must design explicit semantic models and rendering contracts.
- The default theme cannot rely on private component structure that alternative renderers cannot reproduce.
- Supporting alternative primitive adapters requires a substantial certification suite.
- Some visual compositions will be prohibited because they violate semantic or accessibility constraints.
- Package boundaries and dependency rules need active enforcement.

### Neutral

- OUI will still ship a complete default frontend experience.
- "Headless" describes the architecture and customization boundary, not an expectation that customers assemble every control themselves.
- The default renderer remains the reference implementation for conformance.

## Rejected alternatives

### One inseparable component library

Bundling semantics, behavior, layout, and styling into one component system would be simpler initially but would force customer adaptation through forks, overrides, and duplicated behavior.

### Arbitrary render callbacks everywhere

Unconstrained render callbacks maximize local flexibility but make semantic and accessibility conformance difficult to prove. OUI will expose bounded slots and rendering contracts instead.

### Styling-only customization

Tokens alone cannot support all required layout and composition differences. Certified renderer replacement is permitted where token customization is insufficient.

### Fully unopinionated markup

Some structure is semantic. Decisions, forms, evidence, errors, and navigation require relationships and ordering constraints. OUI will not sacrifice those requirements in the name of headlessness.

## Validation

The architecture is validated when:

- core interaction models can run without importing React or CSS;
- the default React renderer and theme are separate packages;
- replacing the default theme does not change behavior tests;
- a renderer conformance suite verifies semantic and accessibility obligations; and
- no IR fixture contains framework component names or styling implementation details.

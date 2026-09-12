# Reference application fixture

The reference application is a fictional, domain-neutral work surface. It exists to exercise OUI interaction semantics without making the framework depend on a production vertical.

## Contents

- [`application.ir.json`](application.ir.json) is the valid application IR fixture.
- [`expected/route-tree.generated.json`](expected/route-tree.generated.json) is the deterministic route binding expected from the valid fixture.
- [`invalid`](invalid) contains RFC 6902 JSON Patch documents that each introduce one invalid condition into the valid fixture.
- [`manifest.json`](manifest.json) declares expected compatibility and diagnostics for every case.

Invalid cases are materialized by applying one patch to `application.ir.json`. A fixture runner MUST NOT combine invalid patches unless a test explicitly exercises diagnostic aggregation.

## Coverage

The valid fixture includes:

- an application shell with navigation and semantic regions;
- collection, detail, edit-form, and evidence-backed decision routes;
- filtering, sorting, cursor pagination, and selection;
- resource relationships and history;
- client and server validation;
- permission expressions and an explained unavailable action; and
- queries and commands bound to `oui.reference.v1.ReferenceFrontendService`.

The fixture deliberately uses generic `Item`, `Actor`, and `Proposal` resources. Those names carry no production-domain meaning.

## Serialization status

JSON is the fixture serialization selected for executable examples. The semantic contract remains the authority. Until a canonical wire schema is adopted, consumers MUST NOT infer additional semantics from object member order or JSON-specific representation details.

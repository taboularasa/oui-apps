# Frontend BFF contract

OUI communicates directly with a generated Go Backend for Frontend through Buf-managed Protobuf services and the Connect protocol.

## Documents

- [Contract conventions](frontend-contract.md) — transport metadata, queries, commands, errors, pagination, streaming, and long-running operations.

## Reference contract

[`proto/oui/reference/v1/reference.proto`](../../proto/oui/reference/v1/reference.proto) is the domain-neutral service used by OUI fixtures and vertical-slice tests.

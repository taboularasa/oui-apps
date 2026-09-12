import { describe, expect, it } from "vitest";
import { createIdempotencyIdentityStore } from "./idempotency";

describe("idempotency identity store", () => {
  it("retains an identity for an explicit retry and rotates it for changed input", () => {
    let sequence = 0;
    const identities = createIdempotencyIdentityStore(
      () => `idempotency:${String(++sequence)}`,
    );
    const input = { itemId: "item:1", changes: { title: "First" } };

    const first = identities.forInput("command:update-item", input);
    expect(identities.forInput("command:update-item", input)).toBe(first);
    expect(
      identities.forInput("command:update-item", {
        itemId: "item:1",
        changes: { title: "Second" },
      }),
    ).not.toBe(first);
  });

  it("releases an identity only after an authoritative result", () => {
    let sequence = 0;
    const identities = createIdempotencyIdentityStore(
      () => `idempotency:${String(++sequence)}`,
    );
    const input = { proposalId: "proposal:1", alternativeId: "approve" };
    const first = identities.forInput("command:decide-proposal", input);

    identities.complete("command:decide-proposal", input);

    expect(identities.forInput("command:decide-proposal", input)).not.toBe(
      first,
    );
  });
});

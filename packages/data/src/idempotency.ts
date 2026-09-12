export interface IdempotencyIdentityStore {
  forInput(
    operationId: string,
    input: Readonly<Record<string, unknown>>,
  ): string;
  complete(operationId: string, input: Readonly<Record<string, unknown>>): void;
}

export function createIdempotencyIdentityStore(
  createIdentity: () => string = () => crypto.randomUUID(),
): IdempotencyIdentityStore {
  const identities = new Map<string, string>();
  const inputIdentity = (
    operationId: string,
    input: Readonly<Record<string, unknown>>,
  ) => `${operationId}\u0000${JSON.stringify(canonicalize(input))}`;

  return Object.freeze({
    forInput(
      operationId: string,
      input: Readonly<Record<string, unknown>>,
    ): string {
      const fingerprint = inputIdentity(operationId, input);
      const existing = identities.get(fingerprint);
      if (existing !== undefined) {
        return existing;
      }
      const created = createIdentity();
      identities.set(fingerprint, created);
      return created;
    },
    complete(
      operationId: string,
      input: Readonly<Record<string, unknown>>,
    ): void {
      identities.delete(inputIdentity(operationId, input));
    },
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

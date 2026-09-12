export type ResourceLoadState =
  "empty" | "error" | "loading" | "partial" | "ready" | "stale" | "unavailable";

export function classifyResourceLoadState({
  available,
  loading,
  error,
  itemCount,
  stale,
  partial,
}: {
  readonly available: boolean;
  readonly loading: boolean;
  readonly error: unknown;
  readonly itemCount: number;
  readonly stale: boolean;
  readonly partial: boolean;
}): ResourceLoadState {
  if (!available) {
    return "unavailable";
  }
  if (error !== undefined) {
    return "error";
  }
  if (loading && itemCount === 0) {
    return "loading";
  }
  if (stale) {
    return "stale";
  }
  if (partial) {
    return "partial";
  }
  return itemCount === 0 ? "empty" : "ready";
}

import { createContext, useContext, type ReactNode } from "react";
import type { ObligationApplicationComposition } from "./application";

const ObligationApplicationContext =
  createContext<ObligationApplicationComposition | null>(null);

export function ObligationApplicationProvider({
  children,
  composition,
}: {
  readonly children: ReactNode;
  readonly composition: ObligationApplicationComposition;
}) {
  return (
    <ObligationApplicationContext value={composition}>
      {children}
    </ObligationApplicationContext>
  );
}

export function useObligationApplication(): ObligationApplicationComposition {
  const composition = useContext(ObligationApplicationContext);
  if (composition === null) {
    throw new Error(
      "The obligation application composition is not available in this tree.",
    );
  }
  return composition;
}

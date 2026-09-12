import { createContext, useContext, type ReactNode } from "react";
import type { EncounterApplicationComposition } from "./application";

const EncounterApplicationContext =
  createContext<EncounterApplicationComposition | null>(null);

export function EncounterApplicationProvider({
  children,
  composition,
}: {
  readonly children: ReactNode;
  readonly composition: EncounterApplicationComposition;
}) {
  return (
    <EncounterApplicationContext value={composition}>
      {children}
    </EncounterApplicationContext>
  );
}

export function useEncounterApplication(): EncounterApplicationComposition {
  const composition = useContext(EncounterApplicationContext);
  if (composition === null) {
    throw new Error(
      "The encounter application composition is not available in this tree.",
    );
  }
  return composition;
}

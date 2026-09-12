import { createContext, useContext, type ReactNode } from "react";
import type { ReferenceApplicationComposition } from "./application";

const ReferenceApplicationContext = createContext<
  ReferenceApplicationComposition | undefined
>(undefined);

export function ReferenceApplicationProvider({
  children,
  composition,
}: {
  readonly children: ReactNode;
  readonly composition: ReferenceApplicationComposition;
}) {
  return (
    <ReferenceApplicationContext.Provider value={composition}>
      {children}
    </ReferenceApplicationContext.Provider>
  );
}

export function useReferenceApplication(): ReferenceApplicationComposition {
  const composition = useContext(ReferenceApplicationContext);
  if (composition === undefined) {
    throw new Error(
      "useReferenceApplication must be used within ReferenceApplicationProvider.",
    );
  }
  return composition;
}

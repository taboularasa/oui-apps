import { createContext, useContext, type ReactNode } from "react";
import type { ProfessionalServicesApplicationComposition } from "./application";

const ProfessionalServicesApplicationContext =
  createContext<ProfessionalServicesApplicationComposition | null>(null);

export function ProfessionalServicesApplicationProvider({
  children,
  composition,
}: {
  readonly children: ReactNode;
  readonly composition: ProfessionalServicesApplicationComposition;
}) {
  return (
    <ProfessionalServicesApplicationContext value={composition}>
      {children}
    </ProfessionalServicesApplicationContext>
  );
}

export function useProfessionalServicesApplication(): ProfessionalServicesApplicationComposition {
  const composition = useContext(ProfessionalServicesApplicationContext);
  if (composition === null) {
    throw new Error(
      "The professional-services application composition is not available.",
    );
  }
  return composition;
}

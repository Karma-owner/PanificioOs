import { useMemo } from "react";

import { useAuth, type Role } from "@/src/utils/auth";
import type { LabSettings, TempArea } from "@/src/utils/lab-settings";

export type LabInfo = {
  labName: string;
  role: Role;
  isAdmin: boolean;
  accountName: string;
  settings: LabSettings;
  /** Nomi per la firma: se l'amministratore non ne ha ancora inseriti, si usa il nome dell'account. */
  operators: string[];
  tempAreas: TempArea[];
};

// Va usato solo dentro l'app: AuthGate la mostra soltanto con un panificio selezionato.
export function useLab(): LabInfo {
  const { membership } = useAuth();
  return useMemo<LabInfo>(() => {
    if (!membership) {
      return { labName: "Laboratorio", role: "operatore", isAdmin: false, accountName: "", settings: { operators: [], tempAreas: [] }, operators: [""], tempAreas: [] };
    }
    const operators = membership.settings.operators.length > 0 ? membership.settings.operators : [membership.displayName];
    return {
      labName: membership.tenantName,
      role: membership.role,
      isAdmin: membership.role === "admin",
      accountName: membership.displayName,
      settings: membership.settings,
      operators,
      tempAreas: membership.settings.tempAreas,
    };
  }, [membership]);
}

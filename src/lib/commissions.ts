import type { StatutReversement } from "./api";

export const STATUTS: Record<StatutReversement, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  A_CALCULER: { libelle: "À calculer", ton: "neutre" },
  CALCULE: { libelle: "À valider", ton: "warn" },
  VALIDE: { libelle: "Validé", ton: "ok" },
  FACTURE_PAR_LIEU: { libelle: "Facturé par le lieu", ton: "ok" },
  AUTOFACTURE: { libelle: "Autofacturé", ton: "ok" },
  PAYE: { libelle: "Payé", ton: "ok" },
};

/** "12,5" → 1250 points de base ; "" → null */
export const versBp = (v: string) => (v.trim() === "" ? null : Math.round(parseFloat(v.replace(",", ".")) * 100));
/** "500" ou "500,50" → centimes ; "" → null */
export const versCents = (v: string) => (v.trim() === "" ? null : Math.round(parseFloat(v.replace(",", ".")) * 100));
export const depuisBp = (bp: number | null) => (bp === null ? "" : String(bp / 100).replace(".", ","));
export const depuisCents = (c: number | null) => (c === null ? "" : String(c / 100).replace(".", ","));

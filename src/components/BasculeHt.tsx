"use client";

import { useState } from "react";

// Préférence HT / TTC gardée sur ce navigateur, commune au tableau de bord et aux fiches lieu
const CLE_HT = "regie_tdb_ht";
const lireHt = () => {
  try {
    return localStorage.getItem(CLE_HT) === "1";
  } catch {
    return false;
  }
};

export function usePreferenceHt(): [boolean, (v: boolean) => void] {
  const [ht, setHtEtat] = useState(lireHt);
  const setHt = (v: boolean) => {
    setHtEtat(v);
    try {
      localStorage.setItem(CLE_HT, v ? "1" : "0");
    } catch {
      /* stockage indisponible : la préférence vaut pour la visite */
    }
  };
  return [ht, setHt];
}

/** HT d'un montant TTC à 20 % de TVA (taux des ventes en régie), quand le HT exact n'est pas calculé */
export const htDepuisTtc = (ttcCents: number) => Math.round(ttcCents / 1.2);

export function BasculeHt({ ht, onChange }: { ht: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Montants">
      {[false, true].map((v) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={ht === v}
          onClick={() => onChange(v)}
          className={`rounded px-3 py-1.5 text-sm font-medium ${ht === v ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {v ? "HT" : "TTC"}
        </button>
      ))}
    </div>
  );
}

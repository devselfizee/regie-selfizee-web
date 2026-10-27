"use client";

import { useState } from "react";
import type { LieuListe } from "@/lib/api";

/** « Apsara Club (Saint-Brieuc, 22) » */
export const nomLieu = (l: Pick<LieuListe, "enseigne" | "ville" | "departement">) => {
  const lieu = [l.ville, l.departement].filter(Boolean).join(", ");
  return lieu ? `${l.enseigne} (${lieu})` : l.enseigne;
};

/**
 * Choix d'un lieu en tapant son nom (des centaines de lieux : une liste déroulante ne suffit plus).
 * Vide : tous les lieux.
 */
export function ChoixLieu({ id, lieux, valeur, onChange }: { id: string; lieux: LieuListe[]; valeur: string; onChange: (lieuId: string) => void }) {
  const choisi = lieux.find((l) => String(l.id) === valeur);
  const [texte, setTexte] = useState(choisi ? nomLieu(choisi) : "");
  return (
    <>
      <input
        id={id}
        className="champ"
        list={`${id}-liste`}
        placeholder="Tous les lieux (tapez un nom)"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          const l = lieux.find((x) => nomLieu(x) === e.target.value);
          if (l) onChange(String(l.id));
          else if (!e.target.value.trim()) onChange("");
        }}
        onBlur={() => {
          // Texte qui ne correspond à aucun lieu : on revient au lieu choisi (ou à tous)
          if (!lieux.some((x) => nomLieu(x) === texte)) setTexte(choisi ? nomLieu(choisi) : "");
        }}
      />
      <datalist id={`${id}-liste`}>
        {lieux.map((l) => <option key={l.id} value={nomLieu(l)} />)}
      </datalist>
    </>
  );
}

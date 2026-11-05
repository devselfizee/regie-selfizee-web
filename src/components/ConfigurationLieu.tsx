"use client";

import { ResumeTarifLieu } from "./GrilleTarifs";
import { EvenementsLieu } from "./EvenementsLieu";

// Onglet « Configuration » de la fiche lieu (retour de Sébastien du 03/11) : le tarif du lieu, renseigné
// une fois et repris par chaque événement, puis la liste des événements (celui par défaut, Halloween, une
// soirée…). Les infos affichées par la borne (nom, avis, réseaux, assistance) sont dans l'onglet
// Communication de l'édition du lieu (05/11).

/** Onglet « Configuration » de la fiche lieu. */
export function ConfigurationLieu({ lieuId }: { lieuId: number }) {
  return (
    <div className="space-y-6">
      <ResumeTarifLieu lieuId={lieuId} />
      <EvenementsLieu lieuId={lieuId} />
    </div>
  );
}

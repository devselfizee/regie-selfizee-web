"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type EvenementPonctuel, type FicheEvenementLieu } from "@/lib/api";
import { maintenantParis } from "@/lib/programmation";
import { Chargement, Erreur } from "./Etat";
import { EvenementsLieu } from "./EvenementsLieu";
import { FriseProgrammation } from "./ProgrammationLieu";

// Onglet « Configuration » de la fiche lieu (maquettes du 10/11/2026, allégé d'après le retour du 12/11) : la frise
// de la programmation à partir d'aujourd'hui, puis un seul bloc « Événements » (la ligne « Par défaut », puis les
// événements personnalisés), chacun avec les tarifs qu'il pratique. Le tarif du lieu se modifie dans l'édition du
// lieu (onglet Tarifs), celui d'un événement dans sa fiche.

/** Onglet « Configuration » de la fiche lieu. */
export function ConfigurationLieu({ lieuId }: { lieuId: number }) {
  const defaut = useQuery({ queryKey: ["evenement-lieu", lieuId, "habituel"], queryFn: () => api<FicheEvenementLieu>(`/lieux/${lieuId}/evenement`) });
  const liste = useQuery({ queryKey: ["evenements-ponctuels", lieuId], queryFn: () => api<EvenementPonctuel[]>(`/lieux/${lieuId}/evenements-ponctuels`) });
  if (defaut.error || liste.error) return <Erreur erreur={defaut.error ?? liste.error} />;
  if (!defaut.data || !liste.data) return <Chargement />;
  const maintenant = maintenantParis();
  return (
    <div className="space-y-5">
      <FriseProgrammation lieuId={lieuId} defaut={defaut.data} liste={liste.data} maintenant={maintenant} />
      <EvenementsLieu lieuId={lieuId} defaut={defaut.data} liste={liste.data} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type TarifsLieu } from "@/lib/api";
import { Badge, Chargement, Erreur, Section } from "./Etat";
import { ResumeGrille } from "./GrilleTarifs";
import { EvenementsLieu } from "./EvenementsLieu";

// Onglet « Configuration » de la fiche lieu (retour de Sébastien du 03/11) : le tarif du lieu, renseigné
// une fois et repris par chaque événement, puis la liste des événements (celui par défaut, Halloween, une
// soirée…). Les infos affichées par la borne (nom, avis, réseaux, assistance) sont dans l'onglet
// Communication de l'édition du lieu (05/11).

function TarifDuLieu({ lieuId }: { lieuId: number }) {
  const { data, error } = useQuery({ queryKey: ["tarifs-lieu", lieuId], queryFn: () => api<TarifsLieu>(`/lieux/${lieuId}/tarifs`) });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  const g = data.propre ?? data.base;
  return (
    <div className="space-y-3 text-sm">
      {data.propre ? <Badge ton="warn">Tarifs propres au lieu</Badge> : <Badge ton="neutre">Tarifs de base du parc</Badge>}
      <ResumeGrille grille={g} />
    </div>
  );
}

/** Onglet « Configuration » de la fiche lieu. */
export function ConfigurationLieu({ lieuId }: { lieuId: number }) {
  return (
    <div className="space-y-6">
      <Section titre="Tarif du lieu" actions={<Link href={`/lieux/${lieuId}/configuration/tarifs`} className="bouton-second">Modifier</Link>}>
        <p className="mb-3 text-xs text-ink-muted">Repris par chaque événement, sauf ceux qui ont leurs propres tarifs.</p>
        <TarifDuLieu lieuId={lieuId} />
      </Section>
      <EvenementsLieu lieuId={lieuId} />
    </div>
  );
}

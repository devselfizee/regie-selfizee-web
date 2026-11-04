"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ReponseInfosBorne, type TarifsLieu } from "@/lib/api";
import { euros, JOURS_SEMAINE } from "@/lib/format";
import { Badge, Chargement, Erreur, Section } from "./Etat";
import { EvenementsLieu } from "./EvenementsLieu";

// Onglet « Configuration » de la fiche lieu (retour de Sébastien du 03/11) : la borne du lieu en trois
// blocs. Les infos du lieu et son tarif, renseignés une fois et repris par chaque événement, puis la
// liste des événements (celui par défaut, Halloween, une soirée…).

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-2">{libelle}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

const vide = <span className="text-ink-muted">—</span>;

function InfosDuLieu({ lieuId }: { lieuId: number }) {
  const { data, error } = useQuery({ queryKey: ["infos-borne", lieuId], queryFn: () => api<ReponseInfosBorne>(`/lieux/${lieuId}/infos-borne`) });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  const i = data.infos;
  const reseaux = [i.instagram && `Instagram ${i.instagram}`, i.tiktok && `TikTok ${i.tiktok}`].filter(Boolean).join(" · ");
  const jours = new Set(data.horaires.map((h) => h.jourSemaine));
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <Ligne libelle="Nom affiché">{i.nom}</Ligne>
      <Ligne libelle="Ville">{i.ville ?? vide}</Ligne>
      <Ligne libelle="Avis Google">{i.avisGoogleUrl ? <Badge ton="ok">Lien renseigné</Badge> : <Badge ton="warn">Pas de lien</Badge>}</Ligne>
      <Ligne libelle="Réseaux">{reseaux || <span className="text-ink-muted">Comptes Selfizee</span>}</Ligne>
      <Ligne libelle="Assistance">
        {i.assistance.proprietaire === "client" ? "Le client" : "Selfizee"}
        {i.assistance.telephone && <span className="text-ink-2"> · {i.assistance.telephone}</span>}
      </Ligne>
      <Ligne libelle="Horaires">
        {data.horaires.length ? (
          <span>
            Ouvert {jours.size} jour{jours.size > 1 ? "s" : ""} sur 7
            <span className="text-ink-2"> ({[...jours].sort((a, b) => a - b).map((j) => JOURS_SEMAINE[j].slice(0, 3)).join(", ")})</span>
          </span>
        ) : (
          <Badge ton="warn">Aucun horaire</Badge>
        )}
      </Ligne>
    </dl>
  );
}

function TarifDuLieu({ lieuId }: { lieuId: number }) {
  const { data, error } = useQuery({ queryKey: ["tarifs-lieu", lieuId], queryFn: () => api<TarifsLieu>(`/lieux/${lieuId}/tarifs`) });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  const g = data.propre ?? data.base;
  return (
    <div className="space-y-3 text-sm">
      {data.propre ? <Badge ton="warn">Tarifs propres au lieu</Badge> : <Badge ton="neutre">Tarifs de base du parc</Badge>}
      <ul className="flex flex-wrap gap-2">
        {g.paliers.map((p) => (
          <li key={p.de} className={`rounded-lg border px-3 py-2 ${g.palierMisEnAvant === p.de ? "border-accent bg-accent/5" : "border-line"}`}>
            {g.palierMisEnAvant === p.de && (
              <span className="mb-1 block text-[0.7rem] font-semibold uppercase tracking-wide text-accent" title="Palier mis en avant sur l'écran d'offre de la borne">
                ★ {g.libelleMisEnAvant || "Mis en avant"}
              </span>
            )}
            <span className="block text-xs text-ink-2">{p.de === 1 ? "1 tirage" : `Dès ${p.de} tirages`}</span>
            <span className="tabular font-semibold">{euros(p.prixCents)}</span>
            <span className="text-xs text-ink-2"> / tirage</span>
          </li>
        ))}
      </ul>
      <p className="text-ink-2">
        « +1 pour un pote » : <span className="tabular font-medium text-ink">{euros(g.plusUnCents)}</span>
      </p>
    </div>
  );
}

/** Onglet « Configuration » de la fiche lieu. */
export function ConfigurationLieu({ lieuId }: { lieuId: number }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section titre="Infos du lieu" actions={<Link href={`/lieux/${lieuId}/configuration/lieu`} className="bouton-second">Modifier</Link>}>
          <p className="mb-3 text-xs text-ink-muted">Reprises par chaque événement de la borne.</p>
          <InfosDuLieu lieuId={lieuId} />
        </Section>
        <Section titre="Tarif du lieu" actions={<Link href={`/lieux/${lieuId}/configuration/tarifs`} className="bouton-second">Modifier</Link>}>
          <p className="mb-3 text-xs text-ink-muted">Repris par chaque événement, sauf ceux qui ont leurs propres tarifs.</p>
          <TarifDuLieu lieuId={lieuId} />
        </Section>
      </div>
      <EvenementsLieu lieuId={lieuId} />
    </div>
  );
}

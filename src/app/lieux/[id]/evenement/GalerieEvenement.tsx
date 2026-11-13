"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type LieuFiche, type ResumeMedias } from "@/lib/api";
import { PageGuard } from "@/lib/perms";
import { Chargement, Erreur, Vide } from "@/components/Etat";
import { FilAriane } from "@/components/FilAriane";
import { GalerieMedias } from "@/components/GalerieMedias";

// Page galerie d'un événement (habituel : /lieux/:id/evenement/galerie ; ponctuel : …/evenement/:eid/galerie) :
// les photos et vidéos des séances faites sur la borne avec cet événement, synchronisées depuis PikCloud.
// Ouverte à ceux qui voient les médias du lieu (admin, commercial, partenaire), pas seulement à l'admin
// comme la fiche de configuration : l'événement est retrouvé dans le résumé de la galerie, pas dans sa fiche.

const pageEvenement = (lieuId: number, eid?: number) => (eid ? `/lieux/${lieuId}/evenement/${eid}` : `/lieux/${lieuId}/evenement`);

export function GalerieEvenement({ id, eid }: { id: number; eid?: number }) {
  return (
    <PageGuard perm="medias.view">
      <Contenu id={id} eid={eid} />
    </PageGuard>
  );
}

function Contenu({ id, eid }: { id: number; eid?: number }) {
  const lieu = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  const resume = useQuery({ queryKey: ["medias-resume", id], queryFn: () => api<ResumeMedias>(`/lieux/${id}/medias/resume`) });
  if (lieu.error || resume.error) return <Erreur erreur={lieu.error ?? resume.error} />;
  if (!lieu.data || !resume.data) return <Chargement />;

  const evenement = resume.data.parEvenement.find((e) => (eid ? e.id === eid : e.habituel));
  const titre = evenement ? (evenement.habituel ? "Événement par défaut" : evenement.nom ?? "Événement") : "Événement";

  return (
    <div className="pb-4">
      <FilAriane lieuId={id} enseigne={lieu.data.enseigne} parent={{ href: pageEvenement(id, eid), libelle: titre }} page="Galerie" />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Photos et vidéos reçues</h1>
          <p className="mt-2 text-sm text-ink-2">
            {titre}
            {evenement && (
              <>
                {" "}· code <span className="font-mono font-semibold tracking-wider">{evenement.code}</span>
              </>
            )}
            {" "}· les séances faites sur la borne avec cet événement.
          </p>
        </div>
        <Link href={pageEvenement(id, eid)} className="bouton-second">
          <span aria-hidden>←</span> Fiche de l&apos;événement
        </Link>
      </header>

      {evenement ? (
        <GalerieMedias lieuId={id} evenementId={evenement.id} />
      ) : (
        <Vide>{eid ? "Événement introuvable." : "L'événement habituel n'est pas encore enregistré : les médias arriveront une fois l'événement installé sur la borne."}</Vide>
      )}
    </div>
  );
}

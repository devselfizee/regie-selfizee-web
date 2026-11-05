"use client";

import { Badge } from "@/components/Etat";
import { IllustrationGabarit } from "@/components/IllustrationGabarit";
import { MAX_COMPOSITIONS, type GabaritEvenement } from "@/lib/api";
import { GABARITS } from "@/lib/gabaritsEvenement";
import { FORMATS_KIT } from "./formatsKit";
import { ChoixDepart, EnTeteStudio, type Depart } from "./StudioRegie";

// « Ajouter un format » depuis la fiche événement : les deux premières étapes du studio, avant d'y entrer
// à l'étape 3 (modèle). 1. départ (modèle vierge ou catalogue), 2. format du kit à proposer sur la borne.

const NOMS_DEPART: Record<Depart, string> = { vierge: "Modèle vierge", catalogue: "Catalogue" };

/** Étape 1 : modèle vierge ou catalogue, avant de savoir quel format on ajoute. */
export function ChoixDepartNouveau({ nomLieu, onChoisir, onRetour }: { nomLieu: string; onChoisir: (d: Depart) => void; onRetour: () => void }) {
  return (
    <div className="min-h-screen bg-page">
      <EnTeteStudio retour={onRetour} libelleRetour="Fiche événement" titre="Studio · Nouveau format" nomLieu={nomLieu} etape={1} />
      <div className="mx-auto max-w-3xl p-6">
        <h2 className="mb-8 text-center text-2xl font-bold text-ink">Comment voulez-vous commencer ?</h2>
        <ChoixDepart onChoisir={onChoisir} />
      </div>
    </div>
  );
}

/** Étape 2 : le format du kit. Depuis le catalogue, les formats qui n'y ont pas de modèles sont grisés. */
export function ChoixFormatKit({ nomLieu, nbFormats, depart, onChoisir, onRetour }: {
  nomLieu: string;
  nbFormats: number;
  depart: Depart;
  onChoisir: (g: GabaritEvenement) => void;
  onRetour: () => void;
}) {
  const plein = nbFormats >= MAX_COMPOSITIONS;
  return (
    <div className="min-h-screen bg-page">
      <EnTeteStudio retour={onRetour} libelleRetour="Retour" titre="Studio · Nouveau format" nomLieu={nomLieu} etape={2} details={[NOMS_DEPART[depart]]} />
      <div className="p-6">
        <h2 className="mb-2 text-center text-2xl font-bold text-ink">Quel format proposer sur la borne ?</h2>
        <p className="mb-8 text-center text-sm text-ink-2">
          {plein
            ? `${MAX_COMPOSITIONS} formats au plus sur l'écran de choix : retirez-en un dans la fiche.`
            : `Il s'ajoutera à la fin de l'écran de choix (${nbFormats + 1} / ${MAX_COMPOSITIONS}) quand vous enregistrerez son cadre.`}
        </p>
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GABARITS.map((g) => {
            const sansCatalogue = depart === "catalogue" && FORMATS_KIT[g.cle].catalogue === false;
            return (
              <button
                key={g.cle}
                type="button"
                disabled={plein || sansCatalogue}
                onClick={() => onChoisir(g.cle)}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-5 text-center transition-all hover:-translate-y-1 hover:border-accent hover:shadow-lg focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-line disabled:hover:shadow-none"
              >
                <span className="flex h-40 w-full items-center justify-center rounded-xl bg-gradient-to-br from-accent/5 to-accent/15 px-6 py-4">
                  <IllustrationGabarit gabarit={g.cle} className="h-full max-w-full transition group-hover:scale-105" />
                </span>
                <span className="mt-1 font-semibold text-ink group-hover:text-accent">{g.nom}</span>
                <span className="text-xs text-ink-2">{g.detail}</span>
                <span className="flex flex-wrap justify-center gap-1.5">
                  {g.qr && <Badge ton="neutre">QR de partage</Badge>}
                  {sansCatalogue && <Badge ton="warn">Pas de modèle au catalogue : partez d&apos;un modèle vierge</Badge>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

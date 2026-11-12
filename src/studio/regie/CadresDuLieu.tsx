"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CadreEvenement, type GabaritEvenement } from "@/lib/api";
import { Chargement, Erreur } from "@/components/Etat";
import { FORMATS_KIT } from "./formatsKit";

// Départ « Cadre du lieu » du studio (retour du 12/11) : repartir d'un cadre déjà dessiné pour ce lieu, dans
// l'événement par défaut ou un autre. On copie son dessin ; le cadre d'origine ne change pas.

export interface CadreDuLieu extends CadreEvenement {
  evenement: { id: number; nom: string | null; habituel: boolean; code: string };
}

/** Le dessin à reprendre : format et gabarit du studio, et l'état Fabric du canvas. */
export interface ModeleDepart {
  gabarit: GabaritEvenement;
  formatId: string;
  gabaritStudioId: string | null;
  canvas: string;
}

/** Route API du cadre (son contenu se lit sur l'événement qui le porte). */
export const cheminCadreDuLieu = (lieuId: number, c: Pick<CadreDuLieu, "evenement" | "compositionId">) =>
  `${c.evenement.habituel ? `/lieux/${lieuId}/evenement` : `/lieux/${lieuId}/evenements-ponctuels/${c.evenement.id}`}/cadres/${c.compositionId}`;

/** Repère d'un cadre dans l'adresse du studio : « d~bandelette-1 » (par défaut) ou « 12~pola-2 ». */
export const repereCadre = (c: Pick<CadreDuLieu, "evenement" | "compositionId">) => `${c.evenement.habituel ? "d" : c.evenement.id}~${c.compositionId}`;
export function cheminDuRepere(lieuId: number, repere: string | null): string | null {
  const m = /^(d|\d+)~([a-z0-9-]{1,40})$/.exec(repere ?? "");
  if (!m) return null;
  return `${m[1] === "d" ? `/lieux/${lieuId}/evenement` : `/lieux/${lieuId}/evenements-ponctuels/${m[1]}`}/cadres/${m[2]}`;
}

const libelleEvenement = (e: CadreDuLieu["evenement"]) => (e.habituel ? "Événement par défaut" : e.nom ?? "Événement");

/**
 * Les cadres du lieu, groupés par événement (le par défaut d'abord) ; `gabarit` : seulement ceux de ce format du kit.
 * `chargerDessin` : lit le dessin du cadre choisi avant de le rendre (sinon seul le cadre choisi est rendu).
 */
export function ChoixCadreLieu({ lieuId, gabarit, onChoisir, chargerDessin = false }: {
  lieuId: number;
  gabarit?: GabaritEvenement;
  onChoisir: (cadre: CadreDuLieu, modele?: ModeleDepart) => void;
  chargerDessin?: boolean;
}) {
  const liste = useQuery({
    queryKey: ["cadres-du-lieu", lieuId, gabarit ?? ""],
    queryFn: () => api<CadreDuLieu[]>(`/lieux/${lieuId}/cadres-du-lieu${gabarit ? `?gabarit=${gabarit}` : ""}`),
  });
  const [lecture, setLecture] = useState<string | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);

  const choisir = async (c: CadreDuLieu) => {
    if (!chargerDessin) return onChoisir(c);
    setLecture(repereCadre(c));
    setErreur(null);
    try {
      const d = await api<{ canvas: string }>(cheminCadreDuLieu(lieuId, c));
      onChoisir(c, { gabarit: c.gabarit, formatId: c.formatId, gabaritStudioId: c.gabaritStudioId, canvas: d.canvas });
    } catch (e) {
      setErreur(e);
    } finally {
      setLecture(null);
    }
  };

  if (liste.error) return <Erreur erreur={liste.error} />;
  if (!liste.data) return <Chargement />;
  if (!liste.data.length) {
    return (
      <p className="mx-auto max-w-xl rounded-lg bg-surface p-6 text-center text-sm text-ink-2">
        {gabarit ? `Aucun cadre « ${FORMATS_KIT[gabarit].libelle} » n'a encore été dessiné pour ce lieu.` : "Aucun cadre n'a encore été dessiné pour ce lieu."} Partez
        d&apos;un modèle vierge ou du catalogue.
      </p>
    );
  }
  const groupes: { cle: string; titre: string; code: string; cadres: CadreDuLieu[] }[] = [];
  for (const c of liste.data) {
    const cle = String(c.evenement.id);
    if (groupes.at(-1)?.cle !== cle) groupes.push({ cle, titre: libelleEvenement(c.evenement), code: c.evenement.code, cadres: [] });
    groupes.at(-1)!.cadres.push(c);
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {erreur != null && <Erreur erreur={erreur} />}
      {groupes.map((g) => (
        <section key={g.cle}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            {g.titre}
            <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-bold">{g.code}</span>
          </h3>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {g.cadres.map((c) => {
              const r = repereCadre(c);
              return (
                <li key={r}>
                  <button
                    type="button"
                    disabled={lecture !== null}
                    onClick={() => choisir(c)}
                    className="group w-full rounded-2xl border border-line bg-surface p-3 text-left transition-all hover:-translate-y-1 hover:border-accent hover:shadow-lg disabled:opacity-60"
                  >
                    <span className="mb-2 flex h-40 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                      {c.vignette ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.vignette} alt="" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-xs text-ink-muted">Pas d&apos;aperçu</span>
                      )}
                    </span>
                    <span className="block truncate text-sm font-semibold text-ink group-hover:text-accent">{FORMATS_KIT[c.gabarit]?.libelle ?? c.gabarit}</span>
                    <span className="block text-xs text-ink-muted">
                      {lecture === r ? "Ouverture…" : `Modifié le ${new Date(c.updatedAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

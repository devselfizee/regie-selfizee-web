"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { EvenementPonctuel, FicheEvenementLieu } from "@/lib/api";
import { affiche, chevauchements, duAu, etatPublication, instants, jourHeure, LIBELLES_ETAT, lignes, minutes, type EtatPublication } from "@/lib/programmation";
import { Segments } from "./EvenementsLieu";

// Frise de la programmation de l'onglet Configuration (maquettes du 10/11/2026) : à partir d'aujourd'hui (retour du
// 12/11 : le passé encombrait), le par défaut en continu et les événements programmés par-dessus. Le passé se
// retrouve dans la liste des événements (filtre « Passés »).

const pageEvenement = (lieuId: number, eid?: number | null) => (eid ? `/lieux/${lieuId}/evenement/${eid}` : `/lieux/${lieuId}/evenement`);

/**
 * Infobulle en position fixe, accrochée à l'élément survolé : elle passe par-dessus les autres blocs et
 * n'est pas coupée par un conteneur qui défile (la frise). Se ferme au défilement.
 */
function useBulle() {
  const [bulle, setBulle] = useState<{ texte: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!bulle) return;
    const cacher = () => setBulle(null);
    window.addEventListener("scroll", cacher, true);
    return () => window.removeEventListener("scroll", cacher, true);
  }, [bulle]);
  const montrer = (e: { currentTarget: HTMLElement }, texte: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setBulle({ texte, x: Math.max(8, Math.min(r.left, window.innerWidth - 328)), y: r.top });
  };
  const rendu = bulle && (
    <span
      role="tooltip"
      className="pointer-events-none fixed z-[60] w-max max-w-80 -translate-y-full rounded-lg bg-[#15171C] px-2.5 py-1.5 text-xs leading-snug font-semibold text-white shadow-lg"
      style={{ left: bulle.x, top: bulle.y - 6 }}
    >
      {bulle.texte}
    </span>
  );
  return { montrer, cacher: () => setBulle(null), rendu };
}

const COULEURS: Record<EtatPublication, string> = {
  publie: "bg-[#8A80F0] text-white",
  brouillon: "bg-[#DDDAFD] text-[#3F33C7]",
  jamais: "bg-[#FEF0DD] text-[#B54708] border border-dashed border-[#B54708]",
};
const ECHELLES = [3, 6, 12] as const;
type Echelle = (typeof ECHELLES)[number];
const moisCourt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Premier jour du mois, `decalage` mois après celui de `ymd`. */
function premierDuMois(ymd: string, decalage: number) {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1 + decalage, 1));
  return d.toISOString().slice(0, 10);
}
const HAUT_LIGNES = 40;
const PAS_LIGNE = 30;

/** Largeur d'un élément, suivie (pour savoir si un nom tient dans son bloc). */
function useLargeur() {
  const ref = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargeur(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, largeur };
}

/** Frise « Programmation » : d'aujourd'hui à la fin de la période, puis mois par mois vers l'avenir. */
export function FriseProgrammation({ lieuId, defaut, liste, maintenant }: { lieuId: number; defaut: FicheEvenementLieu; liste: EvenementPonctuel[]; maintenant: string }) {
  const [echelle, setEchelle] = useState<Echelle>(6);
  const [decalage, setDecalage] = useState(0);
  const bulle = useBulle();
  const { ref, largeur } = useLargeur();

  const aujourdhui = maintenant.slice(0, 10);
  const mois = Array.from({ length: echelle }, (_, k) => premierDuMois(aujourdhui, decalage + k));
  // Période en cours : elle part d'aujourd'hui, pas du début du mois
  const debut = decalage === 0 ? `${aujourdhui}T00:00` : `${mois[0]}T00:00`;
  const fin = `${premierDuMois(aujourdhui, decalage + echelle)}T00:00`;
  const total = minutes(fin) - minutes(debut);
  const pct = (instant: string) => Math.min(100, Math.max(0, ((minutes(instant) - minutes(debut)) / total) * 100));

  const visibles = liste.filter((e) => instants(e).fin > debut && instants(e).debut < fin);
  const ligneDe = lignes(visibles);
  const nbLignes = Math.max(1, ...[...ligneDe.values()].map((l) => l + 1));
  const conflits = chevauchements(liste, maintenant);
  const jourMois = (instant: string) => jourHeure(instant.slice(0, 10), null);

  return (
    <section className="carte flex flex-col gap-3.5 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Programmation</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Segments<`${Echelle}`>
            libelle="Échelle"
            valeur={`${echelle}`}
            onChange={(v) => setEchelle(Number(v) as Echelle)}
            choix={ECHELLES.map((e) => ({ cle: `${e}` as const, libelle: `${e} mois` }))}
          />
          <button type="button" className="bouton-second h-9 px-3" aria-label="Période précédente" disabled={decalage === 0} onClick={() => setDecalage(decalage - 1)}>‹</button>
          <button type="button" className="bouton-second h-9" onClick={() => setDecalage(0)} disabled={decalage === 0}>Aujourd&apos;hui</button>
          <button type="button" className="bouton-second h-9 px-3" aria-label="Période suivante" onClick={() => setDecalage(decalage + 1)}>›</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[36rem]">
          <div className="flex">
            {mois.map((m, k) => {
              const jours = (minutes(k + 1 < mois.length ? `${mois[k + 1]}T00:00` : fin) - minutes(k === 0 ? debut : `${m}T00:00`)) / 1440;
              const nom = majuscule(moisCourt.format(new Date(`${m}T00:00:00Z`)));
              return (
                <span key={m} style={{ flex: jours }} className="truncate border-l border-line pl-1.5 text-[11px] font-semibold text-ink-muted">
                  {nom}
                  {(k === 0 || m.slice(5, 7) === "01") && ` ${m.slice(0, 4)}`}
                </span>
              );
            })}
          </div>
          <div ref={ref} className="relative" style={{ height: HAUT_LIGNES + nbLignes * PAS_LIGNE + 6 }} onMouseLeave={bulle.cacher}>
            {mois.slice(1).map((m) => (
              <i key={m} aria-hidden className="absolute top-0 bottom-0 border-l border-line/70" style={{ left: `${pct(`${m}T00:00`)}%` }} />
            ))}
            <Link
              href={pageEvenement(lieuId)}
              className="absolute inset-x-0 top-1.5 h-6 truncate rounded-md bg-[#0E9F8A] px-2 text-[11px] leading-6 font-bold text-white"
              onMouseEnter={(ev) => bulle.montrer(ev, `Par défaut${defaut.code ? ` (${defaut.code})` : ""} : affiché quand rien d'autre n'est programmé`)}
            >
              Par défaut · tout le temps, hors programmation
            </Link>
            {visibles.map((e) => {
              const ie = instants(e);
              const gauche = pct(ie.debut);
              const large = Math.max(pct(ie.fin) - gauche, 0);
              const haut = HAUT_LIGNES + ligneDe.get(e.id)! * PAS_LIGNE;
              const etat = etatPublication(e, maintenant);
              // Le nom tient-il dans le bloc ? Sinon il va à côté (à gauche près du bord droit)
              const tient = largeur > 0 && (large / 100) * largeur >= e.nom.length * 6.6 + 16;
              const aGauche = gauche > 82;
              return (
                <div key={e.id}>
                  <Link
                    href={pageEvenement(lieuId, e.id)}
                    aria-label={`${e.nom} · ${duAu(e)} · ${LIBELLES_ETAT[etat]}`}
                    className={`absolute box-border h-6 overflow-hidden rounded-md px-1.5 text-[11px] leading-6 font-bold whitespace-nowrap hover:ring-2 hover:ring-ink/30 ${COULEURS[etat]}`}
                    style={{ left: `${gauche}%`, width: `max(${large}%, 8px)`, top: haut }}
                    onMouseEnter={(ev) => bulle.montrer(ev, `${e.nom} · du ${jourHeure(e.dateDebut, e.heureDebut)} au ${jourHeure(e.dateFin, e.heureFin)} · ${LIBELLES_ETAT[etat]}`)}
                  >
                    {tient && e.nom}
                  </Link>
                  {!tient && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute text-[11px] leading-6 font-semibold whitespace-nowrap text-ink"
                      style={aGauche ? { right: `calc(${100 - gauche}% + 5px)`, top: haut } : { left: `calc(${gauche + large}% + 5px)`, top: haut }}
                    >
                      {e.nom}
                    </span>
                  )}
                </div>
              );
            })}
            {aujourdhui >= mois[0] && `${aujourdhui}T00:00` < fin && (
              <i aria-hidden className="pointer-events-none absolute -top-1 bottom-0 border-l-2 border-ink" style={{ left: `${pct(maintenant)}%` }} />
            )}
            {bulle.rendu}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#0E9F8A]" />par défaut</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#8A80F0]" />publié</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#DDDAFD]" />brouillon</span>
        <span className="flex items-center gap-1.5"><i className="box-border inline-block h-2.5 w-2.5 rounded-[3px] border border-dashed border-[#B54708] bg-[#FEF0DD]" />jamais publié</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-0.5 bg-ink" />aujourd&apos;hui</span>
        {conflits.length > 0 && (
          <span className="ml-auto space-y-0.5 text-right text-sm text-warn-ink">
            {conflits.map(({ a, b, debut: d, fin: f }) => (
              <span key={`${a.id}-${b.id}`} className="block">
                Du {jourMois(d)} au {jourMois(f)}, « {a.nom} » et « {b.nom} » se chevauchent : c&apos;est « {affiche([a, b], d)?.nom} », qui commence le plus tard, qui s&apos;affiche.
              </span>
            ))}
          </span>
        )}
      </div>
    </section>
  );
}

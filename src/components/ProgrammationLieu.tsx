"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { EvenementPonctuel, FicheEvenementLieu } from "@/lib/api";
import {
  affiche, chevauchements, duAu, etatPublication, instantLisible, instants, jourHeure, LIBELLES_ETAT, lignes, minutes, prochainChangement, type EtatPublication,
} from "@/lib/programmation";
import { usePerm } from "@/lib/perms";
import { Badge } from "./Etat";
import { FormNouvelEvenement, Segments } from "./EvenementsLieu";
import { MenuActions } from "./MenuActions";
import { Modale } from "./Modale";

// Haut de l'onglet Configuration (maquettes du 10/11/2026) : l'événement prévu sur la borne en ce moment et le
// prochain changement, puis la frise de la programmation. Tout est déduit des dates : la borne ne remonte pas
// encore l'événement installé, et n'en change pas encore toute seule (on tape le code).

const pageEvenement = (lieuId: number, eid?: number | null) => (eid ? `/lieux/${lieuId}/evenement/${eid}` : `/lieux/${lieuId}/evenement`);
const ETIQUETTE = "text-xs font-bold tracking-[0.08em] text-ink-2 uppercase";

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

const AIDE_BANDEAU =
  "D'après la programmation. La borne ne remonte pas encore l'événement installé, et n'en change pas toute seule : on tape le code de l'événement sur la borne.";

/** Bandeau « Prévu sur la borne en ce moment ». */
export function SurLaBorne({ lieuId, defaut, liste, maintenant }: { lieuId: number; defaut: FicheEvenementLieu; liste: EvenementPonctuel[]; maintenant: string }) {
  const peutModifier = usePerm("evenements.edit");
  const [copie, setCopie] = useState(false);
  const bulleBandeau = useBulle();
  const actuel = affiche(liste, maintenant);
  const suivant = prochainChangement(liste, maintenant);
  const version = actuel ?? defaut;
  return (
    <section className="carte flex flex-wrap items-center justify-between gap-5 border-l-4 border-l-[#0E9F8A] px-6 py-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span
          tabIndex={0}
          className={`${ETIQUETTE} w-fit cursor-help`}
          onMouseEnter={(e) => bulleBandeau.montrer(e, AIDE_BANDEAU)}
          onFocus={(e) => bulleBandeau.montrer(e, AIDE_BANDEAU)}
          onMouseLeave={bulleBandeau.cacher}
          onBlur={bulleBandeau.cacher}
        >
          Prévu sur la borne en ce moment
        </span>
        {bulleBandeau.rendu}
        <div className="flex flex-wrap items-center gap-2.5">
          {actuel ? (
            <Link href={pageEvenement(lieuId, actuel.id)} className="text-2xl font-bold tracking-tight hover:text-accent">{actuel.nom}</Link>
          ) : (
            <b className="text-2xl font-bold tracking-tight">Par défaut</b>
          )}
          {(actuel?.code ?? defaut.code) && <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-bold">{actuel?.code ?? defaut.code}</span>}
          {!actuel && !defaut.enregistre ? (
            <Badge ton="warn">Pas encore enregistré</Badge>
          ) : version.version === 0 ? (
            <Badge ton="warn">Jamais publié</Badge>
          ) : version.modifieDepuisPublication ? (
            <Badge ton="warn">version {version.version} · modifications non publiées</Badge>
          ) : (
            <Badge ton="ok">version {version.version} · à jour</Badge>
          )}
        </div>
        <span className="text-sm text-ink-muted">{actuel ? `Événement programmé · ${duAu(actuel)}` : "Événement par défaut du lieu"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex flex-col gap-1 text-sm">
          <span className={ETIQUETTE}>Prochain changement</span>
          {suivant ? (
            <span>
              <b>{suivant.evenement?.nom ?? "Par défaut"}</b> · le {instantLisible(suivant.instant)}
            </span>
          ) : (
            <span className="text-ink-muted">Aucun, rien n&apos;est programmé</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link href={pageEvenement(lieuId)} className="bouton-second">Ouvrir l&apos;événement par défaut</Link>
          {peutModifier && defaut.enregistre && (
            <MenuActions
              libelle="Actions sur l'événement par défaut"
              actions={[{ libelle: "Dupliquer l'événement par défaut", aide: "Mêmes cadres, tarifs et options", onClick: () => setCopie(true) }]}
            />
          )}
        </div>
      </div>
      <Modale titre="Dupliquer l'événement par défaut" ouverte={copie} onFermer={() => setCopie(false)}>
        {copie && <FormNouvelEvenement lieuId={lieuId} source={{ eid: null, nom: "Événement par défaut" }} onAnnuler={() => setCopie(false)} />}
      </Modale>
    </section>
  );
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

/** Frise « Programmation » : le par défaut en continu, les événements programmés par-dessus. */
export function FriseProgrammation({ lieuId, defaut, liste, maintenant }: { lieuId: number; defaut: FicheEvenementLieu; liste: EvenementPonctuel[]; maintenant: string }) {
  const [echelle, setEchelle] = useState<Echelle>(6);
  const [decalage, setDecalage] = useState(0);
  const bulle = useBulle();
  const { ref, largeur } = useLargeur();

  const aujourdhui = maintenant.slice(0, 10);
  const mois = Array.from({ length: echelle }, (_, k) => premierDuMois(aujourdhui, decalage + k));
  const debut = `${mois[0]}T00:00`;
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
          <button type="button" className="bouton-second h-9 px-3" aria-label="Période précédente" onClick={() => setDecalage(decalage - 1)}>‹</button>
          <button type="button" className="bouton-second h-9" onClick={() => setDecalage(0)} disabled={decalage === 0}>Aujourd&apos;hui</button>
          <button type="button" className="bouton-second h-9 px-3" aria-label="Période suivante" onClick={() => setDecalage(decalage + 1)}>›</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[36rem]">
          <div className="flex">
            {mois.map((m, k) => {
              const jours = (minutes(k + 1 < mois.length ? `${mois[k + 1]}T00:00` : fin) - minutes(`${m}T00:00`)) / 1440;
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
            {mois.map((m) => (
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

"use client";

import { useState } from "react";
import type { FicheEvenementLieu, GrilleTarifs, LotJeu, ReglagesEvenement } from "@/lib/api";
import { euros } from "@/lib/format";
import { EditeurGrille } from "../GrilleTarifs";
import { Segments } from "../EvenementsLieu";
import { Interrupteur, Ligne } from "./Blocs";

// Blocs 4 à 6 de la page d'un événement (maquettes du 10/11/2026) : tarifs (ceux du lieu ou propres à
// l'événement), options à la borne, page souvenir (carte à gratter, réimpression). « +1 pour un pote »
// n'est pas une option : c'est un tarif.

type Tarifs = ReglagesEvenement["tarifs"];
type Maj = (p: Partial<Tarifs>) => void;

/** Segments « Ceux du lieu / Propres à l'événement » (en-tête du bloc Tarifs). */
export function ChoixTarifs({ t, maj, tarifsLieu }: { t: Tarifs; maj: Maj; tarifsLieu: FicheEvenementLieu["tarifsLieu"] }) {
  return (
    <Segments<"lieu" | "propres">
      libelle="Tarifs de l'événement"
      valeur={t.herite ? "lieu" : "propres"}
      onChange={(v) => maj(v === "lieu" ? { herite: true, ...tarifsLieu.grille } : { herite: false })}
      choix={[
        { cle: "lieu", libelle: "Ceux du lieu" },
        { cle: "propres", libelle: "Propres à l'événement" },
      ]}
    />
  );
}

/** Bloc « 4 · Tarifs » : la grille en cases ; propres à l'événement, un clic sur un prix le modifie. */
export function TarifsEvenement({ t, maj, tarifsLieu, enseigne }: { t: Tarifs; maj: Maj; tarifsLieu: FicheEvenementLieu["tarifsLieu"]; enseigne: string }) {
  const [edition, setEdition] = useState<string | null>(null);
  const [complet, setComplet] = useState(false);
  const g: GrilleTarifs = t.herite ? tarifsLieu.grille : t;
  const majGrille = (p: Partial<GrilleTarifs>) => maj({ paliers: g.paliers, palierMisEnAvant: g.palierMisEnAvant, libelleMisEnAvant: g.libelleMisEnAvant, plusUnCents: g.plusUnCents, ...p });
  const cases = [
    ...g.paliers.map((p, i) => ({
      cle: `p${p.de}`,
      libelle: p.de === 1 ? "1 tirage" : `dès ${p.de}`,
      cents: p.prixCents,
      avant: g.palierMisEnAvant === p.de,
      changer: (c: number) => majGrille({ paliers: g.paliers.map((x, j) => (j === i ? { ...x, prixCents: c } : x)) }),
    })),
    { cle: "pote", libelle: "+1 pour un pote", cents: g.plusUnCents, avant: false, changer: (c: number) => majGrille({ plusUnCents: c }) },
  ];
  return (
    <div>
      <ul className="flex flex-wrap gap-3">
        {cases.map((c) => (
          <li key={c.cle}>
            <button
              type="button"
              disabled={t.herite}
              onClick={() => setEdition(c.cle)}
              title={t.herite ? undefined : "Cliquer pour modifier le prix"}
              className={`min-w-[7.5rem] rounded-lg border px-3 py-2 text-left disabled:cursor-default ${c.avant ? "border-accent bg-accent/5" : "border-line"} ${t.herite ? "" : "hover:border-accent"}`}
            >
              <span className={`block text-xs ${c.avant ? "font-semibold text-accent" : "text-ink-2"}`}>{c.avant ? `★ ${c.libelle}` : c.libelle}</span>
              {edition === c.cle ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step="0.1"
                  aria-label={`Prix ${c.libelle}`}
                  className="champ mt-0.5 w-24 px-2 py-0.5 text-lg font-semibold tabular"
                  defaultValue={(c.cents / 100).toFixed(2)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    c.changer(Math.max(0, Math.round(Number(e.target.value.replace(",", ".")) * 100)) || 0);
                    setEdition(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEdition(null);
                  }}
                />
              ) : (
                <span className="block text-lg font-semibold tabular">{c.cle === "pote" && !c.cents ? "non posé" : euros(c.cents)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {t.herite ? (
        <p className="mt-3 text-sm text-ink-2">
          Hérités d&apos;{enseigne}, qui {tarifsLieu.origine === "LIEU" ? "a ses tarifs propres" : "hérite du parc"}.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-accent">Tarifs propres à cet événement : cliquer un prix pour le modifier.</span>
            <button type="button" className="text-ink-2 hover:text-ink hover:underline" aria-expanded={complet} onClick={() => setComplet(!complet)}>
              {complet ? "Fermer les paliers" : "Paliers et mise en avant…"}
            </button>
          </p>
          {complet && <EditeurGrille valeur={t} onChange={(x) => majGrille(x)} nom="evenement" />}
        </div>
      )}
    </div>
  );
}

/** Bloc « 5 · À la borne » : codes promo, photo d'appel. */
export function ALaBorne({ t, maj }: { t: Tarifs; maj: Maj }) {
  return (
    <div>
      <Ligne
        libelle="Codes promo"
        valeur={t.codesPromo ? "acceptés sur l'écran d'offre" : <span className="font-normal text-ink-2">refusés</span>}
        action={<Interrupteur actif={t.codesPromo} onChange={(v) => maj({ codesPromo: v })} libelle="Accepter les codes promo" />}
      />
      <Ligne
        libelle="Photo d'appel"
        valeur={
          t.photoAppel.actif ? (
            <label className="flex flex-wrap items-center gap-2">
              après
              <input
                type="number"
                min={10}
                max={3600}
                className="champ w-20 px-2 py-1 tabular"
                value={t.photoAppel.inactiviteSec}
                onChange={(e) => maj({ photoAppel: { ...t.photoAppel, inactiviteSec: Number(e.target.value) } })}
              />
              secondes sans activité
            </label>
          ) : (
            <span className="font-normal text-ink-2">coupée</span>
          )
        }
        action={<Interrupteur actif={t.photoAppel.actif} onChange={(v) => maj({ photoAppel: { ...t.photoAppel, actif: v } })} libelle="Photo d'appel" />}
      />
    </div>
  );
}

const GAGNANTS: { cle: Exclude<LotJeu, "none">; nom: string; couleur: string }[] = [
  { cle: "free", nom: "Photo offerte", couleur: "bg-accent" },
  { cle: "pct50", nom: "−50 % sur la prochaine", couleur: "bg-violet-400" },
  { cle: "pct30", nom: "−30 % sur la prochaine", couleur: "bg-violet-200" },
];

/** Bloc « 6 · Page souvenir (web) » : carte à gratter (répartition sur 100 cartes), réimpression. */
export function PageSouvenir({ t, maj }: { t: Tarifs; maj: Maj }) {
  const jeu = t.jeu;
  const majJeu = (p: Partial<Tarifs["jeu"]>) => maj({ jeu: { ...jeu, ...p } });
  // On raisonne sur 100 cartes grattées ; les anciens poids relatifs sont ramenés à 100 à l'affichage
  const total = Object.values(jeu.lots).reduce((s, v) => s + v, 0) || 100;
  const sur100 = (cle: LotJeu) => Math.round((jeu.lots[cle] / total) * 100);
  const gagnants = GAGNANTS.reduce((s, g) => s + sur100(g.cle), 0);
  const changer = (cle: Exclude<LotJeu, "none">, n: number) => {
    const lots = { free: sur100("free"), pct50: sur100("pct50"), pct30: sur100("pct30"), [cle]: Math.max(0, Math.min(100, n)) };
    const somme = lots.free + lots.pct50 + lots.pct30;
    if (somme > 100) return; // pas plus de 100 gagnantes sur 100 cartes
    majJeu({ lots: { ...lots, none: 100 - somme } });
  };
  return (
    <div>
      <Ligne
        fort
        detailPleineLargeur
        libelle="Carte à gratter"
        action={<Interrupteur actif={jeu.actif} onChange={(v) => maj({ jeu: { ...jeu, actif: v }, ...(v ? { codesPromo: true } : {}) })} libelle="Carte à gratter" />}
        detail={
          jeu.actif && (
            <div className="space-y-4 rounded-xl bg-surface-2 p-4">
              <p className="text-sm font-semibold">Sur 100 cartes grattées</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {GAGNANTS.map((g) => (
                  <label key={g.cle} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 text-sm">
                    <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${g.couleur}`} />
                    <input className="champ w-16 px-2 py-1 text-center tabular" type="number" min={0} max={100} value={sur100(g.cle)} onChange={(e) => changer(g.cle, Number(e.target.value))} />
                    <span>{g.nom}</span>
                  </label>
                ))}
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
                {GAGNANTS.map((g) => <div key={g.cle} className={g.couleur} style={{ width: `${sur100(g.cle)}%` }} />)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <strong>{gagnants}</strong> gagnante{gagnants > 1 ? "s" : ""} et <strong>{100 - gagnants}</strong> perdante{100 - gagnants > 1 ? "s" : ""} sur 100
                </span>
                <label className="flex items-center gap-2">
                  Au plus
                  <input className="champ w-20 px-2 py-1 text-center tabular" type="number" min={0} value={jeu.maxLotsParJour} onChange={(e) => majJeu({ maxLotsParJour: Math.max(0, Number(e.target.value)) })} />
                  gagnantes par jour
                </label>
              </div>
              <p className="text-xs text-ink-muted">
                Après l&apos;envoi des photos : un code promo unique pour la prochaine photo, valable 30 jours sur toutes les bornes partenaires. Active aussi les codes promo à la borne.
              </p>
            </div>
          )
        }
      />
      <Ligne
        libelle="Réimpression"
        valeur={<span className={t.reimpressionWeb ? "" : "font-normal text-ink-2"}>payée depuis le mobile · {t.reimpressionWeb ? "active" : "coupée"}</span>}
        action={<Interrupteur actif={t.reimpressionWeb} onChange={(v) => maj({ reimpressionWeb: v })} libelle="Réimpression payée depuis le mobile" />}
      />
    </div>
  );
}

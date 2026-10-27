import type { ReactNode } from "react";
import { pct, variation } from "@/lib/format";

// Tuile d'indicateur en couleur, comme les tableaux de bord des autres applications Konitys
// (dégradé, libellé en capitales, grand chiffre, icône en haut à droite).

const TEINTES = {
  vert: "from-emerald-400 to-teal-500",
  bleu: "from-sky-400 to-blue-500",
  violet: "from-violet-400 to-purple-500",
  turquoise: "from-teal-400 to-cyan-500",
  orange: "from-amber-400 to-orange-500",
  rose: "from-pink-400 to-rose-500",
  indigo: "from-indigo-400 to-blue-600",
} as const;

// Icônes au trait (dessin de la famille Lucide, licence ISC)
const ICONES = {
  billet: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>,
  numerique: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></>,
  imprimante: <><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" /></>,
  appareil: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>,
  pourcent: <><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></>,
  sac: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
} as const;

export type Teinte = keyof typeof TEINTES;
export type Icone = keyof typeof ICONES;

export function KpiCouleur({
  libelle,
  valeur,
  detail,
  teinte,
  icone,
  courant,
  precedente,
}: {
  libelle: string;
  valeur: string;
  detail?: ReactNode;
  teinte: Teinte;
  icone: Icone;
  /** Pour la comparaison avec la période précédente */
  courant?: number;
  precedente?: number;
}) {
  const v = courant !== undefined && precedente !== undefined ? variation(courant, precedente) : null;
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br p-4 text-white shadow-sm ${TEINTES[teinte]}`}>
      {/* Cercle décoratif, comme sur les autres tableaux de bord Konitys */}
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
      <div className="relative flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/90">{libelle}</span>
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {ICONES[icone]}
          </svg>
        </span>
      </div>
      <div className="relative mt-2 text-3xl font-bold tabular">{valeur}</div>
      {detail && <div className="relative mt-1 text-xs text-white/85">{detail}</div>}
      {v !== null && Math.abs(v) >= 0.005 && (
        <div className="relative mt-1 text-xs font-medium text-white/90">
          <span aria-hidden>{v > 0 ? "▲" : "▼"}</span> {v > 0 ? "+" : ""}
          {pct(v)} vs période préc.
        </div>
      )}
      {v === null && precedente !== undefined && <div className="relative mt-1 text-xs text-white/75">vs période préc. : —</div>}
    </div>
  );
}

import { pct, variation } from "@/lib/format";

/** Tuile d'indicateur avec comparaison période précédente et N-1. */
export function Kpi({
  libelle,
  valeur,
  courant,
  precedente,
  n1,
  inverse = false,
}: {
  libelle: string;
  valeur: string;
  courant: number;
  precedente?: number;
  n1?: number;
  /** true si une hausse est mauvaise (ex. taux de refus) */
  inverse?: boolean;
}) {
  return (
    <div className="carte p-4">
      <div className="text-xs font-medium text-ink-2">{libelle}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{valeur}</div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {precedente !== undefined && <Delta libelle="vs période préc." v={variation(courant, precedente)} inverse={inverse} />}
        {n1 !== undefined && <Delta libelle="vs N-1" v={variation(courant, n1)} inverse={inverse} />}
      </div>
    </div>
  );
}

function Delta({ libelle, v, inverse }: { libelle: string; v: number | null; inverse: boolean }) {
  if (v === null) return <span className="text-ink-muted">{libelle} : —</span>;
  const bon = inverse ? v < 0 : v > 0;
  const neutre = Math.abs(v) < 0.005;
  return (
    <span className={neutre ? "text-ink-muted" : bon ? "text-good" : "text-bad"}>
      <span aria-hidden>{neutre ? "→" : v > 0 ? "▲" : "▼"}</span> {v > 0 ? "+" : ""}
      {pct(v)} <span className="text-ink-muted">{libelle}</span>
    </span>
  );
}

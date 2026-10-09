"use client";

import { useCallback } from "react";
import type { JourPrevision, PrevisionResume } from "@/lib/api";
import { eurosRond, jour, pct, variation } from "@/lib/format";
import { axeCategorie, axeValeur, Graphique, type Jetons } from "./Graphique";

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
export const libelleMois = (du: string) => MOIS.format(new Date(`${du}T00:00:00Z`));

/**
 * CA cumulé du mois : réalisé (trait plein) puis prévu (pointillés), avec le total
 * de l'an dernier en repère. Un seul axe, une seule grandeur.
 */
export function GraphiquePrevision({ jours, n1Cents }: { jours: JourPrevision[]; n1Cents?: number }) {
  const option = useCallback(
    (j: Jetons) => {
      let cumul = 0;
      const realise: (number | null)[] = [];
      const prevu: (number | null)[] = [];
      const dernierRealise = jours.reduce((k, x, i) => (x.realiseCents !== null ? i : k), -1);
      jours.forEach((x, i) => {
        cumul += (x.realiseCents ?? 0) + x.prevuCents;
        const reel = cumul - x.prevuCents;
        realise.push(i <= dernierRealise ? reel / 100 : null);
        // La prévision part du dernier point réalisé pour que les deux traits se rejoignent
        prevu.push(i < dernierRealise ? null : (i === dernierRealise ? reel : cumul) / 100);
      });
      const fmt = (v: number) => eurosRond(v * 100);
      return {
        tooltip: {
          trigger: "axis",
          formatter: (ps: { dataIndex: number }[]) => {
            const i = ps[0].dataIndex;
            const x = jours[i];
            const lignes = [`<strong>${jour(x.jour)}</strong>`];
            if (realise[i] !== null) lignes.push(`Réalisé cumulé : ${fmt(realise[i]!)}`);
            if (prevu[i] !== null && i > dernierRealise) lignes.push(`Prévu cumulé : ${fmt(prevu[i]!)}`);
            if (x.correction?.raisons.length) lignes.push(`<span style="color:${j.ink2}">${x.correction.raisons.join(" · ")}</span>`);
            lignes.push(x.realiseCents !== null ? `Jour : ${eurosRond(x.realiseCents + x.prevuCents)}${x.prevuCents ? " (dont prévu " + eurosRond(x.prevuCents) + ")" : ""}` : `Jour (prévu) : ${eurosRond(x.prevuCents)}`);
            return lignes.join("<br>");
          },
        },
        xAxis: { ...axeCategorie(j, jours.map((x) => x.jour.slice(8))), boundaryGap: false },
        yAxis: axeValeur(j, (v) => fmt(v)),
        series: [
          {
            name: "Réalisé",
            type: "line",
            data: realise,
            showSymbol: false,
            lineStyle: { width: 2, color: j.viz1 },
            itemStyle: { color: j.viz1 },
            areaStyle: { color: j.viz1, opacity: 0.08 },
            markLine: n1Cents
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: j.ink2, type: "dashed", width: 1 },
                  label: { formatter: `N-1 : ${eurosRond(n1Cents)}`, color: j.ink2, position: "insideEndTop" },
                  data: [{ yAxis: n1Cents / 100 }],
                }
              : undefined,
          },
          {
            name: "Prévu",
            type: "line",
            data: prevu,
            showSymbol: false,
            lineStyle: { width: 2, color: j.viz1, type: "dashed" },
            itemStyle: { color: j.viz1 },
          },
        ],
      };
    },
    [jours, n1Cents]
  );
  return <Graphique option={option} hauteur={240} description="CA cumulé du mois : réalisé puis prévision jusqu'à la fin du mois" />;
}

/** Chiffre clé de la prévision, avec sa fourchette et ses comparaisons. */
export function ResumePrevision({ p, n1Cents, precedentCents }: { p: PrevisionResume; n1Cents?: number; precedentCents?: number }) {
  const comparaisons = [
    n1Cents ? { libelle: "vs N-1", v: variation(p.totalCents, n1Cents) } : null,
    precedentCents ? { libelle: "vs mois précédent", v: variation(p.totalCents, precedentCents) } : null,
  ].filter((x): x is { libelle: string; v: number | null } => !!x && x.v !== null);
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-ink-2">Prévision fin {libelleMois(p.du)}</div>
      <div className="text-2xl font-semibold">{eurosRond(p.totalCents)}</div>
      <div className="text-sm text-ink-2">
        entre {eurosRond(p.basseCents)} et {eurosRond(p.hauteCents)} · {eurosRond(p.realiseCents)} déjà réalisés,{" "}
        {p.joursOuvertsRestants} jour(s) d&apos;ouverture restant(s)
      </div>
      {comparaisons.length > 0 && (
        <div className="flex flex-wrap gap-x-3 text-xs">
          {comparaisons.map((c) => (
            <span key={c.libelle} className={c.v! >= 0 ? "text-good" : "text-bad"}>
              <span aria-hidden>{c.v! >= 0 ? "▲" : "▼"}</span> {c.v! > 0 ? "+" : ""}{pct(c.v!)} <span className="text-ink-muted">{c.libelle}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mises en garde sur une prévision : historique court, activité arrêtée. */
export function AvertissementsPrevision({ p }: { p: PrevisionResume }) {
  if (p.arretDepuis)
    return (
      <p className="text-sm text-warn-ink">
        Aucune vente depuis le {jour(p.arretDepuis)} alors que le lieu est censé être ouvert : rien n&apos;est prévu pour la suite.
        Saison terminée non saisie, ou borne en panne ?
      </p>
    );
  if (!p.fiable) return <p className="text-sm text-ink-2">Moins de 3 semaines d&apos;historique : prévision indicative.</p>;
  return null;
}

export const METHODE =
  "Méthode : moyenne du même jour de la semaine sur les 8 dernières semaines (jours d'ouverture seulement), corrigée de la saisonnalité de l'an dernier quand elle est connue, puis des jours fériés, des vacances et de la pluie prévue selon l'effet mesuré pour le lieu. Fourchette à 80 %.";

"use client";

import { useCallback } from "react";
import type { StatsLieu } from "@/lib/api";
import { euros, eurosRond, JOURS_COURTS, JOURS_SEMAINE, MOYENS, nombre } from "@/lib/format";
import { axeCategorie, axeValeur, Graphique, type Jetons } from "./Graphique";

const HEURES = Array.from({ length: 24 }, (_, h) => `${h}h`);

/** Heatmap jour de semaine × heure (CA TTC, échelle séquentielle bleue). */
export function HeatmapHoraire({ cellules }: { cellules: StatsLieu["heatmap"] }) {
  const option = useCallback(
    (j: Jetons) => {
      const max = Math.max(1, ...cellules.map((c) => c.caTtcCents / 100));
      const parCle = new Map(cellules.map((c) => [`${c.jourSemaine}-${c.heure}`, c]));
      const data: [number, number, number][] = [];
      for (let d = 1; d <= 7; d++) for (let h = 0; h < 24; h++) data.push([h, d - 1, (parCle.get(`${d}-${h}`)?.caTtcCents ?? 0) / 100]);

      return {
        legend: { show: false },
        grid: { left: 8, right: 8, top: 8, bottom: 48, containLabel: true },
        tooltip: {
          formatter: (p: { value: [number, number, number] }) => {
            const [h, d] = p.value;
            const c = parCle.get(`${d + 1}-${h}`);
            return `<b>${JOURS_SEMAINE[d + 1]} ${h}h–${h + 1}h</b><br>${euros(c?.caTtcCents ?? 0)} · ${nombre(c?.nbVentes ?? 0)} ventes`;
          },
        },
        xAxis: { ...axeCategorie(j, HEURES), splitArea: { show: false } },
        yAxis: { ...axeCategorie(j, JOURS_COURTS.slice(1)), inverse: true },
        visualMap: {
          min: 0,
          max,
          calculable: false,
          orient: "horizontal",
          left: "center",
          bottom: 0,
          itemHeight: 160,
          itemWidth: 10,
          text: [eurosRond(max * 100), "0 €"],
          textStyle: { color: j.label, fontSize: 11 },
          inRange: { color: [j.seq0, j.seq1, j.seq2, j.seq3, j.seq4, j.seq5] },
        },
        series: [
          {
            type: "heatmap",
            data,
            itemStyle: { borderColor: j.surface, borderWidth: 2, borderRadius: 3 },
            emphasis: { itemStyle: { borderColor: j.ink, borderWidth: 1 } },
          },
        ],
      };
    },
    [cellules]
  );
  return <Graphique option={option} hauteur={300} description="Chiffre d'affaires par jour de la semaine et par heure" />;
}

/** CA moyen par jour de semaine (CA du jour ÷ nombre de ces jours dans la période). */
export function JoursSemaine({ jours }: { jours: StatsLieu["joursSemaine"] }) {
  const option = useCallback(
    (j: Jetons) => ({
      legend: { show: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (items: { dataIndex: number }[]) => {
          const d = jours[items[0].dataIndex];
          return `<b>${JOURS_SEMAINE[d.jourSemaine]}</b><br>CA moyen : ${euros(d.caMoyenCents)}<br>Total : ${euros(d.caTtcCents)} · ${nombre(d.nbVentes)} ventes`;
        },
      },
      xAxis: axeCategorie(j, jours.map((d) => JOURS_COURTS[d.jourSemaine])),
      yAxis: axeValeur(j, (v: number) => eurosRond(v * 100)),
      series: [
        {
          type: "bar",
          data: jours.map((d) => d.caMoyenCents / 100),
          barMaxWidth: 28,
          itemStyle: { color: j.viz1, borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: "top",
            color: j.ink2,
            fontSize: 11,
            formatter: (p: { value: number }) => (p.value ? eurosRond(p.value * 100) : ""),
          },
        },
      ],
    }),
    [jours]
  );
  return <Graphique option={option} hauteur={240} description="Chiffre d'affaires moyen par jour de la semaine" />;
}

/** Répartition par moyen de paiement (barres horizontales, CA TTC). */
export function MoyensPaiement({ moyens }: { moyens: StatsLieu["moyensPaiement"] }) {
  const option = useCallback(
    (j: Jetons) => {
      const tries = [...moyens].sort((a, b) => a.caTtcCents - b.caTtcCents);
      return {
        legend: { show: false },
        grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (items: { dataIndex: number }[]) => {
            const m = tries[items[0].dataIndex];
            return `<b>${MOYENS[m.moyen] ?? m.moyen}</b><br>${euros(m.caTtcCents)} · ${nombre(m.nbVentes)} ventes<br>${nombre(m.nbRefusees)} refus`;
          },
        },
        xAxis: { ...axeValeur(j), axisLabel: { show: false }, splitLine: { show: false } },
        yAxis: axeCategorie(j, tries.map((m) => MOYENS[m.moyen] ?? m.moyen)),
        series: [
          {
            type: "bar",
            data: tries.map((m) => m.caTtcCents / 100),
            barMaxWidth: 20,
            itemStyle: { color: j.viz1, borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: "right", color: j.ink2, fontSize: 11, formatter: (p: { value: number }) => eurosRond(p.value * 100) },
          },
        ],
      };
    },
    [moyens]
  );
  return <Graphique option={option} hauteur={Math.max(120, moyens.length * 40)} description="Chiffre d'affaires par moyen de paiement" />;
}

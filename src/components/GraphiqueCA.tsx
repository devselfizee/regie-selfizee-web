"use client";

import { useCallback } from "react";
import type { Granularite, PointSerie } from "@/lib/api";
import { euros, eurosRond, nombre } from "@/lib/format";
import { completer, libellePeriode, periodesDe } from "@/lib/periodes";
import { axeCategorie, axeValeur, Graphique, type Jetons } from "./Graphique";

/** Évolution du CA sur la période, avec la même période N-1 en comparaison. */
export function GraphiqueCA({
  du,
  au,
  granularite,
  serie,
  serieN1,
}: {
  du: string;
  au: string;
  granularite: Granularite;
  serie: PointSerie[];
  serieN1?: PointSerie[];
}) {
  const option = useCallback(
    (j: Jetons) => {
      const periodes = periodesDe(du, au, granularite);
      const courant = completer(periodes, serie);
      const n1 = serieN1 ? completer(periodes, serieN1) : null;
      const avecN1 = n1?.some((p) => p.nbVentes > 0);

      return {
        legend: { ...(avecN1 ? {} : { show: false }), top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: j.ink2 } },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line", lineStyle: { color: j.axis } },
          formatter: (items: { dataIndex: number; seriesName: string; marker: string }[]) => {
            const i = items[0].dataIndex;
            const lignes = items.map((it) => {
              const p = it.seriesName === "N-1" ? n1![i] : courant[i];
              return `${it.marker} ${it.seriesName} : <b>${euros(p.caTtcCents)}</b> · ${nombre(p.nbVentes)} ventes`;
            });
            return `<div style="font-weight:600;margin-bottom:4px">${libellePeriode(periodes[i], granularite)}</div>${lignes.join("<br>")}`;
          },
        },
        xAxis: axeCategorie(j, periodes.map((p) => libellePeriode(p, granularite))),
        yAxis: axeValeur(j, (v: number) => eurosRond(v * 100)),
        series: [
          {
            name: "Période",
            type: "line",
            data: courant.map((p) => p.caTtcCents / 100),
            lineStyle: { width: 2, color: j.viz1 },
            itemStyle: { color: j.viz1 },
            symbol: "circle",
            symbolSize: 8,
            showSymbol: periodes.length <= 31,
            areaStyle: { color: j.viz1, opacity: 0.08 },
          },
          ...(avecN1
            ? [
                {
                  name: "N-1",
                  type: "line",
                  data: n1!.map((p) => p.caTtcCents / 100),
                  lineStyle: { width: 2, color: j.viz2, type: "dashed" },
                  itemStyle: { color: j.viz2 },
                  symbol: "circle",
                  symbolSize: 8,
                  showSymbol: false,
                },
              ]
            : []),
        ],
      };
    },
    [du, au, granularite, serie, serieN1]
  );

  return <Graphique option={option} description={`Chiffre d'affaires TTC par ${granularite} du ${du} au ${au}`} />;
}

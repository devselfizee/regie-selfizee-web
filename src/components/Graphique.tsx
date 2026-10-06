"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([LineChart, BarChart, HeatmapChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent, SVGRenderer]);

export type Jetons = Record<
  "viz1" | "viz2" | "grid" | "axis" | "label" | "ink" | "ink2" | "surface" | "seq0" | "seq1" | "seq2" | "seq3" | "seq4" | "seq5",
  string
>;

function lireJetons(): Jetons {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    viz1: v("--viz-1"), viz2: v("--viz-2"), grid: v("--viz-grid"), axis: v("--viz-axis"),
    label: v("--viz-label"), ink: v("--ink"), ink2: v("--ink-2"), surface: v("--surface"),
    seq0: v("--viz-seq-0"), seq1: v("--viz-seq-1"), seq2: v("--viz-seq-2"),
    seq3: v("--viz-seq-3"), seq4: v("--viz-seq-4"), seq5: v("--viz-seq-5"),
  };
}

/** Jetons de couleur du thème courant ; mis à jour quand le thème clair/sombre change. */
function useJetons() {
  const [jetons, setJetons] = useState<Jetons | null>(null);
  useEffect(() => {
    const maj = () => setJetons(lireJetons());
    maj();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);
  return jetons;
}

/** Réglages communs : axes et grille discrets, infobulle aux couleurs du thème. */
export function baseOption(j: Jetons): echarts.EChartsCoreOption {
  return {
    animationDuration: 300,
    textStyle: { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: j.ink2 },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: j.surface,
      borderColor: j.axis,
      textStyle: { color: j.ink, fontSize: 12 },
      extraCssText: "box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 6px;",
    },
    legend: { top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: j.ink2 } },
  };
}

export const axeCategorie = (j: Jetons, donnees: string[]) => ({
  type: "category" as const,
  data: donnees,
  axisLine: { lineStyle: { color: j.axis } },
  axisTick: { show: false },
  axisLabel: { color: j.label, fontSize: 11 },
});

export const axeValeur = (j: Jetons, formatter?: (v: number) => string) => ({
  type: "value" as const,
  splitLine: { lineStyle: { color: j.grid } },
  axisLabel: { color: j.label, fontSize: 11, formatter },
});

export function Graphique({
  option,
  hauteur = 280,
  description,
}: {
  option: (j: Jetons) => echarts.EChartsCoreOption;
  hauteur?: number;
  /** Texte alternatif (lecteurs d'écran) */
  description: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  const jetons = useJetons();

  useEffect(() => {
    if (!ref.current) return;
    instance.current = echarts.init(ref.current, null, { renderer: "svg" });
    const ro = new ResizeObserver(() => instance.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      instance.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (jetons && instance.current) {
      instance.current.setOption({ ...baseOption(jetons), ...option(jetons) }, { notMerge: true });
    }
  }, [jetons, option]);

  return <div ref={ref} role="img" aria-label={description} style={{ height: hauteur, width: "100%" }} />;
}

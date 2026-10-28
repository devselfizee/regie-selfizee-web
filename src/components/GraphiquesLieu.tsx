"use client";

import { useCallback } from "react";
import type { StatsLieu } from "@/lib/api";
import { CARTE_BANCAIRE, euros, eurosRond, JOURS_COURTS, JOURS_SEMAINE, MOYENS, nombre } from "@/lib/format";
import { axeCategorie, axeValeur, Graphique, type Jetons } from "./Graphique";

const HEURES = Array.from({ length: 24 }, (_, h) => `${h}h`);

/** Heatmap jour de semaine × heure (CA TTC, échelle séquentielle bleue). */
/** Heures d'ouverture : clé « jour-heure » (1 = lundi) ; une fermeture après minuit déborde sur le lendemain */
function heuresOuvertes(horaires: { jourSemaine: number; ouverture: string; fermeture: string }[]): Set<string> {
  const ouvertes = new Set<string>();
  for (const h of horaires) {
    const debut = Number(h.ouverture.slice(0, 2));
    const finBrute = Number(h.fermeture.slice(0, 2)) + (Number(h.fermeture.slice(3, 5)) > 0 ? 1 : 0);
    const fin = finBrute <= debut ? finBrute + 24 : finBrute;
    for (let x = debut; x < fin; x++) ouvertes.add(`${((h.jourSemaine - 1 + Math.floor(x / 24)) % 7) + 1}-${x % 24}`);
  }
  return ouvertes;
}

export function HeatmapHoraire({ cellules, horaires = [] }: { cellules: StatsLieu["heatmap"]; horaires?: { jourSemaine: number; ouverture: string; fermeture: string }[] }) {
  const option = useCallback(
    (j: Jetons) => {
      const max = Math.max(1, ...cellules.map((c) => c.caTtcCents / 100));
      const parCle = new Map(cellules.map((c) => [`${c.jourSemaine}-${c.heure}`, c]));
      // Heures fermées (d'après les horaires du lieu) : hachurées, quand aucune vente n'y est tombée
      const ouvertes = horaires.length ? heuresOuvertes(horaires) : null;
      const data: { value: [number, number, number]; itemStyle?: object }[] = [];
      for (let d = 1; d <= 7; d++)
        for (let h = 0; h < 24; h++) {
          const c = parCle.get(`${d}-${h}`);
          const fermee = ouvertes !== null && !ouvertes.has(`${d}-${h}`) && !c?.caTtcCents;
          data.push({
            value: [h, d - 1, (c?.caTtcCents ?? 0) / 100],
            ...(fermee ? { itemStyle: { color: j.surface, decal: { symbol: "rect", symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4, color: j.grid } } } : {}),
          });
        }

      return {
        legend: { show: false },
        grid: { left: 8, right: 8, top: 8, bottom: 48, containLabel: true },
        tooltip: {
          formatter: (p: { value: [number, number, number] }) => {
            const [h, d] = p.value;
            const c = parCle.get(`${d + 1}-${h}`);
            const nb = c?.nbVentes ?? 0;
            const ferme = ouvertes !== null && !ouvertes.has(`${d + 1}-${h}`);
            return `<b>${JOURS_SEMAINE[d + 1]} ${h}h–${h + 1}h</b>${ferme ? " · fermé" : ""}<br>${euros(c?.caTtcCents ?? 0)} · ${nombre(nb)} vente${nb > 1 ? "s" : ""}`;
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
    [cellules, horaires]
  );
  return <Graphique option={option} hauteur={300} description="Chiffre d'affaires par jour de la semaine et par heure (heures fermées hachurées)" />;
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
      // Carte insérée et sans contact : une seule barre « Carte bancaire », le détail au survol
      type Ligne = StatsLieu["moyensPaiement"][number] & { libelle: string; detail: StatsLieu["moyensPaiement"] };
      // Un moyen sans CA ni refus n'a servi à aucune vente : séances gratuites (« aucun ») ou expirées
      // (terminal sans réponse, envoyées en « autre »). Ce ne sont pas des paiements : pas de barre.
      const utiles = moyens.filter((m) => m.caTtcCents > 0 || m.nbRefusees > 0);
      const cartes = utiles.filter((m) => CARTE_BANCAIRE.includes(m.moyen));
      const lignes: Ligne[] = utiles.filter((m) => !CARTE_BANCAIRE.includes(m.moyen)).map((m) => ({ ...m, libelle: MOYENS[m.moyen] ?? m.moyen, detail: [] }));
      if (cartes.length) {
        lignes.push({
          moyen: "CARTE",
          libelle: "Carte bancaire",
          caTtcCents: cartes.reduce((s, m) => s + m.caTtcCents, 0),
          nbVentes: cartes.reduce((s, m) => s + m.nbVentes, 0),
          nbRefusees: cartes.reduce((s, m) => s + m.nbRefusees, 0),
          detail: cartes,
        });
      }
      const tries = lignes.sort((a, b) => a.caTtcCents - b.caTtcCents);
      return {
        legend: { show: false },
        grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (items: { dataIndex: number }[]) => {
            const m = tries[items[0].dataIndex];
            const detail = m.detail.map((d) => `${MOYENS[d.moyen] ?? d.moyen} : ${euros(d.caTtcCents)} · ${nombre(d.nbVentes)} ventes`).join("<br>");
            return `<b>${m.libelle}</b><br>${euros(m.caTtcCents)} · ${nombre(m.nbVentes)} ventes<br>${nombre(m.nbRefusees)} refus${detail ? `<br><br>${detail}` : ""}`;
          },
        },
        xAxis: { ...axeValeur(j), axisLabel: { show: false }, splitLine: { show: false } },
        yAxis: axeCategorie(j, tries.map((m) => m.libelle)),
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

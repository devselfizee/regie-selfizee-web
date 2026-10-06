"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { euros, jour, nombre } from "@/lib/format";
import { Reserve, useMoi } from "@/lib/session";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";

type Indicateur = "ca" | "caJourOuvert" | "caHeureOuverture" | "caParPlace" | "caParVisiteur" | "margeNette" | "margeJourOuvert";
type Stat = { n: number; moyenne: number | null; mediane: number | null };

interface LieuSegment extends Record<Indicateur, number | null> {
  lieuId: number;
  enseigne: string;
  ville: string | null;
  typeLieu: string;
  joursEffectifs: number;
  heuresEffectives: number;
  nbVentes: number;
  criteres: Record<string, string>;
}

interface Segments {
  periode: { du: string; au: string };
  dimensions: { cle: string; libelle: string }[];
  x: { cle: string; libelle: string; valeurs: string[] };
  y: { cle: string; libelle: string; valeurs: string[] } | null;
  cases: { x: string; y: string; lieuIds: number[]; stats: Record<Indicateur, Stat> }[];
  global: Record<Indicateur, Stat>;
  lieux: LieuSegment[];
  exclus: string[];
}

const INDICATEURS: { cle: Indicateur; libelle: string; aide: string; admin?: boolean }[] = [
  { cle: "margeJourOuvert", libelle: "Marge par jour ouvert", aide: "Marge nette ÷ jours ouverts et équipés : la vraie rentabilité, comparable entre lieux", admin: true },
  { cle: "margeNette", libelle: "Marge nette", aide: "CA HT − commissions versées au lieu − coûts et amortissement de ses bornes sur la période", admin: true },
  { cle: "caJourOuvert", libelle: "CA par jour ouvert", aide: "CA ÷ jours où le lieu était ouvert ET équipé d'une borne (comparable entre lieux saisonniers, annuels, récents)" },
  { cle: "caHeureOuverture", libelle: "CA par heure d'ouverture", aide: "CA ÷ heures d'ouverture effectives (horaires de la fiche ; 12 h par jour si non renseignés)" },
  { cle: "caParPlace", libelle: "CA par place", aide: "CA par jour ouvert ÷ capacité d'accueil" },
  { cle: "caParVisiteur", libelle: "CA par visiteur", aide: "CA ÷ (fréquentation estimée par jour × jours ouverts)" },
  { cle: "ca", libelle: "CA total", aide: "CA TTC brut sur la période (non normalisé)" },
];

// Échelle séquentielle bleue (du clair au foncé), comme la carte
const ECHELLE = ["#e8f1fc", "#b7d3f6", "#6da7ec", "#2a78d6", "#1c5cab"];
const PEU_DE_LIEUX = 3;

export default function PageAnalyse() {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL"]}>
      <Analyse />
    </Reserve>
  );
}

function Analyse() {
  const moi = useMoi();
  const indicateurs = INDICATEURS.filter((i) => !i.admin || moi.role === "ADMIN");
  const [filtres, setFiltres] = useState<ValeursFiltres>(filtresParDefaut);
  const [x, setX] = useState("typeLieu");
  const [y, setY] = useState("heureFermeture");
  const [indicateur, setIndicateur] = useState<Indicateur>("caJourOuvert");
  const [stat, setStat] = useState<"moyenne" | "mediane">("mediane");
  const [selection, setSelection] = useState<{ x: string; y: string } | null>(null);

  const query = qs({ ...filtres, granularite: undefined, x, y: y || undefined });
  const { data, error, isPending } = useQuery({
    queryKey: ["segments", query],
    queryFn: () => api<Segments>(`/stats/segments${query}`),
    placeholderData: keepPreviousData,
  });

  const def = INDICATEURS.find((i) => i.cle === indicateur)!;

  return (
    <>
      <EnTete
        titre="Analyse par segment"
        sousTitre="Quels types de lieux valent le coup ? Indicateurs normalisés, pour comparer des lieux qui n'ont ni la même ancienneté ni la même saison."
      />
      <Filtres valeurs={filtres} onChange={setFiltres} />

      <div className="carte mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Choix libelle="Colonnes" valeur={x} onChange={(v) => { setX(v); setSelection(null); }} options={data?.dimensions ?? [{ cle: x, libelle: "…" }]} />
        <Choix
          libelle="Lignes"
          valeur={y}
          onChange={(v) => { setY(v); setSelection(null); }}
          options={[{ cle: "", libelle: "Aucun (une seule ligne)" }, ...(data?.dimensions.filter((d) => d.cle !== x) ?? [])]}
        />
        <Choix libelle="Indicateur" valeur={indicateur} onChange={(v) => setIndicateur(v as Indicateur)} options={indicateurs} />
        <div>
          <span className="etiquette">Valeur affichée</span>
          <div className="flex gap-1">
            {(["mediane", "moyenne"] as const).map((s) => (
              <button key={s} onClick={() => setStat(s)}
                className={`flex-1 rounded-md px-3 py-2 text-sm ${stat === s ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}>
                {s === "mediane" ? "Médiane" : "Moyenne"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-ink-muted sm:col-span-2 lg:col-span-4">{def.libelle} : {def.aide}. La médiane résiste mieux qu&apos;une moyenne à un lieu exceptionnel.</p>
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && <Resultats data={data} indicateur={indicateur} stat={stat} selection={selection} setSelection={setSelection} />}
    </>
  );
}

function Choix({ libelle, valeur, onChange, options }: { libelle: string; valeur: string; onChange: (v: string) => void; options: { cle: string; libelle: string }[] }) {
  return (
    <label className="block">
      <span className="etiquette">{libelle}</span>
      <select className="champ" value={valeur} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.cle} value={o.cle}>{o.libelle}</option>)}
      </select>
    </label>
  );
}

function Resultats({
  data, indicateur, stat, selection, setSelection,
}: {
  data: Segments;
  indicateur: Indicateur;
  stat: "moyenne" | "mediane";
  selection: { x: string; y: string } | null;
  setSelection: (s: { x: string; y: string } | null) => void;
}) {
  const lignes = data.y?.valeurs ?? ["Tous"];
  const caseDe = (x: string, y: string) => data.cases.find((c) => c.x === x && c.y === y);
  const g = data.global[indicateur];

  // Classes de couleur : quintiles des valeurs affichées (cases avec au moins un lieu)
  const bornes = useMemo(() => {
    const v = data.cases.map((c) => c.stats[indicateur][stat]).filter((n): n is number => n !== null).sort((a, b) => a - b);
    return [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.floor(q * v.length)] ?? 0);
  }, [data, indicateur, stat]);
  const classe = (v: number) => bornes.filter((b) => v > b).length;

  const choisie = selection ? caseDe(selection.x, selection.y) : null;
  const lieuxChoisis = choisie ? data.lieux.filter((l) => choisie.lieuIds.includes(l.lieuId)).sort((a, b) => (b[indicateur] ?? -1) - (a[indicateur] ?? -1)) : [];

  if (!data.lieux.length) return <Vide>Aucun lieu équipé et ouvert sur la période.</Vide>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-2">
        Du {jour(data.periode.du)} au {jour(data.periode.au)} · {data.lieux.length} lieu(x) · ensemble : médiane{" "}
        <strong className="text-ink">{g.mediane !== null ? euros(g.mediane) : "—"}</strong>, moyenne{" "}
        <strong className="text-ink">{g.moyenne !== null ? euros(g.moyenne) : "—"}</strong>
        {g.n < data.lieux.length && <> (sur {g.n} lieux renseignés)</>}
        {data.exclus.length > 0 && <span className="text-ink-muted"> · écartés faute de jour ouvert et équipé : {data.exclus.join(", ")}</span>}
      </p>

      <div className="carte overflow-x-auto p-3">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left text-xs font-medium text-ink-2">{data.y ? `${data.y.libelle} \\ ${data.x.libelle}` : data.x.libelle}</th>
              {data.x.valeurs.map((vx) => <th key={vx} className="p-2 text-center text-xs font-medium text-ink-2">{vx}</th>)}
            </tr>
          </thead>
          <tbody>
            {lignes.map((vy) => (
              <tr key={vy}>
                <th className="p-2 text-left text-xs font-medium whitespace-nowrap text-ink-2">{data.y ? vy : ""}</th>
                {data.x.valeurs.map((vx) => {
                  const c = caseDe(vx, vy);
                  const s = c?.stats[indicateur];
                  const v = s?.[stat] ?? null;
                  if (!c || v === null) return <td key={vx} className="rounded-md bg-surface-2 p-2 text-center text-ink-muted">—</td>;
                  const k = classe(v);
                  const peu = s!.n < PEU_DE_LIEUX;
                  const actif = selection?.x === vx && selection?.y === vy;
                  return (
                    <td key={vx} className="p-0">
                      <button
                        onClick={() => setSelection(actif ? null : { x: vx, y: vy })}
                        title={`${vx}${data.y ? ` × ${vy}` : ""} : ${s!.n} lieu(x)`}
                        className={`w-full rounded-md p-2 text-center tabular ${peu ? "border border-dashed border-line-strong opacity-60" : ""} ${actif ? "ring-2 ring-ink" : ""}`}
                        style={{ background: ECHELLE[k], color: k >= 3 ? "#ffffff" : "#0b0b0b" }}
                      >
                        <div className="font-semibold">{euros(v)}</div>
                        <div className="text-[0.7rem] opacity-80">
                          {stat === "mediane" ? "moy." : "méd."} {euros((stat === "mediane" ? s!.moyenne : s!.mediane) ?? 0)} · n = {s!.n}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Légende">
          <li className="flex items-center gap-1">
            {ECHELLE.map((c) => <span key={c} className="inline-block h-3 w-5" style={{ background: c }} />)}
            <span className="ml-1">du plus faible au plus élevé</span>
          </li>
          <li className="flex items-center gap-1">
            <span className="inline-block h-3 w-5 border border-dashed border-line-strong opacity-60" /> moins de {PEU_DE_LIEUX} lieux : à ne pas sur-interpréter
          </li>
          <li>Cliquez une case pour voir ses lieux.</li>
        </ul>
      </div>

      {choisie && (
        <Section titre={`${selection!.x}${data.y ? ` × ${selection!.y}` : ""} — ${choisie.lieuIds.length} lieu(x)`}>
          <ul className="divide-y divide-line text-sm">
            {lieuxChoisis.map((l) => (
              <li key={l.lieuId} className="flex justify-between gap-3 py-2">
                <Link className="hover:underline" href={`/lieux/${l.lieuId}`}>{l.enseigne}<span className="text-ink-muted"> · {l.ville ?? l.typeLieu}</span></Link>
                <span className="tabular">{l[indicateur] !== null ? euros(l[indicateur]!) : "non renseigné"}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <TableauLieux lieux={data.lieux} indicateur={indicateur} avecMarge={data.lieux.some((l) => l.margeNette !== null)} />
    </div>
  );
}

const COLONNES: { cle: keyof LieuSegment; libelle: string; format: (v: number) => string }[] = [
  { cle: "ca", libelle: "CA", format: euros },
  { cle: "joursEffectifs", libelle: "Jours ouverts", format: nombre },
  { cle: "caJourOuvert", libelle: "CA / jour ouvert", format: euros },
  { cle: "caHeureOuverture", libelle: "CA / heure", format: euros },
  { cle: "caParPlace", libelle: "CA / place / jour", format: euros },
  { cle: "caParVisiteur", libelle: "CA / visiteur", format: euros },
];

function TableauLieux({ lieux, indicateur, avecMarge }: { lieux: LieuSegment[]; indicateur: Indicateur; avecMarge: boolean }) {
  const [tri, setTri] = useState<keyof LieuSegment>(indicateur);
  const colonnes = avecMarge
    ? [...COLONNES, { cle: "margeNette" as const, libelle: "Marge nette", format: euros }, { cle: "margeJourOuvert" as const, libelle: "Marge / jour", format: euros }]
    : COLONNES;
  const tries = [...lieux].sort((a, b) => ((b[tri] as number | null) ?? -1) - ((a[tri] as number | null) ?? -1));

  const exporter = () => {
    const cellule = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const eur = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
    const lignes = [
      ["Lieu", "Ville", "Type", "CA", "Jours ouverts", "CA / jour ouvert", "CA / heure", "CA / place / jour", "CA / visiteur", ...(avecMarge ? ["Marge nette", "Marge / jour"] : [])].join(";"),
      ...tries.map((l) =>
        [l.enseigne, l.ville, l.typeLieu, eur(l.ca), l.joursEffectifs, eur(l.caJourOuvert), eur(l.caHeureOuverture), eur(l.caParPlace), eur(l.caParVisiteur), ...(avecMarge ? [eur(l.margeNette), eur(l.margeJourOuvert)] : [])]
          .map(cellule)
          .join(";")
      ),
    ];
    const url = URL.createObjectURL(new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "indicateurs_lieux.csv" }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <Section titre="Indicateurs par lieu" actions={<button className="bouton-second !py-1 text-xs" onClick={exporter}>Exporter (CSV)</button>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="py-2 pr-3 font-medium">Lieu</th>
              {colonnes.map((c) => (
                <th key={c.cle} className="py-2 pr-3 text-right font-medium">
                  <button className={`hover:text-ink ${tri === c.cle ? "text-ink" : ""}`} onClick={() => setTri(c.cle)}>
                    {c.libelle}{tri === c.cle ? " ▼" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular">
            {tries.map((l) => (
              <tr key={l.lieuId} className="border-t border-line">
                <td className="py-2 pr-3">
                  <Link className="font-medium hover:underline" href={`/lieux/${l.lieuId}`}>{l.enseigne}</Link>
                  <span className="text-xs text-ink-muted"> · {l.typeLieu}</span>
                </td>
                {colonnes.map((c) => (
                  <td key={c.cle} className={`py-2 pr-3 text-right ${tri === c.cle ? "font-medium" : "text-ink-2"}`}>
                    {l[c.cle] === null ? "—" : c.format(l[c.cle] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

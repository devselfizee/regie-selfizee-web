"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { euros, eurosRond, jour, nombre } from "@/lib/format";
import { DEPARTEMENTS } from "@/lib/departements";
import { preset } from "@/components/Filtres";
import { Badge, Chargement, Erreur, Vide } from "@/components/Etat";
import { PrevisionGlobaleSection } from "@/components/SectionPrevision";

// Onglet « Analyse » de la page Lieux : comparer les lieux du parc (maquette lieux.html du 10/11/2026).
// Une seule teinte violette dans les graphiques ; le rouge seulement pour les alertes.
const VIOLET = "#5B4CF5";
const VIOLET_FONCE = "#3F33C7";
const VIOLET_CLAIR = "#C9CBF8";
const VIOLET_PALE = "#ECECFC";
const GRIS = "#EEF0F4";

// ─── Réponse de GET /api/stats/lieux-analyse ───

interface LieuAnalyse {
  lieuId: number;
  enseigne: string;
  ville: string | null;
  typeLieu: string;
  departement: string | null;
  saisonnier: boolean;
  equipe: boolean;
  caTtcCents: number;
  joursOuverts: number;
  caParJourOuvertCents: number | null;
  /** null : la borne ne remonte pas les parcours invité */
  seances: number | null;
  payees: number | null;
  seancesParJourOuvert: number | null;
  caParSeanceCents: number | null;
  /** Fermeture la plus tardive de la semaine, « 2 h » */
  fermeture: string | null;
}

interface GroupeCritere {
  libelle: string;
  nb: number;
  medianeCents: number;
}

interface LieuASurveiller {
  lieuId: number;
  enseigne: string;
  typeLieu: string;
  departement: string | null;
  test: boolean;
  raisons: { regle: "SOUS_SEUIL" | "SANS_VENTE" | "BAISSE" | "PAYEES"; libelle: string; depuisJours: number | null }[];
  caParJourOuvertCents: number | null;
  evolution4Semaines: number | null;
  caParJourOuvertAvantCents: number | null;
  fermeture: string | null;
  seances: number | null;
  payees: number | null;
}

interface AnalyseLieux {
  periode: { du: string; au: string };
  finRegles: string;
  seuils: { caParJourOuvertCents: number; joursSansVente: number; baisse4Semaines: number; tauxPaye: number };
  medianes: { caParJourOuvertCents: number | null; seancesParJourOuvert: number | null; caParSeanceCents: number | null };
  lieux: LieuAnalyse[];
  criteres: { critere: string; haut: GroupeCritere; bas: GroupeCritere; rapport: number | null }[];
  parType: { typeLieu: string; nb: number; medianeCents: number; minCents: number; maxCents: number }[];
  departements: {
    code: string | null;
    nbLieux: number;
    nbSaisonniers: number;
    joursOuverts: number;
    caTtcCents: number;
    seances: number | null;
    payees: number | null;
    caParJourOuvertCents: number | null;
  }[];
  surveiller: LieuASurveiller[];
}

// ─── Petits éléments communs ───

const tauxPct = (payees: number, seances: number) => `${Math.round((payees / seances) * 100)} %`;
const virgule = (x: number, decimales = 1) => x.toLocaleString("fr-FR", { maximumFractionDigits: decimales, minimumFractionDigits: decimales });

/** Infobulle sombre au survol (attribut data-tip des maquettes) */
function useBulle() {
  const [b, setB] = useState<{ x: number; y: number; texte: string } | null>(null);
  const sur = (texte: string) => ({
    onMouseMove: (e: MouseEvent) => setB({ x: e.clientX, y: e.clientY, texte }),
    onMouseLeave: () => setB(null),
  });
  const bulle = b && (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-md bg-[#15171C] px-2.5 py-1.5 text-xs text-white shadow-lg"
      style={{ left: b.x, top: b.y - 12 }}
    >
      {b.texte}
    </div>
  );
  return { sur, bulle };
}

/** Bloc de la page : titre, ligne de règles (pas d'introduction), contenu */
function Bloc({ titre, regles, children }: { titre: string; regles?: ReactNode; children: ReactNode }) {
  return (
    <section className="carte p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{titre}</h2>
        {regles && <p className="mt-0.5 text-xs text-ink-2">{regles}</p>}
      </div>
      {children}
    </section>
  );
}

/** Barre de valeur avec la médiane du parc en trait vertical */
function BarreMediane({ valeur, max, mediane, texte }: { valeur: number | null; max: number; mediane: number | null; texte: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-2 w-24 shrink-0 rounded-full" style={{ background: VIOLET_PALE }}>
        {valeur !== null && max > 0 && (
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (valeur / max) * 100)}%`, background: valeur >= (mediane ?? 0) ? VIOLET : VIOLET_CLAIR }} />
        )}
        {mediane !== null && max > 0 && <span aria-hidden className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${Math.min(100, (mediane / max) * 100)}%` }} />}
      </span>
      <span className="tabular">{texte}</span>
    </span>
  );
}

// ─── Page ───

const PERIODES = [
  { cle: "30j", libelle: "30 j", calcul: () => preset("30j").calcul() },
  { cle: "90j", libelle: "90 j", calcul: () => preset("90j").calcul() },
  {
    cle: "12m",
    libelle: "12 mois",
    calcul: () => {
      const { au } = preset("30j").calcul();
      return { du: new Date(new Date(`${au}T00:00:00Z`).getTime() - 364 * 86_400_000).toISOString().slice(0, 10), au };
    },
  },
] as const;

export function AnalyseLieux() {
  const [periode, setPeriode] = useState<(typeof PERIODES)[number]["cle"]>("30j");
  const [parc, setParc] = useState("SELFIZEE");
  const { du, au } = PERIODES.find((p) => p.cle === periode)!.calcul();
  const query = qs({ du, au, parc: parc || undefined });
  const { data, error, isPending } = useQuery({
    queryKey: ["stats", "lieux-analyse", query],
    queryFn: () => api<AnalyseLieux>(`/stats/lieux-analyse${query}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      {/* Prévision du mois : tout le parc, indépendante de la période choisie */}
      <PrevisionGlobaleSection detail />

      <div className="flex flex-wrap items-end justify-end gap-2">
        {data && <span className="mr-auto text-sm text-ink-2">Du {jour(data.periode.du)} au {jour(data.periode.au)}</span>}
        <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Période">
          {PERIODES.map((p) => (
            <button
              key={p.cle}
              type="button"
              aria-pressed={periode === p.cle}
              onClick={() => setPeriode(p.cle)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${periode === p.cle ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {p.libelle}
            </button>
          ))}
        </div>
        <label>
          <span className="etiquette">Parc</span>
          <select id="analyse-lieux-parc" className="champ" value={parc} onChange={(e) => setParc(e.target.value)}>
            <option value="SELFIZEE">Parc Selfizee</option>
            <option value="CLIENT">Parc client</option>
            <option value="">Tout</option>
          </select>
        </label>
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && (
        <>
          <Classement data={data} />
          <Matrice data={data} />
          <Differences data={data} />
          <ParDepartement data={data} />
          <Surveiller data={data} />
        </>
      )}
    </div>
  );
}

// ─── Classement des lieux ───

type Tri = "caParJourOuvertCents" | "caTtcCents" | "joursOuverts" | "seances" | "taux";
const COLONNES: { cle: Tri; libelle: string }[] = [
  { cle: "caParJourOuvertCents", libelle: "CA / jour ouvert" },
  { cle: "caTtcCents", libelle: "CA total" },
  { cle: "joursOuverts", libelle: "Jours ouverts" },
  { cle: "seances", libelle: "Séances" },
  { cle: "taux", libelle: "Payées" },
];

function Classement({ data }: { data: AnalyseLieux }) {
  const [tri, setTri] = useState<Tri>("caParJourOuvertCents");
  const { sur, bulle } = useBulle();
  const valeur = (l: LieuAnalyse) => (tri === "taux" ? (l.seances ? l.payees! / l.seances : null) : l[tri]);
  // Les valeurs inconnues (pas de jour ouvert, pas de parcours) en bas
  const lieux = [...data.lieux].sort((a, b) => (valeur(b) ?? -Infinity) - (valeur(a) ?? -Infinity) || a.enseigne.localeCompare(b.enseigne));
  const med = data.medianes.caParJourOuvertCents;
  const max = Math.max(0, ...data.lieux.map((l) => l.caParJourOuvertCents ?? 0));
  const libelleTri = COLONNES.find((c) => c.cle === tri)!.libelle;

  return (
    <Bloc
      titre="Classement des lieux"
      regles={`Trié par ${libelleTri.toLowerCase()}${med !== null ? ` · trait = médiane du parc ${euros(med)} par jour ouvert` : ""} · cliquer un en-tête pour trier, un lieu pour ouvrir sa fiche.`}
    >
      {bulle}
      {lieux.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-2 font-medium"><span className="sr-only">Rang</span></th>
                <th className="py-2 pr-3 font-medium">Lieu</th>
                {COLONNES.map((c) => (
                  <th key={c.cle} className={`py-2 pr-3 font-medium ${c.cle === "caParJourOuvertCents" ? "" : "text-right"}`} aria-sort={tri === c.cle ? "descending" : "none"}>
                    <button type="button" className={`hover:text-ink ${tri === c.cle ? "font-semibold text-ink" : ""}`} onClick={() => setTri(c.cle)}>
                      {c.libelle}{tri === c.cle && " ▾"}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {lieux.map((l, i) => (
                <tr key={l.lieuId} className="border-t border-line">
                  <td className="py-2 pr-2 text-ink-muted">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/lieux/${l.lieuId}`} className="font-medium hover:underline">{l.enseigne}</Link>{" "}
                    <Badge ton="neutre">{l.typeLieu}</Badge>
                    {l.departement && <span className="text-xs text-ink-muted"> · {l.departement}</span>}
                  </td>
                  <td className="py-2 pr-3" {...sur(l.caParJourOuvertCents !== null ? `${l.enseigne} : ${euros(l.caParJourOuvertCents)} par jour ouvert${med !== null ? ` · médiane du parc ${euros(med)}` : ""}` : `${l.enseigne} : aucun jour ouvert sur la période`)}>
                    <BarreMediane valeur={l.caParJourOuvertCents} max={max} mediane={med} texte={l.caParJourOuvertCents !== null ? euros(l.caParJourOuvertCents) : "—"} />
                  </td>
                  <td className="py-2 pr-3 text-right">{eurosRond(l.caTtcCents)}</td>
                  <td className="py-2 pr-3 text-right">{l.joursOuverts}</td>
                  <td className="py-2 pr-3 text-right">{l.seances !== null ? nombre(l.seances) : <span className="text-ink-muted">—</span>}</td>
                  <td className="py-2 pr-3 text-right" {...(l.seances ? sur(`${l.payees} payées sur ${l.seances} séances`) : {})}>
                    {l.seances ? tauxPct(l.payees!, l.seances) : <span className="text-ink-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Vide>Aucun lieu ouvert et équipé d&apos;une borne sur la période.</Vide>
      )}
    </Bloc>
  );
}

// ─── Du monde, ou des séances qui rapportent ? ───

function Matrice({ data }: { data: AnalyseLieux }) {
  const router = useRouter();
  const { sur, bulle } = useBulle();
  const points = data.lieux.filter((l) => l.seancesParJourOuvert !== null && l.caParSeanceCents !== null);
  const { seancesParJourOuvert: mx, caParSeanceCents: my } = data.medianes;
  const L = 640, H = 340, M = { g: 28, d: 16, h: 16, b: 28 };
  const maxX = Math.max(1, ...points.map((l) => l.seancesParJourOuvert!)) * 1.1;
  const maxY = Math.max(1, ...points.map((l) => l.caParSeanceCents!)) * 1.1;
  const x = (v: number) => M.g + (v / maxX) * (L - M.g - M.d);
  const y = (v: number) => H - M.b - (v / maxY) * (H - M.h - M.b);

  return (
    <Bloc
      titre="Du monde, ou des séances qui rapportent ?"
      regles={
        mx !== null && my !== null
          ? `Séances par jour ouvert × CA par séance. Traits = médiane du parc (${virgule(mx)} séances · ${euros(my)}) · cliquer un lieu pour ouvrir sa fiche.`
          : undefined
      }
    >
      {bulle}
      {points.length < 2 || mx === null || my === null ? (
        <Vide>Il faut au moins deux lieux avec des séances remontées par la borne (parcours invité) sur la période.</Vide>
      ) : (
        <svg viewBox={`0 0 ${L} ${H}`} className="h-auto w-full" role="img" aria-label="Chaque lieu selon ses séances par jour ouvert et son CA par séance, axes à la médiane du parc">
          <rect x={M.g} y={M.h} width={L - M.g - M.d} height={H - M.h - M.b} fill="none" stroke={GRIS} />
          {/* Quadrants : au-dessus / en dessous des deux médianes */}
          <rect x={x(mx)} y={M.h} width={L - M.d - x(mx)} height={y(my) - M.h} fill={VIOLET_PALE} opacity={0.6} />
          <line x1={x(mx)} x2={x(mx)} y1={M.h} y2={H - M.b} stroke={VIOLET_CLAIR} strokeDasharray="4 4" />
          <line x1={M.g} x2={L - M.d} y1={y(my)} y2={y(my)} stroke={VIOLET_CLAIR} strokeDasharray="4 4" />
          <g className="fill-ink-muted text-[11px]">
            <text x={M.g + 8} y={M.h + 16}>peu de monde, paie bien</text>
            <text x={L - M.d - 8} y={M.h + 16} textAnchor="end" className="fill-ink font-semibold">à dupliquer</text>
            <text x={M.g + 8} y={H - M.b - 8}>à déplacer</text>
            <text x={L - M.d - 8} y={H - M.b - 8} textAnchor="end">du monde, paie peu</text>
            <text x={M.g} y={H - 8}>← moins de séances par jour ouvert</text>
            <text x={L - M.d} y={H - 8} textAnchor="end">plus de séances par jour ouvert →</text>
            <text transform={`translate(14 ${M.h + 4}) rotate(-90)`} textAnchor="end">CA par séance →</text>
          </g>
          {points.map((l) => {
            const px = x(l.seancesParJourOuvert!), py = y(l.caParSeanceCents!);
            const aller = () => router.push(`/lieux/${l.lieuId}`);
            return (
              <g
                key={l.lieuId}
                role="link"
                tabIndex={0}
                aria-label={l.enseigne}
                className="cursor-pointer outline-none"
                onClick={aller}
                onKeyDown={(e) => e.key === "Enter" && aller()}
                {...sur(`${l.enseigne} : ${virgule(l.seancesParJourOuvert!)} séances par jour ouvert · ${euros(l.caParSeanceCents!)} par séance`)}
              >
                <circle cx={px} cy={py} r={7} fill={VIOLET} stroke="#fff" strokeWidth={2} />
                <text x={px > L - 140 ? px - 11 : px + 11} y={py + 4} textAnchor={px > L - 140 ? "end" : "start"} className="fill-ink text-[12px] font-medium">
                  {l.enseigne}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </Bloc>
  );
}

// ─── Ce qui fait la différence entre les lieux ───

function Differences({ data }: { data: AnalyseLieux }) {
  const maxType = Math.max(0, ...data.parType.map((t) => t.maxCents));
  const comparables = data.lieux.filter((l) => l.caParJourOuvertCents !== null).length;
  return (
    <Bloc titre="Ce qui fait la différence entre les lieux" regles="CA par jour ouvert, médiane de chaque groupe · écart d'au moins × 1,5.">
      {data.criteres.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.criteres.map((c) => (
            <div key={c.critere} className="rounded-md border border-line p-3">
              <div className="text-xs font-medium text-ink-2">{c.critere}</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold tabular" style={{ color: VIOLET_FONCE }}>{euros(c.haut.medianeCents)}</div>
                  <div className="text-xs text-ink-2">{c.haut.libelle} · {c.haut.nb} lieu{c.haut.nb > 1 ? "x" : ""}</div>
                </div>
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: VIOLET_PALE, color: VIOLET_FONCE }}>
                  {c.rapport !== null ? `× ${virgule(c.rapport)}` : "0 € en face"}
                </span>
                <div className="text-right">
                  <div className="text-lg font-semibold tabular text-ink-2">{euros(c.bas.medianeCents)}</div>
                  <div className="text-xs text-ink-2">{c.bas.libelle} · {c.bas.nb} lieu{c.bas.nb > 1 ? "x" : ""}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Vide>
          {comparables < 4 ? "Il faut au moins 4 lieux avec des jours ouverts pour comparer des groupes." : "Aucun critère de la fiche lieu ne sépare les lieux avec un écart net sur cette période."}
        </Vide>
      )}

      {data.parType.length > 0 && (
        <div className="mt-5 border-t border-line pt-3">
          <h3 className="text-sm font-semibold">Par type de lieu</h3>
          <p className="mt-0.5 mb-2 text-xs text-ink-2">Médiane par type · de la plus faible à la plus forte valeur.</p>
          <ul className="space-y-2">
            {data.parType.map((t) => (
              <li key={t.typeLieu} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                <span>
                  {t.typeLieu}
                  <span className="block text-xs text-ink-muted">{t.nb} lieu{t.nb > 1 ? "x" : ""}</span>
                </span>
                <span className="relative h-3 rounded-full" style={{ background: VIOLET_PALE }}>
                  {maxType > 0 && (
                    <>
                      {/* Étendue (min → max) en clair, médiane en foncé */}
                      <span className="absolute inset-y-0 rounded-full" style={{ left: `${(t.minCents / maxType) * 100}%`, width: `${((t.maxCents - t.minCents) / maxType) * 100}%`, background: VIOLET_CLAIR }} />
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(t.medianeCents / maxType) * 100}%`, background: VIOLET }} />
                    </>
                  )}
                </span>
                <span className="text-right tabular">
                  <span className="font-medium">{euros(t.medianeCents)}</span>
                  {t.nb > 1 && <span className="block text-xs text-ink-muted">de {euros(t.minCents)} à {euros(t.maxCents)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bloc>
  );
}

// ─── Par département ───

/** Contours des départements (france-geojson simplifié, Licence Ouverte IGN / INSEE), viewBox 0 0 330 320 */
function useContours() {
  return useQuery({
    queryKey: ["contours-departements"],
    queryFn: async () => {
      const r = await fetch("/data/departements-france.json");
      if (!r.ok) throw new Error("Contours des départements indisponibles");
      return (await r.json()) as Record<string, string>;
    },
    staleTime: Infinity,
  });
}

/** Centre de la boîte d'un contour, pour y écrire le numéro du département */
function centre(d: string): [number, number] {
  const n = [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const xs = n.map((p) => p[0]), ys = n.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** Teinte du clair au foncé selon la part du maximum */
function teinte(part: number) {
  const a = [0xec, 0xec, 0xfc], b = [0x3f, 0x33, 0xc7];
  const t = Math.max(0.15, Math.min(1, part));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

function ParDepartement({ data }: { data: AnalyseLieux }) {
  const [survol, setSurvol] = useState<string | null>(null);
  const { sur, bulle } = useBulle();
  const { data: contours, error } = useContours();
  const med = data.medianes.caParJourOuvertCents;
  const deps = data.departements;
  const max = Math.max(0, ...deps.map((d) => d.caParJourOuvertCents ?? 0));
  const parCode = new Map(deps.filter((d) => d.code).map((d) => [d.code!, d]));
  const centres = useMemo(() => new Map(Object.entries(contours ?? {}).map(([code, d]) => [code, centre(d)])), [contours]);
  const nom = (code: string | null) => (code ? `${code} · ${DEPARTEMENTS[code] ?? "Département"}` : "Code postal manquant");

  if (!deps.length) return null;
  return (
    <Bloc titre="Par département" regles={`Départements équipés teintés selon le CA par jour ouvert${med !== null ? ` · trait = médiane du parc ${euros(med)}` : ""}.`}>
      {bulle}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {error && <Erreur erreur={error} />}
        {!contours && !error && <Chargement />}
        {contours && (
          <svg viewBox="0 0 330 320" className="h-auto w-full max-w-sm" role="img" aria-label={`Carte de France : départements équipés (${deps.filter((d) => d.code).map((d) => nom(d.code)).join(", ")}) teintés selon le CA par jour ouvert`}>
            {Object.entries(contours).map(([code, d]) => {
              const dep = parCode.get(code);
              const actif = survol === code;
              return (
                <path
                  key={code}
                  d={d}
                  fill={dep ? (dep.caParJourOuvertCents !== null && max ? teinte(dep.caParJourOuvertCents / max) : VIOLET_PALE) : GRIS}
                  stroke={actif ? "#15171C" : dep ? VIOLET : "#fff"}
                  strokeWidth={actif ? 1.6 : dep ? 1 : 0.6}
                  {...(dep
                    ? {
                        ...sur(`${nom(code)} : ${dep.caParJourOuvertCents !== null ? `${euros(dep.caParJourOuvertCents)} par jour ouvert` : "aucun jour ouvert"} · ${dep.nbLieux} lieu${dep.nbLieux > 1 ? "x" : ""}`),
                        onMouseEnter: () => setSurvol(code),
                        onMouseOut: () => setSurvol(null),
                      }
                    : {})}
                />
              );
            })}
            {/* Le contour survolé par-dessus ses voisins, puis les numéros des départements équipés */}
            {survol && contours[survol] && <path d={contours[survol]} fill="none" stroke="#15171C" strokeWidth={1.6} pointerEvents="none" />}
            {[...parCode.keys()].filter((c) => centres.has(c)).map((c) => (
              <text key={c} x={centres.get(c)![0]} y={centres.get(c)![1] + 3} textAnchor="middle" pointerEvents="none" className="text-[9px] font-semibold" fill={(parCode.get(c)!.caParJourOuvertCents ?? 0) / (max || 1) > 0.55 ? "#fff" : "#15171C"}>
                {c}
              </text>
            ))}
          </svg>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-3 font-medium">Département</th>
                <th className="py-2 pr-3 text-right font-medium">Lieux</th>
                <th className="py-2 pr-3 text-right font-medium">Jours ouverts</th>
                <th className="py-2 pr-3 text-right font-medium">Séances</th>
                <th className="py-2 pr-3 text-right font-medium">CA</th>
                <th className="py-2 pr-3 font-medium">CA / jour ouvert</th>
                <th className="py-2 text-right font-medium">Payées</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {deps.map((d) => (
                <tr
                  key={d.code ?? ""}
                  className={`border-t border-line ${d.code && survol === d.code ? "bg-surface-2" : ""}`}
                  onMouseEnter={() => setSurvol(d.code)}
                  onMouseLeave={() => setSurvol(null)}
                >
                  <td className="py-2 pr-3 font-medium">{d.code ? nom(d.code) : <span className="text-ink-muted">{nom(null)}</span>}</td>
                  <td className="py-2 pr-3 text-right">
                    {d.nbLieux - d.nbSaisonniers}
                    {d.nbSaisonniers > 0 && <span className="text-xs text-ink-muted"> + {d.nbSaisonniers} saison</span>}
                  </td>
                  <td className="py-2 pr-3 text-right">{d.joursOuverts}</td>
                  <td className="py-2 pr-3 text-right">{d.seances !== null ? nombre(d.seances) : <span className="text-ink-muted">—</span>}</td>
                  <td className="py-2 pr-3 text-right">{eurosRond(d.caTtcCents)}</td>
                  <td className="py-2 pr-3">
                    <BarreMediane valeur={d.caParJourOuvertCents} max={max} mediane={med} texte={d.caParJourOuvertCents !== null ? euros(d.caParJourOuvertCents) : "—"} />
                  </td>
                  <td className="py-2 text-right" title={d.seances ? `${d.payees} payées sur ${d.seances} séances` : undefined}>
                    {d.seances ? tauxPct(d.payees!, d.seances) : <span className="text-ink-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Bloc>
  );
}

// ─── Lieux à surveiller ───

function depuis(r: LieuASurveiller["raisons"][number]) {
  if (r.depuisJours === null) return "—";
  if (r.regle === "SANS_VENTE") return `${r.depuisJours} jours`;
  return r.depuisJours >= 14 ? `${Math.round(r.depuisJours / 7)} semaines` : `${r.depuisJours} jours`;
}

function Surveiller({ data }: { data: AnalyseLieux }) {
  const s = data.seuils;
  const baisse = Math.round(Math.abs(s.baisse4Semaines) * 100);
  return (
    <Bloc
      titre="Lieux à surveiller"
      regles={`Règles : < ${s.caParJourOuvertCents / 100} € / jour ouvert · 0 € sur ≥ ${s.joursSansVente} jours ouverts · − ${baisse} % sur 4 semaines · < ${Math.round(s.tauxPaye * 100)} % payées.`}
    >
      {data.surveiller.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-3 font-medium">Lieu</th>
                <th className="py-2 pr-3 font-medium">Pourquoi</th>
                <th className="py-2 pr-3 text-right font-medium">CA / jour ouvert</th>
                <th className="py-2 pr-3 text-right font-medium">Depuis</th>
                <th className="py-2 pr-3 font-medium">Contexte</th>
                <th className="py-2 font-medium"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.surveiller.map((l) => {
                const premiere = l.raisons.find((r) => r.depuisJours !== null) ?? l.raisons[0];
                const contexte = l.test
                  ? ["Lieu de test : hors classement et médianes"]
                  : [
                      l.fermeture && `Ferme à ${l.fermeture}`,
                      l.seances ? `${l.payees} payées sur ${l.seances}` : null,
                      l.raisons.some((r) => r.regle === "BAISSE") && l.caParJourOuvertAvantCents !== null
                        ? `${euros(l.caParJourOuvertAvantCents)} / jour ouvert les 4 semaines d'avant`
                        : null,
                    ].filter(Boolean);
                return (
                  <tr key={l.lieuId} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{l.enseigne}</span>
                      <span className="text-xs text-ink-muted"> · {[l.typeLieu, l.departement].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex flex-wrap gap-1">
                        {l.raisons.map((r) => (
                          <Badge key={r.regle} ton="crit">{r.libelle}</Badge>
                        ))}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">{l.caParJourOuvertCents !== null ? euros(l.caParJourOuvertCents) : "—"}</td>
                    <td className="py-2 pr-3 text-right">{depuis(premiere)}</td>
                    <td className="py-2 pr-3 text-xs text-ink-2">{contexte.join(" · ") || "—"}</td>
                    <td className="py-2 text-right">
                      <Link href={`/lieux/${l.lieuId}`} className="text-sm font-medium text-accent hover:underline">Fiche →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Vide>Aucun lieu ne dépasse les seuils sur la période.</Vide>
      )}
      <p className="mt-2 text-xs text-ink-muted">« 0 € sur N jours » et « sur 4 semaines » : jusqu&apos;au {jour(data.finRegles)}, dernière journée complète.</p>
    </Bloc>
  );
}

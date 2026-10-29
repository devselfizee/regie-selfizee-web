"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogueItem } from "@/studio/components/dashboard/editor/panels/PanelModeles";
import { modelePermis, posesDuGabarit } from "@/studio/lib/restrictionStudio";

/**
 * Page « Catalogue Selfizee » (entrée du studio, retour boss p.8). Liste plein
 * écran des modèles prêts à l'emploi, à la charte Kalifun (clair/coral).
 *
 * Source (doc fournie) = /api/bibliotheques/content-menu/1?type_id=1 (le « 1 »
 * = groupe Selfizee), groupé par thème → chaque modèle porte ses thèmes. Une
 * seule requête (cachée). Filtres : Thème, Format, Nombre de shoots (ceux du catalogue),
 * recherche — tout côté client.
 *
 * Clic sur un modèle → onPick(item) : StudioContent ouvre l'éditeur qui charge
 * le modèle (mécanique PanelModeles.applyCatalogueModel).
 *
 * (Filtre COULEUR : l'API ajaxGetListeCouleur ne renvoie que des hex, sans les
 *  IDs int attendus par le param `colors[]` — à brancher avec la source d'IDs.)
 */
const CATALOGUE_URL =
  "/editor-api/bibliotheques/content-menu/1?type_id=1&is_active_filtre_par_categ=1&theme=true";

const FORMAT_LABELS: Record<number, string> = {
  1: "Carte postale paysage",
  2: "Carte postale portrait",
  3: "Marque-page",
  4: "Polaroid",
  5: "Carte postale multishoot",
  6: "Polaroid multishoot",
  7: "Carte paysage coupon",
  8: "Mini polaroid",
};

interface Theme {
  id: number;
  nom: string;
}
interface CatModel {
  id: number;
  nom: string;
  format_id: number;
  nbr_pose: number;
  thumb: string;
  full: string;
  themes: number[];
}

// Une seule requête (cachée module-level) : modèles Selfizee groupés par thème.
let cache: { models: CatModel[]; themes: Theme[] } | null = null;
let inflight: Promise<{ models: CatModel[]; themes: Theme[] }> | null = null;

async function fetchModels(): Promise<{ models: CatModel[]; themes: Theme[] }> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(CATALOGUE_URL, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: unknown[]; error?: string };
    const groups = Array.isArray(json.data) ? json.data : [];
    // Le proxy répond 200 { data: [], error } quand le booth rejette l'appel
    // (401 auth requise, injoignable…). Sans données, on lève l'erreur pour
    // afficher un message clair au lieu d'une grille vide trompeuse.
    if (groups.length === 0 && json.error) throw new Error(json.error);
    const themes: Theme[] = [];
    const byId = new Map<number, CatModel>();
    for (const gRaw of groups) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = gRaw as any;
      const themeId = Number(g.id) || 0;
      const themeNom = String(g.nom ?? "").trim();
      if (themeNom && !themes.some((t) => t.id === themeId)) themes.push({ id: themeId, nom: themeNom });
      for (const bRaw of g.bibliotheques || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = bRaw as any;
        const id = Number(b.id);
        const thumb = b.url_sm_thumbnail || b.url_xs_thumbnail || b.url_thumbnail || b.url_md_thumbnail || b.file_url;
        if (!id || !thumb) continue;
        let m = byId.get(id);
        if (!m) {
          m = {
            id,
            nom: String(b.nom ?? ""),
            format_id: Number(b.format_id) || 0,
            nbr_pose: Number(b.nbr_pose) || 0,
            thumb,
            full: b.url_thumbnail || b.url_md_thumbnail || thumb,
            themes: [],
          };
          byId.set(id, m);
        }
        if (themeId && !m.themes.includes(themeId)) m.themes.push(themeId);
      }
    }
    themes.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    cache = { models: [...byId.values()], themes };
    return cache;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function toCatalogueItem(m: CatModel): CatalogueItem {
  return {
    id: m.id,
    nom: m.nom,
    format_id: m.format_id,
    nbr_pose: m.nbr_pose,
    url_sm_thumbnail: m.thumb,
    url_thumbnail: m.full,
    file_url: m.full,
  };
}

export function CatalogueBrowser({
  onPick,
  onBack,
}: {
  onPick: (item: CatalogueItem) => void;
  onBack: () => void;
}) {
  const [models, setModels] = useState<CatModel[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [formatId, setFormatId] = useState<number | null>(null);
  // Régie : les poses du gabarit présélectionnées, modifiables (un modèle à 3 poses + un shoot)
  const [poses, setPoses] = useState<number | null>(() => posesDuGabarit());
  const [themeId, setThemeId] = useState<number | null>(null);
  const [visible, setVisible] = useState(30);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchModels()
      .then(({ models: m, themes: t }) => {
        if (cancelled) return;
        setModels(m);
        setThemes(t);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Le catalogue est momentanément indisponible.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const formatOptions = useMemo(() => {
    const counts: Record<number, number> = {};
    models.filter((m) => modelePermis(m.format_id)).forEach((m) => {
      counts[m.format_id] = (counts[m.format_id] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([id, count]) => ({ id: Number(id), label: FORMAT_LABELS[Number(id)] || `Format ${id}`, count }))
      .sort((a, b) => b.count - a.count);
  }, [models]);

  // Nombres de poses des modèles permis (le filtre choisi reste affiché, même sans modèle)
  const poseOptions = useMemo(() => {
    const n = new Set(models.filter((m) => modelePermis(m.format_id)).map((m) => m.nbr_pose));
    if (poses !== null) n.add(poses);
    return [...n].sort((a, b) => a - b);
  }, [models, poses]);

  const filtered = useMemo(
    () =>
      models.filter((m) => {
        if (!modelePermis(m.format_id)) return false;
        if (formatId !== null && m.format_id !== formatId) return false;
        if (poses !== null && m.nbr_pose !== poses) return false;
        if (themeId !== null && !m.themes.includes(themeId)) return false;
        if (search && !m.nom.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [models, formatId, poses, themeId, search],
  );

  useEffect(() => setVisible(30), [formatId, poses, themeId, search]);

  return (
    <div>
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-700 ring-1 ring-ink-100 transition hover:ring-coral-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
        <h2 className="font-display text-[20px] font-black text-ink-900">Catalogue Selfizee</h2>
        {!loading && (
          <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-[11px] font-bold text-ink-700">
            {filtered.length} modèle{filtered.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        {/* Filtres */}
        <aside className="space-y-5">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un modèle…"
              className="w-full rounded-xl border-2 border-ink-100 bg-cream-50 py-2.5 pl-9 pr-3 text-[13px] outline-none transition focus:border-coral-400 focus:bg-white"
            />
          </div>

          {/* Nombre de shoots (ceux des modèles du catalogue) */}
          <FilterGroup title="Nombre de shoots">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={poses === null} onClick={() => setPoses(null)}>
                Tous
              </Chip>
              {poseOptions.map((p) => (
                <Chip key={p} active={poses === p} onClick={() => setPoses(p)}>
                  {p === 0 ? "Fond" : p}
                </Chip>
              ))}
            </div>
          </FilterGroup>

          {/* Format */}
          {formatOptions.length > 0 && (
            <FilterGroup title="Format">
              <div className="space-y-1">
                <Row active={formatId === null} onClick={() => setFormatId(null)} label="Tous les formats" />
                {formatOptions.map((f) => (
                  <Row key={f.id} active={formatId === f.id} onClick={() => setFormatId(f.id)} label={f.label} count={f.count} />
                ))}
              </div>
            </FilterGroup>
          )}

          {/* Thèmes */}
          {themes.length > 0 && (
            <FilterGroup title="Thèmes">
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                <Row active={themeId === null} onClick={() => setThemeId(null)} label="Tous les thèmes" />
                {themes.map((t) => (
                  <Row key={t.id} active={themeId === t.id} onClick={() => setThemeId(t.id)} label={t.nom} />
                ))}
              </div>
            </FilterGroup>
          )}
        </aside>

        {/* Grille */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-coral-500" />
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-ink-100">
              <p className="text-[14px] font-semibold text-ink-900">{error}</p>
              <p className="mx-auto mt-1.5 max-w-md text-[12px] text-ink-500">
                Le service Selfizee qui fournit les modèles ne répond pas pour l'instant. Réessaie dans un moment.
              </p>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-coral-500 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-coral-600"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Réessayer
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-ink-100">
              <p className="text-[13px] text-ink-700">Aucun modèle ne correspond à ces filtres.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.slice(0, visible).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onPick(toCatalogueItem(m))}
                    title={m.nom}
                    className="group overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100 transition hover:-translate-y-0.5 hover:shadow-pop hover:ring-coral-300"
                  >
                    <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-cream-50 to-blush-50 p-2.5">
                      {/* Fond gris sur l'IMAGE elle-même : les zones photo du
                          modèle (PNG transparent) apparaissent en gris. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.thumb}
                        alt={m.nom}
                        loading="lazy"
                        className="max-h-full max-w-full rounded-sm object-contain bg-gray-200 shadow-[0_6px_16px_-6px_rgba(61,46,40,0.35)] ring-1 ring-ink-900/5"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-ink-900/0 transition group-hover:bg-ink-900/20">
                        <span className="rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-bold text-ink-900 opacity-0 shadow-sm transition group-hover:opacity-100">
                          Utiliser ce modèle
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {visible < filtered.length && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setVisible((v) => v + 30)}
                    className="rounded-full bg-white px-5 py-2 text-[13px] font-bold text-coral-600 ring-1 ring-ink-100 transition hover:ring-coral-300"
                  >
                    Charger plus ({filtered.length - visible} restant{filtered.length - visible > 1 ? "s" : ""})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-400">{title}</p>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`min-w-[34px] rounded-full px-3 py-1.5 text-[12px] font-bold transition ${
        active ? "bg-coral-500 text-white" : "bg-white text-ink-700 ring-1 ring-ink-100 hover:ring-coral-300"
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[12px] font-semibold transition ${
        active ? "bg-coral-50 text-coral-700 ring-1 ring-coral-200" : "text-ink-700 hover:bg-cream-50"
      }`}
    >
      <span className="truncate">{label}</span>
      {count != null && <span className="ml-2 shrink-0 text-[10px] text-ink-400">{count}</span>}
    </button>
  );
}

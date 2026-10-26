"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FrameEditor from "@/studio/components/dashboard/FrameEditor";
import { useTypeFormats } from "@/studio/components/dashboard/editor/hooks/useTypeFormats";
import { setPendingAutoModel, type CatalogueItem } from "@/studio/components/dashboard/editor/panels/PanelModeles";
import type { FrameSavePayload } from "@/studio/components/dashboard/editor/hooks/useCanvasExport";
import { CatalogueBrowser } from "@/studio/app/CatalogueBrowser";
import { SavedChoiceDialog } from "@/studio/app/SavedChoiceDialog";
import { definirRestriction } from "@/studio/lib/restrictionStudio";
import type { Format, Gabarit } from "@/studio/lib/gabarits";
import { api, type CadreEvenement, type GabaritEvenement } from "@/lib/api";
import { FORMATS_KIT } from "./formatsKit";

// Studio de cadres ouvert depuis l'écran Gabarits de la fiche événement d'un lieu : l'éditeur de
// Kalifun (copié dans src/studio), limité aux formats du gabarit du kit, enregistré dans l'API Régie.
// Parcours : départ (vierge ou catalogue) → format → gabarit du studio → éditeur ; une étape à un
// seul choix est sautée. Un cadre déjà enregistré rouvre directement l'éditeur.

type Etape = "depart" | "catalogue" | "format" | "gabarit" | "editeur";

export interface CadreARouvrir extends CadreEvenement {
  canvas: string;
}

export function StudioRegie({ lieuId, gabarit, nomLieu, cadre }: { lieuId: number; gabarit: GabaritEvenement; nomLieu: string; cadre: CadreARouvrir | null }) {
  const kit = FORMATS_KIT[gabarit];
  // Posée avant le premier rendu des enfants : le studio ne voit que les formats du gabarit
  useState(() => definirRestriction(kit));
  useEffect(() => {
    definirRestriction(kit);
    return () => definirRestriction(null);
  }, [kit]);

  const router = useRouter();
  const { formats, loading } = useTypeFormats("cadres");
  const [etape, setEtape] = useState<Etape>(cadre ? "editeur" : "depart");
  const [depuisCatalogue, setDepuisCatalogue] = useState(false);
  const [format, setFormat] = useState<Format | null>(null);
  const [gab, setGab] = useState<Gabarit | null>(null);
  const [canvasInitial, setCanvasInitial] = useState<string | undefined>(cadre?.canvas);
  const [enregistre, setEnregistre] = useState(Boolean(cadre));
  const [choixApresEnregistrement, setChoixApresEnregistrement] = useState(false);

  // Cadre existant : son format et son gabarit du studio, retrouvés dès que les formats sont là
  // (tant qu'on n'en a pas choisi d'autres). Format disparu du studio : on repart de l'écran de départ.
  const formatDuCadre = cadre && !loading ? (formats.find((x) => x.id === cadre.formatId) ?? null) : null;
  const fmt = format ?? formatDuCadre;
  const gb =
    gab ??
    (formatDuCadre && !format
      ? (formatDuCadre.gabarits.find((g) => g.id === cadre?.gabaritStudioId) ?? formatDuCadre.gabarits[0] ?? { id: "existant", name: "Cadre existant", photoZones: [], textZones: [] })
      : null);
  const vue: Etape = cadre && !loading && !fmt && etape === "editeur" ? "depart" : etape;

  const versFiche = () => router.push(`/lieux/${lieuId}/evenement?ecran=gabarits`);

  const choisirFormat = (f: Format) => {
    setFormat(f);
    if (f.gabarits.length === 1) {
      setGab(f.gabarits[0]);
      setEtape("editeur");
    } else setEtape("gabarit");
  };

  const partirVierge = () => {
    setDepuisCatalogue(false);
    setCanvasInitial(undefined);
    if (formats.length === 1) choisirFormat(formats[0]);
    else setEtape("format");
  };

  const choisirModele = (item: CatalogueItem) => {
    const f = formats.find((x) => x.formatBoothId != null && Number(x.formatBoothId) === Number(item.format_id)) ?? formats[0];
    if (!f) return;
    setPendingAutoModel(item);
    setFormat(f);
    setGab(f.gabarits[0] ?? { id: "vierge", name: "Page blanche", photoZones: [], textZones: [] });
    setCanvasInitial(undefined);
    setDepuisCatalogue(true);
    setEtape("editeur");
  };

  const retour = () => {
    if (etape === "editeur" && !cadre) {
      if (depuisCatalogue) setEtape("catalogue");
      else if (format && format.gabarits.length > 1) setEtape("gabarit");
      else if (formats.length > 1) setEtape("format");
      else setEtape("depart");
      return;
    }
    if (etape === "gabarit") return setEtape(formats.length > 1 ? "format" : "depart");
    if (etape === "format" || etape === "catalogue") return setEtape("depart");
    versFiche();
  };

  const enregistrer = async (p: FrameSavePayload) => {
    const r = await api<CadreEvenement>(`/lieux/${lieuId}/evenement/cadres/${gabarit}`, {
      method: "PUT",
      json: {
        nom: `${nomLieu} — ${kit.libelle}`,
        formatId: p.formatId,
        gabaritStudioId: p.gabaritId,
        nbPoses: p.shootCount,
        canvas: p.canvasState,
        image: p.imageDataUrl,
        vignette: p.thumbnailDataUrl || null,
      },
    });
    return { id: r.id != null ? String(r.id) : gabarit };
  };

  if (vue === "editeur" && (!fmt || !gb)) return <Attente />;

  return (
    <div className="min-h-screen bg-page">
      {vue !== "editeur" && (
        <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={retour} className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-accent">
              <span aria-hidden>←</span> {vue === "depart" ? "Fiche événement" : "Retour"}
            </button>
            <h1 className="text-lg font-semibold text-ink">Studio · {kit.libelle}</h1>
          </div>
          <div className="max-w-[280px] truncate text-sm text-ink-2">{nomLieu}</div>
        </header>
      )}

      <div className="p-6">
        {vue === "depart" && (
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-2 text-center text-2xl font-bold text-ink">Comment voulez-vous commencer ?</h2>
            <p className="mb-2 text-center text-sm text-ink-2">
              Formats proposés pour ce gabarit : {loading ? "…" : formats.map((f) => f.name).join(", ")} · {kit.poses} pose{kit.poses > 1 ? "s" : ""}.
            </p>
            {kit.note && <p className="mb-8 text-center text-xs text-ink-muted">{kit.note}</p>}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Depart titre="Modèle vierge" texte="Une page vierge au bon format, à personnaliser de A à Z." onClick={partirVierge} disabled={loading} />
              <Depart titre="Catalogue Selfizee" texte="Les modèles prêts à l'emploi, seulement ceux de ce format." onClick={() => setEtape("catalogue")} disabled={loading} />
            </div>
          </div>
        )}

        {vue === "catalogue" && <CatalogueBrowser onPick={choisirModele} onBack={retour} />}

        {vue === "format" && (
          <Choix titre="Quel format ?">
            {formats.map((f) => (
              <Carte key={f.id} onClick={() => choisirFormat(f)} titre={f.name} detail={`${f.widthPx}×${f.heightPx} px`}>
                <Apercu zones={f.gabarits[0]?.photoZones ?? []} ratio={f.aspectRatio} />
              </Carte>
            ))}
          </Choix>
        )}

        {vue === "gabarit" && format && (
          <Choix titre="Quel gabarit ?" sousTitre={`Format : ${format.name}`}>
            {format.gabarits.map((g) => (
              <Carte key={g.id} onClick={() => { setGab(g); setEtape("editeur"); }} titre={g.name} detail={`${g.photoZones.length} zone${g.photoZones.length > 1 ? "s" : ""} photo`}>
                <Apercu zones={g.photoZones} ratio={format.aspectRatio} />
              </Carte>
            ))}
          </Choix>
        )}

        {vue === "editeur" && fmt && gb && (
          <div>
            <button type="button" onClick={retour} className="mb-4 flex items-center gap-1.5 text-sm text-ink-2 hover:text-accent">
              <span aria-hidden>←</span> {cadre ? "Retour à la fiche événement" : "Retour"}
            </button>
            <FrameEditor
              key={`${fmt.id}-${gb.id}`}
              catalogMode
              format={fmt}
              gabarit={gb}
              frameId={enregistre ? gabarit : undefined}
              initialCanvasState={canvasInitial}
              typeSlug="cadres"
              publicMode
              fixedFrameName={`${nomLieu} — ${kit.libelle}`}
              openCatalogue={depuisCatalogue}
              saveHandler={enregistrer}
              onSaved={() => {
                setEnregistre(true);
                setChoixApresEnregistrement(true);
              }}
              onClose={retour}
              onChangeGabarit={(f, g) => {
                setFormat(f);
                setGab(g);
                setCanvasInitial(undefined);
              }}
              onFormatAutoSwitch={(f, g) => {
                setFormat(f);
                setGab(g);
              }}
            />
          </div>
        )}
      </div>

      <SavedChoiceDialog open={choixApresEnregistrement} onStay={() => setChoixApresEnregistrement(false)} onLeave={versFiche} />
    </div>
  );
}

function Attente() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-accent" />
    </div>
  );
}

function Depart({ titre, texte, onClick, disabled }: { titre: string; texte: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group rounded-2xl border-2 border-line bg-surface p-8 text-center transition-all hover:-translate-y-1 hover:border-accent hover:shadow-lg disabled:opacity-50"
    >
      <h3 className="text-lg font-bold text-ink group-hover:text-accent">{titre}</h3>
      <p className="mt-1 text-sm text-ink-2">{texte}</p>
    </button>
  );
}

function Choix({ titre, sousTitre, children }: { titre: string; sousTitre?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-center text-2xl font-bold text-ink">{titre}</h2>
      {sousTitre && <p className="mb-8 text-center text-sm text-ink-2">{sousTitre}</p>}
      <div className="mx-auto mt-6 flex max-w-4xl flex-wrap justify-center gap-6 [&>*]:w-72">{children}</div>
    </div>
  );
}

function Carte({ titre, detail, onClick, children }: { titre: string; detail: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-2xl border border-line bg-surface p-6 text-center transition-all hover:-translate-y-1 hover:shadow-lg">
      <div className="mb-4 flex h-40 items-center justify-center">{children}</div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">{titre}</h3>
      <p className="mt-1 text-xs text-ink-2">{detail}</p>
    </button>
  );
}

function Apercu({ zones, ratio }: { zones: Gabarit["photoZones"]; ratio: number }) {
  const h = 140;
  const w = Math.min(160, h * ratio);
  return (
    <svg width={w} height={w / ratio} viewBox={`0 0 ${w} ${w / ratio}`} className="drop-shadow-md">
      <rect x={0} y={0} width={w} height={w / ratio} rx={4} fill="white" stroke="var(--line-strong)" />
      {zones.map((z, i) => (
        <rect key={i} x={(z.x / 100) * w} y={(z.y / 100) * (w / ratio)} width={(z.w / 100) * w} height={(z.h / 100) * (w / ratio)} rx={2} fill="var(--accent)" opacity={0.35} />
      ))}
    </svg>
  );
}

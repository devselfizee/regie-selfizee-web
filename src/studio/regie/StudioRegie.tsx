"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FrameEditor from "@/studio/components/dashboard/FrameEditor";
import { useTypeFormats } from "@/studio/components/dashboard/editor/hooks/useTypeFormats";
import { reinitialiserFiltresModeles, setPendingAutoModel, type CatalogueItem } from "@/studio/components/dashboard/editor/panels/PanelModeles";
import type { FrameSavePayload } from "@/studio/components/dashboard/editor/hooks/useCanvasExport";
import { CatalogueBrowser } from "@/studio/app/CatalogueBrowser";
import { SavedChoiceDialog } from "@/studio/app/SavedChoiceDialog";
import { definirRestriction } from "@/studio/lib/restrictionStudio";
import type { Format, Gabarit } from "@/studio/lib/gabarits";
import { api, type CadreEvenement, type GabaritEvenement } from "@/lib/api";
import { FORMATS_KIT } from "./formatsKit";
import { AvertissementPoses, posesDifferentes } from "./AvertissementPoses";

// Studio de cadres ouvert depuis l'écran Gabarits de la fiche événement d'un lieu : l'éditeur de
// Kalifun (copié dans src/studio), limité aux formats du gabarit du kit, enregistré dans l'API Régie.
// Parcours en 3 étapes avant l'éditeur : 1. départ (modèle vierge ou catalogue), 2. format du kit
// (bandelette, pola… : ChoixFormatKit pour un format ajouté depuis la fiche, déjà fait sinon), 3. modèle
// (format et gabarit du studio, ou modèle du catalogue) ; un choix unique est sauté. Un cadre déjà
// enregistré rouvre l'éditeur.

type Etape = "depart" | "catalogue" | "format" | "gabarit" | "editeur";

export interface CadreARouvrir extends CadreEvenement {
  canvas: string;
}

/**
 * `apiCadre` : le cadre de la composition dans l'API (…/cadres/:composition), null pour un format pas encore
 * dans l'événement : `creerComposition` l'y ajoute au premier enregistrement et rend ce chemin ;
 * `departInitial` : départ déjà choisi (format ajouté depuis la fiche : étapes 1 et 2 faites avant le
 * studio), qui s'ouvre alors à l'étape 3 ; `onRetourFormat` : retour à l'étape 2 (choix du format) ;
 * `pageRetour` : la fiche de l'événement ;
 * `libelle` : le nom de la composition (« Pola 1 pose · 2 » quand le gabarit revient).
 */
export function StudioRegie({ gabarit, nomLieu, cadre, apiCadre, creerComposition, departInitial, onRetourFormat, pageRetour, libelle }: {
  gabarit: GabaritEvenement;
  nomLieu: string;
  cadre: CadreARouvrir | null;
  apiCadre: string | null;
  creerComposition?: () => Promise<string>;
  departInitial?: Depart;
  onRetourFormat?: () => void;
  pageRetour: string;
  libelle?: string;
}) {
  const kit = FORMATS_KIT[gabarit];
  const nomComposition = libelle ?? kit.libelle;
  // Posée avant le premier rendu des enfants : le studio ne voit que les formats du gabarit, et le
  // catalogue s'ouvre filtré sur son nombre de poses
  useState(() => {
    definirRestriction(kit);
    reinitialiserFiltresModeles(kit.poses);
  });
  useEffect(() => {
    definirRestriction(kit);
    return () => definirRestriction(null);
  }, [kit]);

  const router = useRouter();
  const { formats, loading } = useTypeFormats("cadres");
  const [etape, setEtape] = useState<Etape>(cadre ? "editeur" : departInitial === "catalogue" ? "catalogue" : departInitial === "vierge" ? "format" : "depart");
  const [depuisCatalogue, setDepuisCatalogue] = useState(false);
  const [format, setFormat] = useState<Format | null>(null);
  const [gab, setGab] = useState<Gabarit | null>(null);
  // Format/gabarit effectifs : la bascule automatique de l'éditeur (selon le nombre de poses) les
  // change sans remonter l'éditeur, sinon le dessin en cours serait perdu (comme dans Kalifun)
  const [effectif, setEffectif] = useState<{ format: Format; gabarit: Gabarit } | null>(null);
  const [canvasInitial, setCanvasInitial] = useState<string | undefined>(cadre?.canvas);
  const [enregistre, setEnregistre] = useState(Boolean(cadre));
  const [cheminCadre, setCheminCadre] = useState(apiCadre);
  const [choixApresEnregistrement, setChoixApresEnregistrement] = useState(false);
  const [posesAConfirmer, setPosesAConfirmer] = useState<CatalogueItem | null>(null);

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

  const versFiche = () => router.push(pageRetour);

  const choisirFormat = (f: Format) => {
    setEffectif(null);
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

  const choisirModele = (item: CatalogueItem, posesConfirmees = false) => {
    if (!posesConfirmees && posesDifferentes(item.nbr_pose)) return setPosesAConfirmer(item);
    const f = formats.find((x) => x.formatBoothId != null && Number(x.formatBoothId) === Number(item.format_id)) ?? formats[0];
    if (!f) return;
    setPendingAutoModel(item);
    setEffectif(null);
    setFormat(f);
    setGab(f.gabarits[0] ?? { id: "vierge", name: "Page blanche", photoZones: [], textZones: [] });
    setCanvasInitial(undefined);
    setDepuisCatalogue(true);
    setEtape("editeur");
  };

  // Avant l'étape 3 : l'écran de départ, ou le choix du format pour un format ajouté depuis la fiche
  const avantModele = () => (onRetourFormat ? onRetourFormat() : setEtape("depart"));
  const retour = () => {
    if (etape === "editeur" && !cadre) {
      if (depuisCatalogue) setEtape("catalogue");
      else if (format && format.gabarits.length > 1) setEtape("gabarit");
      else if (formats.length > 1) setEtape("format");
      else avantModele();
      return;
    }
    if (etape === "gabarit") return formats.length > 1 ? setEtape("format") : avantModele();
    if (etape === "format" || etape === "catalogue") return avantModele();
    versFiche();
  };
  // Départ vierge déjà choisi et un seul format du studio : directement le gabarit (ou l'éditeur). Dans un
  // effet : il faut attendre les formats du studio, chargés après l'ouverture
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (etape === "format" && !format && !loading && formats.length === 1) choisirFormat(formats[0]);
  }, [etape, format, loading, formats]);

  const enregistrer = async (p: FrameSavePayload) => {
    // Sans QR, l'invité ne peut pas récupérer sa photo : sur la bandelette, le dessin recouvre celui du kit
    if (kit.qrObligatoire && !(JSON.parse(p.canvasState).objects ?? []).some((o: { _zoneBorne?: string }) => o._zoneBorne === "qr")) {
      throw new Error("Ajoutez le QR code (Textes → Zones dynamiques) : sans lui, l'invité ne peut pas récupérer sa photo.");
    }
    // Un modèle du catalogue peut avoir un autre nombre de poses : à ajuster avant d'enregistrer
    if (p.shootCount !== kit.poses) {
      const ecart = kit.poses - p.shootCount;
      throw new Error(
        `${kit.libelle} : il faut ${kit.poses} shoot${kit.poses > 1 ? "s" : ""}, le cadre en a ${p.shootCount}. ` +
          (ecart > 0 ? `Ajoutez-en ${ecart} (« Ajouter un shoot »).` : `Supprimez-en ${-ecart}.`),
      );
    }
    // Nouveau format : il n'entre dans l'événement qu'ici, au premier enregistrement de son cadre
    let chemin = cheminCadre;
    if (!chemin) {
      if (!creerComposition) throw new Error("Format introuvable dans l'événement.");
      chemin = await creerComposition();
      setCheminCadre(chemin);
    }
    const r = await api<CadreEvenement>(chemin, {
      method: "PUT",
      json: {
        nom: `${nomLieu} — ${nomComposition}`,
        formatId: p.formatId,
        gabaritStudioId: p.gabaritId,
        nbPoses: p.shootCount,
        canvas: p.canvasState,
        image: p.imageDataUrl,
        vignette: p.thumbnailDataUrl || null,
      },
    });
    return { id: r.id != null ? String(r.id) : r.compositionId };
  };

  if (vue === "editeur" && (!fmt || !gb)) return <Attente />;

  return (
    <div className="min-h-screen bg-page">
      {vue !== "editeur" && (
        <EnTeteStudio
          retour={retour}
          libelleRetour={vue === "depart" ? "Fiche événement" : "Retour"}
          titre={`Studio · ${nomComposition}`}
          nomLieu={nomLieu}
          etape={vue === "depart" ? 1 : 3}
          details={[vue === "catalogue" || depuisCatalogue ? "Catalogue" : "Modèle vierge", nomComposition]}
        />
      )}

      <div className="p-6">
        {vue === "depart" && (
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-2 text-center text-2xl font-bold text-ink">Comment voulez-vous commencer ?</h2>
            <p className="mb-2 text-center text-sm text-ink-2">
              Formats proposés pour ce gabarit : {loading ? "…" : formats.map((f) => f.name).join(", ")} · {kit.poses} pose{kit.poses > 1 ? "s" : ""}.
            </p>
            {kit.note && <p className="mb-8 text-center text-xs text-ink-muted">{kit.note}</p>}
            <ChoixDepart onChoisir={(d) => (d === "vierge" ? partirVierge() : setEtape("catalogue"))} sansCatalogue={kit.catalogue === false} disabled={loading} />
          </div>
        )}

        {vue === "catalogue" && <CatalogueBrowser onPick={(item) => choisirModele(item)} onBack={retour} />}

        {vue === "format" && (
          <Choix titre="Quel modèle ?" sousTitre={`Mise en page du ${nomComposition}`}>
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
              format={effectif?.format ?? fmt}
              gabarit={effectif?.gabarit ?? gb}
              frameId={enregistre ? (cheminCadre ?? undefined) : undefined}
              initialCanvasState={canvasInitial}
              typeSlug="cadres"
              publicMode
              fixedFrameName={`${nomLieu} — ${nomComposition}`}
              openCatalogue={depuisCatalogue}
              saveHandler={enregistrer}
              onSaved={() => {
                setEnregistre(true);
                setChoixApresEnregistrement(true);
              }}
              onClose={retour}
              onChangeGabarit={(f, g) => {
                setEffectif(null);
                setFormat(f);
                setGab(g);
                setCanvasInitial(undefined);
              }}
              onFormatAutoSwitch={(f, g) => setEffectif({ format: f, gabarit: g })}
            />
          </div>
        )}
      </div>

      <AvertissementPoses
        poses={posesAConfirmer?.nbr_pose ?? null}
        onAnnuler={() => setPosesAConfirmer(null)}
        onContinuer={() => {
          if (posesAConfirmer) choisirModele(posesAConfirmer, true);
          setPosesAConfirmer(null);
        }}
      />
      <SavedChoiceDialog open={choixApresEnregistrement} onStay={() => setChoixApresEnregistrement(false)} onLeave={versFiche} />
    </div>
  );
}

export type Depart = "vierge" | "catalogue";
const ETAPES = ["Départ", "Format", "Modèle"];

/** Étape 1 : modèle vierge ou catalogue Selfizee (sans catalogue pour un format qui n'en a pas). */
export function ChoixDepart({ onChoisir, sansCatalogue, disabled }: { onChoisir: (d: Depart) => void; sansCatalogue?: boolean; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <Depart titre="Modèle vierge" texte="Une page vierge au bon format, à personnaliser de A à Z." onClick={() => onChoisir("vierge")} disabled={disabled} />
      {!sansCatalogue && (
        <Depart titre="Catalogue Selfizee" texte="Les modèles prêts à l'emploi, seulement ceux du format choisi." onClick={() => onChoisir("catalogue")} disabled={disabled} />
      )}
    </div>
  );
}

/**
 * En-tête des étapes avant l'éditeur : retour, titre, lieu, et les 3 étapes (1. départ, 2. format,
 * 3. modèle) ; `details` : ce qui a été choisi aux étapes 1 et 2, affiché une fois l'étape passée.
 */
export function EnTeteStudio({ retour, libelleRetour, titre, nomLieu, etape, details = [] }: {
  retour: () => void;
  libelleRetour: string;
  titre: string;
  nomLieu: string;
  etape: 1 | 2 | 3;
  details?: (string | undefined)[];
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <button type="button" onClick={retour} className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-accent">
            <span aria-hidden>←</span> {libelleRetour}
          </button>
          <h1 className="text-lg font-semibold text-ink">{titre}</h1>
        </div>
        <div className="max-w-[280px] truncate text-sm text-ink-2">{nomLieu}</div>
      </div>
      <ol className="mx-auto flex max-w-2xl items-center gap-2 px-6 pb-4" aria-label="Étapes avant l'éditeur">
        {ETAPES.map((e, i) => {
          const n = i + 1;
          const fait = n < etape;
          const courant = n === etape;
          return (
            <li key={e} className="flex flex-1 items-center gap-2" aria-current={courant ? "step" : undefined}>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  courant ? "bg-accent text-white" : fait ? "bg-accent/15 text-accent" : "bg-surface-2 text-ink-muted"
                }`}
              >
                {fait ? "✓" : n}
              </span>
              <span className={`min-w-0 truncate text-sm ${courant ? "font-semibold text-ink" : fait ? "text-ink-2" : "text-ink-muted"}`}>
                {e}
                {fait && details[i] ? <span className="text-ink-muted"> · {details[i]}</span> : null}
              </span>
              {n < ETAPES.length && <span aria-hidden className={`h-px flex-1 ${fait ? "bg-accent/40" : "bg-line"}`} />}
            </li>
          );
        })}
      </ol>
    </header>
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

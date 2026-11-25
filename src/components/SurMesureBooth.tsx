"use client";

import { useMutation } from "@tanstack/react-query";
import { telecharger, type ZipSurMesure } from "@/lib/api";
import { dateHeure } from "@/lib/format";
import { Erreur } from "./Etat";

// Événement booth « sur mesure » (avenant de l'équipe borne du 24/11/2026), dans la fenêtre du créneau booth (création
// et modification) : la case « Événement sur mesure » et le dépôt du zip. Pour un événement créé dans booth puis
// retouché à la main (fonds, cadres, config.json), la Régie sert ce zip aux bornes à la place de booth. Chaque dépôt est
// une nouvelle version, installée par les bornes à la fin de la séance en cours. Le zip est celui du code booth : il
// vaut pour tous ses créneaux, sur tous les lieux où il est programmé. L'envoi se fait à l'enregistrement du formulaire.

/** 100 Mo au plus (décision du 24/11/2026) ; l'API contrôle aussi. */
export const MAX_ZIP_OCTETS = 100 * 1024 * 1024;

/** « 850 Ko », « 12,4 Mo ». */
export const taille = (octets: number | null) =>
  octets === null
    ? "—"
    : octets < 1024 * 1024
      ? `${Math.max(1, Math.round(octets / 1024))} Ko`
      : `${(octets / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;

export interface BorneDuLieu {
  id: number;
  identifiant: string;
  logicielVersion: string | null;
}

/** Pourquoi le fichier choisi serait refusé d'avance (pas un .zip, plus de 100 Mo) ; null s'il peut partir. */
export function refusFichier(f: File | null): string | null {
  if (!f) return null;
  if (!/\.zip$/i.test(f.name)) return "Choisissez un fichier .zip.";
  if (f.size > MAX_ZIP_OCTETS) return `Ce fichier fait ${taille(f.size)} : 100 Mo au plus.`;
  return null;
}

/** Télécharge le dernier zip déposé pour le code d'un créneau booth. */
export const telechargerZip = (lieuId: number, creneauId: number) => telecharger(`/lieux/${lieuId}/evenements-booth/${creneauId}/zip`);

/** Bloc « Événement sur mesure » du formulaire d'un créneau booth : la case, le zip déposé, le fichier à envoyer. */
export function ChampsSurMesure({ lieuId, creneauId, code, zip, autresLieux, bornes, codeChange, surMesure, onSurMesure, fichier, onFichier }: {
  lieuId: number;
  /** Créneau déjà enregistré (null à la création) : pour télécharger le zip déposé */
  creneauId: number | null;
  code: string;
  /** Zip déposé pour ce code ; null : aucun (ou code modifié, pas encore enregistré) */
  zip: ZipSurMesure | null;
  autresLieux: number;
  bornes: BorneDuLieu[];
  /** Le code a été modifié dans le formulaire : le zip déposé est celui de l'ancien code */
  codeChange: boolean;
  surMesure: boolean;
  onSurMesure: (v: boolean) => void;
  fichier: File | null;
  onFichier: (f: File | null) => void;
}) {
  const recuperer = useMutation({ mutationFn: (id: number) => telechargerZip(lieuId, id) });
  const refus = refusFichier(fichier);
  // Explications en info-bulle (retour du 25/11 : trop de texte dans la fenêtre)
  const aideCase =
    "Fichiers retouchés à la main : la Régie sert son zip aux bornes à la place de booth. Galerie, médias et codes promo restent ceux de booth." +
    (bornes.length
      ? `\nBornes du lieu : ${bornes.map((b) => `${b.identifiant} (logiciel ${b.logicielVersion ?? "inconnu"})`).join(", ")}. Il faut le logiciel livré avec l'avenant du 24/11/2026 : une borne plus ancienne prend la version de booth.`
      : "");
  const aideFichier = `Le zip de booth tel quel, ou retouché : son config.json doit porter le code ${code || "du créneau"} ; 100 Mo au plus. Chaque dépôt est une nouvelle version, que les bornes installent seules à la fin de la séance en cours.`;
  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <label className="flex items-start gap-2" title={aideCase}>
        <input type="checkbox" className="mt-0.5" checked={surMesure} onChange={(e) => onSurMesure(e.target.checked)} />
        <span className="font-medium">Événement sur mesure</span>
      </label>
      {!surMesure && zip?.actif && (
        <p className="text-xs text-warn-ink">
          Décoché : les bornes reprennent la version de booth. Le zip v{zip.version} reste gardé, il revient si vous recochez.
        </p>
      )}
      {surMesure && (
        <div className="space-y-3 border-t border-line pt-3">
          {codeChange && <p className="text-xs text-warn-ink">Le zip se rattache au code : pour {code || "ce code"}, déposez son zip ou décochez.</p>}
          {autresLieux > 0 && !codeChange && (
            <p role="note" className="rounded-md bg-warn-bg px-2.5 py-1.5 text-xs text-warn-ink">
              Le code {code} est aussi programmé sur {autresLieux === 1 ? "un autre lieu" : `${autresLieux} autres lieux`} : le zip y est servi aussi.
            </p>
          )}
          {zip && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span title={zip.sha256 ? `SHA-256 ${zip.sha256}` : undefined}>
                <span className="font-medium text-ink">Version {zip.version} déposée</span>
                <span className="text-ink-muted">
                  {" "}· {zip.nomFichier ?? "zip"} · {taille(zip.taille)} · {dateHeure(zip.publieLe)}
                  {zip.deposePar && ` · ${zip.deposePar}`}
                </span>
              </span>
              {zip.etat === "complete" && creneauId !== null && (
                <button type="button" className="bouton-second h-7 px-2.5 text-xs" disabled={recuperer.isPending} onClick={() => recuperer.mutate(creneauId)}>
                  {recuperer.isPending ? "Téléchargement…" : "Télécharger"}
                </button>
              )}
            </div>
          )}
          {zip?.etat === "obsolete" && (
            <p role="alert" className="text-xs text-crit-ink">Le fichier de cette version n&apos;est plus sur le serveur : déposez le zip à nouveau.</p>
          )}
          <label className="block" title={aideFichier}>
            <span className="etiquette">{zip ? `Nouvelle version (${zip.version + 1}), facultatif` : "Zip de l'événement *"}</span>
            <input type="file" accept=".zip,application/zip" className="champ" onChange={(e) => onFichier(e.target.files?.[0] ?? null)} />
          </label>
          {refus && <p role="alert" className="text-xs text-crit-ink">{refus}</p>}
          {recuperer.error && <Erreur erreur={recuperer.error} />}
        </div>
      )}
    </div>
  );
}

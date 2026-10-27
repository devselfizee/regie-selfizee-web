"use client";

import { useState, type ReactNode } from "react";
import { telecharger } from "@/lib/api";

export function BoutonExport({ chemin, children }: { chemin: string; children: ReactNode }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="bouton-second"
      disabled={enCours}
      title={erreur ?? undefined}
      onClick={async () => {
        setEnCours(true);
        setErreur(null);
        try {
          await telecharger(chemin);
        } catch (e) {
          setErreur(e instanceof Error ? e.message : String(e));
        } finally {
          setEnCours(false);
        }
      }}
    >
      {enCours ? "Export…" : erreur ? `Échec : ${erreur}` : children}
    </button>
  );
}

/** « Ventes : CSV | Excel » — chemin sans extension, la requête (filtres) après. */
export function Exporter({ libelle, chemin, requete = "" }: { libelle: string; chemin: string; requete?: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface pl-3 text-sm">
      <span className="text-ink-2">{libelle}</span>
      <BoutonExportCompact chemin={`${chemin}.csv${requete}`}>CSV</BoutonExportCompact>
      <BoutonExportCompact chemin={`${chemin}.xlsx${requete}`}>Excel</BoutonExportCompact>
    </div>
  );
}

function BoutonExportCompact({ chemin, children }: { chemin: string; children: ReactNode }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="px-2 py-2 font-medium text-accent hover:underline disabled:opacity-50"
      disabled={enCours}
      title={erreur ?? `Télécharger en ${children}`}
      onClick={async () => {
        setEnCours(true);
        setErreur(null);
        try {
          await telecharger(chemin);
        } catch (e) {
          setErreur(e instanceof Error ? e.message : String(e));
        } finally {
          setEnCours(false);
        }
      }}
    >
      {enCours ? "…" : erreur ? "Échec" : children}
    </button>
  );
}

/**
 * Un seul bouton « Exporter » qui ouvre la liste des exports (retour de Sébastien) :
 * chaque export en CSV et en Excel.
 */
export function MenuExport({ exports }: { exports: { libelle: string; chemin: string; requete?: string }[] }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const lancer = async (chemin: string, details: HTMLDetailsElement | null) => {
    setEnCours(chemin);
    setErreur(null);
    try {
      await telecharger(chemin);
      if (details) details.open = false;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(null);
    }
  };
  return (
    <details className="relative">
      <summary className="bouton-second cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {enCours ? "Export…" : "Exporter"} <span aria-hidden>▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-line bg-surface py-1 shadow-lg">
        {exports.flatMap((x) =>
          (["csv", "xlsx"] as const).map((format) => {
            const chemin = `${x.chemin}.${format}${x.requete ?? ""}`;
            return (
              <button
                key={chemin}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
                disabled={enCours !== null}
                onClick={(e) => lancer(chemin, e.currentTarget.closest("details"))}
              >
                {x.libelle} <span className="text-ink-muted">· {format === "csv" ? "CSV" : "Excel"}</span>
              </button>
            );
          })
        )}
        {erreur && <p className="px-3 py-1.5 text-xs text-crit-ink">Échec : {erreur}</p>}
      </div>
    </details>
  );
}

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

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

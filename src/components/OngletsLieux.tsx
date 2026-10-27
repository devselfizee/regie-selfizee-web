"use client";

import Link from "next/link";

/** Liste et carte des lieux : deux pages, chacune avec son adresse (retour de Sébastien). */
export function OngletsLieux({ actif }: { actif: "liste" | "carte" }) {
  const onglet = (cle: "liste" | "carte", href: string, libelle: string) => (
    <Link
      href={href}
      aria-current={actif === cle ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm ${actif === cle ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
    >
      {libelle}
    </Link>
  );
  return (
    <nav className="mb-4 inline-flex gap-1 rounded-lg bg-surface-2 p-1" aria-label="Affichage des lieux">
      {onglet("liste", "/lieux", "Liste")}
      {onglet("carte", "/lieux/carte", "Carte")}
    </nav>
  );
}

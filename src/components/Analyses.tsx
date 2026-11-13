"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDroits } from "@/lib/perms";

// Pages d'analyse : une seule entrée « Analyses » dans le menu, puis des onglets (retour de Sébastien du 12/11)
export const PAGES_ANALYSES = [
  { href: "/comportements", libelle: "Comportements", perm: "pages.comportements.view" },
  { href: "/par-heure", libelle: "Par heure", perm: "pages.comportements.view" },
  { href: "/analyses/paiements", libelle: "Paiements", perm: "pages.paiements.view" },
  { href: "/analyse", libelle: "Segments", perm: "pages.analyse.view" },
  { href: "/lieux/carte", libelle: "Géographique", perm: "pages.analyse_geo.view" },
];

/** Clé de l'entrée « Analyses » du menu : visible avec le droit d'au moins une de ses pages */
export const PERM_ANALYSES = "analyses";

export const estPageAnalyses = (chemin: string) =>
  chemin === "/analyses" || PAGES_ANALYSES.some((p) => chemin === p.href || chemin.startsWith(`${p.href}/`));

/** Droit d'une entrée de menu, « Analyses » comprise */
export function useVoitMenu() {
  const a = useDroits();
  return (perm: string) => (perm === PERM_ANALYSES ? PAGES_ANALYSES.some((p) => a(p.perm)) : a(perm));
}

/** Onglets en haut des pages d'analyse */
export function OngletsAnalyses() {
  const chemin = usePathname();
  const a = useDroits();
  const pages = PAGES_ANALYSES.filter((p) => a(p.perm));
  if (pages.length < 2) return null;
  return (
    <nav aria-label="Analyses" className="mb-5 flex gap-1 overflow-x-auto border-b border-line print:hidden">
      {pages.map((p) => {
        const actif = chemin === p.href || chemin.startsWith(`${p.href}/`);
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={actif ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold ${actif ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {p.libelle}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { keycloak } from "@/lib/auth";

const LIENS = [
  { href: "/", libelle: "Vue globale" },
  { href: "/lieux", libelle: "Lieux" },
  { href: "/bornes", libelle: "Bornes" },
  { href: "/imports", libelle: "Imports" },
];

export function Navigation() {
  const chemin = usePathname();
  const kc = keycloak();
  const utilisateur = kc?.tokenParsed as { given_name?: string; family_name?: string; preferred_username?: string } | undefined;
  const actif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));

  return (
    <nav className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-2 md:h-screen md:w-56 md:flex-col md:items-stretch md:gap-1 md:border-r md:border-b-0 md:px-3 md:py-6">
      <div className="mr-3 shrink-0 text-sm font-semibold md:mb-6 md:px-3 md:text-base">
        Régie <span className="text-ink-muted font-normal">Selfizee</span>
      </div>
      {LIENS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`shrink-0 rounded-md px-3 py-2 text-sm ${
            actif(l.href) ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2"
          }`}
        >
          {l.libelle}
        </Link>
      ))}
      {kc && (
        <div className="ml-auto flex shrink-0 items-center gap-2 md:mt-auto md:ml-0 md:flex-col md:items-stretch md:border-t md:border-line md:px-3 md:pt-4">
          <span className="hidden text-xs text-ink-2 sm:inline">
            {[utilisateur?.given_name, utilisateur?.family_name].filter(Boolean).join(" ") || utilisateur?.preferred_username}
          </span>
          <button type="button" className="text-left text-xs text-accent hover:underline" onClick={() => kc.logout()}>
            Déconnexion
          </button>
        </div>
      )}
    </nav>
  );
}

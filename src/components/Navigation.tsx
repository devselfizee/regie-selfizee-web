"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LIENS = [
  { href: "/", libelle: "Vue globale" },
  { href: "/lieux", libelle: "Lieux" },
  { href: "/bornes", libelle: "Bornes" },
  { href: "/imports", libelle: "Imports" },
];

export function Navigation() {
  const chemin = usePathname();
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
    </nav>
  );
}

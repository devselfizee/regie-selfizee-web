"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { keycloak } from "@/lib/auth";
import { useMoi, type Role } from "@/lib/session";

const LIENS: { href: string; libelle: string; roles: Role[] }[] = [
  { href: "/", libelle: "Vue globale", roles: ["ADMIN", "COMMERCIAL"] },
  { href: "/lieux", libelle: "Lieux", roles: ["ADMIN", "COMMERCIAL", "TECHNICIEN"] },
  { href: "/bornes", libelle: "Bornes", roles: ["ADMIN", "TECHNICIEN"] },
  { href: "/reversements", libelle: "Reversements", roles: ["ADMIN"] },
  { href: "/imports", libelle: "Imports", roles: ["ADMIN", "TECHNICIEN"] },
  { href: "/utilisateurs", libelle: "Utilisateurs", roles: ["ADMIN"] },
  { href: "/parametres", libelle: "Paramètres", roles: ["ADMIN"] },
];

const ROLES: Record<Role, string> = {
  ADMIN: "Administrateur",
  COMMERCIAL: "Commercial",
  TECHNICIEN: "Technicien",
  PARTENAIRE: "Partenaire",
};

export function Navigation() {
  const chemin = usePathname();
  const moi = useMoi();
  const kc = keycloak();
  const liens =
    moi.role === "PARTENAIRE" && moi.lieuId
      ? [{ href: `/lieux/${moi.lieuId}`, libelle: "Mon lieu" }]
      : LIENS.filter((l) => l.roles.includes(moi.role));
  const actif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));

  return (
    <nav className="print:hidden sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-2 md:h-screen md:w-56 md:flex-col md:items-stretch md:gap-1 md:border-r md:border-b-0 md:px-3 md:py-6">
      <div className="mr-3 shrink-0 text-sm font-semibold md:mb-6 md:px-3 md:text-base">
        Régie <span className="text-ink-muted font-normal">Selfizee</span>
      </div>
      {liens.map((l) => (
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
      <div className="ml-auto flex shrink-0 items-center gap-2 md:mt-auto md:ml-0 md:flex-col md:items-stretch md:border-t md:border-line md:px-3 md:pt-4">
        <span className="hidden text-xs sm:inline">
          <span className="text-ink">{[moi.prenom, moi.nom].filter(Boolean).join(" ")}</span>
          <span className="block text-ink-muted">{ROLES[moi.role]}</span>
        </span>
        {kc && (
          <button type="button" className="text-left text-xs text-accent hover:underline" onClick={() => kc.logout()}>
            Déconnexion
          </button>
        )}
      </div>
    </nav>
  );
}

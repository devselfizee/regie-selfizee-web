"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keycloak } from "@/lib/auth";
import { useMoi } from "@/lib/session";
import { useDroits } from "@/lib/perms";

// Liens filtrés selon les droits Konitys (une clé pages.<x>.view par entrée)
const LIENS: { href: string; libelle: string; perm: string }[] = [
  { href: "/", libelle: "Tableau de bord", perm: "pages.tableau_de_bord.view" },
  { href: "/lieux", libelle: "Lieux", perm: "pages.lieux.view" },
  { href: "/lieux/carte", libelle: "Analyse géographique", perm: "pages.analyse_geo.view" },
  { href: "/analyse", libelle: "Analyse", perm: "pages.analyse.view" },
  { href: "/comportements", libelle: "Comportements", perm: "pages.comportements.view" },
  { href: "/monitoring", libelle: "Monitoring live", perm: "pages.monitoring.view" },
  { href: "/papier", libelle: "Papier", perm: "pages.papier.view" },
  { href: "/alertes", libelle: "Alertes", perm: "pages.alertes.view" },
  { href: "/mentions", libelle: "Mes mentions", perm: "pages.mentions.view" },
  { href: "/bornes", libelle: "Bornes", perm: "pages.bornes.view" },
  { href: "/reversements", libelle: "Commissions", perm: "pages.commissions.view" },
  { href: "/paiements", libelle: "Paiements", perm: "pages.paiements.view" },
  { href: "/codes", libelle: "Codes de remise", perm: "pages.codes_remise.view" },
  { href: "/rapprochement", libelle: "Rapprochement", perm: "pages.rapprochement.view" },
  { href: "/rentabilite", libelle: "Rentabilité", perm: "pages.rentabilite.view" },
  { href: "/prospects", libelle: "Prospects", perm: "pages.prospects.view" },
  { href: "/utilisateurs", libelle: "Utilisateurs", perm: "pages.utilisateurs.view" },
  { href: "/parametres", libelle: "Paramètres", perm: "pages.parametres.view" },
];

/** `sousEntete` : sous l'en-tête de la plateforme (téléphone), la barre se colle juste en dessous. */
export function Navigation({ sousEntete = false }: { sousEntete?: boolean }) {
  const chemin = usePathname();
  const moi = useMoi();
  const kc = keycloak();
  const a = useDroits();
  // Sans la liste des lieux mais rattaché à un lieu (partenaire) : un menu réduit à « Mon lieu »
  const liens =
    !a("pages.lieux.view") && moi.lieuId
      ? [{ href: `/lieux/${moi.lieuId}`, libelle: "Mon lieu" }]
      : LIENS.filter((l) => a(l.perm));
  const { data: compteur } = useQuery({
    queryKey: ["alertes", "compteur"],
    queryFn: () => api<{ nouvelles: number; critiques: number }>("/alertes/compteur"),
    enabled: a("pages.alertes.view"),
    refetchInterval: 60_000,
  });
  const actif = (href: string) => (href === "/" ? chemin === "/" : chemin.startsWith(href));

  return (
    <nav className={`print:hidden sticky ${sousEntete ? "top-12" : "top-0"} z-10 flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-4 py-2 md:h-screen md:w-56 md:flex-col md:items-stretch md:gap-1 md:border-r md:border-b-0 md:px-3 md:py-6`}>
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
          {l.href === "/alertes" && compteur && compteur.nouvelles > 0 && (
            <span
              className={`ml-2 rounded-full px-1.5 py-0.5 text-[0.7rem] font-semibold ${compteur.critiques ? "bg-crit-bg text-crit-ink" : "bg-warn-bg text-warn-ink"}`}
              aria-label={`${compteur.nouvelles} nouvelle(s) alerte(s)`}
            >
              {compteur.nouvelles}
            </span>
          )}
        </Link>
      ))}
      <div className="ml-auto flex shrink-0 items-center gap-2 md:mt-auto md:ml-0 md:flex-col md:items-stretch md:border-t md:border-line md:px-3 md:pt-4">
        <span className="hidden text-xs sm:inline">
          <span className="text-ink">{[moi.prenom, moi.nom].filter(Boolean).join(" ")}</span>
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

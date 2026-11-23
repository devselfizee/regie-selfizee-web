"use client";

import { useEffect, useState } from "react";
import { deconnecter, keycloak } from "@/lib/auth";
import { useMoi } from "@/lib/session";

/**
 * En-tête des comptes clients de la Régie (realm « regie ») : même apparence que l'en-tête de la plateforme Konitys
 * (HeaderBar chargé en ligne pour les salariés), repris classe pour classe, sans ce qui ne les concerne pas :
 * sélecteur d'apps, recherche, « Créer », tickets, notifications, aide, liens « Mon compte » et « Préférences ».
 */
export function EnTeteClient() {
  const moi = useMoi();
  const [ouvert, setOuvert] = useState(false);
  const libelle = moi.email || "Utilisateur";
  const nomComplet = [moi.prenom, moi.nom].filter(Boolean).join(" ");

  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(false);
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [ouvert]);

  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--k-border)] shadow-sm shadow-black/[0.04] print:hidden"
      style={{ background: "linear-gradient(to right, white, rgba(239, 246, 255, 0.4))" }}
    >
      <div className="flex h-12 items-center gap-2 px-3 md:gap-3 md:px-4">
        {/* Marque et application courante (comme le sélecteur d'apps, sans menu : le client n'a que la Régie) */}
        <div className="flex h-9 items-center gap-2 rounded-lg px-2.5">
          <span className="text-[14px] font-bold tracking-tight text-[var(--k-text)]">KONITYS</span>
          <span className="text-[var(--k-muted)]/30">/</span>
          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: `${COULEUR_APP}15` }}>
            <IconeGrille className="h-4 w-4" couleur={COULEUR_APP} />
          </span>
          <span className="text-[14px] font-semibold" style={{ color: COULEUR_APP }}>Régie Selfizee</span>
        </div>
        {moi.entreprise && (
          <>
            <div className="mx-1 hidden h-6 w-px bg-[var(--k-border)] sm:block" />
            <span className="hidden min-w-0 truncate text-[13px] font-medium text-[var(--k-muted)] sm:inline" title={moi.entreprise.nom}>
              {moi.entreprise.nom}
            </span>
          </>
        )}

        <div className="ml-auto" />

        {/* Menu du compte */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOuvert((v) => !v)}
            className="flex h-9 items-center gap-2 rounded-lg px-2 transition hover:bg-[var(--k-surface-2)]"
            aria-expanded={ouvert}
          >
            <Avatar prenom={moi.prenom} nom={moi.nom} taille="sm" />
            <span className="hidden max-w-[180px] truncate text-[13px] font-medium text-[var(--k-text)] sm:inline">{libelle}</span>
            <IconeChevron className={`h-3 w-3 text-[var(--k-muted)] transition-transform ${ouvert ? "rotate-180" : ""}`} />
          </button>
          {ouvert && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOuvert(false)} />
              <div className="k-menu-entree absolute right-0 z-40 mt-2 w-56 rounded-2xl border border-[var(--k-border)] bg-white/95 py-2 shadow-xl shadow-black/[0.08] backdrop-blur-lg">
                <div className="flex items-center gap-3 border-b border-[var(--k-border)] px-4 py-2.5">
                  <Avatar prenom={moi.prenom} nom={moi.nom} taille="md" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--k-text)]">{libelle}</p>
                    {nomComplet && <p className="mt-0.5 truncate text-[12px] text-[var(--k-muted)]">{nomComplet}</p>}
                  </div>
                </div>
                {moi.entreprise && (
                  <div className="py-1">
                    <div className="flex items-center gap-3 px-4 py-2 text-[13px] text-[var(--k-text)]">
                      <IconeEntreprise className="h-4 w-4 text-[var(--k-muted)]" />
                      <span className="truncate">{moi.entreprise.nom}</span>
                    </div>
                  </div>
                )}
                {keycloak() && (
                  <div className="border-t border-[var(--k-border)] pt-1">
                    <button
                      type="button"
                      onClick={() => deconnecter()}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] text-[var(--k-danger)] transition hover:bg-red-50"
                    >
                      <IconeSortie className="h-4 w-4" />
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// Couleur par défaut d'une app dans l'en-tête de la plateforme (currentAppColor absent)
const COULEUR_APP = "#3B82F6";

/** UserAvatar de la plateforme : initiales sur dégradé indigo (les comptes clients n'ont pas de photo Konitys) */
function Avatar({ prenom, nom, taille }: { prenom?: string | null; nom?: string | null; taille: "sm" | "md" }) {
  const initiales = `${(prenom || "")[0] || ""}${(nom || "")[0] || ""}`.toUpperCase() || "?";
  return (
    <div
      className={`${taille === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm"} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6366F1] to-[#4F46E5] font-semibold text-white`}
      aria-hidden
    >
      {initiales}
    </div>
  );
}

// Icônes Lucide (mêmes tracés que ceux de la plateforme), sans dépendance
const svg = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };

function IconeGrille({ className, couleur }: { className: string; couleur: string }) {
  return (
    <svg {...svg} className={className} style={{ color: couleur }}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

function IconeChevron({ className }: { className: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconeSortie({ className }: { className: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function IconeEntreprise({ className }: { className: string }) {
  return (
    <svg {...svg} className={className}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { deconnecter, keycloak } from "@/lib/auth";
import { useMoi } from "@/lib/session";

/**
 * En-tête des comptes clients de la Régie (realm « regie ») : ils n'ont pas l'en-tête de la plateforme Konitys
 * (sélecteur d'apps, tickets, notifications). Logo, entreprise, personne connectée et déconnexion.
 */
export function EnTeteClient() {
  const moi = useMoi();
  const nom = [moi.prenom, moi.nom].filter(Boolean).join(" ") || moi.email;
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-4 border-b border-line bg-surface px-4 md:px-6 print:hidden">
      <Link href="/" className="flex shrink-0 items-center gap-3">
        <Image src="/selfizee-logo.png" alt="Selfizee" width={100} height={30} className="h-7 w-auto" priority />
        <span className="hidden text-sm font-semibold sm:inline">
          Régie <span className="font-normal text-ink-muted">Selfizee</span>
        </span>
      </Link>
      {moi.entreprise && (
        <span className="min-w-0 truncate border-l border-line pl-4 text-sm text-ink-2" title={moi.entreprise.nom}>
          {moi.entreprise.nom}
        </span>
      )}
      <div className="ml-auto flex min-w-0 items-center gap-3">
        <span className="hidden min-w-0 text-right text-xs leading-tight sm:block">
          <span className="block truncate font-medium text-ink">{nom}</span>
          {nom !== moi.email && <span className="block truncate text-ink-muted">{moi.email}</span>}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold uppercase text-accent" aria-hidden>
          {initiales(moi.prenom, moi.nom, moi.email)}
        </span>
        {keycloak() && (
          <button type="button" className="bouton-second shrink-0 px-3 py-1.5 text-xs" onClick={() => deconnecter()}>
            Déconnexion
          </button>
        )}
      </div>
    </header>
  );
}

function initiales(prenom?: string | null, nom?: string | null, email?: string): string {
  const i = `${(prenom ?? "").trim().charAt(0)}${(nom ?? "").trim().charAt(0)}`;
  return i || (email ?? "?").charAt(0);
}

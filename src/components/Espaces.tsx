"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Providers } from "@/app/providers";
import { Coquille } from "./Coquille";
import { Authentification } from "./Authentification";
import { Session } from "@/lib/session";
import { ChargeurDroits, PageGuard } from "@/lib/perms";

// Pages publiques (invités, sans compte) : ni connexion Keycloak, ni barre ni menu de la plateforme
const PUBLIQUES = ["/mes-photos"];
// Pages plein écran (studio de cadres) : connecté, mais sans la barre ni le menu de la plateforme
const PLEIN_ECRAN = /^\/lieux\/\d+\/evenement\/studio\//;

export function Espaces({ children }: { children: ReactNode }) {
  const chemin = usePathname();
  if (PUBLIQUES.some((p) => chemin === p || chemin.startsWith(`${p}/`))) return <>{children}</>;
  // Droits Konitys : SDK chargé dès que le jeton existe ; la page « Accès refusé » reste hors de toute garde
  if (chemin === "/403") {
    return (
      <Authentification>
        <ChargeurDroits />
        {children}
      </Authentification>
    );
  }
  return (
    <Authentification>
      <ChargeurDroits />
      <Providers>
        <PageGuard perm="app.access">
          <Session>{PLEIN_ECRAN.test(chemin) ? children : <Coquille>{children}</Coquille>}</Session>
        </PageGuard>
      </Providers>
    </Authentification>
  );
}

"use client";

import { PageGuard } from "@/lib/perms";
import { AnalysePaiements } from "@/components/AnalysePaiements";

// Analyse des paiements : rangée dans « Analyses » plutôt qu'en onglet de la page Paiements (retour de Sébastien du 13/11)
export default function PageAnalysePaiements() {
  return (
    <PageGuard perm="pages.paiements.view">
      <AnalysePaiements />
    </PageGuard>
  );
}

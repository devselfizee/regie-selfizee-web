"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageGuard } from "@/lib/perms";
import { ListePaiements } from "@/components/ListePaiements";

export default function PagePaiements() {
  return (
    <PageGuard perm="pages.paiements.view">
      <Suspense>
        <Paiements />
      </Suspense>
    </PageGuard>
  );
}

// ?cartes=test&q=1234 : lien depuis Paramètres → Cartes de test
function Paiements() {
  const p = useSearchParams();
  return <ListePaiements initial={{ q: p.get("q") ?? undefined, cartes: p.get("cartes") ?? undefined }} />;
}

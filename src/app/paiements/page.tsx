"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

// ?cartes=test&q=1234 : lien depuis Paramètres → Cartes de test. L'analyse est dans Analyses → Paiements (retour du 13/11) :
// ?onglet=analyse (anciens liens) y mène.
function Paiements() {
  const p = useSearchParams();
  const router = useRouter();
  const analyse = p.get("onglet") === "analyse";
  useEffect(() => {
    if (analyse) router.replace("/analyses/paiements");
  }, [analyse, router]);
  if (analyse) return null;
  return <ListePaiements initial={{ q: p.get("q") ?? undefined, cartes: p.get("cartes") ?? undefined }} />;
}

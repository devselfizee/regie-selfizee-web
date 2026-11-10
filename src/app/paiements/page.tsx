"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageGuard } from "@/lib/perms";
import { parametreUrl } from "@/lib/format";
import { ListePaiements } from "@/components/ListePaiements";
import { AnalysePaiements } from "@/components/AnalysePaiements";

export default function PagePaiements() {
  return (
    <PageGuard perm="pages.paiements.view">
      <Suspense>
        <Paiements />
      </Suspense>
    </PageGuard>
  );
}

const ONGLETS = [
  { cle: "liste", libelle: "Liste" },
  { cle: "analyse", libelle: "Analyse" },
] as const;
type Onglet = (typeof ONGLETS)[number]["cle"];

// ?cartes=test&q=1234 : lien depuis Paramètres → Cartes de test ; ?onglet=analyse : onglet Analyse
function Paiements() {
  const p = useSearchParams();
  const [onglet, setOnglet] = useState<Onglet>(p.get("onglet") === "analyse" ? "analyse" : "liste");
  return (
    <>
      <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Vues des paiements">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            aria-current={onglet === o.cle ? "page" : undefined}
            onClick={() => {
              setOnglet(o.cle);
              parametreUrl("onglet", o.cle === "liste" ? null : o.cle);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${onglet === o.cle ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {o.libelle}
          </button>
        ))}
      </nav>
      {onglet === "liste" ? <ListePaiements initial={{ q: p.get("q") ?? undefined, cartes: p.get("cartes") ?? undefined }} /> : <AnalysePaiements />}
    </>
  );
}

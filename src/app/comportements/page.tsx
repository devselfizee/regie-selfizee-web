"use client";

import { useState } from "react";
import { qs } from "@/lib/api";
import { jour } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { EnTete } from "@/components/Etat";
import { FiltresPage, useFiltresPage } from "@/components/FiltresPage";
import { ChoixJours, Comportement } from "@/components/Entonnoir";

// Comportement des invités (retour de Sébastien : le parcours n'avait pas sa place sur le tableau de bord)
export default function PageComportements() {
  return (
    <PageGuard perm="pages.comportements.view">
      <Comportements />
    </PageGuard>
  );
}

function Comportements() {
  // Mêmes filtres que le tableau de bord, sur la ligne du titre (retour de Sébastien du 12/11)
  const f = useFiltresPage("30j");
  const [soirs, setSoirs] = useState("");
  const requete = qs({ du: f.du, au: f.au, lieuId: f.lieuId, parc: f.parc });
  return (
    <>
      <EnTete
        titre="Comportements"
        sousTitre={f.du === f.au ? `Le ${jour(f.du)}` : `Du ${jour(f.du)} au ${jour(f.au)}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ChoixJours valeur={soirs} onChange={setSoirs} />
            <FiltresPage f={f} prefixe="cpt" />
          </div>
        }
      />
      <Comportement requete={requete} soirs={soirs} />
    </>
  );
}

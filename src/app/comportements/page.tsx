"use client";

import { useState } from "react";
import { qs } from "@/lib/api";
import { jour } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { EnTete } from "@/components/Etat";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { Comportement } from "@/components/Entonnoir";

// Comportement des invités (retour de Sébastien : le parcours n'avait pas sa place sur le tableau de bord)
export default function PageComportements() {
  return (
    <PageGuard perm="pages.comportements.view">
      <Comportements />
    </PageGuard>
  );
}

function Comportements() {
  const [filtres, setFiltres] = useState<ValeursFiltres>(filtresParDefaut);
  // La granularité ne sert pas ici
  const requete = qs({ ...filtres, granularite: undefined });
  return (
    <>
      <EnTete
        titre="Comportements des invités"
        sousTitre={`De la première page à l'impression : combien vont au bout, où ils décrochent, et quelles bornes sortent du lot · du ${jour(filtres.du)} au ${jour(filtres.au)}`}
      />
      <Filtres valeurs={filtres} onChange={setFiltres} />
      <Comportement requete={requete} />
    </>
  );
}

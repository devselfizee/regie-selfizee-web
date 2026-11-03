"use client";

import { useState } from "react";
import { qs } from "@/lib/api";
import { jour } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { EnTete } from "@/components/Etat";
import { Filtres, filtresParDefaut, type ValeursFiltres } from "@/components/Filtres";
import { Comportement } from "@/components/Entonnoir";

// Comportement des invités (retour de Sébastien : le parcours n'avait pas sa place sur le tableau de bord)
export default function PageComportements() {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL"]}>
      <Comportements />
    </Reserve>
  );
}

function Comportements() {
  const [filtres, setFiltres] = useState<ValeursFiltres>(filtresParDefaut);
  // La granularité ne sert pas ici
  const requete = qs({ ...filtres, granularite: undefined });
  return (
    <>
      <EnTete
        titre="Comportements"
        sousTitre={`Ce que font les invités devant la borne, de la première page à l'impression · du ${jour(filtres.du)} au ${jour(filtres.au)}`}
      />
      <Filtres valeurs={filtres} onChange={setFiltres} />
      <Comportement requete={requete} />
    </>
  );
}

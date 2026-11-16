"use client";

import { useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import { jour } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { EnTete } from "@/components/Etat";
import { ETATS, JournalTelechargements, type Etat } from "@/components/JournalTelechargements";
import { FiltresPage, useFiltresPage } from "@/components/FiltresPage";

// Journal des téléchargements d'événements par les bornes : la chronologie est dans JournalTelechargements.

export default function PageTelechargements() {
  return (
    <PageGuard perm="bornes.view">
      <Telechargements />
    </PageGuard>
  );
}

function Telechargements() {
  const f = useFiltresPage("7j");
  const [etat, setEtat] = useState("");
  const [declencheur, setDeclencheur] = useState("");
  const filtres = { du: f.du, au: f.au, parc: f.parc, lieuId: f.lieuId, etat, declencheur };
  const charge = useIsFetching({ queryKey: ["telechargements-evenements"] }) > 0;

  return (
    <>
      <EnTete
        titre="Téléchargements"
        sousTitre={`Événements chargés par les bornes · ${f.du === f.au ? `le ${jour(f.du)}` : `du ${jour(f.du)} au ${jour(f.au)}`}${charge ? " · mise à jour…" : ""}`}
        actions={
          <>
            <select id="tel-etat" aria-label="Étape" className="champ !w-auto" value={etat} onChange={(e) => setEtat(e.target.value)}>
              <option value="">Toutes les étapes</option>
              {(Object.keys(ETATS) as Etat[]).map((e) => (
                <option key={e} value={e}>
                  {ETATS[e].libelle}
                </option>
              ))}
            </select>
            <select id="tel-declencheur" aria-label="Déclencheur" className="champ !w-auto" value={declencheur} onChange={(e) => setDeclencheur(e.target.value)}>
              <option value="">Auto et manuel</option>
              <option value="AUTO">Automatique</option>
              <option value="MANUEL">Manuel (code tapé)</option>
            </select>
            <FiltresPage f={f} prefixe="tel" />
          </>
        }
      />

      <JournalTelechargements
        filtres={filtres}
        vide={<>Aucun téléchargement sur cette période avec ces filtres. Une ligne s&apos;ajoute quand une borne demande, reçoit ou installe le zip d&apos;un événement.</>}
      />
    </>
  );
}

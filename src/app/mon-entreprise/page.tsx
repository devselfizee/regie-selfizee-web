"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageGuard, usePerm } from "@/lib/perms";
import { Chargement, EnTete, Erreur, Section } from "@/components/Etat";
import { ComptesEntreprise, type DonneesComptes } from "@/components/ComptesEntreprise";

// « Mon entreprise » (option 2 du 20/11/2026) : le client admin invite ses collègues, choisit leur profil et les lieux
// qu'ils voient, parmi ceux de son entreprise.

interface MonEntreprise extends DonneesComptes {
  id: number;
  nom: string;
  moiId: number;
}

export default function PageMonEntreprise() {
  return (
    <PageGuard perm="pages.mon_entreprise.view">
      <Contenu />
    </PageGuard>
  );
}

function Contenu() {
  const gere = usePerm("comptes_entreprise.manage");
  const cle = ["mon-entreprise"];
  const { data, error } = useQuery({ queryKey: cle, queryFn: () => api<MonEntreprise>("/mon-entreprise"), enabled: gere });
  if (!gere) return <Erreur erreur="Votre profil ne permet pas de gérer les comptes de l'entreprise." />;
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  return (
    <>
      <EnTete titre={data.nom} sousTitre={`Les comptes de votre entreprise · ${data.lieux.length} lieu${data.lieux.length > 1 ? "x" : ""}`} />
      <Section titre="Comptes">
        <ComptesEntreprise base="/mon-entreprise" cle={cle} donnees={data} moiId={data.moiId} peutGerer />
      </Section>
    </>
  );
}

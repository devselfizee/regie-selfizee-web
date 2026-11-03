"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type LieuFiche } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Chargement, EnTete, Erreur } from "@/components/Etat";
import { TarifsDuLieu } from "@/components/GrilleTarifs";

// Configuration → Tarif du lieu : la grille reprise par chaque événement de la borne (sauf ceux qui ont
// leurs propres tarifs). Même éditeur que l'onglet Informations de la fiche lieu.

export function TarifLieu({ id }: { id: number }) {
  return (
    <Reserve roles={["ADMIN"]}>
      <Contenu id={id} />
    </Reserve>
  );
}

function Contenu({ id }: { id: number }) {
  const lieu = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  if (lieu.error) return <Erreur erreur={lieu.error} />;
  if (!lieu.data) return <Chargement />;
  return (
    <>
      <EnTete
        titre={`Tarif du lieu · ${lieu.data.enseigne}`}
        sousTitre="Repris par chaque événement de la borne, sauf ceux qui ont leurs propres tarifs."
        actions={<Link href={`/lieux/${id}?onglet=configuration`} className="bouton-second">← Configuration</Link>}
      />
      <TarifsDuLieu lieuId={id} />
    </>
  );
}

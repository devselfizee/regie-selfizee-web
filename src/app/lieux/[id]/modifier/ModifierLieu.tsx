"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type LieuFiche } from "@/lib/api";
import { FormLieu } from "@/components/FormLieu";
import { Chargement, EnTete, Erreur } from "@/components/Etat";

export function ModifierLieu({ id }: { id: number }) {
  const { data, error } = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  return (
    <>
      <EnTete titre={`Modifier · ${data.enseigne}`} />
      <FormLieu lieu={data} />
    </>
  );
}

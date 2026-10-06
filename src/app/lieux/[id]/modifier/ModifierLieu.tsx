"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type LieuFiche } from "@/lib/api";
import { FormLieu } from "@/components/FormLieu";
import { Chargement, EnTete, Erreur } from "@/components/Etat";
import { Reserve } from "@/lib/session";

export function ModifierLieu({ id }: { id: number }) {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL"]}>
      <Modifier id={id} />
    </Reserve>
  );
}

function Modifier({ id }: { id: number }) {
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

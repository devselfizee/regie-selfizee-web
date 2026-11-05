"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type LieuFiche } from "@/lib/api";
import { FormLieu } from "@/components/FormLieu";
import { CommunicationLieu } from "@/components/CommunicationLieu";
import { Chargement, EnTete, Erreur } from "@/components/Etat";
import { parametreUrl } from "@/lib/format";
import { peut, Reserve, useMoi } from "@/lib/session";

// Édition d'un lieu : onglet « Fiche » (identité, segment, activité, contacts…) et, pour les admins,
// onglet « Communication » (nom affiché, avis, réseaux, assistance : repris par la borne et la page
// souvenir), chacun enregistré à part. ?onglet=communication ouvre le second.

type Onglet = "fiche" | "communication";

export function ModifierLieu({ id, ongletInitial }: { id: number; ongletInitial?: string }) {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL"]}>
      <Modifier id={id} ongletInitial={ongletInitial} />
    </Reserve>
  );
}

function Modifier({ id, ongletInitial }: { id: number; ongletInitial?: string }) {
  const moi = useMoi();
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial === "communication" ? "communication" : "fiche");
  const { data, error } = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  const onglets: { cle: Onglet; libelle: string }[] = [
    { cle: "fiche", libelle: "Fiche" },
    ...(peut.administrer(moi.role) ? [{ cle: "communication" as const, libelle: "Communication" }] : []),
  ];
  const actif = onglets.some((o) => o.cle === onglet) ? onglet : "fiche";
  return (
    <>
      <EnTete titre={`Modifier · ${data.enseigne}`} />
      {onglets.length > 1 && (
        <nav className="mb-6 flex gap-1 border-b border-line" aria-label="Parties de la fiche à modifier">
          {onglets.map((o) => (
            <button
              key={o.cle}
              type="button"
              aria-current={actif === o.cle ? "page" : undefined}
              onClick={() => {
                setOnglet(o.cle);
                parametreUrl("onglet", o.cle === "fiche" ? null : o.cle);
              }}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${actif === o.cle ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink"}`}
            >
              {o.libelle}
            </button>
          ))}
        </nav>
      )}
      {actif === "fiche" ? <FormLieu lieu={data} /> : <CommunicationLieu lieuId={id} />}
    </>
  );
}

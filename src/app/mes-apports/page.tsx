"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { jour } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { MoisApports, SyntheseApports, type TableauApport } from "@/components/TableauApports";

// Apporteur d'affaires (demande du 17/11/2026) : son point mensuel, et rien d'autre (ni photos, ni fiches lieux).

interface MesApports extends TableauApport {
  lieux: { id: number; enseigne: string; ville: string | null; taux: string; dateDebut: string; dateFin: string | null }[];
}

export default function PageMesApports() {
  return (
    <PageGuard perm="pages.mes_apports.view">
      <MesApports />
    </PageGuard>
  );
}

function MesApports() {
  const { data, error, isPending } = useQuery({ queryKey: ["apporteurs", "moi"], queryFn: () => api<MesApports>("/apporteurs/moi") });
  return (
    <>
      <EnTete
        titre="Mes apports"
        sousTitre="Le chiffre d'affaires généré par les lieux que vous avez apportés et la commission qui vous revient, mois par mois. Le mois en cours se complète au fil des ventes ; les mois terminés sont définitifs."
      />
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.lieux.length && <Vide>Aucun lieu ne vous est encore rattaché. Rapprochez-vous de Selfizee.</Vide>}
      {data && data.lieux.length > 0 && (
        <>
          <SyntheseApports t={data} />
          <p className="mb-3 text-xs text-ink-2">
            {data.lieux.map((l, i) => (
              <span key={l.id}>
                {i > 0 && " · "}
                <strong>{l.enseigne}</strong>
                {l.ville && ` (${l.ville})`} : {l.taux} depuis le {jour(l.dateDebut)}
                {l.dateFin && ` jusqu'au ${jour(l.dateFin)}`}
              </span>
            ))}
          </p>
          <MoisApports t={data} />
        </>
      )}
    </>
  );
}

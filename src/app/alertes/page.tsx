"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type Alerte, type NiveauAlerte } from "@/lib/api";
import { Reserve, useMoi } from "@/lib/session";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { ListeAlertes, NIVEAUX } from "@/components/ListeAlertes";

const ONGLETS = [
  { cle: "ouvertes", libelle: "Ouvertes", statut: "NOUVELLE,PRISE_EN_CHARGE" },
  { cle: "resolues", libelle: "Résolues", statut: "RESOLUE" },
  { cle: "ignorees", libelle: "Ignorées", statut: "IGNOREE" },
];

export default function PageAlertes() {
  return (
    <Reserve roles={["ADMIN", "TECHNICIEN", "COMMERCIAL"]}>
      <Alertes />
    </Reserve>
  );
}

function Alertes() {
  const moi = useMoi();
  const client = useQueryClient();
  const [onglet, setOnglet] = useState(ONGLETS[0]);
  const [niveau, setNiveau] = useState<NiveauAlerte | "">("");
  const query = qs({ statut: onglet.statut, niveau });
  const { data, error, isPending } = useQuery({
    queryKey: ["alertes", query],
    queryFn: () => api<Alerte[]>(`/alertes${query}`),
    refetchInterval: 60_000,
  });
  const evaluer = useMutation({
    mutationFn: () => api<{ creees: number; resolues: number }>("/alertes/evaluer", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["alertes"] }),
  });

  return (
    <>
      <EnTete
        titre="Alertes"
        sousTitre="Chaque lieu est comparé à son propre historique, uniquement sur ses jours et heures d'ouverture. Vérification toutes les 15 minutes."
        actions={
          moi.role === "ADMIN" ? (
            <button className="bouton-second" disabled={evaluer.isPending} onClick={() => evaluer.mutate()}>
              {evaluer.isPending ? "Vérification…" : "Vérifier maintenant"}
            </button>
          ) : undefined
        }
      />
      {evaluer.data && (
        <p className="mb-3 text-sm text-ink-2">
          {evaluer.data.creees} nouvelle(s) alerte(s), {evaluer.data.resolues} résolue(s) automatiquement.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            onClick={() => setOnglet(o)}
            className={`rounded-md px-3 py-2 text-sm ${onglet.cle === o.cle ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}
          >
            {o.libelle}
          </button>
        ))}
        <select className="champ ml-auto !w-auto" value={niveau} onChange={(e) => setNiveau(e.target.value as NiveauAlerte | "")} aria-label="Niveau">
          <option value="">Tous les niveaux</option>
          {(Object.keys(NIVEAUX) as NiveauAlerte[]).map((n) => (
            <option key={n} value={n}>{NIVEAUX[n].libelle}</option>
          ))}
        </select>
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.length && <Vide>{onglet.cle === "ouvertes" ? "Aucune alerte ouverte. Tout va bien." : "Rien dans cette liste."}</Vide>}
      {data && data.length > 0 && (
        <div className="carte px-4">
          <ListeAlertes alertes={data} />
        </div>
      )}
    </>
  );
}

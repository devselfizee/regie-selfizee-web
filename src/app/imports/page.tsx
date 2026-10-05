"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type ErreurImport } from "@/lib/api";
import { dateHeure } from "@/lib/format";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";

const LIBELLES: Record<string, string> = {
  SCHEMA_INVALIDE: "JSON non conforme",
  CLE_INVALIDE: "Clé API invalide",
  BORNE_DIFFERENTE: "Borne ≠ clé",
  BORNE_REFORMEE: "Borne réformée",
  MODULE_INCONNU: "Module inconnu",
  DEVISE_NON_GEREE: "Devise non gérée",
  CONFLIT_DOUBLON: "Doublon différent",
};

export default function Imports() {
  const [statut, setStatut] = useState("NOUVELLE");
  const [ouverte, setOuverte] = useState<string | null>(null);
  const client = useQueryClient();
  const { data, error, isPending } = useQuery({
    queryKey: ["imports-erreurs", statut],
    queryFn: () => api<{ total: number; erreurs: ErreurImport[] }>(`/imports/erreurs${qs({ statut })}`),
  });
  const changer = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: string }) => api(`/imports/erreurs/${id}`, { method: "PATCH", json: { statut } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["imports-erreurs"] }),
  });

  return (
    <>
      <EnTete titre="File d'erreurs d'import" sousTitre="Lots et transactions rejetés à l'ingestion, avec leur motif. Rien n'est perdu : le JSON reçu est conservé." />
      <div className="mb-4 flex gap-1" role="group" aria-label="Statut">
        {[
          ["NOUVELLE", "À traiter"],
          ["RETRAITEE", "Retraitées"],
          ["IGNOREE", "Ignorées"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setStatut(k)} className={`rounded-md px-3 py-2 text-sm ${statut === k ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}>
            {l}
          </button>
        ))}
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.erreurs.length && <Vide>Aucune erreur dans cette liste.</Vide>}
      {data && data.erreurs.length > 0 && (
        <div className="carte divide-y divide-line">
          {data.erreurs.map((e) => (
            <div key={e.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge ton={e.code === "CLE_INVALIDE" || e.code === "CONFLIT_DOUBLON" ? "crit" : "warn"}>{LIBELLES[e.code] ?? e.code}</Badge>
                    <span className="text-sm font-medium">{e.import.borneIdentifiant ?? "borne inconnue"}</span>
                    <span className="text-xs text-ink-muted">{dateHeure(e.createdAt)} · lot #{e.import.id}{e.transactionIdModule && ` · transaction ${e.transactionIdModule}`}</span>
                  </div>
                  <p className="mt-1 break-words text-sm text-ink-2">{e.message}</p>
                </div>
                <div className="flex gap-1">
                  <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setOuverte(ouverte === e.id ? null : e.id)}>
                    {ouverte === e.id ? "Masquer" : "Voir le JSON"}
                  </button>
                  {statut === "NOUVELLE" ? (
                    <>
                      <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => changer.mutate({ id: e.id, statut: "RETRAITEE" })}>Traitée</button>
                      <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => changer.mutate({ id: e.id, statut: "IGNOREE" })}>Ignorer</button>
                    </>
                  ) : (
                    <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => changer.mutate({ id: e.id, statut: "NOUVELLE" })}>Rouvrir</button>
                  )}
                </div>
              </div>
              {ouverte === e.id && (
                <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-surface-2 p-3 text-xs">{JSON.stringify(e.payload, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

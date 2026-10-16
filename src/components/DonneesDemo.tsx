"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { nombre } from "@/lib/format";
import { Badge, Chargement, Erreur } from "./Etat";

interface EtatDemo {
  present: boolean;
  lieux: number;
  bornes: number;
  ventes: number;
}

/** Paramètres : générer des données de démonstration, puis les effacer avant la mise en service. */
export function DonneesDemo() {
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const { data: etat, error } = useQuery({ queryKey: ["demo"], queryFn: () => api<EtatDemo>("/demo") });
  // Les données de démo touchent toutes les pages : on recharge tout
  const toutRecharger = () => client.invalidateQueries();

  const generer = useMutation({
    mutationFn: () => api<EtatDemo & { ventesCreees: number }>("/demo", { method: "POST" }),
    onSuccess: (r) => {
      setMessage(`Données créées : ${r.lieux} lieux (dont un prospect), ${r.bornes} bornes, ${nombre(r.ventesCreees)} ventes sur 90 jours.`);
      toutRecharger();
    },
  });
  const effacer = useMutation({
    mutationFn: () => api<{ lieux: number; bornes: number; ventes: number }>("/demo", { method: "DELETE" }),
    onSuccess: (r) => {
      setMessage(`Effacé : ${r.lieux} lieux, ${r.bornes} bornes, ${nombre(r.ventes)} ventes. Les vraies données n'ont pas été touchées.`);
      toutRecharger();
    },
  });
  const occupe = generer.isPending || effacer.isPending;

  return (
    <section className="carte p-4">
      <h2 className="text-base font-semibold">Données de démonstration</h2>
      <p className="mb-4 text-sm text-ink-2">
        Pour montrer l&apos;application avant l&apos;arrivée des vraies bornes : 4 lieux équipés avec 90 jours de ventes (tous les cas du schéma 1.1 :
        QR, offerts, expirés, séances gratuites…), contrats et reversements, alertes, SAV, événements, un prospect et une borne en stock. Tout est
        marqué « [DÉMO] » (lieux) ou « DEMO- » (bornes), et s&apos;efface d&apos;un clic sans toucher aux vraies données.
      </p>

      {error && <Erreur erreur={error} />}
      {!etat && !error && <Chargement />}
      {etat && (
        <div className="space-y-4">
          <div className="text-sm">
            {etat.present ? (
              <Badge ton="warn">
                Présentes : {etat.lieux} lieux, {etat.bornes} bornes, {nombre(etat.ventes)} ventes
              </Badge>
            ) : (
              <Badge ton="neutre">Aucune donnée de démonstration</Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="bouton" disabled={occupe || etat.present} onClick={() => { setMessage(null); generer.mutate(); }}>
              {generer.isPending ? "Création… (jusqu'à une minute)" : "Créer les données de démonstration"}
            </button>
            <button
              className="bouton-second text-bad"
              disabled={occupe || !etat.present}
              onClick={() =>
                confirm(
                  `Effacer les données de démonstration (${etat.lieux} lieux, ${etat.bornes} bornes, ${etat.ventes} ventes) ?\n\nSeules les données marquées « démo » sont supprimées. C'est définitif.`
                ) && (setMessage(null), effacer.mutate())
              }
            >
              {effacer.isPending ? "Effacement…" : "Effacer les données de démonstration"}
            </button>
          </div>

          {(generer.error || effacer.error) && <Erreur erreur={generer.error ?? effacer.error} />}
          {message && <p className="text-sm text-good">{message}</p>}
          <p className="text-xs text-ink-muted">
            À effacer avant de brancher les vraies bornes, pour que les statistiques, les commissions et les reversements ne mélangent pas les deux.
            Les créations et effacements sont tracés dans le journal d&apos;audit.
          </p>
        </div>
      )}
    </section>
  );
}

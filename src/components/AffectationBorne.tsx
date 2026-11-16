"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type LieuListe } from "@/lib/api";
import { dateHeure } from "@/lib/format";
import { ChoixLieu } from "@/components/ChoixLieu";

/** Ce que les formulaires d'affectation ont besoin de savoir d'une borne (liste ou fiche). */
export interface BornePourAffectation {
  id: number;
  identifiant: string;
  lieuActuel: { id: number; enseigne: string } | null;
  affectationActuelle: { id: number } | null;
  ventesSansLieu: { nb: number; du: string; au: string } | null;
}

const versIso = (local: string) => new Date(local).toISOString();
const maintenantLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Date ISO → valeur d'un champ datetime-local (heure locale) ; debutJour : à 00:00 */
function localDe(iso: string, debutJour = false): string {
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${debutJour ? "00:00" : `${deux(d.getHours())}:${deux(d.getMinutes())}`}`;
}

function MessageErreur({ erreur }: { erreur: Error | null }) {
  return erreur ? <p role="alert" className="text-sm text-bad">{erreur.message}</p> : null;
}

/** Affecter une borne à un lieu, ou la déplacer (l'affectation en cours est clôturée à la date choisie). */
export function FormAffectation({ borne, onFini }: { borne: BornePourAffectation; onFini: () => void }) {
  const client = useQueryClient();
  const { data: lieux } = useQuery({ queryKey: ["lieux", ""], queryFn: () => api<LieuListe[]>("/lieux") });
  const [lieuId, setLieuId] = useState("");
  const [debut, setDebut] = useState(maintenantLocal);
  const affecter = useMutation({
    mutationFn: () => api("/affectations", { method: "POST", json: { borneId: borne.id, lieuId: Number(lieuId), debut: versIso(debut) } }),
    onSuccess: () => {
      client.invalidateQueries();
      onFini();
    },
  });

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (lieuId) affecter.mutate(); }}>
      <div>
        <label className="etiquette" htmlFor="affectation-lieu">Lieu *</label>
        <ChoixLieu
          id="affectation-lieu"
          lieux={(lieux ?? []).filter((l) => l.id !== borne.lieuActuel?.id)}
          valeur={lieuId}
          onChange={setLieuId}
          tous="Choisir un lieu"
        />
      </div>
      {borne.ventesSansLieu && (
        <div className="rounded-md bg-warn-bg p-3 text-sm text-warn-ink">
          <strong>{borne.ventesSansLieu.nb} vente{borne.ventesSansLieu.nb > 1 ? "s" : ""} sans lieu</strong> du {dateHeure(borne.ventesSansLieu.du)} au{" "}
          {dateHeure(borne.ventesSansLieu.au)}. Pour les rattacher à ce lieu, la borne doit y être arrivée avant la première.
          <button type="button" className="mt-1 block font-medium underline" onClick={() => setDebut(localDe(borne.ventesSansLieu!.du, true))}>
            Commencer le jour de la première vente
          </button>
        </div>
      )}
      <label className="block">
        <span className="etiquette">À partir du *</span>
        <input className="champ" type="datetime-local" required value={debut} onChange={(e) => setDebut(e.target.value)} />
      </label>
      <p className="text-xs text-ink-2">
        {borne.lieuActuel && <>L&apos;affectation à <strong>{borne.lieuActuel.enseigne}</strong> sera clôturée à cette date. </>}
        Les ventes déjà reçues après cette date seront rattachées au nouveau lieu, avec les statistiques et les commissions.
      </p>
      <MessageErreur erreur={affecter.error} />
      <button className="bouton" disabled={affecter.isPending || !lieuId}>Valider</button>
    </form>
  );
}

/** Retirer la borne de son lieu actuel. */
export function FormRetrait({ borne, onFini }: { borne: BornePourAffectation; onFini: () => void }) {
  const client = useQueryClient();
  const [fin, setFin] = useState(maintenantLocal);
  const retirer = useMutation({
    mutationFn: () => api(`/affectations/${borne.affectationActuelle!.id}`, { method: "PATCH", json: { fin: versIso(fin) } }),
    onSuccess: () => {
      client.invalidateQueries();
      onFini();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); retirer.mutate(); }}>
      <p className="text-sm">
        Retirer <strong>{borne.identifiant}</strong> de <strong>{borne.lieuActuel?.enseigne}</strong>. Les ventes reçues après cette date ne seront rattachées à aucun lieu (et signalées).
      </p>
      <label className="block">
        <span className="etiquette">Date de retrait *</span>
        <input className="champ" type="datetime-local" required value={fin} onChange={(e) => setFin(e.target.value)} />
      </label>
      <MessageErreur erreur={retirer.error} />
      <button className="bouton" disabled={retirer.isPending}>Retirer la borne</button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Alerte, type NiveauAlerte, type StatutAlerte } from "@/lib/api";
import { dateHeure } from "@/lib/format";
import { Badge } from "./Etat";

export const NIVEAUX: Record<NiveauAlerte, { libelle: string; ton: "crit" | "warn" | "neutre" }> = {
  CRITIQUE: { libelle: "Critique", ton: "crit" },
  WARNING: { libelle: "Warning", ton: "warn" },
  INFO: { libelle: "Info", ton: "neutre" },
};

const STATUTS: Record<StatutAlerte, string> = {
  NOUVELLE: "Nouvelle",
  PRISE_EN_CHARGE: "Prise en charge",
  RESOLUE: "Résolue",
  IGNOREE: "Ignorée",
};

/** Liste d'alertes avec leurs actions (prise en charge, résolution, commentaire). */
export function ListeAlertes({ alertes, compacte = false }: { alertes: Alerte[]; compacte?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {alertes.map((a) => (
        <LigneAlerte key={a.id} a={a} compacte={compacte} />
      ))}
    </ul>
  );
}

function LigneAlerte({ a, compacte }: { a: Alerte; compacte: boolean }) {
  const client = useQueryClient();
  const [commentaire, setCommentaire] = useState(a.commentaire ?? "");
  const [edition, setEdition] = useState(false);
  const maj = useMutation({
    mutationFn: (patch: { statut?: StatutAlerte; commentaire?: string | null }) => api(`/alertes/${a.id}`, { method: "PATCH", json: patch }),
    onSuccess: () => {
      setEdition(false);
      client.invalidateQueries({ queryKey: ["alertes"] });
    },
  });
  const ouverte = a.statut === "NOUVELLE" || a.statut === "PRISE_EN_CHARGE";

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge ton={NIVEAUX[a.niveau].ton}>{NIVEAUX[a.niveau].libelle}</Badge>
            <span className="text-sm font-medium">{a.libelleType}</span>
            {!ouverte && <span className="text-xs text-ink-muted">· {STATUTS[a.statut]}</span>}
            {a.statut === "PRISE_EN_CHARGE" && a.assignee && (
              <span className="text-xs text-ink-2">· prise en charge par {[a.assignee.prenom, a.assignee.nom].filter(Boolean).join(" ")}</span>
            )}
          </div>
          <p className="mt-1 text-sm">{a.message}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {dateHeure(a.detecteeLe)}
            {!compacte && a.lieu && (
              <> · <Link className="text-accent hover:underline" href={`/lieux/${a.lieu.id}`}>{a.lieu.enseigne}</Link></>
            )}
            {a.borne && <> · {a.borne.identifiant}</>}
          </p>
          {a.commentaire && !edition && <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-xs text-ink-2">Commentaire : {a.commentaire}</p>}
          {edition && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                maj.mutate({ commentaire: commentaire || null });
              }}
            >
              <input className="champ" autoFocus value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Ce qui a été fait, cause trouvée…" />
              <button className="bouton-second !py-1 text-xs">Enregistrer</button>
            </form>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {a.statut === "NOUVELLE" && (
            <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => maj.mutate({ statut: "PRISE_EN_CHARGE" })}>Je m&apos;en occupe</button>
          )}
          {ouverte && (
            <>
              <button className="bouton !px-2 !py-1 text-xs" onClick={() => maj.mutate({ statut: "RESOLUE" })}>Résolue</button>
              <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => maj.mutate({ statut: "IGNOREE" })}>Ignorer</button>
            </>
          )}
          {!ouverte && (
            <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => maj.mutate({ statut: "NOUVELLE" })}>Rouvrir</button>
          )}
          <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setEdition(!edition)}>Commenter</button>
        </div>
      </div>
      {maj.error && <p className="mt-1 text-xs text-bad">{maj.error.message}</p>}
    </li>
  );
}

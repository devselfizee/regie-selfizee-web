"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ErreurApi, type ReleveReversement } from "@/lib/api";
import { dateHeure } from "@/lib/format";

const ROLES: Record<string, string> = {
  GERANT: "Gérant",
  REFERENT_SUR_PLACE: "Référent",
  COMPTABILITE: "Comptabilité",
  AUTRE: "Contact",
};

/** Envoi du relevé PDF par e-mail : contacts de la fiche lieu (cochés par défaut : comptabilité, sinon gérant) + adresses libres. */
export function EnvoiReleve({ r, onFini }: { r: ReleveReversement; onFini: () => void }) {
  const client = useQueryClient();
  const [coches, setCoches] = useState<string[]>(r.destinatairesParDefaut ?? []);
  const [autres, setAutres] = useState("");
  const [message, setMessage] = useState("");
  const destinataires = [
    ...new Set([...coches, ...autres.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))]),
  ];
  const envoyer = useMutation({
    mutationFn: () => api(`/reversements/${r.id}/envoyer`, { method: "POST", json: { destinataires, message: message || null } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["releve", r.id] });
      client.invalidateQueries({ queryKey: ["reversements"] });
      onFini();
    },
  });

  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); envoyer.mutate(); }}>
      {r.envoyeLe && <p className="rounded-md bg-surface-2 p-2 text-xs text-ink-2">Déjà envoyé le {dateHeure(r.envoyeLe)}. Un nouvel envoi remplacera cette date.</p>}
      <fieldset>
        <legend className="etiquette">Contacts du lieu</legend>
        {r.contactsEmail?.length ? (
          <div className="space-y-1">
            {r.contactsEmail.map((c) => (
              <label key={c.email} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={coches.includes(c.email.toLowerCase())}
                  onChange={(e) => setCoches(e.target.checked ? [...coches, c.email.toLowerCase()] : coches.filter((x) => x !== c.email.toLowerCase()))}
                />
                <span>{[c.prenom, c.nom].filter(Boolean).join(" ")} <span className="text-ink-muted">· {ROLES[c.role] ?? c.role} · {c.email}</span></span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">Aucun contact avec e-mail sur la fiche du lieu. Ajoutez-en un (rôle Comptabilité) pour les prochains envois.</p>
        )}
      </fieldset>
      <label className="block">
        <span className="etiquette">Autres destinataires</span>
        <input className="champ" value={autres} onChange={(e) => setAutres(e.target.value)} placeholder="adresse@exemple.fr, autre@exemple.fr" />
      </label>
      <label className="block">
        <span className="etiquette">Message (optionnel)</span>
        <textarea className="champ min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <p className="text-xs text-ink-2">Le relevé est joint en PDF. {destinataires.length ? `Envoi à : ${destinataires.join(", ")}` : "Aucun destinataire sélectionné."}</p>
      {envoyer.error && (
        <p role="alert" className="text-bad">
          {envoyer.error instanceof ErreurApi && envoyer.error.corps.error === "ENVOI_NON_CONFIGURE"
            ? "L'envoi d'e-mails n'est pas encore configuré (identifiants Mailjet à renseigner sur l'API)."
            : envoyer.error.message}
        </p>
      )}
      <button className="bouton" disabled={!destinataires.length || envoyer.isPending}>{envoyer.isPending ? "Envoi…" : "Envoyer le relevé"}</button>
    </form>
  );
}

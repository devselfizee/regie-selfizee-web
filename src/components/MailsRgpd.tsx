"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePerm } from "@/lib/perms";
import { Badge, Chargement, Erreur } from "./Etat";
import { Modale } from "./Modale";

// Mails de la plateforme RGPD (rgpd.orkessi.com) envoyés par la Régie : lien d'accès aux données, notification interne
// des suppressions et modifications. Sujet, corps en texte riche (nettoyé par l'API) et variables {{…}}.

interface ModeleMail {
  cle: string;
  nom: string;
  description: string;
  avecDestinataires: boolean;
  variables: { nom: string; description: string }[];
  sujet: string;
  corps: string;
  destinataires: string | null;
  parDefaut: boolean;
  modifieLe: string | null;
  modifiePar: string | null;
}

export function MailsRgpd() {
  const { data, error } = useQuery({ queryKey: ["modeles-mail"], queryFn: () => api<ModeleMail[]>("/modeles-mail") });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  return (
    <div className="space-y-4">
      <section className="carte p-4 text-sm text-ink-2">
        <h2 className="mb-1 text-base font-semibold text-ink">E-mails RGPD</h2>
        Mails envoyés par la Régie pour la plateforme RGPD (consultation, export, modification et suppression des données des invités). Les variables
        entre accolades sont remplacées à l&apos;envoi : cliquez sur une variable pour l&apos;insérer à l&apos;endroit du curseur.
      </section>
      {data.map((m) => (
        <Modele key={`${m.cle}-${m.modifieLe ?? "defaut"}`} m={m} />
      ))}
    </div>
  );
}

function Modele({ m }: { m: ModeleMail }) {
  const client = useQueryClient();
  const peutModifier = usePerm("referentiel.edit");
  const editeur = useRef<HTMLDivElement>(null);
  const [sujet, setSujet] = useState(m.sujet);
  const [destinataires, setDestinataires] = useState(m.destinataires ?? "");
  const [modifie, setModifie] = useState(false);
  const [apercu, setApercu] = useState<{ sujet: string; html: string } | null>(null);
  const [essai, setEssai] = useState<string | null>(null);

  useEffect(() => {
    if (editeur.current) editeur.current.innerHTML = m.corps;
  }, [m.corps]);

  const corps = () => editeur.current?.innerHTML ?? "";
  const rafraichir = () => client.invalidateQueries({ queryKey: ["modeles-mail"] });

  const enregistrer = useMutation({
    mutationFn: () => api(`/modeles-mail/${m.cle}`, { method: "PUT", json: { sujet, corps: corps(), ...(m.avecDestinataires ? { destinataires } : {}) } }),
    onSuccess: () => {
      setModifie(false);
      rafraichir();
    },
  });
  const retablir = useMutation({
    mutationFn: () => api(`/modeles-mail/${m.cle}`, { method: "DELETE" }),
    onSuccess: rafraichir,
  });
  const voir = useMutation({
    mutationFn: () => api<{ sujet: string; html: string }>(`/modeles-mail/${m.cle}/apercu`, { method: "POST", json: { sujet, corps: corps() } }),
    onSuccess: setApercu,
  });
  const envoyerEssai = useMutation({
    mutationFn: () => api<{ envoyeA: string }>(`/modeles-mail/${m.cle}/essai`, { method: "POST" }),
    onSuccess: (r) => setEssai(r.envoyeA),
  });

  // execCommand : déprécié mais partout disponible, suffisant pour la mise en forme et l'insertion au curseur
  const commande = (c: string, valeur?: string) => {
    editeur.current?.focus();
    document.execCommand(c, false, valeur);
    setModifie(true);
  };

  return (
    <section className="carte p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{m.nom}</h3>
        {m.parDefaut ? (
          <Badge ton="neutre">Texte par défaut</Badge>
        ) : (
          <Badge ton="ok">
            Modifié{m.modifieLe ? ` le ${new Date(m.modifieLe).toLocaleDateString("fr-FR")}` : ""}
            {m.modifiePar ? ` par ${m.modifiePar}` : ""}
          </Badge>
        )}
      </div>
      <p className="mb-4 text-sm text-ink-2">{m.description}</p>

      <div className="space-y-3">
        {m.avecDestinataires && (
          <label className="block">
            <span className="etiquette">Destinataires (séparés par des virgules ; vide : aucun envoi)</span>
            <input
              className="champ"
              value={destinataires}
              disabled={!peutModifier}
              placeholder="dpo@selfizee.fr"
              onChange={(e) => {
                setDestinataires(e.target.value);
                setModifie(true);
              }}
            />
          </label>
        )}
        <label className="block">
          <span className="etiquette">Sujet</span>
          <input
            className="champ"
            value={sujet}
            maxLength={200}
            disabled={!peutModifier}
            onChange={(e) => {
              setSujet(e.target.value);
              setModifie(true);
            }}
          />
        </label>

        <div>
          <span className="etiquette">Message</span>
          {peutModifier && (
            <div className="mb-1.5 flex flex-wrap gap-1" role="toolbar" aria-label={`Mise en forme : ${m.nom}`}>
              {[
                ["bold", "G", "Gras", "font-bold"],
                ["italic", "I", "Italique", "italic"],
                ["underline", "S", "Souligné", "underline"],
                ["insertUnorderedList", "•", "Liste", ""],
              ].map(([c, l, aide, cls]) => (
                // onMouseDown : garder la sélection dans l'éditeur
                <button key={c} type="button" title={aide} aria-label={aide} className={`bouton-second !px-2.5 !py-0.5 ${cls}`} onMouseDown={(e) => { e.preventDefault(); commande(c); }}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <div
            ref={editeur}
            contentEditable={peutModifier}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline
            aria-label={`Message : ${m.nom}`}
            className="champ texte-riche min-h-40"
            onInput={() => setModifie(true)}
          />
        </div>

        <div>
          <span className="etiquette">Variables</span>
          <ul className="flex flex-wrap gap-1.5">
            {m.variables.map((v) => (
              <li key={v.nom}>
                <button
                  type="button"
                  title={v.description}
                  disabled={!peutModifier}
                  className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-xs hover:border-accent disabled:cursor-default"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commande("insertText", `{{${v.nom}}}`);
                  }}
                >
                  {`{{${v.nom}}}`}
                </button>
              </li>
            ))}
          </ul>
          <ul className="mt-1.5 space-y-0.5 text-xs text-ink-muted">
            {m.variables.map((v) => (
              <li key={v.nom}>
                <code>{`{{${v.nom}}}`}</code> : {v.description}
              </li>
            ))}
          </ul>
        </div>

        {[enregistrer.error, retablir.error, voir.error, envoyerEssai.error].filter(Boolean).map((e, i) => (
          <Erreur key={i} erreur={e} />
        ))}
        {essai && <p className="text-sm text-ok-ink">Essai envoyé à {essai}.</p>}

        <div className="flex flex-wrap gap-2">
          {peutModifier && (
            <button type="button" className="bouton" disabled={!modifie || enregistrer.isPending} onClick={() => enregistrer.mutate()}>
              {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
          <button type="button" className="bouton-second" disabled={voir.isPending} onClick={() => voir.mutate()}>
            Aperçu
          </button>
          {peutModifier && (
            <button
              type="button"
              className="bouton-second"
              disabled={modifie || envoyerEssai.isPending}
              title={modifie ? "Enregistrez d'abord : l'essai envoie le texte enregistré" : "Envoie le mail enregistré, avec des valeurs d'exemple, à votre adresse"}
              onClick={() => {
                setEssai(null);
                envoyerEssai.mutate();
              }}
            >
              {envoyerEssai.isPending ? "Envoi…" : "M'envoyer un essai"}
            </button>
          )}
          {peutModifier && !m.parDefaut && (
            <button
              type="button"
              className="bouton-second"
              disabled={retablir.isPending}
              onClick={() => {
                if (confirm("Revenir au texte par défaut ? Le texte actuel sera perdu.")) retablir.mutate();
              }}
            >
              Rétablir le texte par défaut
            </button>
          )}
        </div>
      </div>

      <Modale titre={apercu ? `Aperçu : ${apercu.sujet}` : "Aperçu"} ouverte={!!apercu} onFermer={() => setApercu(null)} large>
        {apercu && (
          // Mail rendu par l'API (valeurs d'exemple) : iframe sans script
          <iframe title="Aperçu du mail" sandbox="" srcDoc={apercu.html} className="h-[32rem] w-full rounded-md border border-line bg-white" />
        )}
      </Modale>
    </section>
  );
}

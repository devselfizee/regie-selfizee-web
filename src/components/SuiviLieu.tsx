"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CommentaireLieu, type ElementTimeline, type Mentionnable } from "@/lib/api";
import { dateHeure } from "@/lib/format";
import { useMoi } from "@/lib/session";
import { Chargement, Erreur, Vide } from "./Etat";

// Suivi de la fiche lieu (demande de Sébastien) : commentaires de l'équipe avec @mentions,
// mêlés à l'histoire du lieu (bornes, interventions, alertes, contrat…) dans une timeline.

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nomComplet = (u: { prenom: string; nom: string }) => `${u.prenom} ${u.nom}`.trim();

/** Couleur de la pastille et libellé de chaque type d'élément */
const TYPES: Record<string, { libelle: string; pastille: string }> = {
  COMMENTAIRE: { libelle: "Commentaire", pastille: "bg-accent" },
  LIEU: { libelle: "Fiche", pastille: "bg-ink-muted" },
  CONTRAT: { libelle: "Contrat", pastille: "bg-ok-ink" },
  BORNE: { libelle: "Borne", pastille: "bg-sky-500" },
  INTERVENTION: { libelle: "Intervention", pastille: "bg-warn-ink" },
  ALERTE: { libelle: "Alerte", pastille: "bg-crit-ink" },
  EVENEMENT: { libelle: "Événement", pastille: "bg-violet-500" },
  COMMISSION: { libelle: "Commission", pastille: "bg-ok-ink" },
};

type Filtre = "tout" | "commentaires" | "historique";

export function SuiviLieu({ lieuId }: { lieuId: number }) {
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const timeline = useQuery({ queryKey: ["suivi", lieuId], queryFn: () => api<ElementTimeline[]>(`/lieux/${lieuId}/timeline`) });
  const personnes = useQuery({ queryKey: ["mentionnables", lieuId], queryFn: () => api<Mentionnable[]>(`/lieux/${lieuId}/mentionnables`), staleTime: 5 * 60_000 });
  const client = useQueryClient();
  const rafraichir = () => client.invalidateQueries({ queryKey: ["suivi", lieuId] });
  // Ouvrir le suivi marque mes mentions du lieu comme lues (côté API) : le compteur du menu suit
  const charge = timeline.dataUpdatedAt;
  useEffect(() => {
    if (charge) client.invalidateQueries({ queryKey: ["mentions"] });
  }, [charge, client]);
  const ajout = useMutation({
    mutationFn: (c: { texte: string; mentionIds: number[] }) => api(`/lieux/${lieuId}/commentaires`, { method: "POST", json: c }),
    onSuccess: rafraichir,
  });

  const elements = (timeline.data ?? []).filter((e) => (filtre === "tout" ? true : filtre === "commentaires" ? e.type === "COMMENTAIRE" : e.type !== "COMMENTAIRE"));

  return (
    <div className="grid gap-6">
      <section className="carte p-4">
        <h2 className="mb-3 text-sm font-semibold">Ajouter un commentaire</h2>
        <Saisie
          personnes={personnes.data ?? []}
          envoi={ajout.isPending}
          erreur={ajout.error}
          libelle="Publier"
          onEnvoyer={(c, vider) => ajout.mutate(c, { onSuccess: vider })}
        />
      </section>

      <section className="carte p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Timeline</h2>
          <div className="flex gap-1" role="group" aria-label="Filtrer la timeline">
            {(
              [
                ["tout", "Tout"],
                ["commentaires", "Commentaires"],
                ["historique", "Historique"],
              ] as const
            ).map(([cle, libelle]) => (
              <button
                key={cle}
                type="button"
                onClick={() => setFiltre(cle)}
                aria-pressed={filtre === cle}
                className={`rounded-md px-3 py-1.5 text-sm ${filtre === cle ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}
              >
                {libelle}
              </button>
            ))}
          </div>
        </div>
        {timeline.error ? (
          <Erreur erreur={timeline.error} />
        ) : !timeline.data ? (
          <Chargement />
        ) : !elements.length ? (
          <Vide>{filtre === "commentaires" ? "Aucun commentaire pour l'instant." : "Rien à afficher."}</Vide>
        ) : (
          <ol className="relative ml-2 border-l border-line">
            {elements.map((e) => (
              <li key={e.cle} className="relative pb-5 pl-6 last:pb-0">
                <span aria-hidden className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-surface ${TYPES[e.type]?.pastille ?? "bg-ink-muted"}`} />
                {e.commentaire ? (
                  <Commentaire c={e.commentaire} personnes={personnes.data ?? []} onChange={rafraichir} />
                ) : (
                  <div>
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-muted">
                      <span>{dateHeure(e.date)}</span>
                      <span>· {TYPES[e.type]?.libelle ?? e.type}</span>
                      {e.auteur && <span>· {e.auteur}</span>}
                    </div>
                    <p className="text-sm">{e.titre}</p>
                    {e.detail && <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink-2">{e.detail}</p>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** Un commentaire : texte avec les mentions en évidence ; modifiable par son auteur (ou un admin) */
function Commentaire({ c, personnes, onChange }: { c: CommentaireLieu; personnes: Mentionnable[]; onChange: () => void }) {
  const moi = useMoi();
  const [edition, setEdition] = useState(false);
  const modifiable = c.auteur?.id === moi.id || moi.role === "ADMIN";
  const maj = useMutation({
    mutationFn: (v: { texte: string; mentionIds: number[] }) => api(`/commentaires/${c.id}`, { method: "PUT", json: v }),
    onSuccess: () => {
      setEdition(false);
      onChange();
    },
  });
  const suppression = useMutation({ mutationFn: () => api(`/commentaires/${c.id}`, { method: "DELETE" }), onSuccess: onChange });
  const mentionnes = c.mentions.map((m) => m.user);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-muted">
        <span className="font-medium text-ink">{c.auteur ? nomComplet(c.auteur) : "Utilisateur supprimé"}</span>
        <span>{dateHeure(c.createdAt)}</span>
        {c.modifieLe && <span>· modifié</span>}
        {modifiable && !edition && (
          <span className="ml-auto flex gap-3">
            <button type="button" className="hover:text-ink hover:underline" onClick={() => setEdition(true)}>
              Modifier
            </button>
            <button
              type="button"
              className="hover:text-bad hover:underline"
              disabled={suppression.isPending}
              onClick={() => confirm("Supprimer ce commentaire ?") && suppression.mutate()}
            >
              Supprimer
            </button>
          </span>
        )}
      </div>
      {edition ? (
        <div className="mt-2">
          <Saisie
            personnes={personnes}
            initial={{ texte: c.texte, mentions: mentionnes }}
            envoi={maj.isPending}
            erreur={maj.error}
            libelle="Enregistrer"
            onEnvoyer={(v) => maj.mutate(v)}
            onAnnuler={() => setEdition(false)}
          />
        </div>
      ) : (
        <div className="mt-1 rounded-md bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap">{avecMentions(c.texte, mentionnes)}</div>
      )}
    </div>
  );
}

/** Met en évidence les « @Prénom Nom » des personnes mentionnées */
function avecMentions(texte: string, mentionnes: { id: number; prenom: string; nom: string }[]): ReactNode {
  const noms = mentionnes.map((u) => `@${nomComplet(u)}`).sort((a, b) => b.length - a.length);
  if (!noms.length) return texte;
  const motif = new RegExp(`(${noms.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return texte.split(motif).map((morceau, i) =>
    noms.includes(morceau) ? (
      <span key={i} className="rounded bg-accent/15 px-0.5 font-medium text-accent">
        {morceau}
      </span>
    ) : (
      morceau
    )
  );
}

/**
 * Zone de saisie : « @ » ouvre la liste des personnes à mentionner (flèches, Entrée, Échap).
 * Ctrl+Entrée publie. Seules les mentions encore présentes dans le texte sont envoyées.
 */
function Saisie({
  personnes,
  initial,
  envoi,
  erreur,
  libelle,
  onEnvoyer,
  onAnnuler,
}: {
  personnes: Mentionnable[];
  initial?: { texte: string; mentions: { id: number; prenom: string; nom: string }[] };
  envoi: boolean;
  erreur: unknown;
  libelle: string;
  onEnvoyer: (c: { texte: string; mentionIds: number[] }, vider: () => void) => void;
  onAnnuler?: () => void;
}) {
  const moi = useMoi();
  const zone = useRef<HTMLTextAreaElement>(null);
  const [texte, setTexte] = useState(initial?.texte ?? "");
  const [mentions, setMentions] = useState<{ id: number; prenom: string; nom: string }[]>(initial?.mentions ?? []);
  // Recherche en cours après un « @ » : position du « @ » et texte tapé
  const [recherche, setRecherche] = useState<{ debut: number; q: string } | null>(null);
  const [choix, setChoix] = useState(0);

  const proposes = useMemo(() => {
    if (!recherche) return [];
    const q = sansAccents(recherche.q);
    return personnes.filter((p) => p.id !== moi.id && sansAccents(nomComplet(p)).includes(q)).slice(0, 8);
  }, [recherche, personnes, moi.id]);

  const suivreCurseur = (valeur: string, curseur: number) => {
    const avant = valeur.slice(0, curseur);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(avant);
    setRecherche(m ? { debut: curseur - m[2].length - 1, q: m[2] } : null);
    setChoix(0);
  };

  const inserer = (p: Mentionnable) => {
    if (!recherche) return;
    const fin = recherche.debut + 1 + recherche.q.length;
    const insere = `@${nomComplet(p)} `;
    const valeur = texte.slice(0, recherche.debut) + insere + texte.slice(fin);
    setTexte(valeur);
    setMentions((m) => (m.some((x) => x.id === p.id) ? m : [...m, p]));
    setRecherche(null);
    const curseur = recherche.debut + insere.length;
    requestAnimationFrame(() => {
      zone.current?.focus();
      zone.current?.setSelectionRange(curseur, curseur);
    });
  };

  const envoyer = () => {
    const t = texte.trim();
    if (!t || envoi) return;
    const mentionIds = mentions.filter((m) => t.includes(`@${nomComplet(m)}`)).map((m) => m.id);
    onEnvoyer({ texte: t, mentionIds }, () => {
      setTexte("");
      setMentions([]);
    });
  };

  return (
    <div>
      <div className="relative">
        <textarea
          ref={zone}
          value={texte}
          rows={3}
          className="champ w-full resize-y"
          placeholder="Écrire un commentaire… Tapez @ pour mentionner quelqu'un."
          aria-label="Commentaire"
          onChange={(e) => {
            setTexte(e.target.value);
            suivreCurseur(e.target.value, e.target.selectionStart);
          }}
          onClick={(e) => suivreCurseur(e.currentTarget.value, e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (recherche && proposes.length) {
              if (e.key === "ArrowDown") return (e.preventDefault(), setChoix((c) => (c + 1) % proposes.length));
              if (e.key === "ArrowUp") return (e.preventDefault(), setChoix((c) => (c - 1 + proposes.length) % proposes.length));
              if (e.key === "Enter" || e.key === "Tab") return (e.preventDefault(), inserer(proposes[choix]));
              if (e.key === "Escape") return (e.preventDefault(), setRecherche(null));
            }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              envoyer();
            }
          }}
          onBlur={() => setTimeout(() => setRecherche(null), 150)}
        />
        {recherche && proposes.length > 0 && (
          <ul role="listbox" className="absolute left-0 z-20 mt-1 w-72 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-lg">
            {proposes.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === choix}
                onMouseDown={(e) => {
                  e.preventDefault();
                  inserer(p);
                }}
                onMouseEnter={() => setChoix(i)}
                className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm ${i === choix ? "bg-surface-2" : ""}`}
              >
                <span>{nomComplet(p)}</span>
                <span className="text-xs text-ink-muted">{ROLES[p.role] ?? p.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="bouton" disabled={!texte.trim() || envoi} onClick={envoyer}>
          {envoi ? "Envoi…" : libelle}
        </button>
        {onAnnuler && (
          <button type="button" className="bouton-second" onClick={onAnnuler}>
            Annuler
          </button>
        )}
        <span className="text-xs text-ink-muted">Les personnes mentionnées sont prévenues par e-mail · Ctrl+Entrée pour publier</span>
      </div>
      {erreur ? (
        <div className="mt-2">
          <Erreur erreur={erreur} />
        </div>
      ) : null}
    </div>
  );
}

const ROLES: Record<string, string> = { ADMIN: "Administrateur", COMMERCIAL: "Commercial", TECHNICIEN: "Technicien" };

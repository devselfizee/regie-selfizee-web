"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type InfosLieuBorne, type ReponseInfosBorne } from "@/lib/api";
import { Badge, Chargement, Erreur, Section } from "./Etat";

// Onglet « Communication » de l'édition d'un lieu (ex Configuration → Infos du lieu, déplacé à la demande
// de Paul le 05/11/2026) : nom affiché, ville, avis et réseaux, assistance. Renseignés une fois pour le
// lieu, repris par chacun de ses événements (accueil de la borne, page souvenir, mails). Enregistrés à part
// de la fiche (PUT /lieux/:id/infos-borne). Les horaires, eux, sont ceux de l'onglet Fiche.

export function CommunicationLieu({ lieuId }: { lieuId: number }) {
  const infos = useQuery({ queryKey: ["infos-borne", lieuId], queryFn: () => api<ReponseInfosBorne>(`/lieux/${lieuId}/infos-borne`) });
  if (infos.error) return <Erreur erreur={infos.error} />;
  if (!infos.data) return <Chargement />;
  return <Formulaire key={infos.dataUpdatedAt} lieuId={lieuId} donnees={infos.data} />;
}

function Champ({ libelle, aide, children }: { libelle: string; aide?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="etiquette">{libelle}</span>
      {children}
      {aide && <span className="mt-1 block text-xs text-ink-muted">{aide}</span>}
    </label>
  );
}

const texte = (v: string) => (v.trim() ? v : null);

function Formulaire({ lieuId, donnees }: { lieuId: number; donnees: ReponseInfosBorne }) {
  const client = useQueryClient();
  const [i, setI] = useState<InfosLieuBorne>(donnees.infos);
  const maj = (p: Partial<InfosLieuBorne>) => setI((x) => ({ ...x, ...p }));
  const majAssistance = (p: Partial<InfosLieuBorne["assistance"]>) => setI((x) => ({ ...x, assistance: { ...x.assistance, ...p } }));
  const modifie = !donnees.enregistrees || JSON.stringify(i) !== JSON.stringify(donnees.infos);

  const enregistrer = useMutation({
    mutationFn: () => api<ReponseInfosBorne>(`/lieux/${lieuId}/infos-borne`, { method: "PUT", json: { infos: i } }),
    onSuccess: (d) => {
      client.setQueryData(["infos-borne", lieuId], d);
      // Les fiches événement affichent les réglages avec ces infos
      client.invalidateQueries({ queryKey: ["evenement-lieu", lieuId] });
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer.mutate();
      }}
    >
      <p className="text-sm text-ink-2">Reprises par chaque événement de la borne : l&apos;accueil de la borne, la page souvenir et les mails.</p>
      {!donnees.enregistrees && (
        <p className="rounded-md bg-surface-2 p-3 text-sm text-ink-2">
          Pas encore enregistrées pour le lieu : elles reprennent celles de l&apos;événement par défaut. Vérifiez-les puis enregistrez.
        </p>
      )}

      <Section titre="Identité">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="Nom affiché *" aide="Sur l'accueil de la borne, la page souvenir et les mails.">
            <input className="champ" required value={i.nom} onChange={(e) => maj({ nom: e.target.value })} />
          </Champ>
          <Champ libelle="Ville">
            <input className="champ" value={i.ville ?? ""} onChange={(e) => maj({ ville: texte(e.target.value) })} />
          </Champ>
        </div>
      </Section>

      <Section titre="Avis et réseaux">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Champ libelle="Lien d'avis Google" aide="Bouton « Je laisse mon avis » du mail de livraison ; sans lien, le bloc n'apparaît pas.">
              <input className="champ" type="url" placeholder="https://g.page/r/…/review" value={i.avisGoogleUrl ?? ""} onChange={(e) => maj({ avisGoogleUrl: texte(e.target.value) })} />
            </Champ>
          </div>
          <Champ libelle="Instagram du lieu" aide="Vide : le compte Selfizee.">
            <input className="champ" placeholder="@lieu" value={i.instagram ?? ""} onChange={(e) => maj({ instagram: texte(e.target.value) })} />
          </Champ>
          <Champ libelle="TikTok du lieu" aide="Vide : le compte Selfizee.">
            <input className="champ" placeholder="@lieu" value={i.tiktok ?? ""} onChange={(e) => maj({ tiktok: texte(e.target.value) })} />
          </Champ>
          <Champ libelle="À tagger dans les partages" aide="Vide : @selfizee.">
            <input className="champ" placeholder="@selfizee" value={i.hashtag ?? ""} onChange={(e) => maj({ hashtag: texte(e.target.value) })} />
          </Champ>
        </div>
      </Section>

      <Section titre="Assistance">
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ libelle="Assurée par">
            <select className="champ" value={i.assistance.proprietaire} onChange={(e) => majAssistance({ proprietaire: e.target.value as "selfizee" | "client" })}>
              <option value="selfizee">Selfizee</option>
              <option value="client">Le client</option>
            </select>
          </Champ>
          <Champ libelle="Téléphone" aide="Vide : le numéro intégré au logiciel.">
            <input className="champ" type="tel" value={i.assistance.telephone ?? ""} onChange={(e) => majAssistance({ telephone: texte(e.target.value) })} />
          </Champ>
          <Champ libelle="E-mail" aide="Vide : contact@selfizee.fr.">
            <input className="champ" type="email" value={i.assistance.email ?? ""} onChange={(e) => majAssistance({ email: texte(e.target.value) })} />
          </Champ>
        </div>
      </Section>

      {enregistrer.error && <Erreur erreur={enregistrer.error} />}
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-page/95 py-3 backdrop-blur">
        <button type="submit" className="bouton" disabled={!i.nom.trim() || !modifie || enregistrer.isPending}>
          {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {enregistrer.isSuccess && !modifie && <Badge ton="ok">Enregistré : les événements du lieu les reprennent</Badge>}
      </div>
    </form>
  );
}

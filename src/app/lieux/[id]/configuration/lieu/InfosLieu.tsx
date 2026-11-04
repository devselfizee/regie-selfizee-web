"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type InfosLieuBorne, type LieuFiche, type ReponseInfosBorne } from "@/lib/api";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Section } from "@/components/Etat";
import { FilAriane } from "@/components/FilAriane";
import { JOURS_SEMAINE } from "@/lib/format";

// Configuration → Infos du lieu : nom affiché, ville, avis et réseaux, assistance, horaires. Renseignées
// une fois pour le lieu, reprises par chacun de ses événements (la borne, la page souvenir, les mails).

export function InfosLieu({ id }: { id: number }) {
  return (
    <Reserve roles={["ADMIN"]}>
      <Chargeur id={id} />
    </Reserve>
  );
}

function Chargeur({ id }: { id: number }) {
  const lieu = useQuery({ queryKey: ["lieu", id], queryFn: () => api<LieuFiche>(`/lieux/${id}`) });
  const infos = useQuery({ queryKey: ["infos-borne", id], queryFn: () => api<ReponseInfosBorne>(`/lieux/${id}/infos-borne`) });
  if (lieu.error || infos.error) return <Erreur erreur={lieu.error ?? infos.error} />;
  if (!lieu.data || !infos.data) return <Chargement />;
  return <Formulaire key={infos.dataUpdatedAt} lieuId={id} enseigne={lieu.data.enseigne} donnees={infos.data} />;
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

function Formulaire({ lieuId, enseigne, donnees }: { lieuId: number; enseigne: string; donnees: ReponseInfosBorne }) {
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
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer.mutate();
      }}
    >
      <FilAriane lieuId={lieuId} enseigne={enseigne} page="Infos du lieu" />
      <EnTete
        titre="Infos du lieu"
        sousTitre="Reprises par chaque événement de la borne : l'accueil de la borne, la page souvenir et les mails."
        actions={
          <button type="submit" className="bouton" disabled={!i.nom.trim() || !modifie || enregistrer.isPending}>
            {enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        }
      />
      {!donnees.enregistrees && (
        <p className="mb-4 rounded-md bg-surface-2 p-3 text-sm text-ink-2">
          Pas encore enregistrées pour le lieu : elles reprennent celles de l&apos;événement par défaut. Vérifiez-les puis enregistrez.
        </p>
      )}
      {enregistrer.error && <div className="mb-4"><Erreur erreur={enregistrer.error} /></div>}
      {enregistrer.isSuccess && !modifie && <p className="mb-4"><Badge ton="ok">Enregistré : les événements du lieu les reprennent</Badge></p>}

      <div className="space-y-4">
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

        <Section titre="Horaires d'ouverture" actions={<Link className="text-sm text-accent hover:underline" href={`/lieux/${lieuId}/modifier`}>Modifier dans la fiche du lieu</Link>}>
          <p className="mb-2 text-xs text-ink-muted">Ceux de la fiche du lieu (toute l&apos;année) : la borne se met en veille en dehors.</p>
          {donnees.horaires.length ? (
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {[...donnees.horaires]
                .sort((a, b) => a.jourSemaine - b.jourSemaine || a.ouverture.localeCompare(b.ouverture))
                .map((h, n) => (
                  <li key={n} className="tabular">{JOURS_SEMAINE[h.jourSemaine]} : {h.ouverture} → {h.fermeture}</li>
                ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">Aucun horaire sur la fiche du lieu.</p>
          )}
        </Section>
      </div>
    </form>
  );
}

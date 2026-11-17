"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type LieuListe } from "@/lib/api";
import { euros, jour } from "@/lib/format";
import { depuisBp, versBp } from "@/lib/commissions";
import { Gate, PageGuard, usePerm } from "@/lib/perms";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { ChoixLieu, ChoixRecherche } from "@/components/ChoixLieu";
import { MoisApports, SyntheseApports, type TableauApport } from "@/components/TableauApports";

// Apporteurs d'affaires (demande du 17/11/2026) : qui a apporté quel lieu, à quel taux, et ce qu'il touche.

interface Apporteur {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  isActive: boolean;
  dejaConnecte: boolean;
}
interface Regle {
  id: number;
  userId: number;
  lieuId: number;
  tauxBp: number;
  taux: string;
  base: "TTC" | "HT";
  netRemboursements: boolean;
  dateDebut: string;
  dateFin: string | null;
  notes: string | null;
  lieu: { id: number; enseigne: string; ville: string | null; statut: string };
}
interface LigneApporteur {
  apporteur: Apporteur;
  regles: Regle[];
  totaux: TableauApport["totaux"];
}
interface Candidat {
  id: number;
  email: string;
  nom: string;
  prenom: string;
}

const nomDe = (u: { nom: string; prenom: string; email: string }) => [u.prenom, u.nom].filter(Boolean).join(" ") || u.email;

export default function PageApporteurs() {
  return (
    <PageGuard perm="pages.apporteurs.view">
      <Apporteurs />
    </PageGuard>
  );
}

function Apporteurs() {
  const gere = usePerm("apporteurs.manage");
  const client = useQueryClient();
  const [edition, setEdition] = useState<{ regle?: Regle; userId?: number } | null>(null);
  const [detail, setDetail] = useState<Apporteur | null>(null);
  const { data, error, isPending } = useQuery({ queryKey: ["apporteurs"], queryFn: () => api<LigneApporteur[]>("/apporteurs") });
  const supprimer = useMutation({
    mutationFn: (r: Regle) => api(`/apporteurs/regles/${r.id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["apporteurs"] }),
  });

  return (
    <>
      <EnTete
        titre="Apporteurs d'affaires"
        sousTitre="Un ami, une antenne, n'importe qui qui a recommandé un lieu : il touche un pourcentage des ventes de ce lieu. Chaque apporteur voit son propre point mensuel dans « Mes apports », rien d'autre."
        actions={
          <Gate perm="apporteurs.manage">
            <button className="bouton" onClick={() => setEdition({})}>Rattacher un apporteur à un lieu</button>
          </Gate>
        }
      />
      <p className="mb-3 text-xs text-ink-2">
        L&apos;apporteur doit d&apos;abord exister dans la page <strong>Utilisateurs</strong> (même e-mail que son compte Keycloak), avec le profil « Régie – apporteur d&apos;affaires » dans l&apos;Admin Panel.
        Pour arrêter une commission sans perdre l&apos;historique, mettez une date de fin.
      </p>
      {error && <Erreur erreur={error} />}
      {supprimer.error && <Erreur erreur={supprimer.error} />}
      {isPending && !error && <Chargement />}
      {data && !data.length && <Vide>Aucun apporteur d&apos;affaires pour le moment.</Vide>}
      {data && data.length > 0 && (
        <div className="space-y-4">
          {data.map(({ apporteur, regles, totaux }) => (
            <section key={apporteur.id} className="carte p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">
                    {nomDe(apporteur)}
                    {!apporteur.isActive && <span className="ml-2"><Badge ton="neutre">Désactivé</Badge></span>}
                    {apporteur.isActive && !apporteur.dejaConnecte && <span className="ml-2"><Badge ton="warn">Jamais connecté</Badge></span>}
                  </h2>
                  <div className="text-xs text-ink-muted">{apporteur.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-ink-2">Mois dernier : <strong className="text-ink">{euros(totaux.moisPrecedentCents)}</strong></span>
                  <span className="text-ink-2">Année : <strong className="text-ink">{euros(totaux.anneeCents)}</strong></span>
                  <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setDetail(apporteur)}>Voir son point mensuel</button>
                  {gere && <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setEdition({ userId: apporteur.id })}>Ajouter un lieu</button>}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-2">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Lieu</th>
                    <th className="py-2 pr-4 font-medium">Commission</th>
                    <th className="py-2 pr-4 font-medium">Période</th>
                    <th className="py-2 pr-4 font-medium">Notes</th>
                    <th className="py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {regles.map((r) => (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="py-2 pr-4">
                        <span className="font-medium">{r.lieu.enseigne}</span>
                        {r.lieu.ville && <span className="text-ink-muted"> · {r.lieu.ville}</span>}
                      </td>
                      <td className="py-2 pr-4">
                        {r.taux} du CA {r.base}
                        {r.netRemboursements ? " net des remboursements" : ""}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        depuis le {jour(r.dateDebut)}
                        {r.dateFin && <div>jusqu&apos;au {jour(r.dateFin)}</div>}
                      </td>
                      <td className="py-2 pr-4 text-xs text-ink-2">{r.notes}</td>
                      <td className="py-2">
                        {gere && (
                          <div className="flex justify-end gap-1">
                            <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setEdition({ regle: r })}>Modifier</button>
                            <button
                              className="bouton-second !px-2 !py-1 text-xs"
                              onClick={() => confirm(`Retirer ${r.lieu.enseigne} de ${nomDe(apporteur)} ? Son historique de commission sur ce lieu disparaît. Pour arrêter sans effacer, mettez plutôt une date de fin.`) && supprimer.mutate(r)}
                            >
                              Retirer
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      <Modale titre={edition?.regle ? "Modifier la commission" : "Rattacher un apporteur à un lieu"} ouverte={edition !== null} onFermer={() => setEdition(null)}>
        {edition && <FormRegle regle={edition.regle} userId={edition.userId} onFini={() => setEdition(null)} />}
      </Modale>
      <Modale titre={detail ? `Point mensuel de ${nomDe(detail)}` : ""} ouverte={detail !== null} onFermer={() => setDetail(null)} large>
        {detail && <DetailApporteur userId={detail.id} />}
      </Modale>
    </>
  );
}

/** Ce que voit l'apporteur dans « Mes apports » */
function DetailApporteur({ userId }: { userId: number }) {
  const { data, error } = useQuery({ queryKey: ["apporteurs", userId, "tableau"], queryFn: () => api<TableauApport>(`/apporteurs/${userId}/tableau`) });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  return (
    <>
      <SyntheseApports t={data} />
      <MoisApports t={data} />
    </>
  );
}

const ymdAujourdhui = () => new Date().toISOString().slice(0, 10);

function FormRegle({ regle, userId, onFini }: { regle?: Regle; userId?: number; onFini: () => void }) {
  const client = useQueryClient();
  const [f, setF] = useState({
    userId: regle ? String(regle.userId) : userId ? String(userId) : "",
    lieuId: regle ? String(regle.lieuId) : "",
    taux: regle ? depuisBp(regle.tauxBp) : "",
    base: regle?.base ?? "TTC",
    netRemboursements: regle?.netRemboursements ?? true,
    dateDebut: regle?.dateDebut ?? ymdAujourdhui(),
    dateFin: regle?.dateFin ?? "",
    notes: regle?.notes ?? "",
  });
  const { data: candidats } = useQuery({ queryKey: ["apporteurs", "candidats"], queryFn: () => api<Candidat[]>("/apporteurs/candidats"), enabled: !regle });
  const { data: lieux } = useQuery({ queryKey: ["lieux", ""], queryFn: () => api<LieuListe[]>("/lieux"), enabled: !regle });
  const enregistrer = useMutation({
    mutationFn: () => {
      const tauxBp = versBp(f.taux);
      const corps = { tauxBp, base: f.base, netRemboursements: f.netRemboursements, dateDebut: f.dateDebut, dateFin: f.dateFin || null, notes: f.notes || null };
      return regle
        ? api(`/apporteurs/regles/${regle.id}`, { method: "PATCH", json: corps })
        : api("/apporteurs/regles", { method: "POST", json: { ...corps, userId: Number(f.userId), lieuId: Number(f.lieuId) } });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["apporteurs"] });
      onFini();
    },
  });
  const tauxBp = versBp(f.taux);
  const valide = (regle || (f.userId && f.lieuId)) && tauxBp !== null && tauxBp >= 0 && tauxBp <= 10_000 && f.dateDebut;

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (valide) enregistrer.mutate(); }}>
      {regle ? (
        <div className="rounded-md bg-surface-2 p-3 text-sm">
          <div className="font-medium">{regle.lieu.enseigne}</div>
          {regle.lieu.ville && <div className="text-ink-2">{regle.lieu.ville}</div>}
        </div>
      ) : (
        <>
          <div>
            <span className="etiquette">Apporteur *</span>
            <ChoixRecherche
              options={(candidats ?? []).map((c) => ({ id: String(c.id), libelle: `${nomDe(c)} — ${c.email}` }))}
              valeur={f.userId}
              onChange={(userId) => setF({ ...f, userId })}
              vide="Choisir une personne…"
              placeholder="Nom, prénom ou e-mail…"
              aucun="Personne ne correspond : ajoutez-la d'abord dans Utilisateurs."
            />
          </div>
          <div>
            <span className="etiquette">Lieu apporté *</span>
            <ChoixLieu id="apport-lieu" lieux={lieux ?? []} valeur={f.lieuId} onChange={(lieuId) => setF({ ...f, lieuId })} tous="Choisir un lieu…" />
          </div>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Commission (% des ventes) *</span>
          <input className="champ" inputMode="decimal" placeholder="5" value={f.taux} onChange={(e) => setF({ ...f, taux: e.target.value })} required />
        </label>
        <label className="block">
          <span className="etiquette">Base</span>
          <select className="champ" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value as "TTC" | "HT" })}>
            <option value="TTC">CA TTC</option>
            <option value="HT">CA HT</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.netRemboursements} onChange={(e) => setF({ ...f, netRemboursements: e.target.checked })} />
        Net des remboursements
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Premier jour commissionné *</span>
          <input className="champ" type="date" value={f.dateDebut} onChange={(e) => setF({ ...f, dateDebut: e.target.value })} required />
        </label>
        <label className="block">
          <span className="etiquette">Dernier jour (facultatif)</span>
          <input className="champ" type="date" value={f.dateFin} min={f.dateDebut} onChange={(e) => setF({ ...f, dateFin: e.target.value })} />
        </label>
      </div>
      <label className="block">
        <span className="etiquette">Notes (contrat, accord…)</span>
        <input className="champ" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} />
      </label>
      {enregistrer.error && <p role="alert" className="text-sm text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={!valide || enregistrer.isPending}>{regle ? "Enregistrer" : "Rattacher"}</button>
    </form>
  );
}

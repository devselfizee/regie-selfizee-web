"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type LieuListe } from "@/lib/api";
import { useMoi } from "@/lib/session";
import { Gate, PageGuard, usePerm } from "@/lib/perms";
import { Badge, Chargement, EnTete, Erreur } from "@/components/Etat";
import { Modale } from "@/components/Modale";

interface Utilisateur {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  /** Reçoit les SMS des alertes critiques (désigné ici ; personne par défaut) */
  alertesSms: boolean;
  isActive: boolean;
  lieuId: number | null;
  lieu: { id: number; enseigne: string } | null;
  dejaConnecte: boolean;
  nbLieux: number;
}

// Adresse de l'Admin Panel (profils et droits), d'après celle de la plateforme
const ADMIN_PANEL = (process.env.NEXT_PUBLIC_PLATEFORM_URL ?? "").replace(/\/$/, "").replace("://plateform.", "://adminpanel.");

export default function PageUtilisateurs() {
  return (
    <PageGuard perm="pages.utilisateurs.view">
      <Utilisateurs />
    </PageGuard>
  );
}

function Utilisateurs() {
  const moi = useMoi();
  const gere = usePerm("utilisateurs.manage");
  const client = useQueryClient();
  const [edition, setEdition] = useState<Utilisateur | "nouveau" | null>(null);
  const { data, error, isPending } = useQuery({ queryKey: ["utilisateurs"], queryFn: () => api<Utilisateur[]>("/utilisateurs") });
  const basculer = useMutation({
    mutationFn: (u: Utilisateur) => api(`/utilisateurs/${u.id}`, { method: "PATCH", json: { isActive: !u.isActive } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["utilisateurs"] }),
  });
  const sms = useMutation({
    mutationFn: (u: Utilisateur) => api(`/utilisateurs/${u.id}`, { method: "PATCH", json: { alertesSms: !u.alertesSms } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["utilisateurs"] }),
  });

  return (
    <>
      <EnTete
        titre="Utilisateurs"
        sousTitre="L'identité vient de Keycloak, les droits de l'Admin Panel Konitys. Ici : ajouter une personne, rattacher un partenaire à son lieu, les SMS des alertes, couper un accès."
        actions={
          <Gate perm="utilisateurs.manage">
            <button className="bouton" onClick={() => setEdition("nouveau")}>Ajouter un utilisateur</button>
          </Gate>
        }
      />
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {basculer.error && <Erreur erreur={basculer.error} />}
      {sms.error && <Erreur erreur={sms.error} />}
      <p className="mb-2 text-sm text-ink-2">
        Ce que chacun peut voir et faire se règle dans l&apos;Admin Panel → <strong>Profils &amp; Droits</strong> (application « Régie »), selon le profil de son compte.
        {ADMIN_PANEL && (
          <>
            {" "}
            <a href={`${ADMIN_PANEL}/hub/droits`} target="_blank" rel="noreferrer" className="text-accent hover:underline">Ouvrir l&apos;Admin Panel</a>
          </>
        )}
      </p>
      <p className="mb-3 text-xs text-ink-2">
        SMS des alertes critiques (borne muette…) : seulement aux personnes cochées, à leur numéro du Hub. Les autres alertes partent par e-mail.
      </p>
      {data && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium" title="Alertes critiques (borne muette…) ; les autres arrivent par e-mail">SMS des alertes</th>
                <th className="px-4 py-3 font-medium">État</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className={`border-t border-line ${u.isActive ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{[u.prenom, u.nom].filter(Boolean).join(" ")}</div>
                    <div className="text-xs text-ink-muted">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {/* Lieu rattaché : celui d'un partenaire (son périmètre « ses lieux ») */}
                    {u.lieu?.enseigne ?? "—"}
                    {u.nbLieux > 0 && (
                      <span className="block text-xs text-ink-muted">responsable de {u.nbLieux} lieu{u.nbLieux > 1 ? "x" : ""}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={u.alertesSms} disabled={!gere || sms.isPending} onChange={() => sms.mutate(u)} aria-label={`SMS des alertes pour ${u.email}`} />
                      <span className={`text-xs ${u.telephone ? "text-ink-2" : u.alertesSms ? "text-warn-ink" : "text-ink-muted"}`}>
                        {u.telephone ?? "pas de numéro dans le Hub"}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    {!u.isActive ? (
                      <Badge ton="neutre">Désactivé</Badge>
                    ) : u.dejaConnecte ? (
                      <Badge ton="ok">Actif</Badge>
                    ) : (
                      <Badge ton="warn">Jamais connecté</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {gere && (
                        <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setEdition(u)}>Lieu rattaché</button>
                      )}
                      {gere && u.id !== moi.id && (
                        <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => basculer.mutate(u)}>
                          {u.isActive ? "Désactiver" : "Réactiver"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modale
        titre={edition === "nouveau" ? "Ajouter un utilisateur" : "Lieu rattaché"}
        ouverte={edition !== null}
        onFermer={() => setEdition(null)}
      >
        {edition !== null && <FormUtilisateur u={edition === "nouveau" ? null : edition} onFini={() => setEdition(null)} />}
      </Modale>
    </>
  );
}

function FormUtilisateur({ u, onFini }: { u: Utilisateur | null; onFini: () => void }) {
  const client = useQueryClient();
  const [f, setF] = useState({ email: u?.email ?? "", lieuId: u?.lieuId ? String(u.lieuId) : "" });
  const { data: lieux } = useQuery({ queryKey: ["lieux", ""], queryFn: () => api<LieuListe[]>("/lieux") });
  const enregistrer = useMutation({
    mutationFn: () => {
      // Identité (Keycloak) et droits (Admin Panel) se gèrent ailleurs : seul le lieu rattaché se règle ici
      const corps = { lieuId: f.lieuId ? Number(f.lieuId) : null };
      return u
        ? api(`/utilisateurs/${u.id}`, { method: "PATCH", json: corps })
        : api("/utilisateurs", { method: "POST", json: { ...corps, email: f.email } });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["utilisateurs"] });
      onFini();
    },
  });

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      {u ? (
        <div className="rounded-md bg-surface-2 p-3 text-sm">
          <div className="font-medium">{[u.prenom, u.nom].filter(Boolean).join(" ")}</div>
          <div className="text-ink-2">{u.email}</div>
          <p className="mt-1 text-xs text-ink-muted">L&apos;identité vient de Keycloak, les droits de l&apos;Admin Panel : ils se modifient là-bas, pas ici.</p>
        </div>
      ) : (
        <label className="block">
          <span className="etiquette">E-mail (celui du compte Keycloak) *</span>
          <input className="champ" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <span className="mt-1 block text-xs text-ink-muted">
            Nom, prénom et téléphone sont repris à sa première connexion ; ses droits viennent de son profil dans l&apos;Admin Panel.
          </span>
        </label>
      )}
      <label className="block">
        <span className="etiquette">Lieu rattaché (partenaire)</span>
        <select className="champ" value={f.lieuId} onChange={(e) => setF({ ...f, lieuId: e.target.value })}>
          <option value="">—</option>
          {lieux?.map((l) => <option key={l.id} value={l.id}>{l.enseigne}</option>)}
        </select>
        <span className="mt-1 block text-xs text-ink-muted">Sans le droit « Voir tous les lieux », la personne ne voit que ce lieu.</span>
      </label>
      {enregistrer.error && <p role="alert" className="text-sm text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>{u ? "Enregistrer" : "Ajouter"}</button>
    </form>
  );
}

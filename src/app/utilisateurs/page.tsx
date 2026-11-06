"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type LieuListe } from "@/lib/api";
import { Reserve, useMoi, type Role } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur } from "@/components/Etat";
import { Modale } from "@/components/Modale";

interface Utilisateur {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  role: Role;
  /** Rôle lu dans Keycloak à la dernière connexion (sinon : rôle provisoire, à définir dans Keycloak) */
  roleKeycloak: boolean;
  isActive: boolean;
  lieuId: number | null;
  lieu: { id: number; enseigne: string } | null;
  dejaConnecte: boolean;
  nbLieux: number;
}

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "ADMIN", label: "Administrateur", description: "Tout, dont les réglages, les contrats et les utilisateurs" },
  { value: "COMMERCIAL", label: "Commercial", description: "Fiches et statistiques de ses lieux" },
  { value: "TECHNICIEN", label: "Technicien", description: "Bornes, affectations, imports (sans le CA)" },
  { value: "PARTENAIRE", label: "Partenaire", description: "Lecture seule de son lieu" },
];
const libelleRole = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;

export default function PageUtilisateurs() {
  return (
    <Reserve roles={["ADMIN"]}>
      <Utilisateurs />
    </Reserve>
  );
}

function Utilisateurs() {
  const moi = useMoi();
  const client = useQueryClient();
  const [edition, setEdition] = useState<Utilisateur | "nouveau" | null>(null);
  const { data, error, isPending } = useQuery({ queryKey: ["utilisateurs"], queryFn: () => api<Utilisateur[]>("/utilisateurs") });
  const basculer = useMutation({
    mutationFn: (u: Utilisateur) => api(`/utilisateurs/${u.id}`, { method: "PATCH", json: { isActive: !u.isActive } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["utilisateurs"] }),
  });

  return (
    <>
      <EnTete
        titre="Utilisateurs"
        sousTitre="Identité et rôle viennent de Keycloak, à chaque connexion. Ici : ajouter une personne, rattacher un partenaire à son lieu, couper un accès."
        actions={<button className="bouton" onClick={() => setEdition("nouveau")}>Ajouter un utilisateur</button>}
      />
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {basculer.error && <Erreur erreur={basculer.error} />}
      {data && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Périmètre</th>
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
                  <td className="px-4 py-3">
                    {libelleRole(u.role)}
                    {!u.roleKeycloak && (
                      <span className="block text-xs text-warn-ink" title="Le jeton Keycloak de cette personne ne porte aucun rôle de la Régie">
                        {u.dejaConnecte ? "à définir dans Keycloak" : "lu à la première connexion"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {u.role === "ADMIN" || u.role === "TECHNICIEN"
                      ? "Tous les lieux"
                      : u.role === "PARTENAIRE"
                        ? u.lieu?.enseigne ?? "—"
                        : `${u.nbLieux} lieu${u.nbLieux > 1 ? "x" : ""}`}
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
                      {u.role === "PARTENAIRE" && (
                        <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setEdition(u)}>Lieu du partenaire</button>
                      )}
                      {u.id !== moi.id && (
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
        titre={edition === "nouveau" ? "Ajouter un utilisateur" : "Lieu du partenaire"}
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
      // Identité et rôle viennent de Keycloak : seul le lieu d'un partenaire se règle ici
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
          <div className="text-ink-2">{libelleRole(u.role)}</div>
          <p className="mt-1 text-xs text-ink-muted">Identité et rôle viennent de Keycloak : ils se modifient là-bas, pas ici.</p>
        </div>
      ) : (
        <label className="block">
          <span className="etiquette">E-mail (celui du compte Keycloak) *</span>
          <input className="champ" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <span className="mt-1 block text-xs text-ink-muted">
            Nom, prénom, téléphone et rôle sont repris de Keycloak à sa première connexion. Sans rôle de la Régie dans Keycloak, elle entre comme commercial.
          </span>
        </label>
      )}
      <label className="block">
        <span className="etiquette">{u ? "Lieu du partenaire *" : "Lieu, si c'est un partenaire"}</span>
        <select className="champ" required={!!u} value={f.lieuId} onChange={(e) => setF({ ...f, lieuId: e.target.value })}>
          <option value="">—</option>
          {lieux?.map((l) => <option key={l.id} value={l.id}>{l.enseigne}</option>)}
        </select>
        <span className="mt-1 block text-xs text-ink-muted">Un partenaire ne voit que ce lieu, en lecture seule.</span>
      </label>
      {enregistrer.error && <p role="alert" className="text-sm text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>{u ? "Enregistrer" : "Ajouter"}</button>
    </form>
  );
}

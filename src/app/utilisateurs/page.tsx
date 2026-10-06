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
        sousTitre="Chaque personne se connecte avec son compte Keycloak ; l'accès et le rôle se donnent ici, par adresse e-mail."
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
                  <td className="px-4 py-3">{libelleRole(u.role)}</td>
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
                      <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setEdition(u)}>Modifier</button>
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
        titre={edition === "nouveau" ? "Ajouter un utilisateur" : "Modifier l'utilisateur"}
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
  const [f, setF] = useState({
    email: u?.email ?? "",
    prenom: u?.prenom ?? "",
    nom: u?.nom ?? "",
    telephone: u?.telephone ?? "",
    role: (u?.role ?? "COMMERCIAL") as Role,
    lieuId: u?.lieuId ? String(u.lieuId) : "",
  });
  const { data: lieux } = useQuery({
    queryKey: ["lieux", ""],
    queryFn: () => api<LieuListe[]>("/lieux"),
    enabled: f.role === "PARTENAIRE",
  });
  const enregistrer = useMutation({
    mutationFn: () => {
      const corps = {
        prenom: f.prenom,
        nom: f.nom,
        telephone: f.telephone || null,
        role: f.role,
        lieuId: f.role === "PARTENAIRE" && f.lieuId ? Number(f.lieuId) : null,
      };
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
      <label className="block">
        <span className="etiquette">E-mail (celui du compte Keycloak) *</span>
        <input className="champ" type="email" required disabled={Boolean(u)} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="etiquette">Prénom</span>
          <input className="champ" value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} />
        </label>
        <label className="block">
          <span className="etiquette">Nom *</span>
          <input className="champ" required value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
        </label>
      </div>
      <label className="block">
        <span className="etiquette">Téléphone (alertes SMS)</span>
        <input className="champ" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} />
      </label>
      <fieldset>
        <legend className="etiquette">Rôle *</legend>
        <div className="space-y-1">
          {ROLES.map((r) => (
            <label key={r.value} className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2 text-sm ${f.role === r.value ? "border-accent bg-accent/5" : "border-line"}`}>
              <input type="radio" name="role" checked={f.role === r.value} onChange={() => setF({ ...f, role: r.value })} />
              <span>
                <span className="font-medium">{r.label}</span>
                <span className="block text-xs text-ink-muted">{r.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {f.role === "PARTENAIRE" && (
        <label className="block">
          <span className="etiquette">Lieu du partenaire *</span>
          <select className="champ" required value={f.lieuId} onChange={(e) => setF({ ...f, lieuId: e.target.value })}>
            <option value="">—</option>
            {lieux?.map((l) => <option key={l.id} value={l.id}>{l.enseigne}</option>)}
          </select>
        </label>
      )}
      {f.role === "COMMERCIAL" && (
        <p className="text-xs text-ink-2">Ses lieux sont ceux dont il est le commercial responsable (fiche lieu).</p>
      )}
      {enregistrer.error && <p role="alert" className="text-sm text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>{u ? "Enregistrer" : "Ajouter"}</button>
    </form>
  );
}

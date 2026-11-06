"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Role } from "@/lib/session";
import { Chargement, Erreur } from "./Etat";

// Paramètres → Rôles et comptes (retour du 06/11/2026) : les rôles viennent de Keycloak, l'identité du Hub.
// Ici, quels rôles Keycloak donnent quel rôle de la Régie, et sous quel nom la fiche Hub donne le téléphone.

interface Reglages {
  roles: Record<Role, string[]>;
  champsTelephone: string[];
}
interface Reponse {
  reglages: Reglages;
  defaut: Reglages;
  rolesVus: { role: string; nb: number }[];
}

const ROLES: { role: Role; libelle: string; aide: string }[] = [
  { role: "ADMIN", libelle: "Administrateur", aide: "Tout, dont les réglages et les contrats" },
  { role: "TECHNICIEN", libelle: "Technicien", aide: "Bornes, affectations, imports (sans le CA)" },
  { role: "COMMERCIAL", libelle: "Commercial", aide: "Ses lieux (commercial responsable)" },
  { role: "PARTENAIRE", libelle: "Partenaire", aide: "Lecture seule de son lieu" },
];

const enTexte = (l: string[]) => l.join(", ");
const enListe = (t: string) => t.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

export function ReglagesComptes() {
  const { data, error } = useQuery({ queryKey: ["reglages-comptes"], queryFn: () => api<Reponse>("/referentiel/comptes") });
  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;
  return <Formulaire key={JSON.stringify(data.reglages)} data={data} />;
}

function Formulaire({ data }: { data: Reponse }) {
  const client = useQueryClient();
  const [roles, setRoles] = useState<Record<Role, string>>(
    () => Object.fromEntries(ROLES.map(({ role }) => [role, enTexte(data.reglages.roles[role] ?? [])])) as Record<Role, string>
  );
  const [telephone, setTelephone] = useState(enTexte(data.reglages.champsTelephone));
  const enregistrer = useMutation({
    mutationFn: () =>
      api<Reponse>("/referentiel/comptes", {
        method: "PUT",
        json: { roles: Object.fromEntries(ROLES.map(({ role }) => [role, enListe(roles[role])])), champsTelephone: enListe(telephone) },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["reglages-comptes"] }),
  });
  // Rôle Keycloak déjà rangé quelque part : on l'affiche comme tel
  const range = (nom: string) => ROLES.find(({ role }) => enListe(roles[role]).some((n) => n.toLowerCase() === nom.toLowerCase()))?.libelle;
  const ajouter = (role: Role, nom: string) => setRoles((r) => ({ ...r, [role]: enTexte([...enListe(r[role]), nom]) }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer.mutate();
      }}
    >
      <section className="carte p-4">
        <h2 className="text-base font-semibold">Rôles Keycloak → rôles de la Régie</h2>
        <p className="mb-4 text-sm text-ink-2">
          Le rôle de chacun est lu dans Keycloak à chaque connexion. Indiquez ici quels rôles Keycloak (realm ou client) donnent chaque rôle de la Régie, séparés par
          des virgules ; la casse ne compte pas. Un compte qui en a plusieurs prend le plus large. Sans aucun de ces rôles, il garde le sien.
        </p>
        <div className="space-y-3">
          {ROLES.map(({ role, libelle, aide }) => (
            <label key={role} className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-start sm:gap-4">
              <span>
                <span className="block text-sm font-medium">{libelle}</span>
                <span className="block text-xs text-ink-muted">{aide}</span>
              </span>
              <input className="champ" value={roles[role]} onChange={(e) => setRoles({ ...roles, [role]: e.target.value })} placeholder={enTexte(data.defaut.roles[role] ?? [])} />
            </label>
          ))}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Rôles vus dans les jetons</h3>
          <p className="mb-2 text-xs text-ink-2">Les rôles Keycloak portés par les comptes à leur dernière connexion. Cliquez pour en ranger un.</p>
          {!data.rolesVus.length ? (
            <p className="text-sm text-ink-muted">Aucun pour l&apos;instant : ils apparaissent quand les comptes se connectent.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.rolesVus.map(({ role: nom, nb }) => {
                const ou = range(nom);
                return (
                  <li key={nom} className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{nom}</code>
                    <span className="text-xs text-ink-muted">{nb} compte{nb > 1 ? "s" : ""}</span>
                    {ou ? (
                      <span className="text-xs text-good">→ {ou}</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {ROLES.map(({ role, libelle }) => (
                          <button key={role} type="button" className="rounded border border-line px-1.5 py-0.5 text-xs text-ink-2 hover:border-accent hover:text-accent" onClick={() => ajouter(role, nom)}>
                            + {libelle}
                          </button>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="carte p-4">
        <h2 className="text-base font-semibold">Téléphone des alertes SMS</h2>
        <p className="mb-3 text-sm text-ink-2">
          Repris de la fiche du Hub à la connexion (Keycloak et le Hub ont les mêmes utilisateurs). Noms possibles du champ dans la fiche, dans l&apos;ordre ; le premier
          qui contient un numéro est retenu.
        </p>
        <input className="champ" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder={enTexte(data.defaut.champsTelephone)} />
      </section>

      {enregistrer.error && <Erreur erreur={enregistrer.error} />}
      <div className="flex items-center gap-3">
        <button className="bouton" disabled={enregistrer.isPending}>{enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}</button>
        {enregistrer.isSuccess && <span className="text-sm text-good">Enregistré : appliqué à la prochaine connexion de chacun.</span>}
      </div>
    </form>
  );
}

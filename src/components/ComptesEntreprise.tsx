"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { dateHeure } from "@/lib/format";
import { Badge, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";

// Comptes clients d'une entreprise (realm Keycloak « regie », option 2 du 20/11/2026) : page Entreprises (Selfizee)
// et « Mon entreprise » (client admin). Mêmes écrans, l'API impose le périmètre.

export interface CompteClient {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  isActive: boolean;
  profilId: number | null;
  /** Lieux cochés ; aucun = tous les lieux de l'entreprise */
  lieuIds: number[];
  invitationEnvoyeeLe: string | null;
  createdAt: string;
}
export interface DonneesComptes {
  lieux: { id: number; enseigne: string; ville: string | null }[];
  comptes: CompteClient[];
  profils: { id: number; libelle: string }[];
}

/**
 * `base` : préfixe des routes de l'API (« /entreprises/12 » ou « /mon-entreprise ») ; `cle` : la requête à rafraîchir ;
 * `moiId` : le compte connecté (client admin), qui ne peut ni se désactiver ni changer son profil.
 */
export function ComptesEntreprise({ base, cle, donnees, moiId, peutGerer }: { base: string; cle: unknown[]; donnees: DonneesComptes; moiId?: number; peutGerer: boolean }) {
  const client = useQueryClient();
  const [edition, setEdition] = useState<CompteClient | "nouveau" | null>(null);
  const rafraichir = () => client.invalidateQueries({ queryKey: cle });
  const basculer = useMutation({
    mutationFn: (c: CompteClient) => api(`${base}/comptes/${c.id}`, { method: "PATCH", json: { isActive: !c.isActive } }),
    onSuccess: rafraichir,
  });
  const inviter = useMutation({
    mutationFn: (c: CompteClient) => api(`${base}/comptes/${c.id}/invitation`, { method: "POST" }),
    onSuccess: rafraichir,
  });
  const profil = (id: number | null) => donnees.profils.find((p) => p.id === id)?.libelle ?? (id ? `Profil n° ${id}` : "—");
  const lieuxDe = (c: CompteClient) =>
    c.lieuIds.length ? c.lieuIds.map((id) => donnees.lieux.find((l) => l.id === id)?.enseigne ?? `Lieu n° ${id}`).join(", ") : "Tous les lieux de l'entreprise";

  return (
    <>
      {peutGerer && (
        <div className="mb-3 flex justify-end">
          <button type="button" className="bouton" onClick={() => setEdition("nouveau")} disabled={!donnees.profils.length}>
            Inviter un compte
          </button>
        </div>
      )}
      {peutGerer && !donnees.profils.length && (
        <p className="mb-3 rounded-md bg-warn-bg p-3 text-sm text-warn-ink">Aucun profil client n&apos;est encore configuré : impossible d&apos;inviter un compte pour le moment.</p>
      )}
      {(basculer.error || inviter.error) && <p role="alert" className="mb-3 text-sm text-bad">{(basculer.error ?? inviter.error)?.message}</p>}
      {inviter.isSuccess && <p className="mb-3 text-sm text-ok-ink">Invitation renvoyée.</p>}
      {!donnees.comptes.length ? (
        <Vide>Aucun compte pour le moment. Chaque compte reçoit un e-mail pour choisir son mot de passe.</Vide>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Personne</th>
                <th className="px-3 py-2 font-medium">Profil</th>
                <th className="px-3 py-2 font-medium">Lieux visibles</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                {peutGerer && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {donnees.comptes.map((c) => (
                <tr key={c.id} className={c.isActive ? "" : "text-ink-muted"}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{[c.prenom, c.nom].filter(Boolean).join(" ")}{c.id === moiId && <span className="ml-1 text-xs text-ink-muted">(vous)</span>}</div>
                    <div className="text-xs text-ink-2">{c.email}</div>
                  </td>
                  <td className="px-3 py-2">{profil(c.profilId)}</td>
                  <td className="max-w-xs px-3 py-2 text-xs text-ink-2">{lieuxDe(c)}</td>
                  <td className="px-3 py-2">
                    {c.isActive ? <Badge ton="ok">Actif</Badge> : <Badge ton="neutre">Désactivé</Badge>}
                    {c.invitationEnvoyeeLe && <div className="mt-0.5 text-xs text-ink-muted">Invité le {dateHeure(c.invitationEnvoyeeLe)}</div>}
                  </td>
                  {peutGerer && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" className="text-xs text-accent hover:underline" onClick={() => setEdition(c)}>Modifier</button>
                      {c.isActive && (
                        <button type="button" className="ml-3 text-xs text-accent hover:underline" disabled={inviter.isPending} onClick={() => inviter.mutate(c)}>
                          Renvoyer l&apos;invitation
                        </button>
                      )}
                      {c.id !== moiId && (
                        <button type="button" className="ml-3 text-xs text-accent hover:underline" disabled={basculer.isPending} onClick={() => basculer.mutate(c)}>
                          {c.isActive ? "Désactiver" : "Réactiver"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modale titre={edition === "nouveau" ? "Inviter un compte" : "Modifier le compte"} ouverte={edition !== null} onFermer={() => setEdition(null)}>
        {edition !== null && (
          <FormCompte
            base={base}
            compte={edition === "nouveau" ? null : edition}
            donnees={donnees}
            soiMeme={edition !== "nouveau" && edition.id === moiId}
            onFini={() => {
              rafraichir();
              setEdition(null);
            }}
          />
        )}
      </Modale>
    </>
  );
}

function FormCompte({ base, compte, donnees, soiMeme, onFini }: { base: string; compte: CompteClient | null; donnees: DonneesComptes; soiMeme: boolean; onFini: () => void }) {
  const [f, setF] = useState({
    email: "",
    prenom: "",
    nom: "",
    profilId: String(compte?.profilId ?? donnees.profils[0]?.id ?? ""),
    lieuIds: new Set<number>(compte?.lieuIds ?? []),
  });
  const basculerLieu = (id: number) =>
    setF((f) => {
      const lieuIds = new Set(f.lieuIds);
      if (lieuIds.has(id)) lieuIds.delete(id);
      else lieuIds.add(id);
      return { ...f, lieuIds };
    });
  const enregistrer = useMutation({
    mutationFn: () => {
      const lieuIds = [...f.lieuIds];
      if (compte) return api(`${base}/comptes/${compte.id}`, { method: "PATCH", json: soiMeme ? { lieuIds } : { lieuIds, profilId: Number(f.profilId) } });
      return api(`${base}/comptes`, { method: "POST", json: { email: f.email, prenom: f.prenom, nom: f.nom, profilId: Number(f.profilId), lieuIds } });
    },
    onSuccess: onFini,
  });

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      {compte ? (
        <div className="rounded-md bg-surface-2 p-3 text-sm">
          <div className="font-medium">{[compte.prenom, compte.nom].filter(Boolean).join(" ")}</div>
          <div className="text-ink-2">{compte.email}</div>
          <p className="mt-1 text-xs text-ink-muted">Nom et e-mail se changent depuis le compte de la personne, pas ici.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="etiquette">Prénom *</span>
              <input className="champ" required value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} />
            </label>
            <label className="block">
              <span className="etiquette">Nom *</span>
              <input className="champ" required value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
            </label>
          </div>
          <label className="block">
            <span className="etiquette">E-mail *</span>
            <input className="champ" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <span className="mt-1 block text-xs text-ink-muted">Un e-mail d&apos;invitation y part : la personne choisit son mot de passe (lien valable 7 jours).</span>
          </label>
        </>
      )}
      <label className="block">
        <span className="etiquette">Profil *</span>
        <select className="champ" required disabled={soiMeme} value={f.profilId} onChange={(e) => setF({ ...f, profilId: e.target.value })}>
          {donnees.profils.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
        </select>
        <span className="mt-1 block text-xs text-ink-muted">{soiMeme ? "Vous ne pouvez pas changer votre propre profil." : "Ce que la personne peut voir et faire (défini par Selfizee)."}</span>
      </label>
      <div>
        <span className="etiquette">Lieux visibles</span>
        <div className="max-h-56 overflow-y-auto rounded-md border border-line p-2 text-sm">
          {donnees.lieux.map((l) => (
            <label key={l.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={f.lieuIds.has(l.id)} onChange={() => basculerLieu(l.id)} />
              <span>{l.enseigne}</span>
              {l.ville && <span className="text-xs text-ink-muted">{l.ville}</span>}
            </label>
          ))}
          {!donnees.lieux.length && <p className="py-2 text-xs text-ink-muted">L&apos;entreprise n&apos;a encore aucun lieu.</p>}
        </div>
        <span className="mt-1 block text-xs text-ink-muted">Aucun coché : tous les lieux de l&apos;entreprise, y compris ceux ajoutés plus tard.</span>
      </div>
      {enregistrer.error && <p role="alert" className="text-sm text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>{compte ? "Enregistrer" : enregistrer.isPending ? "Invitation…" : "Inviter"}</button>
    </form>
  );
}

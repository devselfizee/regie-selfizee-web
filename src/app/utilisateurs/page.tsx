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
  /** Reçoit les e-mails des alertes et le récapitulatif quotidien (désigné ici) */
  alertesEmail: boolean;
  isActive: boolean;
  /** Lieux auxquels un client a accès (demande du 17/11 : un ou plusieurs) */
  lieuIds: number[];
  lieux: { id: number; enseigne: string }[];
  /** Apporteur d'affaires (au moins un lieu rattaché dans la page Apporteurs) */
  apporteur: boolean;
  dejaConnecte: boolean;
  nbLieux: number;
  /** Profils Konitys (Admin Panel), relevés à sa dernière connexion */
  profils: string[];
  /** Admin de la plateforme : passe partout */
  adminPlateforme: boolean;
  profilsRelevesLe: string | null;
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
  // Ancien client Konitys → compte client de la Régie (option 2 du 20/11/2026)
  const [aConvertir, setAConvertir] = useState<Utilisateur | null>(null);
  const gereEntreprises = usePerm("entreprises.manage");
  const { data, error, isPending } = useQuery({ queryKey: ["utilisateurs"], queryFn: () => api<Utilisateur[]>("/utilisateurs") });
  const basculer = useMutation({
    mutationFn: (u: Utilisateur) => api(`/utilisateurs/${u.id}`, { method: "PATCH", json: { isActive: !u.isActive } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["utilisateurs"] }),
  });
  const sms = useMutation({
    mutationFn: (u: Utilisateur) => api(`/utilisateurs/${u.id}`, { method: "PATCH", json: { alertesSms: !u.alertesSms } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["utilisateurs"] }),
  });
  const emails = useMutation({
    mutationFn: (u: Utilisateur) => api(`/utilisateurs/${u.id}`, { method: "PATCH", json: { alertesEmail: !u.alertesEmail } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["utilisateurs"] }),
  });

  return (
    <>
      <EnTete
        titre="Utilisateurs"
        sousTitre="L'identité vient de Keycloak, les droits de l'Admin Panel Konitys. Ici : ajouter une personne, rattacher un client à ses lieux, les SMS des alertes, couper un accès."
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
      {emails.error && <Erreur erreur={emails.error} />}
      <p className="mb-2 text-sm text-ink-2">
        Ce que chacun peut voir et faire se règle dans l&apos;Admin Panel → <strong>Profils &amp; Droits</strong> (application « Régie »), selon le profil de son compte.
        Pour un client, choisissez-y ce qu&apos;il peut faire sur ses lieux (juste les chiffres, tout voir, gérer ses événements…) ; ses lieux se rattachent ici.
        {ADMIN_PANEL && (
          <>
            {" "}
            <a href={`${ADMIN_PANEL}/hub/droits`} target="_blank" rel="noreferrer" className="text-accent hover:underline">Ouvrir l&apos;Admin Panel</a>
          </>
        )}
      </p>
      <p className="mb-3 text-xs text-ink-2">
        Alertes : par e-mail (Warning et Critique, plus le récapitulatif quotidien) et par SMS (critiques : borne muette…) aux seules personnes cochées. Le commercial
        responsable d&apos;un lieu reçoit en plus par e-mail les alertes de vente de ce lieu.
      </p>
      {data && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium" title="Profils de l'Admin Panel, relevés à sa dernière connexion : ils donnent ses droits">Profils</th>
                <th className="px-4 py-3 font-medium" title="Seulement pour un client : le ou les lieux qu'il voit. Les autres voient les lieux selon leurs droits.">
                  Lieux (client)
                </th>
                <th className="px-4 py-3 font-medium" title="Alertes Warning et Critique, et récapitulatif quotidien">E-mails des alertes</th>
                <th className="px-4 py-3 font-medium" title="Alertes critiques (borne muette…)">SMS des alertes</th>
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
                    {/* Profils de l'Admin Panel (relevés à la connexion) : ce sont eux qui donnent les droits */}
                    {u.adminPlateforme || u.profils.length ? (
                      <div className="flex flex-wrap gap-1">
                        {u.adminPlateforme && <Badge ton="ok">Admin plateforme</Badge>}
                        {u.profils.map((p) => (
                          <span key={p} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{p}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {!u.dejaConnecte ? "jamais connecté" : u.profilsRelevesLe ? "aucun profil" : "connu à sa prochaine connexion"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {/* Lieux rattachés : seulement pour un client ; les autres voient les lieux selon leurs droits */}
                    {u.lieux.length ? (
                      <span title={u.lieux.map((l) => l.enseigne).join(", ")}>
                        {u.lieux.slice(0, 3).map((l) => l.enseigne).join(", ")}
                        {u.lieux.length > 3 && <span className="text-ink-muted"> et {u.lieux.length - 3} autre{u.lieux.length > 4 ? "s" : ""}</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">aucun</span>
                    )}
                    {u.nbLieux > 0 && (
                      <span className="block text-xs text-ink-muted">responsable de {u.nbLieux} lieu{u.nbLieux > 1 ? "x" : ""}</span>
                    )}
                    {u.apporteur && <span className="block text-xs text-ink-muted">apporteur d&apos;affaires</span>}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={u.alertesEmail}
                      disabled={!gere || emails.isPending}
                      onChange={() => emails.mutate(u)}
                      aria-label={`E-mails des alertes pour ${u.email}`}
                    />
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
                        <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setEdition(u)}>Lieux rattachés</button>
                      )}
                      {gere && gereEntreprises && u.isActive && u.lieux.length > 0 && u.id !== moi.id && (
                        <button
                          className="bouton-second !px-2 !py-1 text-xs"
                          title="Créer son compte client de la Régie (connexion séparée des salariés) et désactiver ce compte Konitys"
                          onClick={() => setAConvertir(u)}
                        >
                          Passer en compte client
                        </button>
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
        titre={edition === "nouveau" ? "Ajouter un utilisateur" : "Lieux rattachés"}
        ouverte={edition !== null}
        onFermer={() => setEdition(null)}
      >
        {edition !== null && <FormUtilisateur u={edition === "nouveau" ? null : edition} onFini={() => setEdition(null)} />}
      </Modale>
      <Modale titre="Passer en compte client" ouverte={aConvertir !== null} onFermer={() => setAConvertir(null)}>
        {aConvertir && <FormPasserClient u={aConvertir} onFini={() => setAConvertir(null)} />}
      </Modale>
    </>
  );
}

function FormUtilisateur({ u, onFini }: { u: Utilisateur | null; onFini: () => void }) {
  const client = useQueryClient();
  const [f, setF] = useState({ email: u?.email ?? "", lieuIds: new Set<number>(u?.lieuIds ?? []) });
  const [recherche, setRecherche] = useState("");
  const { data: lieux } = useQuery({ queryKey: ["lieux", ""], queryFn: () => api<LieuListe[]>("/lieux") });
  const basculerLieu = (id: number) =>
    setF((f) => {
      const lieuIds = new Set(f.lieuIds);
      if (lieuIds.has(id)) lieuIds.delete(id);
      else lieuIds.add(id);
      return { ...f, lieuIds };
    });
  const normaliser = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = normaliser(recherche.trim());
  // Les lieux cochés d'abord, puis ceux qui correspondent à la recherche (15 au plus : on cherche les autres)
  const coches = (lieux ?? []).filter((l) => f.lieuIds.has(l.id));
  const proposes = (lieux ?? []).filter((l) => !f.lieuIds.has(l.id) && (!q || normaliser(`${l.enseigne} ${l.ville ?? ""} ${l.codePostal ?? ""}`).includes(q))).slice(0, 15);
  const enregistrer = useMutation({
    mutationFn: () => {
      // Identité (Keycloak) et droits (Admin Panel) se gèrent ailleurs : seuls les lieux rattachés se règlent ici
      const corps = { lieuIds: [...f.lieuIds] };
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
      <div>
        <span className="etiquette">Lieux rattachés (client)</span>
        <input className="champ mb-2" placeholder="Rechercher un lieu, une ville…" value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label="Rechercher un lieu" />
        <div className="max-h-56 overflow-y-auto rounded-md border border-line p-2 text-sm">
          {coches.map((l) => (
            <label key={l.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked onChange={() => basculerLieu(l.id)} />
              <span className="font-medium">{l.enseigne}</span>
              {l.ville && <span className="text-xs text-ink-muted">{l.ville}</span>}
            </label>
          ))}
          {proposes.map((l) => (
            <label key={l.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={false} onChange={() => basculerLieu(l.id)} />
              <span>{l.enseigne}</span>
              {l.ville && <span className="text-xs text-ink-muted">{l.ville}</span>}
            </label>
          ))}
          {!coches.length && !proposes.length && <p className="py-2 text-xs text-ink-muted">{lieux ? "Aucun lieu ne correspond." : "Chargement…"}</p>}
        </div>
        <span className="mt-1 block text-xs text-ink-muted">
          {f.lieuIds.size ? `${f.lieuIds.size} lieu${f.lieuIds.size > 1 ? "x" : ""} coché${f.lieuIds.size > 1 ? "s" : ""}. ` : ""}
          Sans le droit « Voir tous les lieux », la personne ne voit que ces lieux ; ce qu&apos;elle peut y faire dépend de son profil dans l&apos;Admin Panel.
        </span>
      </div>
      {enregistrer.error && <p role="alert" className="text-sm text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>{u ? "Enregistrer" : "Ajouter"}</button>
    </form>
  );
}

/**
 * Un client rattaché à des lieux dans le realm Konitys devient un compte client de la Régie : compte créé dans
 * l'entreprise avec les mêmes lieux, e-mail d'invitation, ancien compte désactivé.
 */
function FormPasserClient({ u, onFini }: { u: Utilisateur; onFini: () => void }) {
  const client = useQueryClient();
  const [entrepriseId, setEntrepriseId] = useState("");
  const [profilId, setProfilId] = useState("");
  const entreprises = useQuery({ queryKey: ["entreprises"], queryFn: () => api<{ configure: boolean; entreprises: { id: number; nom: string; actif: boolean }[] }>("/entreprises") });
  const detail = useQuery({
    queryKey: ["entreprise", Number(entrepriseId)],
    queryFn: () => api<{ profils: { id: number; libelle: string }[] }>(`/entreprises/${entrepriseId}`),
    enabled: entrepriseId !== "",
  });
  const convertir = useMutation({
    mutationFn: () => api(`/utilisateurs/${u.id}/passer-client`, { method: "POST", json: { entrepriseId: Number(entrepriseId), profilId: Number(profilId) } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["utilisateurs"] });
      client.invalidateQueries({ queryKey: ["entreprises"] });
      onFini();
    },
  });
  const actives = (entreprises.data?.entreprises ?? []).filter((e) => e.actif);

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); convertir.mutate(); }}>
      <p className="text-sm">
        <strong>{u.email}</strong> aura un compte client de la Régie, avec ses {u.lieux.length} lieu{u.lieux.length > 1 ? "x" : ""} (
        {u.lieux.map((l) => l.enseigne).join(", ")}). Il reçoit un e-mail pour choisir son mot de passe, puis se connecte par « Je suis client ». Son
        compte Konitys est désactivé ici.
      </p>
      {entreprises.data && !entreprises.data.configure && (
        <p className="rounded-md bg-warn-bg p-3 text-sm text-warn-ink">La connexion des clients n&apos;est pas encore configurée : conversion impossible pour le moment.</p>
      )}
      <label className="block">
        <span className="etiquette">Entreprise *</span>
        <select className="champ" required value={entrepriseId} onChange={(e) => { setEntrepriseId(e.target.value); setProfilId(""); }}>
          <option value="">—</option>
          {actives.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>
        <span className="mt-1 block text-xs text-ink-muted">Ses lieux sont rattachés à cette entreprise s&apos;ils n&apos;en ont pas encore. Créez l&apos;entreprise d&apos;abord si besoin (page Entreprises clientes).</span>
      </label>
      <label className="block">
        <span className="etiquette">Profil *</span>
        <select className="champ" required value={profilId} onChange={(e) => setProfilId(e.target.value)} disabled={!detail.data}>
          <option value="">—</option>
          {detail.data?.profils.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
        </select>
      </label>
      {convertir.error && <p role="alert" className="text-sm text-bad">{convertir.error.message}</p>}
      <button className="bouton" disabled={convertir.isPending || !entrepriseId || !profilId || entreprises.data?.configure === false}>
        {convertir.isPending ? "Création…" : "Créer le compte client"}
      </button>
    </form>
  );
}

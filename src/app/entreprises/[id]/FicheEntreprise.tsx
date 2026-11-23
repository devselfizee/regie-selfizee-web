"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type LieuListe } from "@/lib/api";
import { Gate, PageGuard, usePerm } from "@/lib/perms";
import { Badge, Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { ComptesEntreprise, type DonneesComptes } from "@/components/ComptesEntreprise";

interface Detail extends DonneesComptes {
  id: number;
  nom: string;
  actif: boolean;
  notes: string | null;
  configure: boolean;
}

export function FicheEntreprise({ id }: { id: number }) {
  return (
    <PageGuard perm="pages.entreprises.view">
      <Fiche id={id} />
    </PageGuard>
  );
}

function Fiche({ id }: { id: number }) {
  const client = useQueryClient();
  const gere = usePerm("entreprises.manage");
  const cle = ["entreprise", id];
  const { data: e, error } = useQuery({ queryKey: cle, queryFn: () => api<Detail>(`/entreprises/${id}`) });
  const [renommer, setRenommer] = useState(false);
  const [choixLieux, setChoixLieux] = useState(false);
  const activer = useMutation({
    mutationFn: (actif: boolean) => api(`/entreprises/${id}`, { method: "PATCH", json: { actif } }),
    onSuccess: () => client.invalidateQueries({ queryKey: cle }),
  });
  if (error) return <Erreur erreur={error} />;
  if (!e) return <Chargement />;

  return (
    <>
      <EnTete
        titre={e.nom}
        sousTitre={<>Entreprise cliente · {e.actif ? <Badge ton="ok">Active</Badge> : <Badge ton="neutre">Désactivée : aucun de ses comptes n&apos;entre</Badge>}</>}
        actions={
          <>
            <Link href="/entreprises" className="bouton-second">← Toutes les entreprises</Link>
            <Gate perm="entreprises.manage">
              <button type="button" className="bouton-second" onClick={() => setRenommer(true)}>Renommer</button>
            </Gate>
            <Gate perm="entreprises.manage">
              <button type="button" className="bouton-second" disabled={activer.isPending} onClick={() => activer.mutate(!e.actif)}>
                {e.actif ? "Désactiver" : "Réactiver"}
              </button>
            </Gate>
          </>
        }
      />
      {activer.error && <div className="mb-4"><Erreur erreur={activer.error} /></div>}
      {!e.configure && (
        <p className="mb-4 rounded-md bg-warn-bg p-3 text-sm text-warn-ink">
          La connexion des clients n&apos;est pas encore configurée (realm Keycloak « regie ») : impossible d&apos;inviter un compte pour le moment.
        </p>
      )}
      <div className="space-y-6">
        <Section
          titre={`Lieux (${e.lieux.length})`}
          actions={
            <Gate perm="entreprises.manage">
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setChoixLieux(true)}>Choisir les lieux</button>
            </Gate>
          }
        >
          {e.lieux.length ? (
            <ul className="flex flex-wrap gap-2 text-sm">
              {e.lieux.map((l) => (
                <li key={l.id}>
                  <Link href={`/lieux/${l.id}`} className="rounded-md bg-surface-2 px-2 py-1 hover:text-accent">
                    {l.enseigne}{l.ville ? <span className="text-ink-muted"> · {l.ville}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Vide>Aucun lieu : ses comptes ne verraient rien.</Vide>
          )}
        </Section>
        <Section titre="Comptes clients">
          <ComptesEntreprise base={`/entreprises/${id}`} cle={cle} donnees={e} peutGerer={gere && e.configure && e.actif} />
        </Section>
      </div>
      <Modale titre="Renommer l'entreprise" ouverte={renommer} onFermer={() => setRenommer(false)}>
        {renommer && <FormNom id={id} nom={e.nom} onFini={() => { client.invalidateQueries({ queryKey: cle }); setRenommer(false); }} />}
      </Modale>
      <Modale titre="Lieux de l'entreprise" ouverte={choixLieux} onFermer={() => setChoixLieux(false)}>
        {choixLieux && <FormLieux id={id} lieuIds={e.lieux.map((l) => l.id)} onFini={() => { client.invalidateQueries({ queryKey: cle }); setChoixLieux(false); }} />}
      </Modale>
    </>
  );
}

function FormNom({ id, nom: initial, onFini }: { id: number; nom: string; onFini: () => void }) {
  const [nom, setNom] = useState(initial);
  const enregistrer = useMutation({ mutationFn: () => api(`/entreprises/${id}`, { method: "PATCH", json: { nom } }), onSuccess: onFini });
  return (
    <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); enregistrer.mutate(); }}>
      <label className="block">
        <span className="etiquette">Nom *</span>
        <input className="champ" required maxLength={200} value={nom} onChange={(ev) => setNom(ev.target.value)} />
      </label>
      {enregistrer.error && <p role="alert" className="text-sm text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>Enregistrer</button>
    </form>
  );
}

/** Lieux de l'entreprise : recherche dans tous les lieux, cochés d'abord (un lieu n'appartient qu'à une entreprise) */
function FormLieux({ id, lieuIds, onFini }: { id: number; lieuIds: number[]; onFini: () => void }) {
  const [coches, setCoches] = useState(new Set(lieuIds));
  const [recherche, setRecherche] = useState("");
  const { data: lieux } = useQuery({ queryKey: ["lieux", ""], queryFn: () => api<LieuListe[]>("/lieux") });
  const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = normaliser(recherche.trim());
  const choisis = (lieux ?? []).filter((l) => coches.has(l.id));
  const proposes = (lieux ?? []).filter((l) => !coches.has(l.id) && (!q || normaliser(`${l.enseigne} ${l.ville ?? ""} ${l.codePostal ?? ""}`).includes(q))).slice(0, 15);
  const basculer = (lid: number) =>
    setCoches((c) => {
      const n = new Set(c);
      if (n.has(lid)) n.delete(lid);
      else n.add(lid);
      return n;
    });
  const enregistrer = useMutation({ mutationFn: () => api(`/entreprises/${id}/lieux`, { method: "PUT", json: { lieuIds: [...coches] } }), onSuccess: onFini });

  return (
    <form className="space-y-3" onSubmit={(ev) => { ev.preventDefault(); enregistrer.mutate(); }}>
      <input className="champ" placeholder="Rechercher un lieu, une ville…" value={recherche} onChange={(ev) => setRecherche(ev.target.value)} aria-label="Rechercher un lieu" />
      <div className="max-h-72 overflow-y-auto rounded-md border border-line p-2 text-sm">
        {[...choisis, ...proposes].map((l) => (
          <label key={l.id} className="flex items-center gap-2 py-1">
            <input type="checkbox" checked={coches.has(l.id)} onChange={() => basculer(l.id)} />
            <span className={coches.has(l.id) ? "font-medium" : ""}>{l.enseigne}</span>
            {l.ville && <span className="text-xs text-ink-muted">{l.ville}</span>}
          </label>
        ))}
        {!choisis.length && !proposes.length && <p className="py-2 text-xs text-ink-muted">{lieux ? "Aucun lieu ne correspond." : "Chargement…"}</p>}
      </div>
      <p className="text-xs text-ink-muted">Un lieu n&apos;appartient qu&apos;à une entreprise. Un lieu décoché n&apos;est plus visible par les comptes de l&apos;entreprise.</p>
      {enregistrer.error && <p role="alert" className="text-sm text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>Enregistrer</button>
    </form>
  );
}

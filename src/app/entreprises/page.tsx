"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Gate, PageGuard } from "@/lib/perms";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";

// Entreprises clientes (option 2 du 20/11/2026) : chacune possède des lieux, et ses comptes se connectent par « Je suis
// client » (realm Keycloak « regie »), séparés des salariés.

interface Entreprise {
  id: number;
  nom: string;
  actif: boolean;
  nbLieux: number;
  nbComptes: number;
}

export default function PageEntreprises() {
  return (
    <PageGuard perm="pages.entreprises.view">
      <Entreprises />
    </PageGuard>
  );
}

function Entreprises() {
  const router = useRouter();
  const [nouvelle, setNouvelle] = useState(false);
  const [nom, setNom] = useState("");
  const { data, error, isPending } = useQuery({ queryKey: ["entreprises"], queryFn: () => api<{ configure: boolean; entreprises: Entreprise[] }>("/entreprises") });
  const creer = useMutation({
    mutationFn: () => api<{ id: number }>("/entreprises", { method: "POST", json: { nom } }),
    onSuccess: (e) => router.push(`/entreprises/${e.id}`),
  });

  return (
    <>
      <EnTete
        titre="Entreprises clientes"
        sousTitre="Les comptes clients de la Régie : chaque entreprise a ses lieux et ses comptes, qui se connectent par « Je suis client »."
        actions={
          <Gate perm="entreprises.manage">
            <button type="button" className="bouton" onClick={() => setNouvelle(true)}>Nouvelle entreprise</button>
          </Gate>
        }
      />
      {data && !data.configure && (
        <p className="mb-4 rounded-md bg-warn-bg p-3 text-sm text-warn-ink">
          La connexion des clients n&apos;est pas encore configurée (realm Keycloak « regie ») : les entreprises peuvent être préparées, mais aucun compte ne peut être invité.
        </p>
      )}
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.entreprises.length && <Vide>Aucune entreprise pour le moment.</Vide>}
      {data && data.entreprises.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-2 font-medium">Entreprise</th>
                <th className="px-4 py-2 text-right font-medium">Lieux</th>
                <th className="px-4 py-2 text-right font-medium">Comptes actifs</th>
                <th className="px-4 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.entreprises.map((e) => (
                <tr key={e.id} className="hover:bg-surface-2">
                  <td className="px-4 py-2">
                    <Link href={`/entreprises/${e.id}`} className="font-medium hover:text-accent">{e.nom}</Link>
                  </td>
                  <td className="tabular px-4 py-2 text-right">{e.nbLieux}</td>
                  <td className="tabular px-4 py-2 text-right">{e.nbComptes}</td>
                  <td className="px-4 py-2">{e.actif ? <Badge ton="ok">Active</Badge> : <Badge ton="neutre">Désactivée</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modale titre="Nouvelle entreprise" ouverte={nouvelle} onFermer={() => setNouvelle(false)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); creer.mutate(); }}>
          <label className="block">
            <span className="etiquette">Nom *</span>
            <input className="champ" required maxLength={200} value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          {creer.error && <p role="alert" className="text-sm text-bad">{creer.error.message}</p>}
          <button className="bouton" disabled={creer.isPending}>Créer</button>
        </form>
      </Modale>
    </>
  );
}

"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs, type LieuListe } from "@/lib/api";
import { depuis, euros, nombre } from "@/lib/format";
import { useReferentiel } from "@/components/Filtres";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";

const STATUTS: Record<string, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  ACTIF: { libelle: "Actif", ton: "ok" },
  SUSPENDU: { libelle: "Suspendu", ton: "warn" },
  RESILIE: { libelle: "Résilié", ton: "neutre" },
  PROSPECT: { libelle: "Prospect", ton: "neutre" },
};

export default function ListeLieux() {
  const [recherche, setRecherche] = useState("");
  const [typeLieuId, setTypeLieuId] = useState("");
  const [statut, setStatut] = useState("");
  const q = useDeferredValue(recherche);
  const { data: ref } = useReferentiel();
  const query = qs({ q, typeLieuId, statut });
  const { data, error, isPending } = useQuery({
    queryKey: ["lieux", query],
    queryFn: () => api<LieuListe[]>(`/lieux${query}`),
  });

  return (
    <>
      <EnTete
        titre="Lieux"
        sousTitre={data ? `${data.length} lieu${data.length > 1 ? "x" : ""}` : undefined}
        actions={<Link href="/lieux/nouveau" className="bouton">Nouveau lieu</Link>}
      />

      <div className="carte mb-4 grid gap-2 p-3 sm:grid-cols-3">
        <label>
          <span className="etiquette">Recherche</span>
          <input className="champ" placeholder="Enseigne, raison sociale, ville…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <label>
          <span className="etiquette">Type de lieu</span>
          <select className="champ" value={typeLieuId} onChange={(e) => setTypeLieuId(e.target.value)}>
            <option value="">Tous</option>
            {ref?.listes.TYPE_LIEU.map((t) => (
              <option key={t.id} value={t.id}>{t.libelle}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="etiquette">Statut</span>
          <select className="champ" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Clients (hors prospects)</option>
            {Object.entries(STATUTS).map(([k, s]) => (
              <option key={k} value={k}>{s.libelle}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.length && <Vide>Aucun lieu. Créez le premier avec « Nouveau lieu ».</Vide>}
      {data && data.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Bornes</th>
                <th className="px-4 py-3 text-right font-medium">CA 30 j</th>
                <th className="px-4 py-3 text-right font-medium">Ventes 30 j</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.map((l) => (
                <tr key={l.id} className="border-t border-line hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/lieux/${l.id}`} className="font-medium hover:underline">{l.enseigne}</Link>
                    <div className="text-xs text-ink-muted">{[l.raisonSociale, l.ville].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {l.typeLieu.libelle}
                    {l.saisonnalite === "SAISONNIER" && <span className="text-ink-muted"> · saisonnier</span>}
                  </td>
                  <td className="px-4 py-3">
                    {l.bornes.length ? (
                      l.bornes.map((b) => (
                        <div key={b.id} className="text-xs">
                          <span className="font-medium">{b.identifiant}</span>{" "}
                          <span className="text-ink-muted">vente {depuis(b.derniereVente)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-ink-muted">aucune</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{euros(l.ca30jCents)}</td>
                  <td className="px-4 py-3 text-right">{nombre(l.ventes30j)}</td>
                  <td className="px-4 py-3">
                    <Badge ton={STATUTS[l.statut]?.ton ?? "neutre"}>{STATUTS[l.statut]?.libelle ?? l.statut}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

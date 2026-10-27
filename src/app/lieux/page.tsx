"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs, type LieuListe } from "@/lib/api";
import { depuis, euros, nombre } from "@/lib/format";
import { DEPARTEMENTS, libelleDepartement } from "@/lib/departements";
import { useReferentiel } from "@/components/Filtres";
import { OngletsLieux } from "@/components/OngletsLieux";
import { peut, useMoi } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";

const STATUTS: Record<string, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  ACTIF: { libelle: "Actif", ton: "ok" },
  SUSPENDU: { libelle: "Suspendu", ton: "warn" },
  RESILIE: { libelle: "Résilié", ton: "neutre" },
  PROSPECT: { libelle: "Prospect", ton: "neutre" },
};

export default function ListeLieux() {
  const moi = useMoi();
  const [recherche, setRecherche] = useState("");
  const [typeLieuId, setTypeLieuId] = useState("");
  const [statut, setStatut] = useState("");
  // Filtrés ici, sur la liste reçue : les choix proposés restent ceux des lieux affichés
  const [departement, setDepartement] = useState("");
  const [antenneId, setAntenneId] = useState("");
  const [gammeId, setGammeId] = useState("");
  const [parc, setParc] = useState("");
  const q = useDeferredValue(recherche);
  const { data: ref } = useReferentiel();
  const query = qs({ q, typeLieuId, statut });
  const { data, error, isPending } = useQuery({
    queryKey: ["lieux", query],
    queryFn: () => api<LieuListe[]>(`/lieux${query}`),
  });

  const departements = [...new Set((data ?? []).map((l) => l.departement).filter((d): d is string => !!d))].sort();
  const antennes = (ref?.listes.ANTENNE ?? []).filter((a) => a.actif || String(a.id) === antenneId);
  const lieux = (data ?? []).filter(
    (l) =>
      (!departement || l.departement === departement) &&
      (!antenneId || (antenneId === "aucune" ? !l.antenne : String(l.antenne?.id) === antenneId)) &&
      (!gammeId || l.bornes.some((b) => String(b.gamme.id) === gammeId)) &&
      (!parc || l.parc === parc)
  );
  const filtresActifs = departement || antenneId || gammeId || parc;

  return (
    <>
      <EnTete
        titre="Lieux"
        sousTitre={data ? `${lieux.length} lieu${lieux.length > 1 ? "x" : ""}${filtresActifs ? ` sur ${data.length}` : ""}` : undefined}
        actions={peut.gererLieux(moi.role) ? <Link href="/lieux/nouveau" className="bouton">Nouveau lieu</Link> : undefined}
      />
      <OngletsLieux actif="liste" />

      <div className="carte mb-4 grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-7">
        <label className="sm:col-span-3 lg:col-span-2">
          <span className="etiquette">Recherche</span>
          <input id="lieux-recherche" className="champ" placeholder="Enseigne, raison sociale, ville…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <label>
          <span className="etiquette">Département</span>
          <select id="lieux-departement" className="champ" value={departement} onChange={(e) => setDepartement(e.target.value)}>
            <option value="">Tous</option>
            {departements.map((d) => <option key={d} value={d}>{d} · {DEPARTEMENTS[d] ?? ""}</option>)}
          </select>
        </label>
        <label>
          <span className="etiquette">Antenne Selfizee</span>
          <select id="lieux-antenne" className="champ" value={antenneId} onChange={(e) => setAntenneId(e.target.value)}>
            <option value="">Toutes</option>
            {antennes.map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
            <option value="aucune">Sans antenne</option>
          </select>
        </label>
        <label>
          <span className="etiquette">Type de borne</span>
          <select id="lieux-gamme" className="champ" value={gammeId} onChange={(e) => setGammeId(e.target.value)}>
            <option value="">Toutes</option>
            {ref?.gammes.map((g) => <option key={g.id} value={g.id}>{g.libelle}</option>)}
          </select>
        </label>
        <label>
          <span className="etiquette">Parc</span>
          <select id="lieux-parc" className="champ" value={parc} onChange={(e) => setParc(e.target.value)}>
            <option value="">Tous</option>
            <option value="SELFIZEE">Parc Selfizee</option>
            <option value="CLIENT">Parc client</option>
          </select>
        </label>
        <label>
          <span className="etiquette">Type de lieu</span>
          <select id="lieux-type" className="champ" value={typeLieuId} onChange={(e) => setTypeLieuId(e.target.value)}>
            <option value="">Tous</option>
            {ref?.listes.TYPE_LIEU.map((t) => (
              <option key={t.id} value={t.id}>{t.libelle}</option>
            ))}
          </select>
        </label>
        <label className="lg:col-start-7 lg:row-start-1">
          <span className="etiquette">Statut</span>
          <select id="lieux-statut" className="champ" value={statut} onChange={(e) => setStatut(e.target.value)}>
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
      {data && data.length > 0 && !lieux.length && <Vide>Aucun lieu ne correspond à ces filtres.</Vide>}
      {lieux.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium">Ville</th>
                <th className="px-4 py-3 font-medium">Antenne</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Bornes</th>
                {peut.voirVentes(moi.role) && (
                  <>
                    <th className="px-4 py-3 text-right font-medium">CA 30 j</th>
                    <th className="px-4 py-3 text-right font-medium">Ventes 30 j</th>
                  </>
                )}
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {lieux.map((l) => (
                <tr key={l.id} className="border-t border-line hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/lieux/${l.id}`} className="font-medium hover:underline">{l.enseigne}</Link>
                    <div className="text-xs text-ink-muted">{l.raisonSociale}</div>
                    {l.parc === "CLIENT" && <Badge ton="neutre">Parc client</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {l.ville ?? <span className="text-ink-muted">—</span>}
                    {l.departement && <div className="text-xs text-ink-muted">{libelleDepartement(l.departement)}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{l.antenne?.libelle ?? <span className="text-ink-muted">—</span>}</td>
                  <td className="px-4 py-3 text-ink-2">
                    {l.typeLieu.libelle}
                    {l.saisonnalite === "SAISONNIER" && <span className="text-ink-muted"> · saisonnier</span>}
                  </td>
                  <td className="px-4 py-3">
                    {l.bornes.length ? (
                      l.bornes.map((b) => (
                        <div key={b.id} className="text-xs">
                          <span className="font-medium">{b.identifiant}</span> <span className="text-ink-muted">{b.gamme.libelle} · vente {depuis(b.derniereVente)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-ink-muted">aucune</span>
                    )}
                  </td>
                  {peut.voirVentes(moi.role) && (
                    <>
                      <td className="px-4 py-3 text-right">{euros(l.ca30jCents ?? 0)}</td>
                      <td className="px-4 py-3 text-right">{nombre(l.ventes30j ?? 0)}</td>
                    </>
                  )}
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

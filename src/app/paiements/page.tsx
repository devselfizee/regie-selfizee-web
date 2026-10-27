"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type BorneListe, type LieuListe, type Vente } from "@/lib/api";
import { dateHeure, euros, GRATUITES, MOYENS, nombre, OPTIONS_MOYENS } from "@/lib/format";
import { versCents } from "@/lib/commissions";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { Exporter } from "@/components/BoutonExport";

export default function PagePaiements() {
  return (
    <Reserve roles={["ADMIN"]}>
      <Paiements />
    </Reserve>
  );
}

const STATUTS: Record<string, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  ACCEPTEE: { libelle: "Acceptée", ton: "ok" },
  REFUSEE: { libelle: "Refusée", ton: "crit" },
  ANNULEE: { libelle: "Annulée", ton: "neutre" },
  EXPIREE: { libelle: "Sans réponse du terminal", ton: "warn" },
  OFFERTE: { libelle: "Tirage offert (non débité)", ton: "warn" },
  REMBOURSEE: { libelle: "Remboursement", ton: "neutre" },
};

const TYPES: { cle: string; libelle: string; aide: string }[] = [
  { cle: "paiements", libelle: "Tous les paiements", aide: "Chaque passage par le terminal ou le QR, encaissé ou non, et les remboursements" },
  { cle: "ventes", libelle: "Ventes encaissées", aide: "Acceptées et débitées, et les remboursements" },
  { cle: "non_abouties", libelle: "Non abouties", aide: "Refusées, annulées, sans réponse du terminal, tirages offerts : aucun débit" },
  { cle: "remboursements", libelle: "Remboursements", aide: "Saisis ici, rattachés à leur vente" },
  { cle: "gratuites", libelle: "Séances gratuites", aide: "Séances à 0 € : mode gratuit, code staff, sans tirage…" },
  { cle: "tout", libelle: "Tout", aide: "Toutes les séances transmises par les bornes" },
];

interface PagePaiements {
  total: number;
  page: number;
  parPage: number;
  totaux: { nbVentes: number; encaisseTtcCents: number; rembourseTtcCents: number };
  lignes: Vente[];
}

function Paiements() {
  const [q, setQ] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [type, setType] = useState("paiements");
  const [lieuId, setLieuId] = useState("");
  const [borneId, setBorneId] = useState("");
  const [moyen, setMoyen] = useState("");
  const [parc, setParc] = useState("SELFIZEE");
  const [page, setPage] = useState(1);
  const [rembourser, setRembourser] = useState<Vente | null>(null);
  // Tout changement de filtre revient à la première page
  const changer = <T,>(maj: (v: T) => void) => (v: T) => {
    maj(v);
    setPage(1);
  };
  const recherche = useDeferredValue(q.trim());
  const query = qs({
    q: recherche || undefined, du: du || undefined, au: au || undefined, type, lieuId: lieuId || undefined,
    borneId: borneId || undefined, moyenPaiement: moyen || undefined, parc: parc || undefined, page,
  });
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["ventes", query],
    queryFn: () => api<PagePaiements>(`/ventes${query}`),
    placeholderData: keepPreviousData,
  });
  const lieux = useQuery({ queryKey: ["lieux", "paiements"], queryFn: () => api<LieuListe[]>("/lieux?statut="), staleTime: 5 * 60_000 });
  const bornes = useQuery({ queryKey: ["bornes"], queryFn: () => api<BorneListe[]>("/bornes"), staleTime: 5 * 60_000 });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;
  const typeChoisi = TYPES.find((x) => x.cle === type);

  return (
    <>
      <EnTete
        titre="Paiements"
        sousTitre="Tous les paiements remontés par les bornes. Une vente se rembourse ici : la borne ne rembourse jamais."
        actions={<Exporter libelle="Exporter" chemin="/export/transactions" requete={qs({ du: du || undefined, au: au || undefined, lieuId: lieuId || undefined, parc: parc || undefined })} />}
      />
      <div className="carte mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="etiquette">Recherche</span>
          <input id="paiements-recherche" className="champ" placeholder="S513-20261005-K7PX2M-1, n° d'autorisation 554821, pi_…" value={q} onChange={(e) => changer(setQ)(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Du</span>
          <input id="paiements-du" type="date" className="champ" value={du} max={au || undefined} onChange={(e) => changer(setDu)(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Au</span>
          <input id="paiements-au" type="date" className="champ" value={au} min={du || undefined} onChange={(e) => changer(setAu)(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Afficher</span>
          <select id="paiements-type" className="champ" value={type} onChange={(e) => changer(setType)(e.target.value)}>
            {TYPES.map((x) => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">Lieu</span>
          <select id="paiements-lieu" className="champ" value={lieuId} onChange={(e) => changer(setLieuId)(e.target.value)}>
            <option value="">Tous</option>
            {lieux.data?.map((l) => <option key={l.id} value={l.id}>{l.enseigne}{l.ville ? ` · ${l.ville}` : ""}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">Borne</span>
          <select id="paiements-borne" className="champ" value={borneId} onChange={(e) => changer(setBorneId)(e.target.value)}>
            <option value="">Toutes</option>
            {bornes.data?.map((b) => <option key={b.id} value={b.id}>{b.identifiant}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="etiquette">Moyen</span>
            <select id="paiements-moyen" className="champ" value={moyen} onChange={(e) => changer(setMoyen)(e.target.value)}>
              <option value="">Tous</option>
              {OPTIONS_MOYENS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="etiquette">Parc</span>
            <select id="paiements-parc" className="champ" value={parc} onChange={(e) => changer(setParc)(e.target.value)}>
              <option value="SELFIZEE">Selfizee</option>
              <option value="CLIENT">Client</option>
              <option value="">Tout</option>
            </select>
          </label>
        </div>
        {typeChoisi && !recherche && <p className="text-xs text-ink-muted sm:col-span-2 lg:col-span-4">{typeChoisi.aide}.</p>}
        {recherche && <p className="text-xs text-ink-muted sm:col-span-2 lg:col-span-4">Une recherche porte sur toutes les séances, quel que soit « Afficher ».</p>}
      </div>

      {data && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span><strong className="tabular">{nombre(data.total)}</strong> ligne{data.total > 1 ? "s" : ""}{isFetching ? " · mise à jour…" : ""}</span>
          <span>Encaissé : <strong className="tabular">{euros(data.totaux.encaisseTtcCents)}</strong> TTC <span className="text-ink-muted">({nombre(data.totaux.nbVentes)} vente{data.totaux.nbVentes > 1 ? "s" : ""}{data.totaux.rembourseTtcCents > 0 ? `, ${euros(data.totaux.rembourseTtcCents)} remboursés déduits` : ""})</span></span>
        </div>
      )}
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.lignes.length && <Vide>Aucun paiement ne correspond.</Vide>}
      {data && data.lignes.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Transaction</th>
                <th className="px-4 py-3 font-medium">Borne · lieu</th>
                <th className="px-4 py-3 font-medium">Paiement</th>
                <th className="px-4 py-3 text-right font-medium">Montant</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.lignes.map((v) => {
                const statut = STATUTS[v.statut] ?? { libelle: v.statut, ton: "neutre" as const };
                const vendue = (v.statut === "ACCEPTEE" && !v.gratuite && v.moyenPaiement !== "AUCUN" && v.montantTtcCents > 0) || v.statut === "REMBOURSEE";
                const remboursable = v.statut === "ACCEPTEE" && v.montantTtcCents > v.rembourseCents && v.moyenPaiement !== "AUCUN";
                return (
                  <tr key={v.id} className="border-t border-line align-top">
                    <td className="px-4 py-3 whitespace-nowrap">{dateHeure(v.horodatage)}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{v.transactionIdModule}</div>
                      {v.referenceMonetique && <div className="text-xs text-ink-muted">réf. {v.referenceMonetique}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Link className="hover:underline" href={`/bornes/${v.borne.id}`}>{v.borne.identifiant}</Link>
                      {v.lieu ? <> · <Link className="hover:underline" href={`/lieux/${v.lieu.id}`}>{v.lieu.enseigne}</Link></> : <span className="text-ink-muted"> · non affectée</span>}
                    </td>
                    <td className="px-4 py-3">
                      {MOYENS[v.moyenPaiement] ?? v.moyenPaiement}
                      <div className="text-xs text-ink-muted">{v.typeModule.libelle}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {vendue ? (
                        euros(v.montantTtcCents)
                      ) : (
                        <span className="text-ink-muted" title="Montant demandé, non encaissé">
                          {euros(v.montantTtcCents)}
                          {v.montantTtcCents > 0 && <span className="block text-xs">demandés, non encaissés</span>}
                        </span>
                      )}
                      {v.rembourseCents > 0 && <div className="text-xs text-bad">− {euros(v.rembourseCents)} remboursés</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge ton={statut.ton}>{statut.libelle}</Badge>
                        {v.encaissement === "INCERTAIN" && <Badge ton="warn">À rapprocher</Badge>}
                        {(v.gratuite || (v.statut === "ACCEPTEE" && v.moyenPaiement === "AUCUN")) && (
                          <Badge ton="neutre">Gratuit{v.gratuite ? ` — ${GRATUITES[v.gratuite] ?? v.gratuite.toLowerCase()}` : ""}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {remboursable && <button className="text-xs text-accent hover:underline" onClick={() => setRembourser(v)}>Rembourser</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button type="button" className="bouton-second !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Plus récents</button>
          <span className="text-ink-2 tabular">Page {page} / {pages}</span>
          <button type="button" className="bouton-second !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Plus anciens →</button>
        </div>
      )}
      <Modale titre="Rembourser une vente" ouverte={rembourser !== null} onFermer={() => setRembourser(null)}>
        {rembourser && <FormRemboursement vente={rembourser} onFini={() => setRembourser(null)} />}
      </Modale>
    </>
  );
}

function FormRemboursement({ vente, onFini }: { vente: Vente; onFini: () => void }) {
  const client = useQueryClient();
  const reste = vente.montantTtcCents - vente.rembourseCents;
  const [montant, setMontant] = useState((reste / 100).toFixed(2).replace(".", ","));
  const [motif, setMotif] = useState("");
  const envoyer = useMutation({
    mutationFn: () => api(`/ventes/${vente.id}/remboursement`, { method: "POST", json: { montantCents: versCents(montant), motif } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["ventes"] });
      onFini();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); envoyer.mutate(); }}>
      <p className="text-sm text-ink-2">
        Vente <span className="font-mono">{vente.transactionIdModule}</span> du {dateHeure(vente.horodatage)} : {euros(vente.montantTtcCents)}
        {vente.rembourseCents > 0 && `, dont ${euros(vente.rembourseCents)} déjà remboursés`}. Le remboursement est daté d&apos;aujourd&apos;hui et
        se déduit du CA (et de la base de commission) du lieu.
      </p>
      <label className="block">
        <span className="etiquette">Montant (€) *</span>
        <input className="champ" required inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} />
      </label>
      <label className="block">
        <span className="etiquette">Motif *</span>
        <input className="champ" required placeholder="Tirage raté, double débit…" value={motif} onChange={(e) => setMotif(e.target.value)} />
      </label>
      {envoyer.error && <Erreur erreur={envoyer.error} />}
      <button className="bouton" disabled={envoyer.isPending}>Rembourser</button>
    </form>
  );
}

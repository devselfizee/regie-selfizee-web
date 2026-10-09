"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type Vente } from "@/lib/api";
import { dateHeure, euros, MOYENS } from "@/lib/format";
import { versCents } from "@/lib/commissions";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";

export default function PageVentes() {
  return (
    <Reserve roles={["ADMIN"]}>
      <Ventes />
    </Reserve>
  );
}

const STATUTS: Record<string, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  ACCEPTEE: { libelle: "Acceptée", ton: "ok" },
  REFUSEE: { libelle: "Refusée", ton: "crit" },
  ANNULEE: { libelle: "Annulée", ton: "neutre" },
  EXPIREE: { libelle: "Expirée", ton: "warn" },
  OFFERTE: { libelle: "Offerte (non débitée)", ton: "warn" },
  REMBOURSEE: { libelle: "Remboursement", ton: "neutre" },
};

function Ventes() {
  const [q, setQ] = useState("");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [rembourser, setRembourser] = useState<Vente | null>(null);
  const query = qs({ q: q.trim() || undefined, du: du || undefined, au: au || undefined });
  const { data, error, isPending } = useQuery({
    queryKey: ["ventes", query],
    queryFn: () => api<Vente[]>(`/ventes${query}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <EnTete
        titre="Ventes"
        sousTitre="Retrouver une vente (identifiant de transaction, n° d'autorisation, identifiant Stripe) et la rembourser : la borne ne rembourse jamais, le remboursement se saisit ici."
      />
      <div className="carte mb-4 grid gap-3 p-3 sm:grid-cols-[2fr_1fr_1fr]">
        <label className="block">
          <span className="etiquette">Recherche</span>
          <input className="champ" placeholder="S513-20261005-K7PX2M-1, 554821, pi_…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Du</span>
          <input type="date" className="champ" value={du} onChange={(e) => setDu(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Au</span>
          <input type="date" className="champ" value={au} onChange={(e) => setAu(e.target.value)} />
        </label>
      </div>
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.length && <Vide>Aucune vente ne correspond.</Vide>}
      {data && data.length > 0 && (
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
              {data.map((v) => {
                const statut = STATUTS[v.statut] ?? { libelle: v.statut, ton: "neutre" as const };
                const remboursable = v.statut === "ACCEPTEE" && v.montantTtcCents > v.rembourseCents;
                return (
                  <tr key={v.id} className="border-t border-line align-top">
                    <td className="px-4 py-3 whitespace-nowrap">{dateHeure(v.horodatage)}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{v.transactionIdModule}</div>
                      {v.referenceMonetique && <div className="text-xs text-ink-muted">réf. {v.referenceMonetique}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Link className="hover:underline" href={`/bornes/${v.borne.id}`}>{v.borne.identifiant}</Link>
                      {v.lieu && <> · <Link className="hover:underline" href={`/lieux/${v.lieu.id}`}>{v.lieu.enseigne}</Link></>}
                    </td>
                    <td className="px-4 py-3">
                      {MOYENS[v.moyenPaiement] ?? v.moyenPaiement}
                      <div className="text-xs text-ink-muted">{v.typeModule.libelle}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {euros(v.montantTtcCents)}
                      {v.rembourseCents > 0 && <div className="text-xs text-bad">− {euros(v.rembourseCents)} remboursés</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge ton={statut.ton}>{statut.libelle}</Badge>
                        {v.encaissement === "INCERTAIN" && <Badge ton="warn">Encaissement incertain</Badge>}
                        {v.gratuite && <Badge ton="neutre">Gratuit</Badge>}
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
      {data && data.length === 100 && <p className="mt-2 text-xs text-ink-muted">100 ventes affichées au plus : précisez la recherche.</p>}
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

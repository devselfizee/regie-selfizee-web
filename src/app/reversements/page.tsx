"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type Reversement, type StatutReversement } from "@/lib/api";
import { STATUTS, versCents } from "@/lib/commissions";
import { euros } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Exporter } from "@/components/BoutonExport";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";

const ONGLETS: { cle: string; libelle: string; statuts: StatutReversement[] | null }[] = [
  { cle: "valider", libelle: "À valider", statuts: ["CALCULE"] },
  { cle: "facturer", libelle: "À facturer", statuts: ["VALIDE"] },
  { cle: "payer", libelle: "À payer", statuts: ["FACTURE_PAR_LIEU", "AUTOFACTURE"] },
  { cle: "payes", libelle: "Payés", statuts: ["PAYE"] },
  { cle: "tous", libelle: "Tous", statuts: null },
];

export default function PageReversements() {
  return (
    <Reserve roles={["ADMIN"]}>
      <Reversements />
    </Reserve>
  );
}

function Reversements() {
  const client = useQueryClient();
  const [onglet, setOnglet] = useState(ONGLETS[0]);
  const [action, setAction] = useState<{ type: "corriger" | "facturer"; r: Reversement } | null>(null);
  const query = qs({ statut: onglet.statuts });
  const { data, error, isPending } = useQuery({
    queryKey: ["reversements", query],
    queryFn: () => api<Reversement[]>(`/reversements${query}`),
  });
  const rafraichir = () => client.invalidateQueries({ queryKey: ["reversements"] });

  const calculer = useMutation({
    mutationFn: () => api<{ calcules: number; figes: number; supprimes: number }>("/reversements/calculer", { method: "POST", json: {} }),
    onSuccess: rafraichir,
  });
  const envoyerValides = useMutation({
    mutationFn: () =>
      api<{ envoyes: number; sansDestinataire: string[]; echecs: { lieu: string; erreur: string }[] }>("/reversements/envoyer-valides", { method: "POST" }),
    onSuccess: rafraichir,
  });
  const statut = useMutation({
    mutationFn: ({ id, statut }: { id: number; statut: StatutReversement }) => api(`/reversements/${id}/statut`, { method: "PATCH", json: { statut } }),
    onSuccess: rafraichir,
  });

  const total = data?.reduce((s, r) => s + r.montantAReverserCents, 0) ?? 0;

  return (
    <>
      <EnTete
        titre="Reversements"
        sousTitre="Commissions dues aux lieux, période par période. Calculées automatiquement à la fin de chaque période ; une période validée n'est plus recalculée."
        actions={
          <>
            <button className="bouton-second" disabled={calculer.isPending} onClick={() => calculer.mutate()}>
              {calculer.isPending ? "Calcul…" : "Calculer les périodes terminées"}
            </button>
            <button className="bouton-second" disabled={envoyerValides.isPending} onClick={() => envoyerValides.mutate()}>
              {envoyerValides.isPending ? "Envoi…" : "Envoyer les relevés validés"}
            </button>
            <Exporter libelle="Export compta (validés)" chemin="/reversements/export" />
          </>
        }
      />
      {envoyerValides.error && <Erreur erreur={envoyerValides.error} />}
      {envoyerValides.data && (
        <div className="mb-3 text-sm text-ink-2">
          {envoyerValides.data.envoyes} relevé(s) envoyé(s).
          {envoyerValides.data.sansDestinataire.length > 0 && (
            <> Sans e-mail sur la fiche (à compléter) : {envoyerValides.data.sansDestinataire.join(", ")}.</>
          )}
          {envoyerValides.data.echecs.map((e) => <div key={e.lieu} className="text-bad">{e.lieu} : {e.erreur}</div>)}
        </div>
      )}
      {calculer.data && (
        <p className="mb-3 text-sm text-ink-2">
          {calculer.data.calcules} période(s) calculée(s), {calculer.data.figes} déjà validée(s) laissée(s) telles quelles.
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-1" role="tablist">
        {ONGLETS.map((o) => (
          <button key={o.cle} role="tab" aria-selected={onglet.cle === o.cle} onClick={() => setOnglet(o)}
            className={`rounded-md px-3 py-2 text-sm ${onglet.cle === o.cle ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}>
            {o.libelle}
          </button>
        ))}
      </div>

      {(error || statut.error) && <Erreur erreur={error ?? statut.error} />}
      {isPending && !error && <Chargement />}
      {data && !data.length && <Vide>Aucun reversement dans cette liste.</Vide>}
      {data && data.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium">Période</th>
                <th className="px-4 py-3 text-right font-medium">Base</th>
                <th className="px-4 py-3 text-right font-medium">Commission</th>
                <th className="px-4 py-3 text-right font-medium">Corrections</th>
                <th className="px-4 py-3 text-right font-medium">À reverser</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-4 py-3"><Link className="font-medium hover:underline" href={`/lieux/${r.lieuId}`}>{r.lieu?.enseigne}</Link></td>
                  <td className="px-4 py-3 whitespace-nowrap capitalize">{r.periode}</td>
                  <td className="px-4 py-3 text-right text-ink-2">{euros(r.baseCalculCents)}</td>
                  <td className="px-4 py-3 text-right">
                    {euros(r.commissionCalculeeCents)}
                    {r.detailCalcul?.minimumApplique && <div className="text-xs text-ink-muted">minimum garanti</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-2">{r.ajustementsCents ? euros(r.ajustementsCents) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold">{euros(r.montantAReverserCents)}</td>
                  <td className="px-4 py-3">
                    <Badge ton={STATUTS[r.statut].ton}>{STATUTS[r.statut].libelle}</Badge>
                    {r.numeroFacture && <div className="mt-1 text-xs text-ink-muted">{r.numeroFacture}</div>}
                    {r.envoyeLe && <div className="mt-1 text-xs text-ink-muted">✉ envoyé</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Link className="bouton-second !px-2 !py-1 text-xs" href={`/reversements/${r.id}`}>Relevé</Link>
                      {r.statut === "CALCULE" && (
                        <>
                          <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setAction({ type: "corriger", r })}>Corriger</button>
                          <button className="bouton !px-2 !py-1 text-xs" onClick={() => statut.mutate({ id: r.id, statut: "VALIDE" })}>Valider</button>
                        </>
                      )}
                      {r.statut === "VALIDE" && (
                        <>
                          <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => statut.mutate({ id: r.id, statut: "CALCULE" })}>Dévalider</button>
                          <button className="bouton !px-2 !py-1 text-xs" onClick={() => setAction({ type: "facturer", r })}>Facturation</button>
                        </>
                      )}
                      {(r.statut === "FACTURE_PAR_LIEU" || r.statut === "AUTOFACTURE") && (
                        <button className="bouton !px-2 !py-1 text-xs" onClick={() => statut.mutate({ id: r.id, statut: "PAYE" })}>Marquer payé</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong">
                <td className="px-4 py-3 text-sm font-medium" colSpan={5}>Total ({data.length})</td>
                <td className="px-4 py-3 text-right font-semibold tabular">{euros(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modale titre="Correction manuelle" ouverte={action?.type === "corriger"} onFermer={() => setAction(null)}>
        {action?.type === "corriger" && <FormCorrection r={action.r} onFini={() => { setAction(null); rafraichir(); }} />}
      </Modale>
      <Modale titre="Facturation" ouverte={action?.type === "facturer"} onFermer={() => setAction(null)}>
        {action?.type === "facturer" && <FormFacturation r={action.r} onFini={() => { setAction(null); rafraichir(); }} />}
      </Modale>
    </>
  );
}

function FormCorrection({ r, onFini }: { r: Reversement; onFini: () => void }) {
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const corriger = useMutation({
    mutationFn: () => api(`/reversements/${r.id}/ajustements`, { method: "POST", json: { montantCents: versCents(montant), motif } }),
    onSuccess: onFini,
  });
  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); corriger.mutate(); }}>
      <p>
        {r.lieu?.enseigne} · <span className="capitalize">{r.periode}</span> — commission calculée {euros(r.commissionCalculeeCents)}.
        La correction est tracée (montant, motif, auteur) et conservée si la période est recalculée.
      </p>
      <label className="block">
        <span className="etiquette">Montant (négatif pour retirer) *</span>
        <span className="flex items-center gap-2">
          <input className="champ" inputMode="decimal" required placeholder="ex. 15 ou -10,50" value={montant} onChange={(e) => setMontant(e.target.value)} />
          <span className="text-ink-2">€</span>
        </span>
      </label>
      <label className="block">
        <span className="etiquette">Motif *</span>
        <input className="champ" required minLength={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
      </label>
      {corriger.error && <p role="alert" className="text-bad">{corriger.error.message}</p>}
      <button className="bouton" disabled={corriger.isPending}>Enregistrer la correction</button>
    </form>
  );
}

function FormFacturation({ r, onFini }: { r: Reversement; onFini: () => void }) {
  const [mode, setMode] = useState<"AUTOFACTURE" | "FACTURE_PAR_LIEU">("AUTOFACTURE");
  const [numero, setNumero] = useState("");
  const facturer = useMutation({
    mutationFn: () => api(`/reversements/${r.id}/statut`, { method: "PATCH", json: { statut: mode, numeroFacture: numero || null } }),
    onSuccess: onFini,
  });
  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); facturer.mutate(); }}>
      <p>{r.lieu?.enseigne} · <span className="capitalize">{r.periode}</span> — {euros(r.montantAReverserCents)} à reverser.</p>
      <fieldset className="space-y-1">
        <label className="flex gap-2"><input type="radio" checked={mode === "AUTOFACTURE"} onChange={() => setMode("AUTOFACTURE")} /> Autofacturé par Selfizee</label>
        <label className="flex gap-2"><input type="radio" checked={mode === "FACTURE_PAR_LIEU"} onChange={() => setMode("FACTURE_PAR_LIEU")} /> Facture reçue du lieu</label>
      </fieldset>
      <label className="block">
        <span className="etiquette">N° de facture</span>
        <input className="champ" value={numero} onChange={(e) => setNumero(e.target.value)} />
      </label>
      {facturer.error && <p role="alert" className="text-bad">{facturer.error.message}</p>}
      <button className="bouton" disabled={facturer.isPending}>Enregistrer</button>
    </form>
  );
}

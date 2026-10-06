"use client";

import { useDeferredValue, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ErreurApi, type Contrat, type ModeleCommission } from "@/lib/api";
import { depuisBp, depuisCents, versBp, versCents } from "@/lib/commissions";
import { euros } from "@/lib/format";

const MODELES: { value: ModeleCommission; label: string; aide: string }[] = [
  { value: "AUCUNE", label: "Aucune commission", aide: "Emplacement offert contre l'animation" },
  { value: "POURCENTAGE", label: "Pourcentage direct", aide: "X % du CA dès le premier euro" },
  { value: "POURCENTAGE_APRES_SEUIL", label: "Pourcentage après seuil", aide: "X % seulement à partir d'un montant" },
  { value: "PALIERS", label: "Paliers", aide: "Taux qui augmente par tranche de CA" },
  { value: "FORFAIT", label: "Forfait", aide: "Montant fixe par période, éventuellement + %" },
];

/** Premier jour du mois suivant (date d'effet proposée par défaut). */
const moisProchain = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 10);
};

export function FormContrat({ lieuId, actuel, onFini }: { lieuId: number; actuel?: Contrat; onFini: () => void }) {
  const client = useQueryClient();
  const [f, setF] = useState({
    modele: actuel?.modele ?? ("POURCENTAGE" as ModeleCommission),
    base: actuel?.base ?? "TTC",
    netRemboursements: actuel?.netRemboursements ?? true,
    periodicite: actuel?.periodicite ?? "MOIS",
    dateEffet: moisProchain(),
    taux: depuisBp(actuel?.tauxBp ?? null),
    seuil: depuisCents(actuel?.seuilCents ?? null),
    seuilMode: actuel?.seuilMode ?? "AU_DELA",
    seuilCumul: actuel?.seuilCumul ?? "PAR_PERIODE",
    forfait: depuisCents(actuel?.forfaitCents ?? null),
    minimum: depuisCents(actuel?.minimumGarantiCents ?? null),
    paliersMode: actuel?.paliersMode ?? "MARGINAL",
    paliers: actuel?.paliers.length
      ? actuel.paliers.map((p) => ({ depuis: depuisCents(p.depuisCents), taux: depuisBp(p.tauxBp) }))
      : [{ depuis: "0", taux: "10" }, { depuis: "1000", taux: "20" }],
    motifAvenant: "",
  });
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const corps = {
    modele: f.modele,
    base: f.base,
    netRemboursements: f.netRemboursements,
    periodicite: f.periodicite,
    dateEffet: f.dateEffet,
    tauxBp: versBp(f.taux),
    seuilCents: versCents(f.seuil),
    seuilMode: f.seuilMode,
    seuilCumul: f.seuilCumul,
    forfaitCents: versCents(f.forfait),
    minimumGarantiCents: versCents(f.minimum),
    paliersMode: f.paliersMode,
    paliers: f.paliers
      .map((p) => ({ depuisCents: versCents(p.depuis) ?? 0, tauxBp: versBp(p.taux) ?? 0 }))
      .sort((a, b) => a.depuisCents - b.depuisCents),
    motifAvenant: f.motifAvenant || null,
  };

  // Aperçu : la commission pour quelques CA, calculée par le moteur de l'API
  const apercu = useDeferredValue(JSON.stringify(corps));
  const simulation = useQuery({
    queryKey: ["simulation", apercu],
    queryFn: () =>
      api<{ valide: boolean; description?: string; exemples?: { caCents: number; commissionCents: number; minimumApplique: boolean }[] }>(
        "/commissions/simuler",
        { method: "POST", json: { ...JSON.parse(apercu), exemplesCents: [30000, 80000, 150000, 300000] } }
      ),
    placeholderData: (p) => p,
  });

  const enregistrer = useMutation({
    mutationFn: () => api(`/commissions/lieux/${lieuId}/contrats`, { method: "POST", json: corps }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["commissions", lieuId] });
      client.invalidateQueries({ queryKey: ["reversements"] });
      onFini();
    },
  });
  const erreurs = new Map(
    enregistrer.error instanceof ErreurApi ? (enregistrer.error.corps.champs ?? []).map((c) => [c.chemin.split(".")[0], c.message]) : []
  );

  const m = f.modele;
  return (
    <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      {actuel && (
        <p className="rounded-md bg-surface-2 p-3 text-xs text-ink-2">
          Avenant au contrat en cours (version {actuel.version}). Les périodes déjà validées ne seront pas recalculées.
        </p>
      )}

      <fieldset>
        <legend className="etiquette">Modèle</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {MODELES.map((o) => (
            <label key={o.value} className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2 ${m === o.value ? "border-accent bg-accent/5" : "border-line"}`}>
              <input type="radio" name="modele" checked={m === o.value} onChange={() => set({ modele: o.value })} />
              <span>
                <span className="font-medium">{o.label}</span>
                <span className="block text-xs text-ink-muted">{o.aide}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {m !== "AUCUNE" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ libelle="Base de calcul">
            <select className="champ" value={f.base} onChange={(e) => set({ base: e.target.value as "TTC" | "HT" })}>
              <option value="TTC">CA TTC</option>
              <option value="HT">CA HT</option>
            </select>
          </Champ>
          <Champ libelle="Période de calcul">
            <select className="champ" value={f.periodicite} onChange={(e) => set({ periodicite: e.target.value as typeof f.periodicite })}>
              <option value="MOIS">Mois</option>
              <option value="TRIMESTRE">Trimestre</option>
              <option value="SAISON">Saison (dates de la fiche lieu)</option>
              <option value="ANNEE">Année</option>
            </select>
          </Champ>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={f.netRemboursements} onChange={(e) => set({ netRemboursements: e.target.checked })} />
            Net des remboursements
          </label>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {(m === "POURCENTAGE" || m === "POURCENTAGE_APRES_SEUIL" || m === "FORFAIT") && (
          <Champ libelle={m === "FORFAIT" ? "+ pourcentage (optionnel)" : "Taux"} suffixe="%" erreur={erreurs.get("tauxBp")}>
            <input className="champ" inputMode="decimal" value={f.taux} onChange={(e) => set({ taux: e.target.value })} />
          </Champ>
        )}
        {m === "POURCENTAGE_APRES_SEUIL" && (
          <>
            <Champ libelle="Seuil" suffixe="€" erreur={erreurs.get("seuilCents")}>
              <input className="champ" inputMode="decimal" value={f.seuil} onChange={(e) => set({ seuil: e.target.value })} />
            </Champ>
            <Champ libelle="Le taux s'applique">
              <select className="champ" value={f.seuilMode} onChange={(e) => set({ seuilMode: e.target.value as typeof f.seuilMode })}>
                <option value="AU_DELA">À la part au-delà du seuil</option>
                <option value="DES_ATTEINTE">À tout le CA dès le seuil atteint</option>
              </select>
            </Champ>
          </>
        )}
        {m === "FORFAIT" && (
          <Champ libelle="Forfait par période" suffixe="€" erreur={erreurs.get("forfaitCents")}>
            <input className="champ" inputMode="decimal" value={f.forfait} onChange={(e) => set({ forfait: e.target.value })} />
          </Champ>
        )}
        {(m === "POURCENTAGE_APRES_SEUIL" || m === "PALIERS") && (
          <Champ libelle="Seuil / paliers">
            <select className="champ" value={f.seuilCumul} onChange={(e) => set({ seuilCumul: e.target.value as typeof f.seuilCumul })}>
              <option value="PAR_PERIODE">Remis à zéro chaque période</option>
              <option value="CUMULE">Cumulés depuis la date d&apos;effet</option>
            </select>
          </Champ>
        )}
        {m !== "AUCUNE" && (
          <Champ libelle="Minimum garanti (optionnel)" suffixe="€">
            <input className="champ" inputMode="decimal" value={f.minimum} onChange={(e) => set({ minimum: e.target.value })} />
          </Champ>
        )}
      </div>

      {m === "PALIERS" && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="etiquette !mb-0">Paliers</span>
            <select className="champ !w-auto" value={f.paliersMode} onChange={(e) => set({ paliersMode: e.target.value as typeof f.paliersMode })}>
              <option value="MARGINAL">Chaque tranche à son taux</option>
              <option value="GLOBAL">Taux du palier atteint sur tout le CA</option>
            </select>
          </div>
          {erreurs.get("paliers") && <p className="mb-1 text-xs text-bad">{erreurs.get("paliers")}</p>}
          <div className="space-y-2">
            {f.paliers.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-10 text-ink-2">dès</span>
                <input className="champ !w-28" inputMode="decimal" aria-label="Borne basse en euros" value={p.depuis}
                  onChange={(e) => set({ paliers: f.paliers.map((x, j) => (j === i ? { ...x, depuis: e.target.value } : x)) })} />
                <span className="text-ink-2">€ :</span>
                <input className="champ !w-20" inputMode="decimal" aria-label="Taux en pourcentage" value={p.taux}
                  onChange={(e) => set({ paliers: f.paliers.map((x, j) => (j === i ? { ...x, taux: e.target.value } : x)) })} />
                <span className="text-ink-2">%</span>
                <button type="button" className="text-ink-muted hover:text-bad" aria-label="Supprimer le palier"
                  onClick={() => set({ paliers: f.paliers.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 text-sm font-medium text-accent hover:underline"
            onClick={() => set({ paliers: [...f.paliers, { depuis: "", taux: "" }] })}>+ Ajouter un palier</button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Champ libelle="Date d'effet" erreur={erreurs.get("dateEffet")}>
          <input className="champ" type="date" required value={f.dateEffet} onChange={(e) => set({ dateEffet: e.target.value })} />
        </Champ>
        {actuel && (
          <Champ libelle="Motif de l'avenant">
            <input className="champ" value={f.motifAvenant} onChange={(e) => set({ motifAvenant: e.target.value })} />
          </Champ>
        )}
      </div>

      {/* Aperçu */}
      <div className="rounded-md border border-line bg-surface-2 p-3">
        <div className="text-xs font-medium text-ink-2">Aperçu</div>
        {simulation.data?.valide ? (
          <>
            <p className="mt-1">{simulation.data.description}</p>
            <table className="mt-2 w-full text-xs tabular">
              <thead className="text-ink-muted">
                <tr><th className="text-left font-medium">CA de la période</th><th className="text-right font-medium">Commission</th></tr>
              </thead>
              <tbody>
                {simulation.data.exemples!.map((e) => (
                  <tr key={e.caCents}>
                    <td>{euros(e.caCents)}</td>
                    <td className="text-right">{euros(e.commissionCents)}{e.minimumApplique && <span className="text-ink-muted"> (minimum)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-1 text-xs text-ink-muted">Complétez le contrat pour voir l&apos;aperçu.</p>
        )}
      </div>

      {enregistrer.error && !erreurs.size && <p role="alert" className="text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>{actuel ? "Enregistrer l'avenant" : "Enregistrer le contrat"}</button>
    </form>
  );
}

function Champ({ libelle, suffixe, erreur, children }: { libelle: string; suffixe?: string; erreur?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="etiquette">{libelle}</span>
      <span className="flex items-center gap-2">
        {children}
        {suffixe && <span className="text-ink-2">{suffixe}</span>}
      </span>
      {erreur && <span className="mt-1 block text-xs text-bad">{erreur}</span>}
    </label>
  );
}

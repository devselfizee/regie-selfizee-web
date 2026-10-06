"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type BorneDetail, type CategorieCout, type Cout, type Intervention, type Rentabilite, type RetourInvestissement } from "@/lib/api";
import { date, dateHeure, depuis, euros, eurosRond, jour, pct } from "@/lib/format";
import { depuisCents, versCents } from "@/lib/commissions";
import { Reserve, useMoi } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Section, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { axeCategorie, axeValeur, Graphique, type Jetons } from "@/components/Graphique";
import { PRESETS } from "@/components/Filtres";

export const CATEGORIES: Record<CategorieCout, string> = {
  CONSOMMABLES: "Consommables",
  DEPLACEMENT: "Déplacement",
  INTERVENTION: "Intervention",
  PIECE: "Pièce",
  AUTRE: "Autre",
};

export function FicheBorne({ id }: { id: number }) {
  return (
    <Reserve roles={["ADMIN", "TECHNICIEN"]}>
      <Fiche id={id} />
    </Reserve>
  );
}

function Fiche({ id }: { id: number }) {
  const moi = useMoi();
  const { data: b, error } = useQuery({ queryKey: ["borne", id], queryFn: () => api<BorneDetail>(`/bornes/${id}`) });
  if (error) return <Erreur erreur={error} />;
  if (!b) return <Chargement />;
  const actuelle = b.affectations.find((a) => !a.fin);
  const moduleActuel = b.modules.find((m) => !m.retireLe);

  return (
    <>
      <EnTete
        titre={b.identifiant}
        sousTitre={[b.gamme.libelle, b.numeroSerie, moduleActuel && `${moduleActuel.type.libelle}${moduleActuel.numeroSerie ? ` ${moduleActuel.numeroSerie}` : ""}`, b.logicielVersion && `v${b.logicielVersion}`]
          .filter(Boolean)
          .join(" · ")}
        actions={<Link href="/bornes" className="bouton-second">← Toutes les bornes</Link>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Info libelle="Lieu actuel">
          {actuelle ? <Link className="hover:underline" href={`/lieux/${actuelle.lieu.id}`}>{actuelle.lieu.enseigne}</Link> : <Badge ton="warn">Non affectée</Badge>}
        </Info>
        <Info libelle="Dernier signal">{depuis(b.dernierHeartbeat)}</Info>
        <Info libelle="Dernière vente">{depuis(b.derniereVente)}</Info>
      </div>

      <div className="space-y-6">
        {moi.role === "ADMIN" && <SectionRentabilite id={id} />}
        <SectionInterventions id={id} />
        <SectionCouts id={id} />
        <Section titre="Historique des emplacements">
          <ul className="divide-y divide-line text-sm">
            {b.affectations.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-2">
                <Link className="hover:underline" href={`/lieux/${a.lieu.id}`}>{a.lieu.enseigne}<span className="text-ink-muted"> · {a.lieu.ville}</span></Link>
                <span className="text-ink-2">{dateHeure(a.debut)} → {a.fin ? dateHeure(a.fin) : "aujourd'hui"}</span>
              </li>
            ))}
            {!b.affectations.length && <li className="py-2 text-ink-muted">Jamais installée.</li>}
          </ul>
        </Section>
      </div>
    </>
  );
}

function Info({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="carte p-4">
      <div className="text-xs text-ink-2">{libelle}</div>
      <div className="mt-1 font-medium">{children}</div>
    </div>
  );
}

// ─── Rentabilité (admin) ────────────────────────────────────

function SectionRentabilite({ id }: { id: number }) {
  const [periode, setPeriode] = useState(PRESETS[2].calcul()); // 90 jours
  const [achat, setAchat] = useState(false);
  const { data, error } = useQuery({
    queryKey: ["rentabilite", id, periode.du, periode.au],
    queryFn: () =>
      api<{ achat: { coutAchatCents: number | null; dureeAmortissementMois: number | null; dateMiseEnService: string | null }; rentabilite: Rentabilite; roi: RetourInvestissement | null }>(
        `/rentabilite/bornes/${id}${qs({ du: periode.du, au: periode.au })}`
      ),
  });

  return (
    <Section
      titre="Rentabilité"
      actions={
        <div className="flex flex-wrap gap-1">
          {PRESETS.filter((p) => p.cle !== "7j").map((p) => {
            const c = p.calcul();
            return (
              <button key={p.cle} onClick={() => setPeriode(c)}
                className={`rounded-md px-2 py-1 text-xs ${periode.du === c.du && periode.au === c.au ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}>
                {p.libelle}
              </button>
            );
          })}
        </div>
      }
    >
      {error && <Erreur erreur={error} />}
      {!data && !error && <Chargement />}
      {data && (
        <div className="space-y-5">
          <p className="text-xs text-ink-muted">Du {jour(periode.du)} au {jour(periode.au)}. Commissions : part de la borne dans les reversements calculés (au prorata de son CA dans le lieu).</p>
          <table className="w-full max-w-lg text-sm">
            <tbody className="tabular">
              <Ligne libelle="CA HT (net des remboursements)" valeur={data.rentabilite.caHtCents} />
              <Ligne libelle="Commissions reversées au lieu" valeur={-data.rentabilite.commissionsCents} />
              {Object.entries(data.rentabilite.coutsParCategorie).map(([cat, v]) => (
                <Ligne key={cat} libelle={CATEGORIES[cat as CategorieCout]} valeur={-(v ?? 0)} />
              ))}
              <Ligne libelle="Amortissement" valeur={-data.rentabilite.amortissementCents} aide={data.achat.coutAchatCents ? undefined : "prix d'achat non renseigné"} />
              <tr className="border-t-2 border-line-strong font-semibold">
                <td className="py-2">Marge nette</td>
                <td className={`py-2 text-right ${data.rentabilite.margeNetteCents < 0 ? "text-bad" : "text-good"}`}>{euros(data.rentabilite.margeNetteCents)}</td>
              </tr>
            </tbody>
          </table>

          <div className="rounded-md bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Retour sur investissement</h3>
              <button className="text-xs text-accent hover:underline" onClick={() => setAchat(true)}>
                {data.achat.coutAchatCents ? "Modifier l'achat" : "Renseigner le prix d'achat"}
              </button>
            </div>
            {data.roi ? <Roi roi={data.roi} /> : <p className="mt-2 text-sm text-ink-muted">Renseignez le prix d&apos;achat de la borne pour suivre son retour sur investissement.</p>}
          </div>
        </div>
      )}
      <Modale titre="Achat et amortissement" ouverte={achat} onFermer={() => setAchat(false)}>
        {data && <FormAchat id={id} achat={data.achat} onFini={() => setAchat(false)} />}
      </Modale>
    </Section>
  );
}

function Ligne({ libelle, valeur, aide }: { libelle: string; valeur: number; aide?: string }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 text-ink-2">{libelle}{aide && <span className="text-xs text-ink-muted"> ({aide})</span>}</td>
      <td className="py-1.5 text-right">{valeur ? euros(valeur) : "—"}</td>
    </tr>
  );
}

function Roi({ roi }: { roi: RetourInvestissement }) {
  const option = useCallback(
    (j: Jetons) => ({
      legend: { show: false },
      tooltip: {
        trigger: "axis",
        formatter: (items: { dataIndex: number }[]) => {
          const m = roi.mois[items[0].dataIndex];
          return `<b>${m.mois}</b><br>Marge du mois : ${euros(m.margeCents)}<br>Cumul : ${euros(m.cumulCents)}`;
        },
      },
      xAxis: axeCategorie(j, roi.mois.map((m) => m.mois)),
      yAxis: axeValeur(j, (v: number) => eurosRond(v * 100)),
      series: [
        {
          type: "line",
          data: roi.mois.map((m) => m.cumulCents / 100),
          lineStyle: { width: 2, color: j.viz1 },
          itemStyle: { color: j.viz1 },
          symbolSize: 8,
          areaStyle: { color: j.viz1, opacity: 0.08 },
          markLine: {
            symbol: "none",
            lineStyle: { color: j.ink2, type: "dashed" },
            label: { formatter: `Prix d'achat ${eurosRond(roi.coutAchatCents)}`, color: j.ink2, position: "insideEndTop" },
            data: [{ yAxis: roi.coutAchatCents / 100 }],
          },
        },
      ],
    }),
    [roi]
  );
  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs text-ink-2">
          <span>{euros(roi.cumulMargeCents)} de marge depuis le {jour(roi.depuis)}</span>
          <span>Prix d&apos;achat : {euros(roi.coutAchatCents)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(roi.partRemboursee * 100)} aria-label="Part du prix d'achat remboursée">
          <div className="h-full rounded-full bg-accent" style={{ width: `${roi.partRemboursee * 100}%` }} />
        </div>
        <p className="mt-1 text-sm">
          {roi.dateRetour ? (
            <span className="text-good">✓ Rentabilisée le {jour(roi.dateRetour)}</span>
          ) : roi.moisRestants !== null ? (
            <>{pct(roi.partRemboursee)} remboursé · environ <strong>{roi.moisRestants} mois</strong> restants au rythme actuel ({euros(roi.margeMensuelleCents ?? 0)} / mois)</>
          ) : (
            <span className="text-bad">{pct(roi.partRemboursee)} remboursé · pas de remboursement au rythme actuel</span>
          )}
        </p>
      </div>
      {roi.mois.length > 1 && <Graphique option={option} hauteur={200} description="Marge cumulée depuis la mise en service, comparée au prix d'achat" />}
    </div>
  );
}

function FormAchat({ id, achat, onFini }: { id: number; achat: { coutAchatCents: number | null; dureeAmortissementMois: number | null; dateMiseEnService: string | null }; onFini: () => void }) {
  const client = useQueryClient();
  const [prix, setPrix] = useState(depuisCents(achat.coutAchatCents));
  const [duree, setDuree] = useState(achat.dureeAmortissementMois ? String(achat.dureeAmortissementMois) : "36");
  const [mes, setMes] = useState(achat.dateMiseEnService?.slice(0, 10) ?? "");
  const enregistrer = useMutation({
    mutationFn: () =>
      api(`/rentabilite/bornes/${id}/achat`, {
        method: "PATCH",
        json: { coutAchatCents: versCents(prix), dureeAmortissementMois: duree ? Number(duree) : null, dateMiseEnService: mes || null },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["rentabilite"] });
      onFini();
    },
  });
  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
      <label className="block">
        <span className="etiquette">Prix d&apos;achat (HT)</span>
        <span className="flex items-center gap-2"><input className="champ" inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} /> €</span>
      </label>
      <label className="block">
        <span className="etiquette">Durée d&apos;amortissement</span>
        <span className="flex items-center gap-2"><input className="champ" type="number" min={1} value={duree} onChange={(e) => setDuree(e.target.value)} /> mois</span>
      </label>
      <label className="block">
        <span className="etiquette">Date de mise en service (sinon : première installation)</span>
        <input className="champ" type="date" value={mes} onChange={(e) => setMes(e.target.value)} />
      </label>
      {enregistrer.error && <p className="text-bad">{enregistrer.error.message}</p>}
      <button className="bouton" disabled={enregistrer.isPending}>Enregistrer</button>
    </form>
  );
}

// ─── Interventions SAV ──────────────────────────────────────

/** "2026-10-05T14:30" (heure locale du navigateur) → ISO avec fuseau */
const versIso = (local: string) => (local ? new Date(local).toISOString() : null);
const maintenantLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function SectionInterventions({ id }: { id: number }) {
  const client = useQueryClient();
  const [form, setForm] = useState(false);
  const { data } = useQuery({ queryKey: ["interventions", id], queryFn: () => api<Intervention[]>(`/bornes/${id}/interventions`) });
  const supprimer = useMutation({
    mutationFn: (iid: number) => api(`/interventions/${iid}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries(),
  });
  return (
    <Section titre="Interventions SAV" actions={<button className="bouton-second !py-1 text-xs" onClick={() => setForm(true)}>Nouvelle intervention</button>}>
      {!data ? <Chargement /> : !data.length ? <Vide>Aucune intervention enregistrée.</Vide> : (
        <ul className="divide-y divide-line text-sm">
          {data.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <div><span className="font-medium">{i.motif}</span> <span className="text-ink-muted">· {dateHeure(i.date)}{i.technicien && ` · ${[i.technicien.prenom, i.technicien.nom].filter(Boolean).join(" ")}`}</span></div>
                {i.compteRendu && <p className="text-ink-2">{i.compteRendu}</p>}
                {i.enPanneDepuis && (
                  <p className="text-xs text-ink-muted">En panne du {dateHeure(i.enPanneDepuis)} {i.resolueLe ? `au ${dateHeure(i.resolueLe)}` : "(non résolue)"}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {i.coutCents > 0 && <span className="tabular">{euros(i.coutCents)}</span>}
                <button className="text-xs text-ink-muted hover:text-bad" onClick={() => confirm("Supprimer cette intervention (et son coût) ?") && supprimer.mutate(i.id)}>Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modale titre="Nouvelle intervention" ouverte={form} onFermer={() => setForm(false)}>
        <FormIntervention id={id} onFini={() => setForm(false)} />
      </Modale>
    </Section>
  );
}

function FormIntervention({ id, onFini }: { id: number; onFini: () => void }) {
  const client = useQueryClient();
  const [f, setF] = useState({ date: maintenantLocal(), motif: "", compteRendu: "", enPanneDepuis: "", resolueLe: "", cout: "" });
  const creer = useMutation({
    mutationFn: () =>
      api(`/bornes/${id}/interventions`, {
        method: "POST",
        json: {
          date: versIso(f.date),
          motif: f.motif,
          compteRendu: f.compteRendu || null,
          enPanneDepuis: versIso(f.enPanneDepuis),
          resolueLe: versIso(f.resolueLe),
          coutCents: versCents(f.cout),
        },
      }),
    onSuccess: () => {
      client.invalidateQueries();
      onFini();
    },
  });
  return (
    <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); creer.mutate(); }}>
      <label className="block"><span className="etiquette">Date du passage *</span><input className="champ" type="datetime-local" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      <label className="block"><span className="etiquette">Motif *</span><input className="champ" required placeholder="Bourrage imprimante, remplacement TPE…" value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })} /></label>
      <label className="block"><span className="etiquette">Compte-rendu</span><textarea className="champ min-h-20" value={f.compteRendu} onChange={(e) => setF({ ...f, compteRendu: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="etiquette">En panne depuis</span><input className="champ" type="datetime-local" value={f.enPanneDepuis} onChange={(e) => setF({ ...f, enPanneDepuis: e.target.value })} /></label>
        <label className="block"><span className="etiquette">Résolue le</span><input className="champ" type="datetime-local" value={f.resolueLe} onChange={(e) => setF({ ...f, resolueLe: e.target.value })} /></label>
      </div>
      <label className="block">
        <span className="etiquette">Coût (déplacement, main d&apos;œuvre, pièces)</span>
        <span className="flex items-center gap-2"><input className="champ" inputMode="decimal" value={f.cout} onChange={(e) => setF({ ...f, cout: e.target.value })} /> €</span>
      </label>
      {creer.error && <p className="text-bad">{creer.error.message}</p>}
      <button className="bouton" disabled={creer.isPending}>Enregistrer</button>
    </form>
  );
}

// ─── Coûts ──────────────────────────────────────────────────

function SectionCouts({ id }: { id: number }) {
  const client = useQueryClient();
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), categorie: "CONSOMMABLES" as CategorieCout, montant: "", libelle: "" });
  const { data } = useQuery({ queryKey: ["couts", id], queryFn: () => api<Cout[]>(`/bornes/${id}/couts`) });
  const rafraichir = () => {
    client.invalidateQueries({ queryKey: ["couts", id] });
    client.invalidateQueries({ queryKey: ["rentabilite"] });
  };
  const ajouter = useMutation({
    mutationFn: () => api(`/bornes/${id}/couts`, { method: "POST", json: { date: f.date, categorie: f.categorie, montantCents: versCents(f.montant), libelle: f.libelle || null } }),
    onSuccess: () => {
      setF({ ...f, montant: "", libelle: "" });
      rafraichir();
    },
  });
  const supprimer = useMutation({ mutationFn: (cid: number) => api(`/couts/${cid}`, { method: "DELETE" }), onSuccess: rafraichir });

  return (
    <Section titre="Coûts">
      <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); ajouter.mutate(); }}>
        <label><span className="etiquette">Date</span><input className="champ" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label>
          <span className="etiquette">Catégorie</span>
          <select className="champ" value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value as CategorieCout })}>
            {(Object.keys(CATEGORIES) as CategorieCout[]).filter((c) => c !== "INTERVENTION").map((c) => <option key={c} value={c}>{CATEGORIES[c]}</option>)}
          </select>
        </label>
        <label><span className="etiquette">Montant (€)</span><input className="champ !w-28" inputMode="decimal" required value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value })} /></label>
        <label className="min-w-40 flex-1"><span className="etiquette">Libellé</span><input className="champ" placeholder="Rouleau papier, péage…" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} /></label>
        <button className="bouton" disabled={ajouter.isPending}>Ajouter</button>
      </form>
      {ajouter.error && <p className="mb-2 text-sm text-bad">{ajouter.error.message}</p>}
      {!data ? <Chargement /> : !data.length ? <Vide>Aucun coût saisi. Les coûts des interventions s&apos;ajoutent automatiquement.</Vide> : (
        <table className="w-full text-sm">
          <tbody className="tabular">
            {data.map((c) => (
              <tr key={c.id} className="border-t border-line first:border-0">
                <td className="py-1.5 pr-3 text-ink-2">{date(c.date)}</td>
                <td className="py-1.5 pr-3">{CATEGORIES[c.categorie]}</td>
                <td className="py-1.5 pr-3 text-ink-2">{c.libelle ?? c.intervention?.motif}</td>
                <td className="py-1.5 pr-3 text-right">{euros(c.montantCents)}</td>
                <td className="py-1.5 text-right">
                  {!c.intervention && <button className="text-xs text-ink-muted hover:text-bad" onClick={() => supprimer.mutate(c.id)} aria-label="Supprimer">✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

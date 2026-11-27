"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Privatisation } from "@/lib/api";
import { euros, jour } from "@/lib/format";
import { Chargement, Erreur, Section, Vide } from "./Etat";
import { Modale } from "./Modale";
import { Avatar } from "./SuiviLieu";

/**
 * Privatisations d'un lieu (demande de Sébastien du 26/11/2026) : forfait vendu au lieu, ou offert, pour un événement
 * où la borne passe en gratuit. Compte dans le CA du lieu, à part des ventes d'impression, le jour du début.
 */
export const usePrivatisations = (lieuId: number) =>
  useQuery({ queryKey: ["privatisations", lieuId], queryFn: () => api<Privatisation[]>(`/privatisations?lieuId=${lieuId}`) });

const tauxTexte = (bp: number) => `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;

export function PrivatisationsLieu({ lieuId, peutEcrire }: { lieuId: number; peutEcrire: boolean }) {
  const client = useQueryClient();
  const { data, error } = usePrivatisations(lieuId);
  const [edition, setEdition] = useState<Privatisation | "nouvelle" | null>(null);
  const supprimer = useMutation({
    mutationFn: (id: number) => api(`/privatisations/${id}`, { method: "DELETE" }),
    onSuccess: () => rafraichir(client, lieuId),
  });

  return (
    <Section titre="Privatisations" actions={peutEcrire ? <button className="bouton-second" onClick={() => setEdition("nouvelle")}>Ajouter</button> : undefined}>
      <p className="mb-3 text-sm text-ink-2">
        Borne privatisée par le lieu pour un événement en gratuit (l&apos;événement gratuit se crée dans la configuration, comme d&apos;habitude).
        Le montant compte dans le chiffre d&apos;affaires du lieu, à part des ventes d&apos;impression, le jour du début.
      </p>
      {error && <Erreur erreur={error} />}
      {!data && !error && <Chargement />}
      {data && !data.length && <Vide>Aucune privatisation.</Vide>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div>
                <div>
                  <span className="font-medium">{p.libelle}</span>{" "}
                  <span className="text-ink-muted">· {p.debut === p.fin ? `le ${jour(p.debut)}` : `du ${jour(p.debut)} au ${jour(p.fin)}`}</span>
                </div>
                <div className="text-xs text-ink-2">
                  {p.offerte ? (
                    <span className="font-medium">Offerte</span>
                  ) : (
                    <>
                      <span className="font-medium text-ink">{euros(p.montantHtCents)} HT</span> · {euros(p.montantTtcCents)} TTC (TVA {tauxTexte(p.tauxTvaBp)})
                    </>
                  )}
                  {p.papierInclus ? " · papier inclus" : " · papier en plus"}
                </div>
                {p.note && <div className="mt-0.5 text-xs text-ink-2">{p.note}</div>}
                {p.auteur && (
                  <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-muted">
                    <Avatar nom={`${p.auteur.prenom} ${p.auteur.nom}`.trim()} photo={p.auteur.photoUrl} /> {`${p.auteur.prenom} ${p.auteur.nom}`.trim()}
                  </div>
                )}
              </div>
              {peutEcrire && (
                <div className="flex gap-2">
                  <button className="text-xs text-accent hover:underline" onClick={() => setEdition(p)}>Modifier</button>
                  <button className="text-xs text-bad hover:underline" onClick={() => confirm("Supprimer cette privatisation ? Son montant sort du chiffre du lieu.") && supprimer.mutate(p.id)}>
                    Supprimer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {supprimer.error && <Erreur erreur={supprimer.error} />}
      <Modale titre={edition === "nouvelle" ? "Nouvelle privatisation" : "Modifier la privatisation"} ouverte={edition !== null} onFermer={() => setEdition(null)}>
        {edition !== null && <FormPrivatisation lieuId={lieuId} privatisation={edition === "nouvelle" ? null : edition} onFini={() => setEdition(null)} />}
      </Modale>
    </Section>
  );
}

function rafraichir(client: ReturnType<typeof useQueryClient>, lieuId: number) {
  client.invalidateQueries({ queryKey: ["privatisations", lieuId] });
  // Chiffres du lieu et du tableau de bord
  client.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("stats") });
}

/** "170,5" → 17050 centimes ; null si illisible */
function centimes(texte: string): number | null {
  const t = texte.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

const enTexte = (cents: number) => (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");

function FormPrivatisation({ lieuId, privatisation: p, onFini }: { lieuId: number; privatisation: Privatisation | null; onFini: () => void }) {
  const client = useQueryClient();
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    libelle: p?.libelle ?? "",
    debut: p?.debut ?? aujourdhui,
    fin: p?.fin ?? aujourdhui,
    offerte: p?.offerte ?? false,
    montantHt: p && !p.offerte ? enTexte(p.montantHtCents) : "",
    taux: p ? String(p.tauxTvaBp / 100).replace(".", ",") : "20",
    papierInclus: p?.papierInclus ?? true,
    note: p?.note ?? "",
  });
  const ht = f.offerte ? 0 : centimes(f.montantHt);
  const tauxBp = centimes(f.taux);
  const ttc = ht !== null && tauxBp !== null ? Math.round((ht * (10_000 + tauxBp)) / 10_000) : null;

  const enregistrer = useMutation({
    mutationFn: () => {
      const json = {
        lieuId,
        libelle: f.libelle,
        debut: f.debut,
        fin: f.fin < f.debut ? f.debut : f.fin,
        offerte: f.offerte,
        montantHtCents: ht ?? 0,
        tauxTvaBp: tauxBp ?? 2000,
        papierInclus: f.papierInclus,
        note: f.note || null,
      };
      return p ? api(`/privatisations/${p.id}`, { method: "PUT", json }) : api("/privatisations", { method: "POST", json });
    },
    onSuccess: () => {
      rafraichir(client, lieuId);
      onFini();
    },
  });
  const valide = f.libelle.trim() !== "" && (f.offerte || (ht !== null && ht > 0)) && tauxBp !== null && tauxBp <= 10_000;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valide) enregistrer.mutate();
      }}
    >
      <label className="block">
        <span className="etiquette">Événement *</span>
        <input className="champ" required maxLength={200} placeholder="Soirée privée, anniversaire…" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="etiquette">Début *</span>
          <input type="date" className="champ" required value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value, fin: f.fin < e.target.value ? e.target.value : f.fin })} />
        </label>
        <label className="block">
          <span className="etiquette">Fin *</span>
          <input type="date" className="champ" required min={f.debut} value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.offerte} onChange={(e) => setF({ ...f, offerte: e.target.checked })} /> Offerte (0 €)
      </label>
      {!f.offerte && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="etiquette">Montant HT (€) *</span>
            <input className="champ" required inputMode="decimal" placeholder="141,67" value={f.montantHt} onChange={(e) => setF({ ...f, montantHt: e.target.value })} />
          </label>
          <label className="block">
            <span className="etiquette">TVA (%)</span>
            <input className="champ" required inputMode="decimal" value={f.taux} onChange={(e) => setF({ ...f, taux: e.target.value })} />
          </label>
        </div>
      )}
      {!f.offerte && <p className="text-sm text-ink-2">TTC : <span className="font-medium text-ink">{ttc !== null ? euros(ttc) : "—"}</span></p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.papierInclus} onChange={(e) => setF({ ...f, papierInclus: e.target.checked })} /> Papier inclus
      </label>
      <label className="block">
        <span className="etiquette">Note</span>
        <textarea className="champ" rows={2} maxLength={2000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </label>
      {enregistrer.error && <Erreur erreur={enregistrer.error} />}
      <button className="bouton" disabled={!valide || enregistrer.isPending}>Enregistrer</button>
    </form>
  );
}

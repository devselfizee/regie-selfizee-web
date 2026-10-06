"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type ApercuReleve, type ColonnesReleve, type RapportReleve, type ReleveResume } from "@/lib/api";
import { dateHeure, euros, jour, nombre } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";

export default function PageRapprochement() {
  return (
    <Reserve roles={["ADMIN"]}>
      <Releves />
    </Reserve>
  );
}

function Releves() {
  const [importer, setImporter] = useState(false);
  const { data, error, isPending } = useQuery({ queryKey: ["releves"], queryFn: () => api<ReleveResume[]>("/rapprochement/releves") });

  return (
    <>
      <EnTete
        titre="Rapprochement monétique"
        sousTitre="Comparez le relevé du prestataire monétique (Ingenico…) avec les ventes remontées par les bornes : paiements encaissés mais jamais remontés, ventes remontées mais jamais encaissées, écarts de montant."
        actions={<button className="bouton" onClick={() => setImporter(true)}>Importer un relevé</button>}
      />
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.length && (
        <Vide>
          Aucun relevé importé. Exportez le relevé de transactions depuis l&apos;espace du prestataire au format CSV, puis importez-le ici.
          Pensez à renseigner le n° de terminal (TID) de chaque borne sur sa fiche.
        </Vide>
      )}
      {data && data.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Période</th>
                <th className="px-4 py-3 font-medium">Fichier</th>
                <th className="px-4 py-3 text-right font-medium">Lignes</th>
                <th className="px-4 py-3 text-right font-medium">Montant</th>
                <th className="px-4 py-3 text-right font-medium">Rapprochées</th>
                <th className="px-4 py-3 text-right font-medium">Écarts</th>
                <th className="px-4 py-3 text-right font-medium">Non retrouvées</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link className="font-medium hover:underline" href={`/rapprochement/${r.id}`}>
                      {r.periodeDebut === r.periodeFin ? jour(r.periodeDebut) : `${jour(r.periodeDebut)} → ${jour(r.periodeFin)}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {r.fournisseur} · {r.fichierNom}
                    <div className="text-xs text-ink-muted">importé le {dateHeure(r.importeLe)}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{nombre(r.lignes)}</td>
                  <td className="px-4 py-3 text-right">{euros(r.montantCents)}</td>
                  <td className="px-4 py-3 text-right">{nombre(r.rapprochees)}</td>
                  <td className={`px-4 py-3 text-right ${r.ecarts ? "text-warn-ink" : "text-ink-muted"}`}>{nombre(r.ecarts)}</td>
                  <td className={`px-4 py-3 text-right ${r.nonRapprochees ? "text-bad" : "text-ink-muted"}`}>{nombre(r.nonRapprochees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modale titre="Importer un relevé monétique" ouverte={importer} onFermer={() => setImporter(false)} large>
        <FormImport />
      </Modale>
    </>
  );
}

/** Texte du fichier : UTF-8, sinon Windows-1252 (exports Excel français). */
async function lireFichier(f: File) {
  const octets = await f.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(octets);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(octets) : utf8;
}

const CHAMPS: { cle: keyof ColonnesReleve; libelle: string; requis: boolean; aide?: string }[] = [
  { cle: "date", libelle: "Date", requis: true, aide: "avec ou sans l'heure" },
  { cle: "heure", libelle: "Heure", requis: false, aide: "si elle est dans une colonne à part" },
  { cle: "montant", libelle: "Montant", requis: true },
  { cle: "terminal", libelle: "N° de terminal (TID)", requis: true },
  { cle: "reference", libelle: "N° d'autorisation", requis: false, aide: "améliore le rapprochement" },
];

// Colonnes retenues par fournisseur, retrouvées au prochain import (préférence locale)
const cleMemoire = (fournisseur: string) => `rapprochement.colonnes.${fournisseur.toLowerCase()}`;
function colonnesMemorisees(fournisseur: string, entetes: string[]): ColonnesReleve | null {
  try {
    const m = JSON.parse(localStorage.getItem(cleMemoire(fournisseur)) ?? "null") as Record<string, string | null> | null;
    if (!m) return null;
    const c: ColonnesReleve = {};
    for (const [cle, nom] of Object.entries(m)) {
      const i = nom === null ? -1 : entetes.indexOf(nom);
      if (i >= 0) c[cle as keyof ColonnesReleve] = i;
    }
    return c;
  } catch {
    return null;
  }
}
function memoriserColonnes(fournisseur: string, entetes: string[], c: ColonnesReleve) {
  try {
    localStorage.setItem(cleMemoire(fournisseur), JSON.stringify(Object.fromEntries(Object.entries(c).map(([k, i]) => [k, i == null ? null : entetes[i]]))));
  } catch {
    /* stockage indisponible : on redemandera */
  }
}

function FormImport() {
  const router = useRouter();
  const [fournisseur, setFournisseur] = useState("Ingenico");
  const [fichier, setFichier] = useState<{ nom: string; contenu: string } | null>(null);
  const [colonnes, setColonnes] = useState<ColonnesReleve>({});
  const [enCentimes, setEnCentimes] = useState(false);

  const apercu = useMutation({
    mutationFn: (contenu: string) => api<ApercuReleve>("/rapprochement/apercu", { method: "POST", json: { contenu } }),
    onSuccess: (a) => setColonnes(colonnesMemorisees(fournisseur, a.entetes) ?? a.colonnes),
  });
  const importer = useMutation({
    mutationFn: () =>
      api<RapportReleve>("/rapprochement/releves", {
        method: "POST",
        json: { fournisseur, fichierNom: fichier!.nom, contenu: fichier!.contenu, colonnes, montantEnCentimes: enCentimes },
      }),
    onSuccess: (r) => {
      memoriserColonnes(fournisseur, apercu.data!.entetes, colonnes);
      router.push(`/rapprochement/${r.releve.id}?importees=${r.import?.lignes ?? 0}&doublons=${r.import?.doublons ?? 0}&rejetees=${r.import?.rejetees ?? 0}`);
    },
  });

  const choisir = async (f: File | undefined) => {
    if (!f) return;
    const contenu = await lireFichier(f);
    setFichier({ nom: f.name, contenu });
    apercu.mutate(contenu);
  };

  const a = apercu.data;
  const complet = CHAMPS.every((c) => !c.requis || colonnes[c.cle] != null);
  const role = (i: number) => CHAMPS.find((c) => colonnes[c.cle] === i)?.libelle;

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); importer.mutate(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Prestataire</span>
          <input className="champ" required value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Fichier CSV du relevé</span>
          <input className="champ" type="file" accept=".csv,.txt,text/csv" required onChange={(e) => choisir(e.target.files?.[0])} />
        </label>
      </div>
      {apercu.isPending && <Chargement texte="Lecture du fichier…" />}
      {apercu.error && <Erreur erreur={apercu.error} />}

      {a && (
        <>
          <div>
            <h3 className="text-sm font-semibold">Quelle colonne contient quoi ?</h3>
            <p className="mb-2 text-xs text-ink-2">
              {nombre(a.nbLignes)} lignes. Colonnes devinées d&apos;après les en-têtes : vérifiez-les avec l&apos;aperçu. Elles seront retenues pour le prochain relevé « {fournisseur} ».
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {CHAMPS.map((c) => (
                <label key={c.cle} className="block">
                  <span className="etiquette">{c.libelle}{c.requis && " *"}</span>
                  <select
                    className="champ"
                    required={c.requis}
                    value={colonnes[c.cle] ?? ""}
                    onChange={(e) => setColonnes({ ...colonnes, [c.cle]: e.target.value === "" ? null : Number(e.target.value) })}
                  >
                    <option value="">{c.requis ? "—" : "Aucune"}</option>
                    {a.entetes.map((e, i) => <option key={i} value={i}>{e || `Colonne ${i + 1}`}</option>)}
                  </select>
                  {c.aide && <span className="text-xs text-ink-muted">{c.aide}</span>}
                </label>
              ))}
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={enCentimes} onChange={(e) => setEnCentimes(e.target.checked)} />
                Montants en centimes (« 800 » = 8 €)
              </label>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-left">
                <tr>
                  {a.entetes.map((e, i) => (
                    <th key={i} className="px-2 py-1.5 font-medium">
                      <div className="text-ink-2">{e}</div>
                      <div className={role(i) ? "text-accent" : "text-ink-muted"}>{role(i) ?? "ignorée"}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular">
                {a.exemples.map((l, i) => (
                  <tr key={i} className="border-t border-line">
                    {a.entetes.map((_, j) => <td key={j} className={`whitespace-nowrap px-2 py-1 ${role(j) ? "" : "text-ink-muted"}`}>{l[j]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {importer.error && <Erreur erreur={importer.error} />}
      <button className="bouton" disabled={!a || !complet || importer.isPending}>
        {importer.isPending ? "Import et rapprochement…" : "Importer et rapprocher"}
      </button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Concurrent } from "@/lib/api";
import { nombre } from "@/lib/format";
import { Badge, Chargement, Erreur } from "./Etat";

export const MATERIELS: Record<"CABINE" | "BORNE", string> = { CABINE: "Cabine", BORNE: "Borne" };

export const useConcurrents = () => useQuery({ queryKey: ["concurrents"], queryFn: () => api<Concurrent[]>("/concurrents"), staleTime: 5 * 60_000 });

/**
 * Paramètres : concurrents (demande de Sébastien, 03/11/2026) — nom et type de matériel, choisis sur la fiche d'un
 * prospect ; leurs emplacements connus s'importent ici et s'affichent sur la carte des prospects.
 */
export function Concurrents() {
  const client = useQueryClient();
  const { data, error } = useConcurrents();
  const [edition, setEdition] = useState<Concurrent | "nouveau" | null>(null);
  const [import_, setImport] = useState<Concurrent | null>(null);
  const fini = () => {
    setEdition(null);
    client.invalidateQueries({ queryKey: ["concurrents"] });
  };
  const supprimer = useMutation({ mutationFn: (id: number) => api(`/concurrents/${id}`, { method: "DELETE" }), onSuccess: fini });

  return (
    <section className="carte p-4">
      <h2 className="text-base font-semibold">Concurrents</h2>
      <p className="mb-4 text-sm text-ink-2">
        Les concurrents qu&apos;on rencontre chez les prospects, avec leur type de matériel. Ils se choisissent sur la fiche d&apos;un prospect
        (« concurrent déjà en place ») ; leurs emplacements importés s&apos;affichent sur la{" "}
        <Link href="/prospects?vue=carte" className="text-accent hover:underline">carte des prospects</Link>.
      </p>
      {error && <Erreur erreur={error} />}
      {!data && !error && <Chargement />}
      {data && (
        <div className="space-y-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-3 font-medium">Concurrent</th>
                <th className="py-2 pr-3 font-medium">Matériel</th>
                <th className="py-2 pr-3 text-right font-medium">Emplacements connus</th>
                <th className="py-2 pr-3 text-right font-medium">Chez nos prospects</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) =>
                edition !== "nouveau" && edition?.id === c.id ? (
                  <tr key={c.id} className="border-t border-line">
                    <td colSpan={5} className="py-2"><Formulaire initial={c} onFini={fini} onAnnuler={() => setEdition(null)} /></td>
                  </tr>
                ) : (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{c.nom}</span>
                      {c.siteWeb && <a href={c.siteWeb} target="_blank" rel="noreferrer" className="ml-2 text-xs text-accent hover:underline">site</a>}
                    </td>
                    <td className="py-2 pr-3"><Badge ton="neutre">{MATERIELS[c.typeMateriel]}</Badge></td>
                    <td className="py-2 pr-3 text-right tabular">{nombre(c.nbEmplacements)}</td>
                    <td className="py-2 pr-3 text-right tabular">{nombre(c.nbLieux)}</td>
                    <td className="whitespace-nowrap py-2 text-right">
                      <button type="button" className="text-sm text-accent hover:underline" onClick={() => setImport(c)}>Importer des emplacements</button>
                      <button type="button" className="ml-3 text-sm text-accent hover:underline" onClick={() => setEdition(c)}>Modifier</button>
                      <button
                        type="button"
                        className="ml-3 text-sm text-bad hover:underline"
                        onClick={() => confirm(`Supprimer ${c.nom} et ses ${c.nbEmplacements} emplacement(s) ?`) && supprimer.mutate(c.id)}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          {supprimer.error && <Erreur erreur={supprimer.error} />}
          {edition === "nouveau" ? (
            <Formulaire onFini={fini} onAnnuler={() => setEdition(null)} />
          ) : (
            <button type="button" className="bouton-second" onClick={() => setEdition("nouveau")}>Ajouter un concurrent</button>
          )}
          {import_ && <ImportEmplacements concurrent={import_} onFini={() => { setImport(null); fini(); }} />}
        </div>
      )}
    </section>
  );
}

function Formulaire({ initial, onFini, onAnnuler }: { initial?: Concurrent; onFini: () => void; onAnnuler: () => void }) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [typeMateriel, setType] = useState<"CABINE" | "BORNE">(initial?.typeMateriel ?? "BORNE");
  const [siteWeb, setSiteWeb] = useState(initial?.siteWeb ?? "");
  const enregistrer = useMutation({
    mutationFn: () =>
      api(initial ? `/concurrents/${initial.id}` : "/concurrents", { method: initial ? "PUT" : "POST", json: { nom, typeMateriel, siteWeb: siteWeb.trim() || null } }),
    onSuccess: onFini,
  });
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        enregistrer.mutate();
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="etiquette">Nom *</span>
        <input className="champ w-full" required maxLength={120} value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <label>
        <span className="etiquette">Matériel *</span>
        <select className="champ" value={typeMateriel} onChange={(e) => setType(e.target.value as "CABINE" | "BORNE")}>
          <option value="CABINE">Cabine</option>
          <option value="BORNE">Borne</option>
        </select>
      </label>
      <label className="min-w-0 flex-1">
        <span className="etiquette">Site web</span>
        <input className="champ w-full" type="url" placeholder="https://…" value={siteWeb} onChange={(e) => setSiteWeb(e.target.value)} />
      </label>
      <button className="bouton" disabled={enregistrer.isPending}>Enregistrer</button>
      <button type="button" className="bouton-second" onClick={onAnnuler}>Annuler</button>
      {enregistrer.error && <div className="w-full"><Erreur erreur={enregistrer.error} /></div>}
    </form>
  );
}

type LigneEmplacement = { nom: string; adresse: string | null; codePostal: string | null; ville: string | null; pays?: string | null; latitude?: number; longitude?: number };

const PAYS = ["France", "Belgique", "Suisse", "Luxembourg", "Allemagne", "Italie", "Espagne", "Monaco", "Pays-Bas", "Royaume-Uni"];

/**
 * Texte collé → emplacements. Deux formats :
 * - colonnes (Excel, CSV ; ou tabulations) : nom, adresse, code postal, ville (, latitude, longitude) ;
 * - blocs copiés depuis le site d'un concurrent : le nom en majuscules, puis l'adresse sur une ou plusieurs lignes
 *   (« Rue Denis Diderot, 31700 » / « Blagnac, France »).
 */
/** Adresse complète sur une ligne → rue, code postal, ville et pays (« Rue Denis Diderot, 31700 Blagnac, France ») */
function decouperAdresse(texte: string): Pick<LigneEmplacement, "adresse" | "codePostal" | "ville" | "pays"> {
  let reste = texte.replace(/\s+/g, " ").trim();
  let pays: string | null = null;
  for (const p of PAYS) {
    const m = new RegExp(`[,\\s-]+${p}\\s*$`, "i");
    if (m.test(reste)) {
      pays = p;
      reste = reste.replace(m, "");
    }
  }
  // Le dernier code postal à 4 ou 5 chiffres sépare la rue de la ville
  const cp = [...reste.matchAll(/\b(\d{4,5})\b/g)].pop();
  const nettoyer = (s: string) => s.replace(/^[\s,–-]+|[\s,–-]+$/g, "") || null;
  if (!cp) return { adresse: nettoyer(reste), codePostal: null, ville: null, pays };
  // Paris sans ville après le code postal (« … - 75011 »)
  const ville = nettoyer(reste.slice(cp.index! + cp[1].length)) ?? (/^75\d{3}$/.test(cp[1]) ? "Paris" : null);
  return { adresse: nettoyer(reste.slice(0, cp.index)), codePostal: cp[1], ville, pays: pays ?? (cp[1].length === 5 && ville ? "France" : null) };
}

/**
 * Texte collé → emplacements. Deux formats :
 * - colonnes (Excel, CSV ; ou tabulations) : nom, adresse, code postal, ville (, latitude, longitude) ; une adresse complète
 *   dans la seule colonne adresse est découpée (script de copie de la liste d'un concurrent) ;
 * - blocs copiés depuis le site d'un concurrent : le nom en majuscules, puis l'adresse sur une ou plusieurs lignes.
 */
export function lireEmplacements(texte: string): LigneEmplacement[] {
  const lignes = texte.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l !== "+");
  if (lignes.some((l) => /\t|;/.test(l))) {
    return lignes
      .map((l) => l.split(/\t|;/).map((c) => c.trim()))
      .filter((c) => c[0] && !/^nom$/i.test(c[0]))
      .map(([nom, adresse, codePostal, ville, lat, lng]) => {
        const latitude = lat ? Number(lat.replace(",", ".")) : NaN;
        const longitude = lng ? Number(lng.replace(",", ".")) : NaN;
        return {
          nom,
          ...(adresse && !codePostal && !ville ? decouperAdresse(adresse) : { adresse: adresse || null, codePostal: codePostal || null, ville: ville || null }),
          ...(Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : {}),
        };
      });
  }
  // Blocs : une ligne en majuscules ouvre un emplacement, les suivantes forment son adresse
  const blocs: { nom: string; adresse: string[] }[] = [];
  for (const l of lignes) {
    const majuscules = /[A-Z]/.test(l) && l === l.toUpperCase();
    if (majuscules || !blocs.length) blocs.push({ nom: l, adresse: [] });
    else blocs[blocs.length - 1].adresse.push(l);
  }
  return blocs.map(({ nom, adresse }) => ({ nom: nom.charAt(0) + nom.slice(1).toLowerCase(), ...decouperAdresse(adresse.join(", ")) }));
}

function ImportEmplacements({ concurrent, onFini }: { concurrent: Concurrent; onFini: () => void }) {
  const [texte, setTexte] = useState("");
  const [remplacer, setRemplacer] = useState(false);
  const lignes = lireEmplacements(texte);
  const importer = useMutation({
    mutationFn: () =>
      api<{ importes: number; places: number; introuvables: string[] }>(`/concurrents/${concurrent.id}/emplacements/import`, {
        method: "POST",
        json: { lignes, remplacer, source: "collage" },
      }),
  });
  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <h3 className="text-sm font-semibold">Importer des emplacements de {concurrent.nom}</h3>
      <p className="text-xs text-ink-2">
        Collez la liste copiée depuis le site du concurrent (le nom en majuscules puis l&apos;adresse, page après page), ou des lignes Excel
        (nom, adresse, code postal, ville, et si vous les avez latitude, longitude). Vérifiez l&apos;aperçu avant d&apos;importer. Sans position,
        l&apos;adresse est placée sur la carte automatiquement (adresses françaises).
      </p>
      <textarea
        className="champ min-h-40 font-mono text-xs"
        placeholder={"3 Brasseurs\tRue Denis Diderot\t31700\tBlagnac\nAlma\t5 rue du Bosphore\t35000\tRennes"}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      {lignes.length > 0 && !importer.data && (
        <div className="overflow-x-auto">
          <p className="mb-1 text-xs text-ink-2">Aperçu : {lignes.length} emplacement(s) reconnu(s){lignes.length > 8 ? ", les 8 premiers" : ""}</p>
          <table className="w-full text-xs">
            <thead className="text-left text-ink-2">
              <tr>
                <th className="py-1 pr-2 font-medium">Nom</th>
                <th className="py-1 pr-2 font-medium">Adresse</th>
                <th className="py-1 pr-2 font-medium">Code postal</th>
                <th className="py-1 pr-2 font-medium">Ville</th>
                <th className="py-1 font-medium">Pays</th>
              </tr>
            </thead>
            <tbody>
              {lignes.slice(0, 8).map((l, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-2">{l.nom}</td>
                  <td className="py-1 pr-2">{l.adresse ?? "—"}</td>
                  <td className="py-1 pr-2">{l.codePostal ?? "—"}</td>
                  <td className="py-1 pr-2">{l.ville ?? "—"}</td>
                  <td className="py-1">{l.pays ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={remplacer} onChange={(e) => setRemplacer(e.target.checked)} /> Remplacer les {concurrent.nbEmplacements} emplacement(s) déjà connus
      </label>
      {importer.data ? (
        <div className="text-sm">
          <p className="text-good">{importer.data.importes} emplacement(s) importé(s), {importer.data.places} placé(s) sur la carte.</p>
          {importer.data.introuvables.length > 0 && (
            <p className="text-warn-ink">Adresse introuvable, absents de la carte : {importer.data.introuvables.slice(0, 20).join(", ")}{importer.data.introuvables.length > 20 ? "…" : ""}</p>
          )}
          <button type="button" className="bouton-second mt-2" onClick={onFini}>Fermer</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" className="bouton" disabled={!lignes.length || importer.isPending} onClick={() => importer.mutate()}>
            {importer.isPending ? "Import et placement sur la carte…" : `Importer ${lignes.length} ligne(s)`}
          </button>
          <button type="button" className="bouton-second" onClick={onFini}>Annuler</button>
        </div>
      )}
      {importer.error && <Erreur erreur={importer.error} />}
    </div>
  );
}

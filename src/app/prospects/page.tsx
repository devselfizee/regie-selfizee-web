"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, qs, type EmplacementConcurrent, type ListeProspects, type Prospect } from "@/lib/api";
import { euros, eurosRond, pct } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Classe, CONFIANCE, Precision } from "@/components/Prospect";
import { CarteLieux, type PointCarte } from "@/components/CarteLieux";
import { MATERIELS, useConcurrents } from "@/components/Concurrents";

export default function PageProspects() {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL"]}>
      <Suspense>
        <Prospects />
      </Suspense>
    </Reserve>
  );
}

// Couleurs de la carte : nos prospects (bleu), avec un concurrent en place (orange), emplacements des concurrents (noir / violet)
const COULEURS = { prospect: "#2a78d6", prospectConcurrent: "#eb6834", CABINE: "#1f1f1f", BORNE: "#8250df" };

function Prospects() {
  const router = useRouter();
  const [vue, setVue] = useState<"liste" | "carte">(useSearchParams().get("vue") === "carte" ? "carte" : "liste");
  // Filtres (retour de Sébastien) : concurrent en place ou non, quel concurrent, quel matériel
  const [enPlace, setEnPlace] = useState("");
  const [concurrentId, setConcurrentId] = useState("");
  const [materiel, setMateriel] = useState("");
  const [voirEmplacements, setVoirEmplacements] = useState(true);
  const { data, error, isPending } = useQuery({ queryKey: ["prospects"], queryFn: () => api<ListeProspects>("/prospects") });
  const concurrents = useConcurrents();
  const emplacements = useQuery({
    queryKey: ["emplacements-concurrents", concurrentId, materiel],
    queryFn: () => api<EmplacementConcurrent[]>(`/concurrents/emplacements${qs({ concurrentId: concurrentId && concurrentId !== "autre" ? concurrentId : undefined, typeMateriel: materiel || undefined })}`),
    enabled: voirEmplacements,
  });

  const garde = (p: Prospect) =>
    (enPlace === "" || (enPlace === "oui" ? p.concurrentEnPlace === true : enPlace === "non" ? p.concurrentEnPlace === false : p.concurrentEnPlace == null)) &&
    (concurrentId === "" || (concurrentId === "autre" ? !!p.concurrent && p.concurrent.id === null : String(p.concurrent?.id) === concurrentId)) &&
    (materiel === "" || p.concurrent?.typeMateriel === materiel);
  const prospects = (data?.prospects ?? []).filter(garde);
  const filtre = enPlace || concurrentId || materiel;

  const points: PointCarte[] = [
    ...(voirEmplacements ? emplacements.data ?? [] : [])
      .filter((e) => e.latitude !== null && e.longitude !== null)
      .map((e) => ({
        // Ids négatifs : distincts de ceux des prospects
        id: -e.id,
        latitude: e.latitude!,
        longitude: e.longitude!,
        couleur: COULEURS[e.concurrent.typeMateriel],
        rayon: 6,
        inerte: true,
        titre: `${e.concurrent.nom} · ${e.nom}`,
        lignes: [MATERIELS[e.concurrent.typeMateriel], [e.adresse, e.codePostal, e.ville].filter(Boolean).join(" ")],
      })),
    ...prospects
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({
        id: p.id,
        latitude: p.latitude!,
        longitude: p.longitude!,
        couleur: p.concurrentEnPlace ? COULEURS.prospectConcurrent : COULEURS.prospect,
        titre: p.enseigne,
        lignes: [
          [p.typeLieu, p.ville].filter(Boolean).join(" · "),
          p.concurrentEnPlace ? `Concurrent en place : ${p.concurrent?.nom ?? "oui"}` : p.concurrentEnPlace === false ? "Pas de concurrent" : "Concurrent : non renseigné",
          ...(p.estimation ? [`CA estimé : ${euros(p.estimation.caJourOuvertCents)} / jour ouvert`] : []),
        ],
      })),
  ];
  const sansPosition = prospects.filter((p) => p.latitude == null || p.longitude == null).length;

  return (
    <>
      <EnTete
        titre="Prospects"
        sousTitre="Lieux à démarcher, classés par CA estimé d'après les lieux équipés qui leur ressemblent."
        actions={
          <>
            <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Affichage">
              {(["liste", "carte"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vue === v}
                  onClick={() => setVue(v)}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${vue === v ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
                >
                  {v === "liste" ? "Liste" : "Carte"}
                </button>
              ))}
            </div>
            <Link href="/lieux/nouveau?statut=PROSPECT" className="bouton">Nouveau prospect</Link>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <label>
          <span className="etiquette">Concurrent en place</span>
          <select className="champ" value={enPlace} onChange={(e) => setEnPlace(e.target.value)}>
            <option value="">Tous</option>
            <option value="oui">Avec un concurrent</option>
            <option value="non">Sans concurrent</option>
            <option value="inconnu">Non renseigné</option>
          </select>
        </label>
        <label>
          <span className="etiquette">Concurrent</span>
          <select className="champ" value={concurrentId} onChange={(e) => setConcurrentId(e.target.value)}>
            <option value="">Tous</option>
            {concurrents.data?.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            <option value="autre">Autres (saisis à la main)</option>
          </select>
        </label>
        <label>
          <span className="etiquette">Matériel du concurrent</span>
          <select className="champ" value={materiel} onChange={(e) => setMateriel(e.target.value)}>
            <option value="">Tous</option>
            <option value="CABINE">Cabine</option>
            <option value="BORNE">Borne</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={voirEmplacements} onChange={(e) => setVoirEmplacements(e.target.checked)} />
          Emplacements des concurrents
        </label>
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.prospects.length && vue === "liste" && <Vide>Aucun prospect pour l&apos;instant. Créez une fiche lieu avec le statut « Prospect ».</Vide>}
      {data && data.prospects.length > 0 && !prospects.length && vue === "liste" && <Vide>Aucun prospect ne correspond à ces filtres.</Vide>}

      {data && vue === "carte" && (
        <div className="space-y-2">
          <CarteLieux points={points} onClic={(id) => id > 0 && router.push(`/lieux/${id}`)} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Légende">
            {[
              ["Prospect", COULEURS.prospect],
              ["Prospect avec un concurrent en place", COULEURS.prospectConcurrent],
              ...(voirEmplacements ? [["Cabine d'un concurrent", COULEURS.CABINE], ["Borne d'un concurrent", COULEURS.BORNE]] : []),
            ].map(([l, c]) => (
              <li key={l} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-white" style={{ background: c }} />
                {l}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            {prospects.length} prospect(s){filtre ? " (filtrés)" : ""}
            {sansPosition > 0 && `, dont ${sansPosition} sans position (adresse à compléter)`}
            {voirEmplacements && emplacements.data && ` · ${emplacements.data.length} emplacement(s) de concurrents`}
            {voirEmplacements && emplacements.data && !emplacements.data.length && " : à importer dans Paramètres → Concurrents"}.
          </p>
        </div>
      )}

      {data && vue === "liste" && prospects.length > 0 && (
        <>
          <div className="carte overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="px-4 py-3 font-medium">Prospect</th>
                  <th className="px-4 py-3 font-medium">Concurrent en place</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 text-right font-medium">CA / jour ouvert estimé</th>
                  <th className="px-4 py-3 text-right font-medium">CA annuel estimé</th>
                  <th className="px-4 py-3 font-medium">Confiance</th>
                  <th className="px-4 py-3 text-right font-medium">Fiche remplie</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {prospects.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link className="font-medium hover:underline" href={`/lieux/${p.id}`}>{p.enseigne}</Link>
                      <div className="text-xs text-ink-muted">{[p.typeLieu, p.ville].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.concurrentEnPlace ? (
                        <>
                          {p.concurrent?.nom ?? "Oui"}
                          {p.concurrent?.typeMateriel && <span className="block text-xs text-ink-muted">{MATERIELS[p.concurrent.typeMateriel]}</span>}
                        </>
                      ) : p.concurrentEnPlace === false ? (
                        <span className="text-ink-2">Non</span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{p.estimation ? <Classe e={p.estimation} /> : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {p.estimation ? (
                        <>
                          {euros(p.estimation.caJourOuvertCents)}
                          <div className="text-xs text-ink-muted">{euros(p.estimation.basseCents)} – {euros(p.estimation.hauteCents)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.caAnnuelCents !== null ? eurosRond(p.caAnnuelCents) : <span className="text-xs text-ink-muted">saisons à saisir</span>}
                    </td>
                    <td className="px-4 py-3">{p.estimation ? CONFIANCE[p.estimation.confiance] : "—"}</td>
                    <td className={`px-4 py-3 text-right ${p.completude.taux < 0.5 ? "text-warn-ink" : ""}`}>{pct(p.completude.taux)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Precision l={data} />
          </div>
        </>
      )}
      {vue === "liste" && voirEmplacements && <ListeEmplacements emplacements={emplacements.data} chargement={emplacements.isPending} />}
    </>
  );
}

/** Vue liste : les emplacements connus des concurrents (importés dans Paramètres → Concurrents), avec une recherche */
function ListeEmplacements({ emplacements, chargement }: { emplacements: EmplacementConcurrent[] | undefined; chargement: boolean }) {
  const [q, setQ] = useState("");
  const [nb, setNb] = useState(100);
  if (chargement) return <Chargement />;
  if (!emplacements) return null;
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtres = q.trim() ? emplacements.filter((e) => n([e.nom, e.ville, e.codePostal, e.adresse, e.concurrent.nom].filter(Boolean).join(" ")).includes(n(q.trim()))) : emplacements;
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-base font-semibold">Emplacements des concurrents ({filtres.length})</h2>
        <input className="champ !w-72" placeholder="Rechercher un nom, une ville, un code postal…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!emplacements.length ? (
        <Vide>Aucun emplacement : importez ceux d&apos;un concurrent dans Paramètres → Concurrents.</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium">Concurrent</th>
                <th className="px-4 py-3 font-medium">Adresse</th>
                <th className="px-4 py-3 font-medium">Ville</th>
              </tr>
            </thead>
            <tbody>
              {filtres.slice(0, nb).map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-2.5 font-medium">{e.nom}</td>
                  <td className="px-4 py-2.5">
                    {e.concurrent.nom}
                    <span className="block text-xs text-ink-muted">{MATERIELS[e.concurrent.typeMateriel]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{e.adresse ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {[e.codePostal, e.ville].filter(Boolean).join(" ") || "—"}
                    {e.latitude === null && <span className="block text-xs text-warn-ink">pas sur la carte</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtres.length > nb && (
            <div className="border-t border-line p-3 text-center">
              <button type="button" className="bouton-second" onClick={() => setNb(nb + 200)}>Afficher plus ({filtres.length - nb} restants)</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

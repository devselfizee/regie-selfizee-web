"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type EmplacementConcurrent, type ListeProspects, type Prospect } from "@/lib/api";
import { euros, eurosRond, pct } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Classe, CONFIANCE, Precision } from "@/components/Prospect";
import { CarteLieux, type PointCarte } from "@/components/CarteLieux";
import { MATERIELS, useConcurrents } from "@/components/Concurrents";
import { useReferentiel } from "@/components/Filtres";

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
  // Catégorie du lieu (bar, boîte de nuit…) ; "0" = emplacements sans catégorie
  const [categorie, setCategorie] = useState("");
  const { data: ref } = useReferentiel();
  const typesLieu = (ref?.listes.TYPE_LIEU ?? []).filter((t) => t.actif);
  const libelleCategorie = typesLieu.find((t) => String(t.id) === categorie)?.libelle;
  const { data, error, isPending } = useQuery({ queryKey: ["prospects"], queryFn: () => api<ListeProspects>("/prospects") });
  const concurrents = useConcurrents();
  const emplacements = useQuery({
    queryKey: ["emplacements-concurrents", concurrentId, materiel, categorie],
    queryFn: () =>
      api<EmplacementConcurrent[]>(
        `/concurrents/emplacements${qs({ concurrentId: concurrentId && concurrentId !== "autre" ? concurrentId : undefined, typeMateriel: materiel || undefined, typeLieuId: categorie || undefined })}`
      ),
    enabled: voirEmplacements,
  });

  const garde = (p: Prospect) =>
    (enPlace === "" || (enPlace === "oui" ? p.concurrentEnPlace === true : enPlace === "non" ? p.concurrentEnPlace === false : p.concurrentEnPlace == null)) &&
    (concurrentId === "" || (concurrentId === "autre" ? !!p.concurrent && p.concurrent.id === null : String(p.concurrent?.id) === concurrentId)) &&
    (materiel === "" || p.concurrent?.typeMateriel === materiel) &&
    (categorie === "" || (categorie === "0" ? !p.typeLieu : p.typeLieu === libelleCategorie));
  const prospects = (data?.prospects ?? []).filter(garde);
  const filtre = enPlace || concurrentId || materiel || categorie;

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
        lignes: [[MATERIELS[e.concurrent.typeMateriel], e.typeLieu?.libelle].filter(Boolean).join(" · "), [e.adresse, e.codePostal, e.ville].filter(Boolean).join(" ")],
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

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        <label>
          <span className="etiquette">Catégorie du lieu</span>
          <select className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            <option value="">Toutes</option>
            {typesLieu.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            <option value="0">À catégoriser</option>
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

/**
 * Vue liste : les emplacements connus des concurrents (importés dans Paramètres → Concurrents), avec une recherche.
 * Chacun peut devenir un prospect (demande de Sébastien) : nom, adresse, position et concurrent en place repris.
 */
function ListeEmplacements({ emplacements, chargement }: { emplacements: EmplacementConcurrent[] | undefined; chargement: boolean }) {
  const client = useQueryClient();
  const { data: ref } = useReferentiel();
  const [q, setQ] = useState("");
  const [nb, setNb] = useState(100);
  const [choisis, setChoisis] = useState<Set<number>>(new Set());
  const [typeLieuId, setTypeLieuId] = useState("");
  const creer = useMutation({
    mutationFn: (ids: number[]) =>
      api<{ crees: number; dejaProspects: number }>("/concurrents/emplacements/prospects", { method: "POST", json: { ids, typeLieuId: typeLieuId ? Number(typeLieuId) : null } }),
    onSuccess: () => {
      setChoisis(new Set());
      client.invalidateQueries({ queryKey: ["prospects"] });
      client.invalidateQueries({ queryKey: ["emplacements-concurrents"] });
    },
  });
  // Catégorie corrigée à la main, et première passe automatique d'après le nom
  const categoriser = useMutation({
    mutationFn: ({ id, typeLieuId }: { id: number; typeLieuId: number | null }) =>
      api(`/concurrents/emplacements/${id}`, { method: "PATCH", json: { typeLieuId } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["emplacements-concurrents"] }),
  });
  const auto = useMutation({
    mutationFn: () => api<{ categorises: number; restants: number }>("/concurrents/emplacements/categoriser", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["emplacements-concurrents"] }),
  });
  // Vérification sur Google Places (type, note, avis), par lots tant qu'il en reste
  const google = useQuery({ queryKey: ["emplacements-google"], queryFn: () => api<{ configure: boolean; restants: number }>("/concurrents/emplacements/google") });
  const [verif, setVerif] = useState<{ enCours: boolean; traites: number; trouves: number; categorises: number; erreur: unknown }>({ enCours: false, traites: 0, trouves: 0, categorises: 0, erreur: null });
  const verifierSurGoogle = async () => {
    let cumul = { traites: 0, trouves: 0, categorises: 0 };
    setVerif({ enCours: true, ...cumul, erreur: null });
    try {
      for (;;) {
        const r = await api<{ traites: number; trouves: number; categorises: number; restants: number }>("/concurrents/emplacements/google", { method: "POST", json: { lot: 20 } });
        cumul = { traites: cumul.traites + r.traites, trouves: cumul.trouves + r.trouves, categorises: cumul.categorises + r.categorises };
        setVerif({ enCours: r.restants > 0 && r.traites > 0, ...cumul, erreur: null });
        if (!r.restants || !r.traites) break;
      }
    } catch (erreur) {
      setVerif({ enCours: false, ...cumul, erreur });
    }
    client.invalidateQueries({ queryKey: ["emplacements-concurrents"] });
    client.invalidateQueries({ queryKey: ["emplacements-google"] });
  };
  if (chargement) return <Chargement />;
  if (!emplacements) return null;
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtres = q.trim() ? emplacements.filter((e) => n([e.nom, e.ville, e.codePostal, e.adresse, e.concurrent.nom].filter(Boolean).join(" ")).includes(n(q.trim()))) : emplacements;
  const disponibles = filtres.filter((e) => !e.lieu);
  const tousCoches = disponibles.length > 0 && disponibles.every((e) => choisis.has(e.id));
  const basculer = (id: number) => setChoisis((s) => { const c = new Set(s); if (c.has(id)) c.delete(id); else c.add(id); return c; });
  const typesLieu = (ref?.listes.TYPE_LIEU ?? []).filter((t) => t.actif);
  const sansCategorie = emplacements.filter((e) => !e.typeLieu).length;
  // Le type choisi ne sert qu'aux emplacements sélectionnés sans catégorie
  const choisisSansCategorie = emplacements.filter((e) => choisis.has(e.id) && !e.typeLieu).length;

  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-base font-semibold">Emplacements des concurrents ({filtres.length})</h2>
        <div className="flex flex-wrap items-end gap-2">
          {google.data?.configure && google.data.restants > 0 && (
            <button type="button" className="bouton" disabled={verif.enCours} onClick={verifierSurGoogle} title="Catégorie, note et avis d'après la fiche Google du lieu">
              {verif.enCours ? `Vérification sur Google… ${verif.traites} / ${verif.traites + google.data.restants}` : `Vérifier sur Google (${google.data.restants})`}
            </button>
          )}
          {sansCategorie > 0 && (
            <button type="button" className="bouton-second" disabled={auto.isPending} onClick={() => auto.mutate()} title="Bar, club, centre commercial… d'après le nom ; à vérifier ensuite">
              {auto.isPending ? "Catégorisation…" : `Catégoriser automatiquement (${sansCategorie} sans catégorie)`}
            </button>
          )}
          <input className="champ !w-72" placeholder="Rechercher un nom, une ville, un code postal…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {auto.data && (
        <p className="mb-2 text-sm text-good">
          {auto.data.categorises} emplacement(s) catégorisé(s) d&apos;après leur nom.{auto.data.restants > 0 && ` ${auto.data.restants} restent à catégoriser à la main (filtre « À catégoriser »).`}
        </p>
      )}
      {(auto.error || categoriser.error) && <Erreur erreur={auto.error ?? categoriser.error} />}
      {verif.traites > 0 && (
        <p className="mb-2 text-sm text-good">
          Google : {verif.traites} emplacement(s) vérifié(s), {verif.trouves} retrouvé(s), {verif.categorises} catégorisé(s).
          {verif.enCours && " Ne fermez pas la page avant la fin."}
        </p>
      )}
      {verif.erreur != null && <Erreur erreur={verif.erreur} />}
      {google.data && !google.data.configure && (
        <p className="mb-2 text-xs text-ink-muted">Vérification sur Google indisponible : clé GOOGLE_PLACES_API_KEY à ajouter dans l&apos;API.</p>
      )}

      {choisis.size > 0 && (
        <div className="mb-2 flex flex-wrap items-end gap-2 rounded-md bg-accent/5 p-3 text-sm">
          <span className="self-center font-medium">{choisis.size} emplacement(s) sélectionné(s)</span>
          {choisisSansCategorie > 0 && (
            <label>
              <span className="etiquette">Type de lieu pour les {choisisSansCategorie} sans catégorie *</span>
              <select className="champ" value={typeLieuId} onChange={(e) => setTypeLieuId(e.target.value)}>
                <option value="">—</option>
                {typesLieu.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="bouton" disabled={(choisisSansCategorie > 0 && !typeLieuId) || creer.isPending} onClick={() => creer.mutate([...choisis])}>
            {creer.isPending ? "Création…" : `Créer ${choisis.size} prospect${choisis.size > 1 ? "s" : ""}`}
          </button>
          <button type="button" className="bouton-second" onClick={() => setChoisis(new Set())}>Annuler</button>
        </div>
      )}
      {creer.data && (
        <p className="mb-2 text-sm text-good">
          {creer.data.crees} prospect(s) créé(s) avec le concurrent en place renseigné.{creer.data.dejaProspects > 0 && ` ${creer.data.dejaProspects} étaient déjà des prospects.`}
        </p>
      )}
      {creer.error && <Erreur erreur={creer.error} />}

      {!emplacements.length ? (
        <Vide>Aucun emplacement : importez ceux d&apos;un concurrent dans Paramètres → Concurrents.</Vide>
      ) : (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Tout sélectionner"
                    checked={tousCoches}
                    disabled={!disponibles.length}
                    onChange={() => setChoisis(tousCoches ? new Set() : new Set(disponibles.map((e) => e.id)))}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium">Catégorie</th>
                <th className="px-4 py-3 font-medium">Concurrent</th>
                <th className="px-4 py-3 font-medium">Adresse</th>
                <th className="px-4 py-3 font-medium">Ville</th>
                <th className="px-4 py-3 font-medium">Prospect</th>
              </tr>
            </thead>
            <tbody>
              {filtres.slice(0, nb).map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    {!e.lieu && <input type="checkbox" aria-label={`Sélectionner ${e.nom}`} checked={choisis.has(e.id)} onChange={() => basculer(e.id)} />}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{e.nom}</span>
                    {e.googlePlaceId ? (
                      <a href={e.googleUrl ?? undefined} target="_blank" rel="noreferrer" className="block text-xs text-ink-muted hover:underline" title={e.googleNom ?? undefined}>
                        Google{e.googleNote !== null && ` · ★ ${e.googleNote.toLocaleString("fr-FR")}`}{e.googleNbAvis !== null && ` (${e.googleNbAvis} avis)`}
                        {e.googleType && ` · ${e.googleType.replace(/_/g, " ")}`}
                      </a>
                    ) : (
                      e.googleVerifieLe && <span className="block text-xs text-warn-ink">introuvable sur Google</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      className={`champ !py-1 text-sm ${e.typeLieu ? "" : "text-warn-ink"}`}
                      aria-label={`Catégorie de ${e.nom}`}
                      value={e.typeLieu?.id ?? ""}
                      onChange={(ev) => categoriser.mutate({ id: e.id, typeLieuId: ev.target.value ? Number(ev.target.value) : null })}
                    >
                      <option value="">À catégoriser</option>
                      {typesLieu.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    {e.concurrent.nom}
                    <span className="block text-xs text-ink-muted">{MATERIELS[e.concurrent.typeMateriel]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{e.adresse ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {[e.codePostal, e.ville].filter(Boolean).join(" ") || "—"}
                    {e.latitude === null && <span className="block text-xs text-warn-ink">pas sur la carte</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.lieu ? (
                      <Link href={`/lieux/${e.lieu.id}`} className="text-accent hover:underline">Voir le {e.lieu.statut === "PROSPECT" ? "prospect" : "lieu"}</Link>
                    ) : (
                      <button type="button" className="text-accent hover:underline" onClick={() => setChoisis(new Set([e.id]))}>Créer le prospect</button>
                    )}
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

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs, type LieuListe } from "@/lib/api";
import { depuis, euros, nombre, parametreUrl } from "@/lib/format";
import { DEPARTEMENTS, libelleDepartement } from "@/lib/departements";
import { useReferentiel } from "@/components/Filtres";
import { Gate, PageGuard, usePerm } from "@/lib/perms";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { CarteLieux } from "@/components/CarteLieux";
import { AnalyseLieux } from "@/components/AnalyseLieux";

const STATUTS: Record<string, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  // « Actif » faisait penser à une borne connectée (retour de Sébastien) : c'est la relation commerciale
  ACTIF: { libelle: "Client", ton: "ok" },
  SUSPENDU: { libelle: "Suspendu", ton: "warn" },
  RESILIE: { libelle: "Résilié", ton: "neutre" },
  PROSPECT: { libelle: "Prospect", ton: "neutre" },
};

export default function PageLieux() {
  return (
    <PageGuard perm="pages.lieux.view">
      {/* useSearchParams (onglet dans l'adresse) demande une frontière Suspense */}
      <Suspense fallback={<Chargement />}>
        <ListeLieux />
      </Suspense>
    </PageGuard>
  );
}

function ListeLieux() {
  const voitVentes = usePerm("ventes.view");
  const [recherche, setRecherche] = useState("");
  const [typeLieuId, setTypeLieuId] = useState("");
  const [statut, setStatut] = useState("");
  // Filtrés ici, sur la liste reçue : les choix proposés restent ceux des lieux affichés
  const [departement, setDepartement] = useState("");
  const [antenneId, setAntenneId] = useState("");
  const [gammeId, setGammeId] = useState("");
  // Notre parc par défaut (demande de Sébastien du 13/11)
  const [parc, setParc] = useState("SELFIZEE");
  // Liste ou carte (retour de Sébastien) ; analyse du parc (maquette lieux.html), avec le droit de voir les ventes
  const demande = useSearchParams().get("onglet");
  const [vue, choisirVue] = useState<"liste" | "carte" | "analyse">(demande === "carte" || demande === "analyse" ? demande : "liste");
  const setVue = (v: typeof vue) => {
    choisirVue(v);
    parametreUrl("onglet", v === "liste" ? null : v);
  };
  const analyse = vue === "analyse" && voitVentes;
  const router = useRouter();
  const q = useDeferredValue(recherche);
  const { data: ref } = useReferentiel();
  const query = qs({ q, typeLieuId, statut });
  const { data, error, isPending } = useQuery({
    queryKey: ["lieux", query],
    queryFn: () => api<LieuListe[]>(`/lieux${query}`),
    enabled: !analyse,
  });

  const departements = [...new Set((data ?? []).map((l) => l.departement).filter((d): d is string => !!d))].sort();
  const antennes = (ref?.listes.ANTENNE ?? []).filter((a) => a.actif || String(a.id) === antenneId);
  const lieux = (data ?? []).filter(
    (l) =>
      (!departement || l.departement === departement) &&
      (!antenneId || (antenneId === "aucune" ? !l.antenne : String(l.antenne?.id) === antenneId)) &&
      (!gammeId || l.bornes.some((b) => String(b.gamme.id) === gammeId)) &&
      (!parc || l.parc === parc)
  );
  const filtresActifs = departement || antenneId || gammeId || parc;

  return (
    <>
      <EnTete
        titre="Lieux"
        sousTitre={!analyse && data ? `${lieux.length} lieu${lieux.length > 1 ? "x" : ""}${filtresActifs ? ` sur ${data.length}` : ""}` : undefined}
        actions={
          <>
            <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Affichage">
              {(voitVentes ? (["liste", "carte", "analyse"] as const) : (["liste", "carte"] as const)).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={vue === v}
                  onClick={() => setVue(v)}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${vue === v ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
                >
                  {v === "liste" ? "Liste" : v === "carte" ? "Carte" : "Analyse"}
                </button>
              ))}
            </div>
            <Gate perm="lieux.create">
              <Link href="/lieux/nouveau" className="bouton">Nouveau lieu</Link>
            </Gate>
          </>
        }
      />

      {analyse && <AnalyseLieux />}

      {!analyse && (
      <>
      {/* Sept filtres de même largeur sur une ligne (retour du 13/11 : la recherche était trop longue) */}
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <label>
          <span className="etiquette">Recherche</span>
          <input id="lieux-recherche" className="champ" placeholder="Enseigne, raison sociale, ville…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <label>
          <span className="etiquette">Département</span>
          <select id="lieux-departement" className="champ" value={departement} onChange={(e) => setDepartement(e.target.value)}>
            <option value="">Tous</option>
            {departements.map((d) => <option key={d} value={d}>{d} · {DEPARTEMENTS[d] ?? ""}</option>)}
          </select>
        </label>
        <label>
          <span className="etiquette">Ville principale</span>
          <select id="lieux-antenne" className="champ" value={antenneId} onChange={(e) => setAntenneId(e.target.value)}>
            <option value="">Toutes</option>
            {antennes.map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
            <option value="aucune">Sans ville principale</option>
          </select>
        </label>
        <label>
          <span className="etiquette">Type de borne</span>
          <select id="lieux-gamme" className="champ" value={gammeId} onChange={(e) => setGammeId(e.target.value)}>
            <option value="">Toutes</option>
            {ref?.gammes.map((g) => <option key={g.id} value={g.id}>{g.libelle}</option>)}
          </select>
        </label>
        <label>
          <span className="etiquette">Parc</span>
          <select id="lieux-parc" className="champ" value={parc} onChange={(e) => setParc(e.target.value)}>
            <option value="">Tous</option>
            <option value="SELFIZEE">Parc Selfizee</option>
            <option value="CLIENT">Parc client</option>
            <option value="TEST">Parc test</option>
          </select>
        </label>
        <label>
          <span className="etiquette">Type de lieu</span>
          <select id="lieux-type" className="champ" value={typeLieuId} onChange={(e) => setTypeLieuId(e.target.value)}>
            <option value="">Tous</option>
            {ref?.listes.TYPE_LIEU.map((t) => (
              <option key={t.id} value={t.id}>{t.libelle}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="etiquette">Statut</span>
          <select id="lieux-statut" className="champ" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Tous (hors prospects)</option>
            {Object.entries(STATUTS).map(([k, s]) => (
              <option key={k} value={k}>{s.libelle}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.length && <Vide>Aucun lieu. Créez le premier avec « Nouveau lieu ».</Vide>}
      {data && data.length > 0 && !lieux.length && <Vide>Aucun lieu ne correspond à ces filtres.</Vide>}
      {lieux.length > 0 && vue === "carte" && <VueCarte lieux={lieux} onClic={(id) => router.push(`/lieux/${id}`)} />}
      {lieux.length > 0 && vue === "liste" && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium">Ville</th>
                <th className="px-4 py-3 font-medium">Ville principale</th>
                <th className="px-4 py-3 font-medium">Parc</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Bornes</th>
                {voitVentes && (
                  <>
                    <th className="px-4 py-3 text-right font-medium">CA 30 j</th>
                    <th className="px-4 py-3 text-right font-medium">Ventes 30 j</th>
                  </>
                )}
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {lieux.map((l) => (
                <tr key={l.id} className="border-t border-line hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/lieux/${l.id}`} className="font-medium hover:underline">{l.enseigne}</Link>
                    <div className="text-xs text-ink-muted">{l.raisonSociale}</div>
                  </td>
                  <td className="px-4 py-3">
                    {l.ville ?? <span className="text-ink-muted">—</span>}
                    {l.departement && <div className="text-xs text-ink-muted">{libelleDepartement(l.departement)}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{l.antenne?.libelle ?? <span className="text-ink-muted">—</span>}</td>
                  <td className="px-4 py-3">{l.parc === "CLIENT" ? <Badge ton="neutre">Client</Badge> : l.parc === "TEST" ? <Badge ton="warn">Test</Badge> : <span className="text-ink-2">Selfizee</span>}</td>
                  <td className="px-4 py-3 text-ink-2">
                    {l.typeLieu.libelle}
                    {l.saisonnalite === "SAISONNIER" && <span className="text-ink-muted"> · saisonnier</span>}
                  </td>
                  <td className="px-4 py-3">
                    {l.bornes.length ? (
                      l.bornes.map((b) => (
                        <div key={b.id} className="text-xs">
                          <span className="font-medium">{b.identifiant}</span> <span className="text-ink-muted">{b.gamme.libelle} · vente {depuis(b.derniereVente)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-ink-muted">aucune</span>
                    )}
                  </td>
                  {voitVentes && (
                    <>
                      <td className="px-4 py-3 text-right">{euros(l.ca30jCents ?? 0)}</td>
                      <td className="px-4 py-3 text-right">{nombre(l.ventes30j ?? 0)}</td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <Badge ton={STATUTS[l.statut]?.ton ?? "neutre"}>{STATUTS[l.statut]?.libelle ?? l.statut}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </>
  );
}

/** Les lieux filtrés sur la carte, colorés par statut */
function VueCarte({ lieux, onClic }: { lieux: LieuListe[]; onClic: (id: number) => void }) {
  const COULEURS: Record<string, string> = { ACTIF: "#16a05a", SUSPENDU: "#d97706", RESILIE: "#6b7280", PROSPECT: "#2a78d6" };
  const places = lieux.filter((l) => l.latitude != null && l.longitude != null);
  const absents = lieux.length - places.length;
  return (
    <div className="space-y-2">
      <CarteLieux
        onClic={onClic}
        points={places.map((l) => ({
          id: l.id,
          latitude: l.latitude!,
          longitude: l.longitude!,
          couleur: COULEURS[l.statut] ?? "#6b7280",
          titre: l.enseigne,
          lignes: [
            [l.typeLieu.libelle, l.ville].filter(Boolean).join(" · "),
            STATUTS[l.statut]?.libelle ?? l.statut,
            l.bornes.length ? `Bornes : ${l.bornes.map((b) => b.identifiant).join(", ")}` : "Aucune borne",
            ...(l.ca30jCents !== null ? [`CA 30 j : ${euros(l.ca30jCents)}`] : []),
          ],
        }))}
      />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Légende">
        {Object.entries(COULEURS).map(([k, c]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white" style={{ background: c }} />
            {STATUTS[k].libelle}
          </li>
        ))}
      </ul>
      {absents > 0 && <p className="text-xs text-ink-muted">{absents} lieu(x) sans position (adresse à compléter) : absents de la carte.</p>}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BorneListe, type LieuListe } from "@/lib/api";
import { dateHeure, depuis } from "@/lib/format";
import { useReferentiel } from "@/components/Filtres";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { CleUnique, Modale } from "@/components/Modale";
import { Reserve } from "@/lib/session";

type Action =
  | { type: "creer" }
  | { type: "affecter"; borne: BorneListe }
  | { type: "retirer"; borne: BorneListe }
  | { type: "cle"; borne: BorneListe }
  | { type: "cleAffichee"; identifiant: string; cle: string };

const STATUTS: Record<string, string> = {
  EN_STOCK: "En stock", INSTALLEE: "Installée", EN_PANNE: "En panne", EN_REPARATION: "En réparation", REFORMEE: "Réformée",
};

export default function PageBornes() {
  return (
    <Reserve roles={["ADMIN", "TECHNICIEN"]}>
      {/* useSearchParams (lien depuis une alerte) demande une frontière Suspense */}
      <Suspense fallback={<Chargement />}>
        <Bornes />
      </Suspense>
    </Reserve>
  );
}

function Bornes() {
  const [action, setAction] = useState<Action | null>(null);
  const { data, error, isPending } = useQuery({ queryKey: ["bornes"], queryFn: () => api<BorneListe[]>("/bornes") });
  // Lien depuis une alerte « borne non affectée » : ouvre la fenêtre d'affectation de cette borne
  const parametres = useSearchParams();
  const aAffecter = parametres.get("affecter");
  const [lienTraite, setLienTraite] = useState<string | null>(null);
  if (aAffecter && data && lienTraite !== aAffecter) {
    const b = data.find((x) => String(x.id) === aAffecter);
    setLienTraite(aAffecter);
    if (b) setAction({ type: "affecter", borne: b });
  }
  const fermer = () => setAction(null);
  // Recherche (borne ou lieu) et filtre par gamme (retour de Sébastien)
  const [recherche, setRecherche] = useState("");
  const [gammeId, setGammeId] = useState("");
  const [parc, setParc] = useState("");
  const { data: ref } = useReferentiel();
  const q = recherche.trim().toLowerCase();
  const visibles = (data ?? []).filter(
    (b) =>
      (!gammeId || String(b.gamme.id) === gammeId) &&
      (!parc || b.lieuActuel?.parc === parc) &&
      (!q || b.identifiant.toLowerCase().includes(q) || (b.lieuActuel ? `${b.lieuActuel.enseigne} ${b.lieuActuel.ville ?? ""}`.toLowerCase().includes(q) : false))
  );

  return (
    <>
      <EnTete
        titre="Bornes"
        sousTitre={data ? `${data.length} borne${data.length > 1 ? "s" : ""} · ${data.filter((b) => b.enLigne).length} en ligne` : undefined}
        actions={<button className="bouton" onClick={() => setAction({ type: "creer" })}>Nouvelle borne</button>}
      />

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.length && <Vide>Aucune borne enregistrée.</Vide>}
      {data && data.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <label className="block">
            <span className="etiquette">Recherche</span>
            <input id="bornes-recherche" className="champ" placeholder="N° de borne (S220), lieu, ville…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
          <label className="block">
            <span className="etiquette">Type de borne</span>
            <select id="bornes-gamme" className="champ" value={gammeId} onChange={(e) => setGammeId(e.target.value)}>
              <option value="">Toutes</option>
              {ref?.gammes.map((g) => <option key={g.id} value={g.id}>{g.libelle}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="etiquette">Parc</span>
            <select id="bornes-parc" className="champ" value={parc} onChange={(e) => setParc(e.target.value)}>
              <option value="">Tous</option>
              <option value="SELFIZEE">Parc Selfizee</option>
              <option value="CLIENT">Parc client</option>
            </select>
          </label>
        </div>
      )}
      {data && data.length > 0 && !visibles.length && <Vide>Aucune borne ne correspond.</Vide>}
      {visibles.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Lieu actuel</th>
                <th className="px-4 py-3 font-medium">Borne</th>
                <th className="px-4 py-3 font-medium">Connexion</th>
                <th className="px-4 py-3 font-medium">Dernière vente</th>
                <th className="px-4 py-3 font-medium">Papier restant</th>
                <th className="px-4 py-3 font-medium">Paiement</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((b) => (
                <tr key={b.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    {b.lieuActuel ? (
                      <>
                        <Link className="hover:underline" href={`/lieux/${b.lieuActuel.id}`}>{b.lieuActuel.enseigne}</Link>
                        <div className="text-xs text-ink-muted">depuis le {dateHeure(b.affectationActuelle!.debut)}</div>
                      </>
                    ) : (
                      <Badge ton="warn">Non affectée</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link className="font-medium hover:underline" href={`/bornes/${b.id}`}>{b.identifiant}</Link>
                    <div className="text-xs text-ink-muted">
                      {b.gamme.libelle} · {STATUTS[b.statut] ?? b.statut}
                      {b.lieuActuel?.parc === "CLIENT" && " · parc client"}
                      {b.logicielVersion && ` · v${b.logicielVersion}`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {b.enLigne ? <Badge ton="ok">En ligne</Badge> : b.dernierHeartbeat ? <Badge ton="crit">Muette</Badge> : <span title="La borne n’a encore rien envoyé à Régie : la synchronisation n’est pas encore installée ou configurée sur la borne."><Badge ton="neutre">Pas encore synchronisée</Badge></span>}
                    <div className="mt-1 text-xs text-ink-muted">signal {depuis(b.dernierHeartbeat)}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{depuis(b.derniereVente)}</td>
                  <td className="px-4 py-3 tabular">
                    {b.papier ? (
                      <span className={b.papier.restant < 50 ? "text-bad" : b.papier.restant < 100 ? "text-warn-ink" : ""}>
                        {b.papier.restant} tirage{b.papier.restant > 1 ? "s" : ""}
                        <span className="block text-xs text-ink-muted">{depuis(b.papier.le)}</span>
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-2">
                    {b.modules.map((m) => <div key={m.id}>{m.type.libelle}{m.numeroSerie && ` · ${m.numeroSerie}`}</div>)}
                    {!b.cleConfiguree && <Badge ton="warn">Pas de clé API</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setAction({ type: "affecter", borne: b })}>
                        {b.lieuActuel ? "Déplacer" : "Affecter"}
                      </button>
                      {b.lieuActuel && (
                        <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setAction({ type: "retirer", borne: b })}>Retirer</button>
                      )}
                      <button className="bouton-second !px-2 !py-1 text-xs" onClick={() => setAction({ type: "cle", borne: b })}>Nouvelle clé</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modale titre="Nouvelle borne" ouverte={action?.type === "creer"} onFermer={fermer}>
        <FormBorne onCree={(identifiant, cle) => setAction({ type: "cleAffichee", identifiant, cle })} />
      </Modale>
      <Modale
        titre={action?.type === "affecter" ? `${action.borne.lieuActuel ? "Déplacer" : "Affecter"} ${action.borne.identifiant}` : ""}
        ouverte={action?.type === "affecter"}
        onFermer={fermer}
      >
        {action?.type === "affecter" && <FormAffectation borne={action.borne} onFini={fermer} />}
      </Modale>
      <Modale titre={action?.type === "retirer" ? `Retirer ${action.borne.identifiant}` : ""} ouverte={action?.type === "retirer"} onFermer={fermer}>
        {action?.type === "retirer" && <FormRetrait borne={action.borne} onFini={fermer} />}
      </Modale>
      <Modale titre="Régénérer la clé API" ouverte={action?.type === "cle"} onFermer={fermer}>
        {action?.type === "cle" && (
          <RegenererCle borne={action.borne} onFini={(cle) => setAction({ type: "cleAffichee", identifiant: action.borne.identifiant, cle })} />
        )}
      </Modale>
      <Modale titre="Clé API" ouverte={action?.type === "cleAffichee"} onFermer={fermer}>
        {action?.type === "cleAffichee" && <CleUnique identifiant={action.identifiant} cle={action.cle} />}
      </Modale>
    </>
  );
}

/** "2026-10-05T14:30" (heure locale du navigateur) → ISO avec fuseau */
const versIso = (local: string) => new Date(local).toISOString();
const maintenantLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function MessageErreur({ erreur }: { erreur: Error | null }) {
  return erreur ? <p role="alert" className="text-sm text-bad">{erreur.message}</p> : null;
}

function FormBorne({ onCree }: { onCree: (identifiant: string, cle: string) => void }) {
  const client = useQueryClient();
  const { data: ref } = useReferentiel();
  const [f, setF] = useState({ identifiant: "", gammeId: "", moduleTypeId: "", moduleSerie: "", moduleTid: "" });
  const creer = useMutation({
    mutationFn: () =>
      api<{ identifiant: string; cleApi: string }>("/bornes", {
        method: "POST",
        json: {
          identifiant: f.identifiant,
          gammeId: Number(f.gammeId),
          module: f.moduleTypeId
            ? { typeId: Number(f.moduleTypeId), numeroSerie: f.moduleSerie || undefined, identifiantPrestataire: f.moduleTid || undefined }
            : undefined,
        },
      }),
    onSuccess: (b) => {
      client.invalidateQueries({ queryKey: ["bornes"] });
      onCree(b.identifiant, b.cleApi);
    },
  });

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); creer.mutate(); }}>
      <label className="block">
        <span className="etiquette">Identifiant de la borne *</span>
        <input className="champ" required placeholder="S220" value={f.identifiant} onChange={(e) => setF({ ...f, identifiant: e.target.value.toUpperCase() })} />
        <span className="mt-1 block text-xs text-ink-muted">Celui que la borne envoie avec ses ventes (borne_id), par exemple S220.</span>
      </label>
      <label className="block">
        <span className="etiquette">Gamme *</span>
        <select className="champ" required value={f.gammeId} onChange={(e) => setF({ ...f, gammeId: e.target.value })}>
          <option value="">—</option>
          {ref?.gammes.filter((g) => g.actif).map((g) => <option key={g.id} value={g.id}>{g.libelle}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="etiquette">Module de paiement</span>
          <select className="champ" value={f.moduleTypeId} onChange={(e) => setF({ ...f, moduleTypeId: e.target.value })}>
            <option value="">—</option>
            {ref?.typesModule.filter((t) => t.actif).map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">N° de série du module</span>
          <input className="champ" value={f.moduleSerie} onChange={(e) => setF({ ...f, moduleSerie: e.target.value })} />
        </label>
      </div>
      {f.moduleTypeId && (
        <label className="block">
          <span className="etiquette">N° de terminal chez le prestataire (TID)</span>
          <input className="champ" value={f.moduleTid} onChange={(e) => setF({ ...f, moduleTid: e.target.value })} />
          <span className="text-xs text-ink-muted">Sert à rapprocher les relevés du prestataire monétique ; modifiable plus tard sur la fiche.</span>
        </label>
      )}
      <MessageErreur erreur={creer.error} />
      <button className="bouton" disabled={creer.isPending}>Créer et générer la clé</button>
    </form>
  );
}

function FormAffectation({ borne, onFini }: { borne: BorneListe; onFini: () => void }) {
  const client = useQueryClient();
  const { data: lieux } = useQuery({ queryKey: ["lieux", ""], queryFn: () => api<LieuListe[]>("/lieux") });
  const [lieuId, setLieuId] = useState("");
  const [debut, setDebut] = useState(maintenantLocal);
  const affecter = useMutation({
    mutationFn: () => api("/affectations", { method: "POST", json: { borneId: borne.id, lieuId: Number(lieuId), debut: versIso(debut) } }),
    onSuccess: () => {
      client.invalidateQueries();
      onFini();
    },
  });

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); affecter.mutate(); }}>
      <label className="block">
        <span className="etiquette">Lieu *</span>
        <select className="champ" required value={lieuId} onChange={(e) => setLieuId(e.target.value)}>
          <option value="">—</option>
          {lieux?.filter((l) => l.id !== borne.lieuActuel?.id).map((l) => (
            <option key={l.id} value={l.id}>{l.enseigne}{l.ville ? ` (${l.ville})` : ""}</option>
          ))}
        </select>
      </label>
      {borne.ventesSansLieu && (
        <div className="rounded-md bg-warn-bg p-3 text-sm text-warn-ink">
          <strong>{borne.ventesSansLieu.nb} vente{borne.ventesSansLieu.nb > 1 ? "s" : ""} sans lieu</strong> du {dateHeure(borne.ventesSansLieu.du)} au{" "}
          {dateHeure(borne.ventesSansLieu.au)}. Pour les rattacher à ce lieu, la borne doit y être arrivée avant la première.
          <button type="button" className="mt-1 block font-medium underline" onClick={() => setDebut(localDe(borne.ventesSansLieu!.du, true))}>
            Commencer le jour de la première vente
          </button>
        </div>
      )}
      <label className="block">
        <span className="etiquette">À partir du *</span>
        <input className="champ" type="datetime-local" required value={debut} onChange={(e) => setDebut(e.target.value)} />
      </label>
      <p className="text-xs text-ink-2">
        {borne.lieuActuel && <>L&apos;affectation à <strong>{borne.lieuActuel.enseigne}</strong> sera clôturée à cette date. </>}
        Les ventes déjà reçues après cette date seront rattachées au nouveau lieu, avec les statistiques et les commissions.
      </p>
      <MessageErreur erreur={affecter.error} />
      <button className="bouton" disabled={affecter.isPending}>Valider</button>
    </form>
  );
}

function FormRetrait({ borne, onFini }: { borne: BorneListe; onFini: () => void }) {
  const client = useQueryClient();
  const [fin, setFin] = useState(maintenantLocal);
  const retirer = useMutation({
    mutationFn: () => api(`/affectations/${borne.affectationActuelle!.id}`, { method: "PATCH", json: { fin: versIso(fin) } }),
    onSuccess: () => {
      client.invalidateQueries();
      onFini();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); retirer.mutate(); }}>
      <p className="text-sm">
        Retirer <strong>{borne.identifiant}</strong> de <strong>{borne.lieuActuel?.enseigne}</strong>. Les ventes reçues après cette date ne seront rattachées à aucun lieu (et signalées).
      </p>
      <label className="block">
        <span className="etiquette">Date de retrait *</span>
        <input className="champ" type="datetime-local" required value={fin} onChange={(e) => setFin(e.target.value)} />
      </label>
      <MessageErreur erreur={retirer.error} />
      <button className="bouton" disabled={retirer.isPending}>Retirer la borne</button>
    </form>
  );
}

function RegenererCle({ borne, onFini }: { borne: BorneListe; onFini: (cle: string) => void }) {
  const client = useQueryClient();
  const regenerer = useMutation({
    mutationFn: () => api<{ cleApi: string }>(`/bornes/${borne.id}/cle`, { method: "POST" }),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["bornes"] });
      onFini(r.cleApi);
    },
  });
  return (
    <div className="space-y-3 text-sm">
      <p>
        La clé actuelle de <strong>{borne.identifiant}</strong> cessera immédiatement de fonctionner : la borne ne pourra plus envoyer ses ventes
        tant que la nouvelle clé n&apos;y est pas installée. Elle les renverra ensuite (rattrapage).
      </p>
      <MessageErreur erreur={regenerer.error} />
      <button className="bouton" disabled={regenerer.isPending} onClick={() => regenerer.mutate()}>Générer une nouvelle clé</button>
    </div>
  );
}

/** Date ISO → valeur d'un champ datetime-local (heure locale) ; debutJour : à 00:00 */
function localDe(iso: string, debutJour = false): string {
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${debutJour ? "00:00" : `${deux(d.getHours())}:${deux(d.getMinutes())}`}`;
}

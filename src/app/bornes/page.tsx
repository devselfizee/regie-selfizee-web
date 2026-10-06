"use client";

import Link from "next/link";
import { useState } from "react";
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
      <Bornes />
    </Reserve>
  );
}

function Bornes() {
  const [action, setAction] = useState<Action | null>(null);
  const { data, error, isPending } = useQuery({ queryKey: ["bornes"], queryFn: () => api<BorneListe[]>("/bornes") });
  const fermer = () => setAction(null);

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
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Borne</th>
                <th className="px-4 py-3 font-medium">Connexion</th>
                <th className="px-4 py-3 font-medium">Lieu actuel</th>
                <th className="px-4 py-3 font-medium">Dernière vente</th>
                <th className="px-4 py-3 font-medium">Paiement</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{b.identifiant}</div>
                    <div className="text-xs text-ink-muted">
                      {b.gamme.libelle} · {b.numeroSerie} · {STATUTS[b.statut] ?? b.statut}
                      {b.logicielVersion && ` · v${b.logicielVersion}`}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {b.enLigne ? <Badge ton="ok">En ligne</Badge> : <Badge ton={b.dernierHeartbeat ? "crit" : "neutre"}>{b.dernierHeartbeat ? "Muette" : "Jamais connectée"}</Badge>}
                    <div className="mt-1 text-xs text-ink-muted">signal {depuis(b.dernierHeartbeat)}</div>
                  </td>
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
                  <td className="px-4 py-3 text-ink-2">{depuis(b.derniereVente)}</td>
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
  const [f, setF] = useState({ identifiant: "", numeroSerie: "", gammeId: "", moduleTypeId: "", moduleSerie: "" });
  const creer = useMutation({
    mutationFn: () =>
      api<{ identifiant: string; cleApi: string }>("/bornes", {
        method: "POST",
        json: {
          identifiant: f.identifiant,
          numeroSerie: f.numeroSerie,
          gammeId: Number(f.gammeId),
          module: f.moduleTypeId ? { typeId: Number(f.moduleTypeId), numeroSerie: f.moduleSerie || undefined } : undefined,
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
        <span className="etiquette">Identifiant (celui envoyé dans les JSON) *</span>
        <input className="champ" required placeholder="MT-0043" value={f.identifiant} onChange={(e) => setF({ ...f, identifiant: e.target.value.toUpperCase() })} />
      </label>
      <label className="block">
        <span className="etiquette">Numéro de série *</span>
        <input className="champ" required value={f.numeroSerie} onChange={(e) => setF({ ...f, numeroSerie: e.target.value })} />
      </label>
      <label className="block">
        <span className="etiquette">Gamme *</span>
        <select className="champ" required value={f.gammeId} onChange={(e) => setF({ ...f, gammeId: e.target.value })}>
          <option value="">—</option>
          {ref?.gammes.map((g) => <option key={g.id} value={g.id}>{g.libelle}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="etiquette">Module de paiement</span>
          <select className="champ" value={f.moduleTypeId} onChange={(e) => setF({ ...f, moduleTypeId: e.target.value })}>
            <option value="">—</option>
            {ref?.typesModule.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">N° de série du module</span>
          <input className="champ" value={f.moduleSerie} onChange={(e) => setF({ ...f, moduleSerie: e.target.value })} />
        </label>
      </div>
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
      <label className="block">
        <span className="etiquette">À partir du *</span>
        <input className="champ" type="datetime-local" required value={debut} onChange={(e) => setDebut(e.target.value)} />
      </label>
      <p className="text-xs text-ink-2">
        {borne.lieuActuel && <>L&apos;affectation à <strong>{borne.lieuActuel.enseigne}</strong> sera clôturée à cette date. </>}
        Les ventes déjà reçues après cette date seront rattachées au nouveau lieu.
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

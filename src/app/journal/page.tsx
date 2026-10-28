"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { dateHeure } from "@/lib/format";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Reserve } from "@/lib/session";

// Journal des envois des bornes : ce qu'elles ont envoyé à la Régie, accepté ou refusé, avec le contenu brut.

interface LotJournal {
  id: string;
  source: string;
  type: "TRANSACTIONS" | "HEARTBEAT" | "RELEVE_MONETIQUE" | "PARCOURS";
  borneIdentifiant: string | null;
  schemaVersion: string | null;
  recuLe: string;
  ipSource: string | null;
  statut: "OK" | "PARTIEL" | "REJETE";
  nbRecues: number;
  nbCreees: number;
  nbDoublons: number;
  nbCompletees: number;
  nbRejetees: number;
  borne: { id: number; identifiant: string } | null;
  erreurs: { code: string }[];
  refusParCode: { code: string; nb: number }[];
}

interface LotDetail extends Omit<LotJournal, "erreurs" | "refusParCode"> {
  payload: unknown;
  erreurs: { index: number | null; transactionIdModule: string | null; code: string; message: string }[];
}

interface SigneDeVie {
  id: string;
  horodatage: string;
  recuLe: string;
  papierRestant: number | null;
  rubanRestant: number | null;
  imprimanteOk: boolean | null;
  modulePaiementOk: boolean | null;
  erreurs: { code: string; message?: string; composant?: string }[] | null;
  logicielVersion: string | null;
  borne: { id: number; identifiant: string };
}

const TYPES: Record<string, string> = { TRANSACTIONS: "Ventes", HEARTBEAT: "Signes de vie", RELEVE_MONETIQUE: "Relevé monétique", PARCOURS: "Parcours invité" };
const STATUTS: Record<LotJournal["statut"], { ton: "ok" | "warn" | "crit"; libelle: string }> = {
  OK: { ton: "ok", libelle: "Accepté" },
  PARTIEL: { ton: "warn", libelle: "En partie refusé" },
  REJETE: { ton: "crit", libelle: "Refusé" },
};
const SOURCES: Record<string, string> = { API: "borne (API)", DEPOT_FICHIER: "dépôt de fichier", RATTRAPAGE_MANUEL: "rattrapage manuel", BACKOFFICE: "back-office" };

export default function PageJournal() {
  return (
    <Reserve roles={["ADMIN", "TECHNICIEN"]}>
      <Journal />
    </Reserve>
  );
}

function Journal() {
  const [onglet, setOnglet] = useState<"envois" | "signes">("envois");
  const [borne, setBorne] = useState("");
  const [type, setType] = useState("");
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const filtre = borne.trim();

  return (
    <>
      <EnTete
        titre="Journal des bornes"
        sousTitre="Tout ce que les bornes envoient à la Régie, accepté ou refusé, avec le contenu reçu. Pour vérifier qu'une borne transmet bien."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Affichage">
          {(
            [
              ["envois", "Envois reçus"],
              ["signes", "Signes de vie acceptés"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setOnglet(k)} className={`rounded-md px-3 py-1.5 text-sm ${onglet === k ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-2"}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="etiquette">Borne</span>
          <input
            id="journal-borne"
            className="champ w-40"
            placeholder="ex. S221"
            value={borne}
            onChange={(e) => {
              setBorne(e.target.value.toUpperCase());
              setPage(1);
            }}
          />
        </label>
        {onglet === "envois" && (
          <>
            <label className="block">
              <span className="etiquette">Type</span>
              <select id="journal-type" className="champ" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                <option value="">Tous</option>
                <option value="TRANSACTIONS">Ventes</option>
                <option value="PARCOURS">Parcours invité</option>
                <option value="HEARTBEAT">Signes de vie refusés</option>
              </select>
            </label>
            <label className="block">
              <span className="etiquette">Résultat</span>
              <select id="journal-statut" className="champ" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
                <option value="">Tous</option>
                <option value="OK">Acceptés</option>
                <option value="PARTIEL">En partie refusés</option>
                <option value="REJETE">Refusés</option>
              </select>
            </label>
          </>
        )}
      </div>
      {onglet === "envois" ? <Envois borne={filtre} type={type} statut={statut} page={page} setPage={setPage} /> : <Signes borne={filtre} />}
    </>
  );
}

function Envois({ borne, type, statut, page, setPage }: { borne: string; type: string; statut: string; page: number; setPage: (p: number) => void }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const { data, error, isPending } = useQuery({
    queryKey: ["journal", borne, type, statut, page],
    queryFn: () => api<{ total: number; page: number; parPage: number; lots: LotJournal[] }>(`/imports/journal${qs({ borne, type, statut, page })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  if (error) return <Erreur erreur={error} />;
  if (isPending) return <Chargement />;
  if (!data.lots.length)
    return (
      <Vide>
        Aucun envoi{borne && ` de ${borne}`}. Si la borne a envoyé quelque chose, vérifiez l&apos;adresse utilisée : sans le bon chemin
        (/ingest/v1/…), l&apos;envoi n&apos;arrive pas jusqu&apos;ici.
      </Vide>
    );
  const pages = Math.ceil(data.total / data.parPage);

  return (
    <>
      <p className="mb-2 text-xs text-ink-muted">{data.total} envoi(s), les plus récents d&apos;abord. Mise à jour toutes les 30 secondes.</p>
      <div className="carte divide-y divide-line">
        {data.lots.map((l) => (
          <div key={l.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <Badge ton={STATUTS[l.statut].ton}>{STATUTS[l.statut].libelle}</Badge>
                <span className="font-medium">{l.borne?.identifiant ?? l.borneIdentifiant ?? "borne inconnue"}</span>
                <span className="text-ink-2">{TYPES[l.type] ?? l.type}</span>
                <span className="text-xs text-ink-muted tabular">
                  {dateHeure(l.recuLe)} · {SOURCES[l.source] ?? l.source}
                  {l.schemaVersion && ` · schéma ${l.schemaVersion}`}
                  {l.ipSource && ` · IP ${l.ipSource}`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {(l.type === "TRANSACTIONS" || l.type === "PARCOURS") && l.borne && l.statut !== "OK" && <Rejouer id={l.id} />}
                <button type="button" className="bouton-second !px-2 !py-1 text-xs" onClick={() => setOuvert(ouvert === l.id ? null : l.id)}>
                  {ouvert === l.id ? "Masquer" : "Voir le contenu"}
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-2 tabular">
              {(l.type === "TRANSACTIONS" || l.type === "PARCOURS") && l.statut !== "REJETE"
                ? `${l.nbRecues} reçue(s) : ${l.nbCreees} nouvelle(s), ${l.nbDoublons} déjà reçue(s)${l.nbCompletees ? ` dont ${l.nbCompletees} complétée(s)` : ""}, ${l.nbRejetees} refusée(s)${l.refusParCode?.length ? ` (${l.refusParCode.map((c) => `${c.code} × ${c.nb}`).join(", ")})` : ""}`
                : l.erreurs.map((e) => e.code).join(", ")}
              {!l.borne && l.statut === "REJETE" && " · borne inconnue de la Régie ou clé refusée"}
            </p>
            {ouvert === l.id && <Detail id={l.id} />}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button type="button" className="bouton-second !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Plus récents</button>
          <span className="text-ink-2 tabular">Page {page} / {pages}</span>
          <button type="button" className="bouton-second !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Plus anciens →</button>
        </div>
      )}
    </>
  );
}

/** Rejoue un lot de ventes refusé, une fois la cause corrigée (module réactivé…). Sans risque de doublon. */
function Rejouer({ id }: { id: string }) {
  const client = useQueryClient();
  const rejouer = useMutation({
    mutationFn: () => api<{ recues: number; creees?: number; crees?: number; doublons: number; rejetees: number }>(`/imports/journal/${id}/rejouer`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["journal"] }),
  });
  if (rejouer.data) {
    const r = rejouer.data;
    return <span className="self-center text-xs text-ink-2">Rejoué : {r.creees ?? r.crees ?? 0} nouveau(x), {r.doublons} déjà reçue(s), {r.rejetees} refusée(s)</span>;
  }
  return (
    <>
      {rejouer.error && <span className="self-center text-xs text-crit-ink">{rejouer.error.message}</span>}
      <button type="button" className="bouton-second !px-2 !py-1 text-xs" disabled={rejouer.isPending} title="Après avoir corrigé la cause du refus" onClick={() => rejouer.mutate()}>
        {rejouer.isPending ? "…" : "Rejouer"}
      </button>
    </>
  );
}

function Detail({ id }: { id: string }) {
  const { data, error } = useQuery({ queryKey: ["journal-lot", id], queryFn: () => api<LotDetail>(`/imports/journal/${id}`) });
  if (error) return <div className="mt-3"><Erreur erreur={error} /></div>;
  if (!data) return <Chargement />;
  return (
    <div className="mt-3 space-y-2">
      {data.erreurs.length > 0 && (
        <ul className="space-y-1 rounded-md bg-crit-bg p-3 text-xs text-crit-ink">
          {data.erreurs.map((e, i) => (
            <li key={i}>
              <strong>{e.code}</strong>
              {e.index !== null && ` · ligne ${e.index + 1}`}
              {e.transactionIdModule && ` · ${e.transactionIdModule}`} : {e.message}
            </li>
          ))}
        </ul>
      )}
      <pre className="max-h-96 overflow-auto rounded-md bg-surface-2 p-3 text-xs">{JSON.stringify(data.payload, null, 2)}</pre>
    </div>
  );
}

const ouiNon = (v: boolean | null) => (v === null ? "—" : v ? "OK" : "En panne");

function Signes({ borne }: { borne: string }) {
  const { data, error, isPending } = useQuery({
    queryKey: ["signes-de-vie", borne],
    queryFn: () => api<SigneDeVie[]>(`/imports/signes-de-vie${qs({ borne })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  if (error) return <Erreur erreur={error} />;
  if (isPending) return <Chargement />;
  if (!data.length) return <Vide>Aucun signe de vie accepté{borne && ` de ${borne}`}. Les signes de vie refusés sont dans « Envois reçus ».</Vide>;
  return (
    <>
      <p className="mb-2 text-xs text-ink-muted">Les 200 derniers, les plus récents d&apos;abord. Mise à jour toutes les 30 secondes.</p>
      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-2">
              <th className="px-3 py-2 font-medium">Borne</th>
              <th className="px-3 py-2 font-medium">Envoyé par la borne</th>
              <th className="px-3 py-2 font-medium">Reçu</th>
              <th className="px-3 py-2 font-medium">Papier</th>
              <th className="px-3 py-2 font-medium">Ruban</th>
              <th className="px-3 py-2 font-medium">Imprimante</th>
              <th className="px-3 py-2 font-medium">Paiement</th>
              <th className="px-3 py-2 font-medium">Erreurs</th>
              <th className="px-3 py-2 font-medium">Logiciel</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-medium">{s.borne.identifiant}</td>
                <td className="px-3 py-2">{dateHeure(s.horodatage)}</td>
                <td className="px-3 py-2 text-ink-2">{dateHeure(s.recuLe)}</td>
                <td className="px-3 py-2">{s.papierRestant ?? "—"}</td>
                <td className="px-3 py-2">{s.rubanRestant ?? "—"}</td>
                <td className={`px-3 py-2 ${s.imprimanteOk === false ? "text-crit-ink" : ""}`}>{ouiNon(s.imprimanteOk)}</td>
                <td className={`px-3 py-2 ${s.modulePaiementOk === false ? "text-crit-ink" : ""}`}>{ouiNon(s.modulePaiementOk)}</td>
                <td className="px-3 py-2 text-xs">{s.erreurs?.length ? s.erreurs.map((e) => e.code).join(", ") : "—"}</td>
                <td className="px-3 py-2 text-xs text-ink-2">{s.logicielVersion ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

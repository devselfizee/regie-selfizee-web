"use client";

import Link from "next/link";
import { Suspense, useDeferredValue, useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type LieuListe } from "@/lib/api";
import { date, dateHeure, jour, nombre } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { ChoixLieu } from "@/components/ChoixLieu";
import { BoutonExport } from "@/components/BoutonExport";

// Codes de remise (demande de Sébastien, 02/11/2026) : impressions offertes ou remisées, saisies sur la borne.

type Etat = "a_utiliser" | "entame" | "epuise" | "expire" | "desactive";
const ETATS: Record<Etat, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  a_utiliser: { libelle: "À utiliser", ton: "ok" },
  entame: { libelle: "Utilisé en partie", ton: "warn" },
  epuise: { libelle: "Épuisé", ton: "neutre" },
  expire: { libelle: "Expiré", ton: "neutre" },
  desactive: { libelle: "Désactivé", ton: "crit" },
};

interface CodeRemise {
  id: number;
  code: string;
  lotId: number;
  libelle: string | null;
  type: "OFFERT" | "POURCENTAGE";
  pourcentage: number | null;
  quantite: number;
  utilise: number;
  restant: number;
  lieu: { id: number; enseigne: string } | null;
  seulementLieu: boolean;
  expireLe: string;
  creeLe: string;
  desactiveLe: string | null;
  etat: Etat;
  nbUtilisations: number;
  derniereUtilisation: string | null;
}

interface PageCodes {
  total: number;
  page: number;
  parPage: number;
  lignes: CodeRemise[];
  /** Tous les codes du filtre (pour « tout sélectionner ») */
  ids: number[];
  lots: { id: number; libelle: string | null; nbCodes: number; createdAt: string; lieu: { enseigne: string } | null }[];
}

const remise = (c: Pick<CodeRemise, "type" | "pourcentage" | "quantite">) =>
  c.type === "OFFERT" ? `${c.quantite} impression${c.quantite > 1 ? "s" : ""} offerte${c.quantite > 1 ? "s" : ""}` : `−${c.pourcentage} % sur ${c.quantite} impression${c.quantite > 1 ? "s" : ""}`;

export default function PageCodesRemise() {
  return (
    <Reserve roles={["ADMIN"]}>
      {/* useSearchParams (lien depuis la fiche d'un lieu : ?lieuId=&lotId=) demande une frontière Suspense */}
      <Suspense fallback={<Chargement />}>
        <Codes />
      </Suspense>
    </Reserve>
  );
}

function Codes() {
  const parametres = useSearchParams();
  const [q, setQ] = useState("");
  const [lieuId, setLieuId] = useState(() => parametres.get("lieuId") ?? "");
  const [lotId, setLotId] = useState(() => parametres.get("lotId") ?? "");
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const [creation, setCreation] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);
  // Sélection (un, plusieurs ou tous les codes du filtre) pour supprimer un lot créé par erreur
  const [choisis, setChoisis] = useState<Set<number>>(new Set());
  const client = useQueryClient();
  const changer = <T,>(maj: (v: T) => void) => (v: T) => {
    maj(v);
    setPage(1);
    setChoisis(new Set());
  };
  const recherche = useDeferredValue(q.trim());
  const filtres = { q: recherche || undefined, lieuId: lieuId || undefined, lotId: lotId || undefined, statut: statut || undefined };
  const query = qs({ ...filtres, page });
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["codes-remise", query],
    queryFn: () => api<PageCodes>(`/codes-remise${query}`),
    placeholderData: keepPreviousData,
  });
  const lieux = useQuery({ queryKey: ["lieux", "codes"], queryFn: () => api<LieuListe[]>("/lieux?statut="), staleTime: 5 * 60_000 });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;
  const surPage = data?.lignes.map((c) => c.id) ?? [];
  const pageChoisie = surPage.length > 0 && surPage.every((id) => choisis.has(id));
  const basculer = (ids: number[], oui: boolean) =>
    setChoisis((s) => {
      const n = new Set(s);
      for (const id of ids) if (oui) n.add(id); else n.delete(id);
      return n;
    });
  const supprimer = useMutation({
    mutationFn: (ids: number[]) => api<{ supprimes: number; lotsSupprimes: number }>("/codes-remise/supprimer", { method: "POST", json: { ids } }),
    onSuccess: (r) => {
      setChoisis(new Set());
      // Un lot supprimé ne peut plus servir de filtre
      if (r.lotsSupprimes) setLotId("");
      client.invalidateQueries({ queryKey: ["codes-remise"] });
      client.invalidateQueries({ queryKey: ["lieu"] });
      client.invalidateQueries({ queryKey: ["suivi"] });
    },
  });

  return (
    <>
      <EnTete
        titre="Codes de remise"
        sousTitre="Impressions offertes ou remisées, à saisir sur la borne. Un clic sur un code montre où et quand il a servi."
        actions={
          <>
            <BoutonExport chemin={`/codes-remise/export.xlsx${qs(filtres)}`}>Exporter (Excel)</BoutonExport>
            <button type="button" className="bouton" onClick={() => setCreation(true)}>
              Générer des codes
            </button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="etiquette">Code</span>
          <input className="champ font-mono uppercase" placeholder="K7PX2" value={q} onChange={(e) => changer(setQ)(e.target.value)} />
        </label>
        <div className="block">
          <span className="etiquette">Lieu</span>
          <ChoixLieu id="codes-lieu" lieux={lieux.data ?? []} valeur={lieuId} onChange={changer(setLieuId)} tous="Tous" />
        </div>
        <label className="block">
          <span className="etiquette">État</span>
          <select className="champ" value={statut} onChange={(e) => changer(setStatut)(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(ETATS).map(([k, e]) => <option key={k} value={k}>{e.libelle}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">Lot</span>
          <select className="champ" value={lotId} onChange={(e) => changer(setLotId)(e.target.value)}>
            <option value="">Tous</option>
            {data?.lots.map((l) => (
              <option key={l.id} value={l.id}>
                #{l.id} {l.libelle ?? ""} · {l.nbCodes} code{l.nbCodes > 1 ? "s" : ""}{l.lieu ? ` · ${l.lieu.enseigne}` : ""} · {date(l.createdAt)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data && (
        <p className="mb-3 text-sm">
          <strong className="tabular">{nombre(data.total)}</strong> code{data.total > 1 ? "s" : ""}
          {isFetching ? " · mise à jour…" : ""}
        </p>
      )}
      {choisis.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-accent/5 px-4 py-2 text-sm">
          <strong className="tabular">{nombre(choisis.size)} code{choisis.size > 1 ? "s" : ""} sélectionné{choisis.size > 1 ? "s" : ""}</strong>
          {data && pageChoisie && data.total > choisis.size && (
            <button type="button" className="text-accent hover:underline" onClick={() => basculer(data.ids, true)}>
              Sélectionner les {nombre(data.total)} codes du filtre
            </button>
          )}
          <button type="button" className="text-ink-2 hover:underline" onClick={() => setChoisis(new Set())}>Tout désélectionner</button>
          <button
            type="button"
            className="bouton-second ml-auto text-bad"
            disabled={supprimer.isPending}
            onClick={() =>
              confirm(`Supprimer définitivement ${choisis.size} code${choisis.size > 1 ? "s" : ""} ? Ils ne pourront plus être saisis sur la borne. Un code déjà utilisé ne se supprime pas (désactivez-le).`) &&
              supprimer.mutate([...choisis])
            }
          >
            {supprimer.isPending ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      )}
      {supprimer.error && <Erreur erreur={supprimer.error} />}
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.lignes.length && <Vide>Aucun code ne correspond. « Générer des codes » pour en créer.</Vide>}
      {data && data.lignes.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="w-10 py-3 pl-4">
                  <input
                    type="checkbox"
                    aria-label="Sélectionner les codes de la page"
                    checked={pageChoisie}
                    onChange={(e) => basculer(surPage, e.target.checked)}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Remise</th>
                <th className="px-4 py-3 text-right font-medium">Utilisées</th>
                <th className="px-4 py-3 text-right font-medium">Restantes</th>
                <th className="px-4 py-3 font-medium">Lieu · valable</th>
                <th className="px-4 py-3 font-medium">Expire le</th>
                <th className="px-4 py-3 font-medium">Dernière utilisation</th>
                <th className="px-4 py-3 font-medium">État</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.lignes.map((c) => (
                <tr
                  key={c.id}
                  className={`cursor-pointer border-t border-line hover:bg-surface-2 ${choisis.has(c.id) ? "bg-accent/5" : ""}`}
                  onClick={() => setDetail(c.id)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setDetail(c.id)}
                  aria-label={`Détail du code ${c.code}`}
                >
                  <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner le code ${c.code}`}
                      checked={choisis.has(c.id)}
                      onChange={(e) => basculer([c.id], e.target.checked)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-4 py-2.5 font-mono font-medium tracking-wider">{c.code}</td>
                  <td className="px-4 py-2.5">{remise(c)}</td>
                  <td className="px-4 py-2.5 text-right">{nombre(c.utilise)}</td>
                  <td className="px-4 py-2.5 text-right">{nombre(c.restant)}</td>
                  <td className="px-4 py-2.5">
                    {c.lieu ? c.lieu.enseigne : <span className="text-ink-muted">—</span>}
                    <span className="block text-xs text-ink-muted">{c.seulementLieu && c.lieu ? "ce lieu seulement" : "toutes les bornes"}</span>
                  </td>
                  <td className="px-4 py-2.5">{jour(c.expireLe)}</td>
                  <td className="px-4 py-2.5 text-ink-2">{c.derniereUtilisation ? dateHeure(c.derniereUtilisation) : "—"}</td>
                  <td className="px-4 py-2.5"><Badge ton={ETATS[c.etat].ton}>{ETATS[c.etat].libelle}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button type="button" className="bouton-second !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Précédents</button>
          <span className="text-ink-2 tabular">Page {page} / {pages}</span>
          <button type="button" className="bouton-second !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivants →</button>
        </div>
      )}

      <Modale titre="Générer des codes" ouverte={creation} onFermer={() => setCreation(false)}>
        {creation && (
          <FormulaireLot
            lieux={lieux.data ?? []}
            onCree={(lot) => {
              setCreation(false);
              setStatut("");
              setLieuId("");
              setQ("");
              setLotId(String(lot));
              setPage(1);
            }}
          />
        )}
      </Modale>
      <Modale titre="Code de remise" large ouverte={detail !== null} onFermer={() => setDetail(null)}>
        {detail !== null && <DetailCode id={detail} />}
      </Modale>
    </>
  );
}

const dansUnAn = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

function FormulaireLot({ lieux, onCree }: { lieux: LieuListe[]; onCree: (lotId: number) => void }) {
  const client = useQueryClient();
  const [nbCodes, setNbCodes] = useState("10");
  const [libelle, setLibelle] = useState("");
  const [type, setType] = useState<"OFFERT" | "POURCENTAGE">("OFFERT");
  const [quantite, setQuantite] = useState("1");
  const [pourcentage, setPourcentage] = useState("30");
  const [lieuId, setLieuId] = useState("");
  const [seulementLieu, setSeulementLieu] = useState(false);
  const [expireLe, setExpireLe] = useState(dansUnAn);
  const creer = useMutation({
    mutationFn: () =>
      api<{ lotId: number; codesCrees: number }>("/codes-remise/lots", {
        method: "POST",
        json: {
          nbCodes: Number(nbCodes),
          libelle: libelle.trim() || undefined,
          type,
          quantite: Number(quantite),
          pourcentage: type === "POURCENTAGE" ? Number(pourcentage) : undefined,
          lieuId: lieuId ? Number(lieuId) : null,
          seulementLieu: !!lieuId && seulementLieu,
          expireLe,
        },
      }),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["codes-remise"] });
      // Le lot apparaît dans la timeline et sur la fiche du lieu
      client.invalidateQueries({ queryKey: ["suivi"] });
      client.invalidateQueries({ queryKey: ["lieu"] });
      onCree(r.lotId);
    },
  });
  const apercu = remise({ type, pourcentage: Number(pourcentage) || 0, quantite: Number(quantite) || 0 });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        creer.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Nombre de codes *</span>
          <input className="champ" type="number" min={1} max={1000} required value={nbCodes} onChange={(e) => setNbCodes(e.target.value)} />
        </label>
        <label className="block">
          <span className="etiquette">Nom du lot</span>
          <input className="champ" maxLength={120} placeholder="Offerts au Satori, soirée d'ouverture…" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="etiquette">Remise *</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="type" checked={type === "OFFERT"} onChange={() => setType("OFFERT")} /> Impressions offertes
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="type" checked={type === "POURCENTAGE"} onChange={() => setType("POURCENTAGE")} /> Remise en %
        </label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Impressions par code *</span>
          <input className="champ" type="number" min={1} max={100} required value={quantite} onChange={(e) => setQuantite(e.target.value)} />
        </label>
        {type === "POURCENTAGE" && (
          <label className="block">
            <span className="etiquette">Remise (%) *</span>
            <input className="champ" type="number" min={1} max={99} required value={pourcentage} onChange={(e) => setPourcentage(e.target.value)} />
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="block">
          <span className="etiquette">Donnés à un lieu</span>
          <ChoixLieu id="lot-lieu" lieux={lieux} valeur={lieuId} onChange={setLieuId} tous="Aucun" />
        </div>
        <label className="block">
          <span className="etiquette">Valables jusqu&apos;au *</span>
          <input className="champ" type="date" required value={expireLe} onChange={(e) => setExpireLe(e.target.value)} />
        </label>
      </div>
      <fieldset className="space-y-2" disabled={!lieuId}>
        <legend className="etiquette">Utilisables</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="portee" checked={!seulementLieu || !lieuId} onChange={() => setSeulementLieu(false)} /> Sur toutes nos bornes en régie
        </label>
        <label className={`flex items-center gap-2 text-sm ${lieuId ? "" : "text-ink-muted"}`}>
          <input type="radio" name="portee" checked={seulementLieu && !!lieuId} onChange={() => setSeulementLieu(true)} /> Seulement sur les bornes de ce lieu
        </label>
      </fieldset>

      <p className="text-sm text-ink-2">
        {nombre(Number(nbCodes) || 0)} code{Number(nbCodes) > 1 ? "s" : ""} de 5 caractères · {apercu} chacun · jusqu&apos;au {expireLe ? jour(expireLe) : "—"}.
      </p>
      {creer.error && <Erreur erreur={creer.error} />}
      <button className="bouton" disabled={creer.isPending}>{creer.isPending ? "Génération…" : "Générer"}</button>
    </form>
  );
}

interface Detail extends CodeRemise {
  utilisations: { id: string; horodatage: string; demandees: number; accordees: number; utilisationId: string | null; borne: { id: number; identifiant: string }; lieu: { id: number; enseigne: string } | null }[];
}

function DetailCode({ id }: { id: number }) {
  const client = useQueryClient();
  const { data: c, error } = useQuery({ queryKey: ["codes-remise", "detail", id], queryFn: () => api<Detail>(`/codes-remise/${id}`) });
  const basculer = useMutation({
    mutationFn: (actif: boolean) => api(`/codes-remise/${id}/desactiver`, { method: "POST", json: { actif } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["codes-remise"] }),
  });
  if (error) return <Erreur erreur={error} />;
  if (!c) return <Chargement />;
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-2xl font-semibold tracking-widest">{c.code}</span>
        <Badge ton={ETATS[c.etat].ton}>{ETATS[c.etat].libelle}</Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-ink-2">Remise</dt><dd>{remise(c)}</dd>
        <dt className="text-ink-2">Utilisées</dt><dd className="tabular">{nombre(c.utilise)} sur {nombre(c.quantite)} · reste {nombre(c.restant)}</dd>
        <dt className="text-ink-2">Lieu</dt>
        <dd>
          {c.lieu ? <Link className="hover:underline" href={`/lieux/${c.lieu.id}`}>{c.lieu.enseigne}</Link> : "—"} · {c.seulementLieu && c.lieu ? "valable dans ce lieu seulement" : "valable sur toutes les bornes"}
        </dd>
        <dt className="text-ink-2">Valable jusqu&apos;au</dt><dd>{jour(c.expireLe)}</dd>
        <dt className="text-ink-2">Lot</dt><dd>#{c.lotId}{c.libelle ? ` ${c.libelle}` : ""} · créé le {date(c.creeLe)}</dd>
      </dl>

      <div>
        <h3 className="mb-1 text-xs font-medium text-ink-2">Utilisations ({c.utilisations.length})</h3>
        {c.utilisations.length ? (
          <table className="w-full">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Date</th>
                <th className="py-1.5 pr-3 font-medium">Borne · lieu</th>
                <th className="py-1.5 pr-3 text-right font-medium">Accordées</th>
                <th className="py-1.5 font-medium">Séance</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {c.utilisations.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="py-1.5 pr-3">{dateHeure(u.horodatage)}</td>
                  <td className="py-1.5 pr-3">{u.borne.identifiant}{u.lieu ? ` · ${u.lieu.enseigne}` : ""}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {u.accordees}
                    {u.accordees < u.demandees && <span className="text-xs text-warn-ink"> / {u.demandees} demandées</span>}
                  </td>
                  <td className="py-1.5 font-mono text-xs text-ink-2">{u.utilisationId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-ink-muted">Pas encore utilisé.</p>
        )}
      </div>

      <div className="border-t border-line pt-3">
        {c.desactiveLe ? (
          <button type="button" className="bouton-second" disabled={basculer.isPending} onClick={() => basculer.mutate(true)}>Réactiver le code</button>
        ) : (
          <button
            type="button"
            className="bouton-second text-bad"
            disabled={basculer.isPending}
            onClick={() => confirm(`Désactiver le code ${c.code} ? La borne le refusera.`) && basculer.mutate(false)}
          >
            Désactiver le code
          </button>
        )}
        {basculer.error && <Erreur erreur={basculer.error} />}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type BorneListe, type LieuListe, type Vente } from "@/lib/api";
import { dateHeure, euros, GRATUITES, nombre, OPTIONS_MOYENS } from "@/lib/format";
import { versCents } from "@/lib/commissions";
import { Badge, Chargement, EnTete, Erreur, Vide } from "./Etat";
import { Modale } from "./Modale";
import { MenuExport } from "./BoutonExport";
import { RecapCommande } from "./RecapCommande";
import { ChoixLieu } from "./ChoixLieu";
import { CalendrierVentes } from "./CalendrierVentes";
import { BasculeHt, usePreferenceHt } from "./BasculeHt";

const STATUTS: Record<string, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  ACCEPTEE: { libelle: "Acceptée", ton: "ok" },
  REFUSEE: { libelle: "Refusée", ton: "crit" },
  ANNULEE: { libelle: "Annulée", ton: "neutre" },
  EXPIREE: { libelle: "Sans réponse du terminal", ton: "warn" },
  OFFERTE: { libelle: "Tirage offert (non débité)", ton: "warn" },
  REMBOURSEE: { libelle: "Remboursement", ton: "neutre" },
};

// Moyen de paiement en court (liste) : le sans contact bien distingué de la carte insérée avec code (retour de Sébastien)
const MOYENS_COURTS: Record<string, string> = {
  CB: "CB code saisi",
  SANS_CONTACT: "CB sans contact",
  ESPECES: "Espèces",
  MOBILE: "Téléphone",
  WEB: "QR / en ligne",
  AUCUN: "Sans paiement",
};
const moyenCourt = (moyen: string, statut: string) => (moyen === "AUTRE" ? (statut === "ACCEPTEE" ? "Autre" : "—") : (MOYENS_COURTS[moyen] ?? moyen));

const CARTES: Record<string, string> = { reelles: "Ventes réelles", test: "Cartes de test", toutes: "Toutes" };

const TYPES: { cle: string; libelle: string; aide: string }[] = [
  { cle: "paiements", libelle: "Tous les paiements", aide: "Chaque passage par le terminal ou le QR, encaissé ou non, et les remboursements" },
  { cle: "ventes", libelle: "Ventes encaissées", aide: "Acceptées et débitées, et les remboursements" },
  { cle: "non_abouties", libelle: "Non abouties", aide: "Refusées, annulées, sans réponse du terminal, tirages offerts : aucun débit" },
  { cle: "remboursements", libelle: "Remboursements", aide: "Saisis ici, rattachés à leur vente" },
];

interface PagePaiements {
  total: number;
  page: number;
  parPage: number;
  totaux: { nbVentes: number; encaisseTtcCents: number; rembourseTtcCents: number; encaisseHtCents?: number; rembourseHtCents?: number };
  lignes: Vente[];
}

// « 07/11/26 » et « 21:44 » (heure de Paris), sur deux lignes
const jourFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "2-digit" });
const heureFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const jourLongFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" });

const DEFAUTS = { q: "", cartes: "reelles", du: "", au: "", type: "paiements", sansAction: false, lieuId: "", borneId: "", moyen: "", parc: "SELFIZEE" };

/** Largeur commune des filtres */
const CHAMP_FILTRE = "block w-full sm:w-48";

/**
 * Liste paginée des paiements, avec filtres, récapitulatif et remboursement.
 * Page Paiements ; avec lieuIdFixe, onglet « Ventes » d'une fiche lieu (lieu imposé, tous parcs ; HT / TTC donné par la fiche).
 */
export function ListePaiements({ lieuIdFixe, initial, ht: htFiche }: { lieuIdFixe?: number; initial?: { q?: string; cartes?: string }; ht?: boolean }) {
  const depart = { ...DEFAUTS, q: initial?.q ?? "", cartes: initial?.cartes && CARTES[initial.cartes] ? initial.cartes : "reelles" };
  const [f, setF] = useState(depart);
  const [htPage, setHtPage] = usePreferenceHt();
  const ht = htFiche ?? htPage;
  const lieuId = lieuIdFixe ? String(lieuIdFixe) : f.lieuId;
  // Sur une fiche lieu, le lieu est choisi : pas de filtre de parc
  const parc = lieuIdFixe ? "" : f.parc;
  const [page, setPage] = useState(1);
  // Liste ou calendrier du mois avec la synthèse de chaque jour (retour de Sébastien)
  const [vue, setVue] = useState<"liste" | "calendrier">("liste");
  const [rembourser, setRembourser] = useState<Vente | null>(null);
  // Récapitulatif d'une commande (clic sur la ligne), parcouru avec les flèches dans la liste d'où il vient
  const [recap, setRecap] = useState<{ id: string; ids: string[] } | null>(null);
  // Jour du calendrier ouvert en popup
  const [jourOuvert, setJourOuvert] = useState<string | null>(null);
  // Tout changement de filtre revient à la première page
  const changer = <K extends keyof typeof DEFAUTS>(cle: K) => (v: (typeof DEFAUTS)[K]) => {
    setF((x) => ({ ...x, [cle]: v, ...(cle === "lieuId" ? { borneId: "" } : {}) }));
    setPage(1);
  };
  const recherche = useDeferredValue(f.q.trim());
  const filtresCommuns = {
    type: f.type, sansAction: f.sansAction ? "1" : undefined, lieuId: lieuId || undefined, borneId: f.borneId || undefined,
    moyenPaiement: f.moyen || undefined, parc: parc || undefined, cartes: f.cartes,
  };
  const query = qs({ q: recherche || undefined, du: f.du || undefined, au: f.au || undefined, ...filtresCommuns, page });
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["ventes", query],
    queryFn: () => api<PagePaiements>(`/ventes${query}`),
    placeholderData: keepPreviousData,
  });
  const lieux = useQuery({ queryKey: ["lieux", "paiements"], queryFn: () => api<LieuListe[]>("/lieux?statut="), staleTime: 5 * 60_000, enabled: !lieuIdFixe });
  const bornes = useQuery({ queryKey: ["bornes"], queryFn: () => api<BorneListe[]>("/bornes"), staleTime: 5 * 60_000 });
  // Lieu choisi : seulement ses bornes (retour de Sébastien), plus celle déjà choisie
  const bornesProposees = (bornes.data ?? []).filter((b) => !lieuId || b.lieuActuel?.id === Number(lieuId) || String(b.id) === f.borneId);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;
  const typeChoisi = TYPES.find((x) => x.cle === f.type);
  const modifies = (Object.keys(DEFAUTS) as (keyof typeof DEFAUTS)[]).some((k) => (lieuIdFixe && (k === "lieuId" || k === "parc") ? false : f[k] !== DEFAUTS[k]));
  const encaisse = data ? (ht ? (data.totaux.encaisseHtCents ?? 0) : data.totaux.encaisseTtcCents) : 0;
  const ouvrirRecap = (lignes: Vente[]) => (id: string) => setRecap({ id, ids: lignes.map((l) => l.id) });

  const bascules = (
    <>
      {htFiche === undefined && <BasculeHt ht={ht} onChange={setHtPage} />}
      <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Affichage">
        {(["liste", "calendrier"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={vue === v}
            onClick={() => setVue(v)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${vue === v ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {v === "liste" ? "Liste" : "Calendrier"}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
      {lieuIdFixe ? (
        <div className="mb-3 flex justify-end gap-2">
          {bascules}
          <MenuExport exports={[{ libelle: "Ventes du lieu", chemin: "/export/transactions", requete: qs({ du: f.du || undefined, au: f.au || undefined, lieuId }) }]} />
        </div>
      ) : (
        <EnTete
          titre="Paiements"
          sousTitre="Tous les paiements remontés par les bornes. Cliquez sur une ligne pour le récapitulatif ; une vente se rembourse ici, la borne ne rembourse jamais."
          actions={
            <>
              {bascules}
              <MenuExport exports={[{ libelle: "Ventes", chemin: "/export/transactions", requete: qs({ du: f.du || undefined, au: f.au || undefined, lieuId: lieuId || undefined, parc: parc || undefined }) }]} />
            </>
          }
        />
      )}

      {/* Filtres sur le moins de lignes possible (retour de Sébastien), à droite et de même largeur comme les autres pages (retour du 13/11) */}
      <div className="mb-3 flex flex-wrap items-end justify-end gap-2">
        <label className={CHAMP_FILTRE}>
          <span className="etiquette">Recherche</span>
          <input id="paiements-recherche" className="champ" placeholder="Transaction, n° d'autorisation, 4 derniers chiffres, pi_…" value={f.q} onChange={(e) => changer("q")(e.target.value)} />
        </label>
        {vue === "liste" && (
          <>
            <label className={CHAMP_FILTRE}>
              <span className="etiquette">Du</span>
              <input id="paiements-du" type="date" className="champ" value={f.du} max={f.au || undefined} onChange={(e) => changer("du")(e.target.value)} />
            </label>
            <label className={CHAMP_FILTRE}>
              <span className="etiquette">Au</span>
              <input id="paiements-au" type="date" className="champ" value={f.au} min={f.du || undefined} onChange={(e) => changer("au")(e.target.value)} />
            </label>
          </>
        )}
        <label className={CHAMP_FILTRE}>
          <span className="etiquette">Afficher</span>
          <select id="paiements-type" className="champ" value={f.type} onChange={(e) => changer("type")(e.target.value)} title={typeChoisi?.aide}>
            {TYPES.map((x) => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}
          </select>
        </label>
        {!lieuIdFixe && (
          <div className={CHAMP_FILTRE}>
            <span className="etiquette">Lieu</span>
            <ChoixLieu id="paiements-lieu" lieux={lieux.data ?? []} valeur={f.lieuId} onChange={changer("lieuId")} tous="Tous" />
          </div>
        )}
        <label className={CHAMP_FILTRE}>
          <span className="etiquette">Borne</span>
          <select id="paiements-borne" className="champ" value={f.borneId} onChange={(e) => changer("borneId")(e.target.value)}>
            <option value="">Toutes</option>
            {bornesProposees.map((b) => <option key={b.id} value={b.id}>{lieuId || !b.lieuActuel ? b.identifiant : `${b.lieuActuel.enseigne} · ${b.identifiant}`}</option>)}
          </select>
        </label>
        <label className={CHAMP_FILTRE}>
          <span className="etiquette">Cartes</span>
          <select id="paiements-cartes" className="champ" value={f.cartes} onChange={(e) => changer("cartes")(e.target.value)}>
            {Object.entries(CARTES).map(([cle, libelle]) => <option key={cle} value={cle}>{libelle}</option>)}
          </select>
        </label>
        <label className={CHAMP_FILTRE}>
          <span className="etiquette">Moyen</span>
          <select id="paiements-moyen" className="champ" value={f.moyen} onChange={(e) => changer("moyen")(e.target.value)}>
            <option value="">Tous</option>
            {OPTIONS_MOYENS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {!lieuIdFixe && (
          <label className={CHAMP_FILTRE}>
            <span className="etiquette">Parc</span>
            <select id="paiements-parc" className="champ" value={f.parc} onChange={(e) => changer("parc")(e.target.value)}>
              <option value="SELFIZEE">Selfizee</option>
              <option value="CLIENT">Client</option>
              <option value="TEST">Test</option>
              <option value="">Tout</option>
            </select>
          </label>
        )}
        {modifies && (
          <button
            type="button"
            className="bouton-second"
            onClick={() => {
              setF(DEFAUTS);
              setPage(1);
            }}
            title="Revenir aux filtres par défaut"
          >
            Réinitialiser
          </button>
        )}
      </div>
      {/* Une seule ligne d'infos : photos sans action, totaux, explication du filtre en infobulle */}
      <div className="mb-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
        <label className="flex items-center gap-2 text-ink-2" title="Mode gratuit, code staff, sans tirage… : pas des ventes">
          <input type="checkbox" checked={f.sansAction} onChange={(e) => changer("sansAction")(e.target.checked)} />
          Photos validées sans paiement
        </label>
        {vue === "liste" && data && (
          <>
            <span><strong className="tabular">{nombre(data.total)}</strong> ligne{data.total > 1 ? "s" : ""}{isFetching ? " · mise à jour…" : ""}</span>
            <span>
              Encaissé : <strong className="tabular">{euros(encaisse)}</strong> {ht ? "HT" : "TTC"}{" "}
              <span className="text-ink-muted">({nombre(data.totaux.nbVentes)} vente{data.totaux.nbVentes > 1 ? "s" : ""}{data.totaux.rembourseTtcCents > 0 ? `, remboursements déduits` : ""})</span>
            </span>
          </>
        )}
        {recherche ? (
          <span className="text-xs text-ink-muted">La recherche porte sur toutes les séances, quel que soit « Afficher ».</span>
        ) : f.cartes !== "reelles" ? (
          <span className="text-xs text-ink-muted">{f.cartes === "test" ? "Seulement les cartes de test, hors chiffres réels." : "Cartes de test comprises (hors statistiques)."}</span>
        ) : null}
      </div>

      {vue === "calendrier" && (
        <CalendrierVentes
          lieuId={lieuIdFixe}
          ht={ht}
          filtres={{ lieuId: lieuId || undefined, borneId: f.borneId || undefined, moyenPaiement: f.moyen || undefined, parc: parc || undefined, cartes: f.cartes }}
          onJour={setJourOuvert}
        />
      )}
      {vue === "liste" && error && <Erreur erreur={error} />}
      {vue === "liste" && isPending && !error && <Chargement />}
      {vue === "liste" && data && !data.lignes.length && <Vide>Aucun paiement ne correspond.</Vide>}
      {vue === "liste" && data && data.lignes.length > 0 && (
        <TableauPaiements lignes={data.lignes} ht={ht} onRecap={ouvrirRecap(data.lignes)} onRembourser={setRembourser} />
      )}
      {vue === "liste" && data && pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button type="button" className="bouton-second !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Plus récents</button>
          <span className="text-ink-2 tabular">Page {page} / {pages}</span>
          <button type="button" className="bouton-second !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Plus anciens →</button>
        </div>
      )}

      {/* Un jour du calendrier : ses paiements en popup (retour de Sébastien), avec les mêmes filtres */}
      <Modale
        titre={jourOuvert ? `Paiements du ${jourLongFmt.format(new Date(`${jourOuvert}T00:00:00Z`))}` : "Paiements du jour"}
        tresLarge
        ouverte={jourOuvert !== null && recap === null && rembourser === null}
        onFermer={() => setJourOuvert(null)}
      >
        {jourOuvert && <PaiementsDuJour jour={jourOuvert} filtres={filtresCommuns} ht={ht} onRecap={(id, lignes) => setRecap({ id, ids: lignes })} onRembourser={setRembourser} />}
      </Modale>

      <Modale titre={recap ? `Commande ${recap.ids.indexOf(recap.id) + 1} / ${recap.ids.length}` : "Commande"} large ouverte={recap !== null} onFermer={() => setRecap(null)}>
        {recap && (
          <NavigationRecap recap={recap} onChange={(id) => setRecap({ ...recap, id })}>
            <RecapCommande
              key={recap.id}
              id={recap.id}
              onRembourser={(v) => {
                setRecap(null);
                setRembourser(v);
              }}
            />
          </NavigationRecap>
        )}
      </Modale>
      <Modale titre="Rembourser une vente" ouverte={rembourser !== null} onFermer={() => setRembourser(null)}>
        {rembourser && <FormRemboursement vente={rembourser} onFini={() => setRembourser(null)} />}
      </Modale>
    </>
  );
}

/** Flèches gauche / droite du clavier (et boutons) : commande précédente / suivante de la liste (retour de Sébastien) */
function NavigationRecap({ recap, onChange, children }: { recap: { id: string; ids: string[] }; onChange: (id: string) => void; children: ReactNode }) {
  const i = recap.ids.indexOf(recap.id);
  const precedente = i > 0 ? recap.ids[i - 1] : null;
  const suivante = i >= 0 && i < recap.ids.length - 1 ? recap.ids[i + 1] : null;
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return;
      if (e.key === "ArrowLeft" && precedente) onChange(precedente);
      else if (e.key === "ArrowRight" && suivante) onChange(suivante);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [precedente, suivante, onChange]);
  return (
    <>
      {children}
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
        <button type="button" className="bouton-second !py-1" disabled={!precedente} onClick={() => precedente && onChange(precedente)}>← Précédente</button>
        <span className="hidden text-xs text-ink-muted sm:inline">Flèches ← → du clavier</span>
        <button type="button" className="bouton-second !py-1" disabled={!suivante} onClick={() => suivante && onChange(suivante)}>Suivante →</button>
      </div>
    </>
  );
}

/** Paiements d'un jour (popup du calendrier) : jusqu'à 200 lignes, pages au-delà */
function PaiementsDuJour({
  jour,
  filtres,
  ht,
  onRecap,
  onRembourser,
}: {
  jour: string;
  filtres: Record<string, string | undefined>;
  ht: boolean;
  onRecap: (id: string, ids: string[]) => void;
  onRembourser: (v: Vente) => void;
}) {
  const [page, setPage] = useState(1);
  const query = qs({ ...filtres, du: jour, au: jour, page });
  const { data, error, isPending } = useQuery({ queryKey: ["ventes", query], queryFn: () => api<PagePaiements>(`/ventes${query}`), placeholderData: keepPreviousData });
  if (error) return <Erreur erreur={error} />;
  if (isPending || !data) return <Chargement />;
  if (!data.lignes.length) return <Vide>Aucun paiement ce jour-là avec ces filtres.</Vide>;
  const pages = Math.max(1, Math.ceil(data.total / data.parPage));
  const ids = data.lignes.map((l) => l.id);
  return (
    <>
      <p className="mb-3 text-sm">
        <strong className="tabular">{nombre(data.total)}</strong> ligne{data.total > 1 ? "s" : ""} · encaissé{" "}
        <strong className="tabular">{euros(ht ? (data.totaux.encaisseHtCents ?? 0) : data.totaux.encaisseTtcCents)}</strong> {ht ? "HT" : "TTC"}
      </p>
      <TableauPaiements lignes={data.lignes} ht={ht} onRecap={(id) => onRecap(id, ids)} onRembourser={onRembourser} />
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

/**
 * Paiements sur deux lignes, du plus utile au moins utile (retour de Sébastien, surtout sur téléphone) :
 * date / heure · photo · lieu / borne · moyen / carte · montant · statut · transaction / réf. · rembourser
 */
function TableauPaiements({ lignes, ht, onRecap, onRembourser }: { lignes: Vente[]; ht: boolean; onRecap: (id: string) => void; onRembourser: (v: Vente) => void }) {
  return (
    <div className="carte overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="px-3 py-2.5 font-medium">Date</th>
            <th className="px-1 py-2.5 font-medium"><span className="sr-only">Photo</span></th>
            <th className="px-3 py-2.5 font-medium">Lieu · borne</th>
            <th className="px-3 py-2.5 font-medium">Paiement</th>
            <th className="px-3 py-2.5 text-right font-medium">{ht ? "HT" : "TTC"}</th>
            <th className="px-3 py-2.5 font-medium">Statut</th>
            <th className="px-3 py-2.5 font-medium">Transaction</th>
            <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="tabular">
          {lignes.map((v) => {
            const statut = STATUTS[v.statut] ?? { libelle: v.statut, ton: "neutre" as const };
            const aucuneAction = v.statut === "ACCEPTEE" && (v.moyenPaiement === "AUCUN" || v.montantTtcCents === 0);
            const vendue = (v.statut === "ACCEPTEE" && !v.gratuite && v.moyenPaiement !== "AUCUN" && v.montantTtcCents > 0) || v.statut === "REMBOURSEE";
            const remboursable = v.statut === "ACCEPTEE" && v.montantTtcCents > v.rembourseCents && v.moyenPaiement !== "AUCUN";
            const montant = ht ? (v.montantHtCents ?? v.montantTtcCents) : v.montantTtcCents;
            const rembourse = ht ? (v.rembourseHtCents ?? v.rembourseCents) : v.rembourseCents;
            const instant = new Date(v.horodatage);
            return (
              <tr
                key={v.id}
                className="cursor-pointer border-t border-line align-top hover:bg-surface-2"
                onClick={() => onRecap(v.id)}
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onRecap(v.id)}
                aria-label={`Récapitulatif de ${v.transactionIdModule}`}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  {jourFmt.format(instant)}
                  <div className="text-xs text-ink-muted">{heureFmt.format(instant)}</div>
                </td>
                <td className="px-1 py-1.5">
                  {v.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vignette externe (PikCloud)
                    <img src={v.photoUrl} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <span className="block h-10 w-10 rounded bg-surface-2" aria-hidden />
                  )}
                </td>
                <td className="px-3 py-2">
                  {v.lieu ? (
                    <Link className="hover:underline" href={`/lieux/${v.lieu.id}`} onClick={(e) => e.stopPropagation()}>{v.lieu.enseigne}</Link>
                  ) : (
                    <span className="text-ink-muted">non affectée</span>
                  )}
                  <div className="text-xs">
                    <Link className="text-ink-muted hover:underline" href={`/bornes/${v.borne.id}`} onClick={(e) => e.stopPropagation()}>{v.borne.identifiant}</Link>
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {moyenCourt(v.moyenPaiement, v.statut)}
                  <div className="text-xs text-ink-muted">
                    {v.carteFin ? <span className="font-mono">****{v.carteFin}</span> : v.typeModule.libelle}
                  </div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {vendue ? (
                    euros(montant)
                  ) : (
                    <span className="text-ink-muted" title="Montant demandé, non encaissé">
                      {euros(montant)}
                      {v.montantTtcCents > 0 && <span className="block text-xs">non encaissé</span>}
                    </span>
                  )}
                  {v.rembourseCents > 0 && <div className="text-xs text-bad">− {euros(rembourse)}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {!aucuneAction && <Badge ton={statut.ton}>{statut.libelle}</Badge>}
                    {v.encaissement === "INCERTAIN" && <Badge ton="warn">À rapprocher</Badge>}
                    {v.carteTest && <Badge ton="warn">Test · {v.carteTest}</Badge>}
                    {(v.gratuite || aucuneAction) && (
                      <Badge ton="neutre">Sans action{v.gratuite ? ` — ${GRATUITES[v.gratuite] ?? v.gratuite.toLowerCase()}` : ""}</Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs whitespace-nowrap">{v.transactionIdModule}</div>
                  {v.referenceMonetique && <div className="text-xs text-ink-muted">réf. {v.referenceMonetique}</div>}
                </td>
                <td className="px-3 py-2 text-right">
                  {remboursable && (
                    <button
                      className="text-xs text-accent hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRembourser(v);
                      }}
                    >
                      Rembourser
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormRemboursement({ vente, onFini }: { vente: Vente; onFini: () => void }) {
  const client = useQueryClient();
  const reste = vente.montantTtcCents - vente.rembourseCents;
  const [montant, setMontant] = useState((reste / 100).toFixed(2).replace(".", ","));
  const [motif, setMotif] = useState("");
  const envoyer = useMutation({
    mutationFn: () => api(`/ventes/${vente.id}/remboursement`, { method: "POST", json: { montantCents: versCents(montant), motif } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["ventes"] });
      onFini();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); envoyer.mutate(); }}>
      <p className="text-sm text-ink-2">
        Vente <span className="font-mono">{vente.transactionIdModule}</span> du {dateHeure(vente.horodatage)} : {euros(vente.montantTtcCents)} TTC
        {vente.rembourseCents > 0 && `, dont ${euros(vente.rembourseCents)} déjà remboursés`}. Le remboursement est daté d&apos;aujourd&apos;hui et
        se déduit du CA (et de la base de commission) du lieu.
      </p>
      <label className="block">
        <span className="etiquette">Montant TTC (€) *</span>
        <input className="champ" required inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} />
      </label>
      <label className="block">
        <span className="etiquette">Motif *</span>
        <input className="champ" required placeholder="Tirage raté, double débit…" value={motif} onChange={(e) => setMotif(e.target.value)} />
      </label>
      {envoyer.error && <Erreur erreur={envoyer.error} />}
      <button className="bouton" disabled={envoyer.isPending}>Rembourser</button>
    </form>
  );
}

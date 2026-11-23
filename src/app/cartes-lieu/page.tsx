"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs, type LieuListe } from "@/lib/api";
import { dateHeure, euros, jour, nombre } from "@/lib/format";
import { STATUTS_PAIEMENT } from "@/components/RecapCommande";
import { Gate, PageGuard } from "@/lib/perms";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { Modale } from "@/components/Modale";
import { ChoixLieu } from "@/components/ChoixLieu";

// Cartes sans contact du lieu (Mifare, avenant du 23/11/2026) : la borne lit l'UID de la carte, la Régie décide
// (carte connue, lieu, validité, plafond du jour, solde) et débite le solde ou offre les tirages.

type Etat = "active" | "expiree" | "desactivee";
const ETATS: Record<Etat, { libelle: string; ton: "ok" | "neutre" | "crit" }> = {
  active: { libelle: "Active", ton: "ok" },
  expiree: { libelle: "Expirée", ton: "neutre" },
  desactivee: { libelle: "Désactivée", ton: "crit" },
};

type Effet = "DEBITE" | "OFFERT";
const EFFETS: Record<Effet, string> = { DEBITE: "Débite un solde", OFFERT: "Tirages offerts" };

const RAISONS: Record<string, string> = {
  INCONNUE: "Carte inconnue",
  DESACTIVEE: "Carte désactivée",
  EXPIREE: "Carte expirée",
  LIEU: "Borne d'un autre lieu",
  PLAFOND: "Plafond du jour atteint",
  SOLDE_INSUFFISANT: "Solde insuffisant",
  ANNULEE: "Annulée avant l'utilisation",
};
const ANNULATIONS: Record<string, string> = {
  tirage_non_sorti: "tirage pas sorti",
  sans_reponse: "la borne n'a pas eu la réponse",
  reponse_tardive: "réponse arrivée trop tard",
};

interface Carte {
  id: number;
  uid: string;
  libelle: string | null;
  effet: Effet;
  soldeCents: number;
  plafondJourCents: number | null;
  plafondJourTirages: number | null;
  expireLe: string | null;
  desactiveLe: string | null;
  notes: string | null;
  lieu: { id: number; enseigne: string };
  creeLe: string;
  etat: Etat;
}

interface Ligne extends Carte {
  nbUtilisations: number;
  derniereUtilisation: string | null;
}

interface Inconnue {
  uid: string;
  typeCarte: string | null;
  presentations: number;
  derniere: string;
  borne: { id: number; identifiant: string };
  lieu: { id: number; enseigne: string } | null;
}

/** « 6,50 » ou « 6.5 » → 650 ; null si ce n'est pas un montant */
const centimes = (s: string): number | null => {
  const v = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
};
const saisieEuros = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

const plafond = (c: Pick<Carte, "effet" | "plafondJourCents" | "plafondJourTirages">) =>
  c.effet === "DEBITE"
    ? c.plafondJourCents != null ? `${euros(c.plafondJourCents)} par jour` : null
    : c.plafondJourTirages != null ? `${c.plafondJourTirages} tirage${c.plafondJourTirages > 1 ? "s" : ""} par jour` : null;

export default function PageCartesLieu() {
  return (
    <PageGuard perm="pages.cartes_lieu.view">
      <Cartes />
    </PageGuard>
  );
}

function Cartes() {
  const [q, setQ] = useState("");
  const [lieuId, setLieuId] = useState("");
  const [etat, setEtat] = useState("");
  const [page, setPage] = useState(1);
  const [formulaire, setFormulaire] = useState<{ carte?: Carte; uid?: string; lieuId?: number } | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const changer = <T,>(maj: (v: T) => void) => (v: T) => {
    maj(v);
    setPage(1);
  };
  const recherche = useDeferredValue(q.trim());
  const query = qs({ q: recherche || undefined, lieuId: lieuId || undefined, etat: etat || undefined, page });
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["cartes-lieu", query],
    queryFn: () => api<{ total: number; page: number; parPage: number; lignes: Ligne[] }>(`/cartes-lieu${query}`),
    placeholderData: keepPreviousData,
  });
  const inconnues = useQuery({
    queryKey: ["cartes-lieu", "inconnues", lieuId],
    queryFn: () => api<Inconnue[]>(`/cartes-lieu/inconnues${qs({ lieuId: lieuId || undefined })}`),
  });
  const lieux = useQuery({ queryKey: ["lieux", "cartes"], queryFn: () => api<LieuListe[]>("/lieux?statut="), staleTime: 5 * 60_000 });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;

  return (
    <>
      <EnTete
        titre="Cartes du lieu"
        sousTitre="Cartes sans contact (Mifare) acceptées par les bornes à la place d'une carte bancaire : elles débitent un solde ou offrent les tirages. Un clic sur une carte montre son historique."
        actions={
          <Gate perm="cartes_lieu.edit">
            <button type="button" className="bouton" onClick={() => setFormulaire({})}>
              Enregistrer une carte
            </button>
          </Gate>
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-end gap-3">
        <label className="block w-full sm:w-48">
          <span className="etiquette">UID ou nom</span>
          <input className="champ" placeholder="04A1B2C3, Carte VIP…" value={q} onChange={(e) => changer(setQ)(e.target.value)} />
        </label>
        <div className="block w-full sm:w-48">
          <span className="etiquette">Lieu</span>
          <ChoixLieu id="cartes-lieu" lieux={lieux.data ?? []} valeur={lieuId} onChange={changer(setLieuId)} tous="Tous" />
        </div>
        <label className="block w-full sm:w-48">
          <span className="etiquette">État</span>
          <select className="champ" value={etat} onChange={(e) => changer(setEtat)(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(ETATS).map(([k, e]) => <option key={k} value={k}>{e.libelle}</option>)}
          </select>
        </label>
      </div>

      {inconnues.data && inconnues.data.length > 0 && (
        <div className="carte mb-4 p-4 text-sm">
          <h2 className="font-medium">Cartes présentées mais pas encore enregistrées</h2>
          <p className="mb-2 text-xs text-ink-2">
            Pour enregistrer une nouvelle carte, présentez-la une fois à une borne du lieu : elle apparaît ici (30 derniers jours) avec son UID.
          </p>
          <table className="w-full">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-1.5 pr-3 font-medium">UID</th>
                <th className="py-1.5 pr-3 font-medium">Dernière présentation</th>
                <th className="py-1.5 pr-3 font-medium">Borne · lieu</th>
                <th className="py-1.5 pr-3 text-right font-medium">Fois</th>
                <th />
              </tr>
            </thead>
            <tbody className="tabular">
              {inconnues.data.map((i) => (
                <tr key={i.uid} className="border-t border-line">
                  <td className="py-1.5 pr-3 font-mono">{i.uid}</td>
                  <td className="py-1.5 pr-3">{dateHeure(i.derniere)}</td>
                  <td className="py-1.5 pr-3">{i.borne.identifiant}{i.lieu ? ` · ${i.lieu.enseigne}` : ""}</td>
                  <td className="py-1.5 pr-3 text-right">{nombre(i.presentations)}</td>
                  <td className="py-1.5 text-right">
                    <Gate perm="cartes_lieu.edit">
                      <button type="button" className="text-accent hover:underline" onClick={() => setFormulaire({ uid: i.uid, lieuId: i.lieu?.id })}>
                        Enregistrer
                      </button>
                    </Gate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p className="mb-3 text-sm">
          <strong className="tabular">{nombre(data.total)}</strong> carte{data.total > 1 ? "s" : ""}
          {isFetching ? " · mise à jour…" : ""}
        </p>
      )}
      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !data.lignes.length && <Vide>Aucune carte ne correspond. « Enregistrer une carte » pour en ajouter une.</Vide>}
      {data && data.lignes.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Carte</th>
                <th className="px-4 py-3 font-medium">Effet</th>
                <th className="px-4 py-3 text-right font-medium">Solde</th>
                <th className="px-4 py-3 font-medium">Lieu</th>
                <th className="px-4 py-3 font-medium">Plafond</th>
                <th className="px-4 py-3 font-medium">Expire le</th>
                <th className="px-4 py-3 font-medium">Dernière utilisation</th>
                <th className="px-4 py-3 font-medium">État</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.lignes.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t border-line hover:bg-surface-2"
                  onClick={() => setDetail(c.id)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && setDetail(c.id)}
                  aria-label={`Détail de la carte ${c.libelle ?? c.uid}`}
                >
                  <td className="px-4 py-2.5">
                    {c.libelle ?? <span className="text-ink-muted">Sans nom</span>}
                    <span className="block font-mono text-xs text-ink-muted">{c.uid}</span>
                  </td>
                  <td className="px-4 py-2.5">{EFFETS[c.effet]}</td>
                  <td className="px-4 py-2.5 text-right">{c.effet === "DEBITE" ? euros(c.soldeCents) : "—"}</td>
                  <td className="px-4 py-2.5">{c.lieu.enseigne}</td>
                  <td className="px-4 py-2.5 text-ink-2">{plafond(c) ?? "—"}</td>
                  <td className="px-4 py-2.5">{c.expireLe ? jour(c.expireLe) : "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {c.derniereUtilisation ? dateHeure(c.derniereUtilisation) : "—"}
                    {c.nbUtilisations > 0 && <span className="block text-xs">{nombre(c.nbUtilisations)} utilisation{c.nbUtilisations > 1 ? "s" : ""}</span>}
                  </td>
                  <td className="px-4 py-2.5"><Badge ton={ETATS[c.etat].ton}>{ETATS[c.etat].libelle}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button type="button" className="bouton-second !py-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Précédentes</button>
          <span className="text-ink-2 tabular">Page {page} / {pages}</span>
          <button type="button" className="bouton-second !py-1" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivantes →</button>
        </div>
      )}

      <Modale titre={formulaire?.carte ? "Modifier la carte" : "Enregistrer une carte"} ouverte={formulaire !== null} onFermer={() => setFormulaire(null)}>
        {formulaire && (
          <FormulaireCarte
            lieux={lieux.data ?? []}
            carte={formulaire.carte}
            uidInitial={formulaire.uid}
            lieuInitial={formulaire.lieuId}
            onFini={(id) => {
              setFormulaire(null);
              setDetail(id);
            }}
          />
        )}
      </Modale>
      <Modale titre="Carte du lieu" large ouverte={detail !== null && formulaire === null} onFermer={() => setDetail(null)}>
        {detail !== null && <DetailCarte id={detail} onModifier={(carte) => setFormulaire({ carte })} />}
      </Modale>
    </>
  );
}

function FormulaireCarte({ lieux, carte, uidInitial, lieuInitial, onFini }: { lieux: LieuListe[]; carte?: Carte; uidInitial?: string; lieuInitial?: number; onFini: (id: number) => void }) {
  const client = useQueryClient();
  const [uid, setUid] = useState(carte?.uid ?? uidInitial ?? "");
  const [libelle, setLibelle] = useState(carte?.libelle ?? "");
  const [lieuId, setLieuId] = useState(String(carte?.lieu.id ?? lieuInitial ?? ""));
  const [effet, setEffet] = useState<Effet>(carte?.effet ?? "DEBITE");
  const [solde, setSolde] = useState("");
  const [plafondEuros, setPlafondEuros] = useState(saisieEuros(carte?.plafondJourCents ?? null));
  const [plafondTirages, setPlafondTirages] = useState(carte?.plafondJourTirages != null ? String(carte.plafondJourTirages) : "");
  const [expireLe, setExpireLe] = useState(carte?.expireLe ?? "");
  const [notes, setNotes] = useState(carte?.notes ?? "");
  const [erreurSaisie, setErreurSaisie] = useState<string | null>(null);
  const enregistrer = useMutation({
    mutationFn: (corps: Record<string, unknown>) =>
      carte
        ? api(`/cartes-lieu/${carte.id}`, { method: "PATCH", json: corps }).then(() => ({ id: carte.id }))
        : api<{ id: number }>("/cartes-lieu", { method: "POST", json: corps }),
    onSuccess: (r) => {
      client.invalidateQueries({ queryKey: ["cartes-lieu"] });
      onFini(r.id);
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const plafondCents = effet === "DEBITE" && plafondEuros.trim() ? centimes(plafondEuros) : null;
        const soldeCents = !carte && effet === "DEBITE" && solde.trim() ? centimes(solde) : 0;
        if ((effet === "DEBITE" && plafondEuros.trim() && !plafondCents) || soldeCents === null || soldeCents < 0) {
          setErreurSaisie("Montant invalide : saisissez par exemple 20 ou 6,50.");
          return;
        }
        setErreurSaisie(null);
        enregistrer.mutate({
          ...(carte ? {} : { uid, soldeInitialCents: soldeCents }),
          libelle: libelle.trim() || null,
          lieuId: Number(lieuId),
          effet,
          plafondJourCents: plafondCents,
          plafondJourTirages: effet === "OFFERT" && plafondTirages ? Number(plafondTirages) : null,
          expireLe: expireLe || null,
          notes: notes.trim() || null,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">UID de la carte *</span>
          <input
            className="champ font-mono uppercase"
            required
            disabled={!!carte}
            placeholder="04A1B2C3"
            pattern="[0-9A-Fa-f: -]{8,29}"
            title="Hexadécimal, 8, 14 ou 20 caractères"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="etiquette">Nom</span>
          <input className="champ" maxLength={120} placeholder="Carte VIP, Personnel bar…" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
        </label>
      </div>
      <div className="block">
        <span className="etiquette">Lieu *</span>
        <ChoixLieu id="carte-lieu" lieux={lieux} valeur={lieuId} onChange={setLieuId} tous="Choisir un lieu" />
      </div>

      <fieldset className="space-y-2">
        <legend className="etiquette">Effet *</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="effet" checked={effet === "DEBITE"} onChange={() => setEffet("DEBITE")} /> Débite un solde (carte prépayée, compte)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="effet" checked={effet === "OFFERT"} onChange={() => setEffet("OFFERT")} /> Tirages offerts (personnel, carte cadeau)
        </label>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        {effet === "DEBITE" && !carte && (
          <label className="block">
            <span className="etiquette">Solde de départ (€)</span>
            <input className="champ" inputMode="decimal" placeholder="20" value={solde} onChange={(e) => setSolde(e.target.value)} />
          </label>
        )}
        {effet === "DEBITE" ? (
          <label className="block">
            <span className="etiquette">Plafond par jour (€)</span>
            <input className="champ" inputMode="decimal" placeholder="Aucun" value={plafondEuros} onChange={(e) => setPlafondEuros(e.target.value)} />
          </label>
        ) : (
          <label className="block">
            <span className="etiquette">Plafond par jour (tirages)</span>
            <input className="champ" type="number" min={1} max={1000} placeholder="Aucun" value={plafondTirages} onChange={(e) => setPlafondTirages(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="etiquette">Valable jusqu&apos;au</span>
          <input className="champ" type="date" value={expireLe} onChange={(e) => setExpireLe(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="etiquette">Notes</span>
        <textarea className="champ" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {carte && <p className="text-xs text-ink-2">Le solde se modifie depuis la fiche de la carte (« Créditer » ou « Retirer »).</p>}
      {erreurSaisie && <p className="text-sm text-bad">{erreurSaisie}</p>}
      {enregistrer.error && <Erreur erreur={enregistrer.error} />}
      <button className="bouton" disabled={enregistrer.isPending || !lieuId}>{enregistrer.isPending ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}

interface Detail extends Carte {
  creePar: { prenom: string | null; nom: string | null } | null;
  aujourdhui: { cents: number; tirages: number };
  utilisations: {
    id: string;
    horodatage: string;
    borne: { id: number; identifiant: string };
    lieu: { id: number; enseigne: string } | null;
    utilisationId: string;
    sessionCode: string | null;
    evenementCode: string | null;
    montantCents: number;
    nb: number;
    accepte: boolean;
    effet: Effet | null;
    montantDebiteCents: number;
    soldeApresCents: number | null;
    raison: string | null;
    annuleeLe: string | null;
    annulationRaison: string | null;
    ventes: { id: string; transactionIdModule: string; statut: string; montantTtcCents: number }[];
  }[];
  mouvements: { id: number; le: string; montantCents: number; soldeApresCents: number; note: string | null; par: { prenom: string | null; nom: string | null } | null }[];
}

const nomDe = (p: { prenom: string | null; nom: string | null } | null) => (p ? [p.prenom, p.nom].filter(Boolean).join(" ") : "");

function DetailCarte({ id, onModifier }: { id: number; onModifier: (c: Carte) => void }) {
  const client = useQueryClient();
  const { data: c, error } = useQuery({ queryKey: ["cartes-lieu", "detail", id], queryFn: () => api<Detail>(`/cartes-lieu/${id}`) });
  const basculer = useMutation({
    mutationFn: (actif: boolean) => api(`/cartes-lieu/${id}/desactiver`, { method: "POST", json: { actif } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["cartes-lieu"] }),
  });
  if (error) return <Erreur erreur={error} />;
  if (!c) return <Chargement />;
  const p = plafond(c);
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl font-semibold">{c.libelle ?? "Carte sans nom"}</span>
        <Badge ton={ETATS[c.etat].ton}>{ETATS[c.etat].libelle}</Badge>
        {c.effet === "DEBITE" && <span className="ml-auto text-2xl font-semibold tabular">{euros(c.soldeCents)}</span>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-ink-2">UID</dt><dd className="font-mono">{c.uid}</dd>
        <dt className="text-ink-2">Effet</dt><dd>{EFFETS[c.effet]}</dd>
        <dt className="text-ink-2">Lieu</dt><dd><Link className="hover:underline" href={`/lieux/${c.lieu.id}`}>{c.lieu.enseigne}</Link> · acceptée sur ses bornes seulement</dd>
        <dt className="text-ink-2">Plafond</dt>
        <dd className="tabular">
          {p ?? "aucun"}
          <span className="text-ink-2">
            {" · aujourd'hui : "}
            {c.effet === "DEBITE" ? euros(c.aujourdhui.cents) : `${c.aujourdhui.tirages} tirage${c.aujourdhui.tirages > 1 ? "s" : ""}`}
          </span>
        </dd>
        <dt className="text-ink-2">Valable jusqu&apos;au</dt><dd>{c.expireLe ? jour(c.expireLe) : "sans limite"}</dd>
        <dt className="text-ink-2">Enregistrée</dt><dd>le {dateHeure(c.creeLe)}{c.creePar && ` par ${nomDe(c.creePar)}`}</dd>
        {c.notes && (<><dt className="text-ink-2">Notes</dt><dd className="whitespace-pre-line">{c.notes}</dd></>)}
      </dl>

      <Gate perm="cartes_lieu.edit">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="bouton-second" onClick={() => onModifier(c)}>Modifier</button>
          {c.desactiveLe ? (
            <button type="button" className="bouton-second" disabled={basculer.isPending} onClick={() => basculer.mutate(true)}>Réactiver la carte</button>
          ) : (
            <button
              type="button"
              className="bouton-second text-bad"
              disabled={basculer.isPending}
              onClick={() => confirm("Désactiver cette carte ? Les bornes la refuseront (carte perdue, volée ou copiée).") && basculer.mutate(false)}
            >
              Désactiver la carte
            </button>
          )}
        </div>
        {basculer.error && <Erreur erreur={basculer.error} />}
        {c.effet === "DEBITE" && <Mouvement id={id} />}
      </Gate>

      <div>
        <h3 className="mb-1 text-xs font-medium text-ink-2">Utilisations ({c.utilisations.length})</h3>
        {c.utilisations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 font-medium">Borne · lieu</th>
                  <th className="py-1.5 pr-3 font-medium">Commande</th>
                  <th className="py-1.5 pr-3 font-medium">Résultat</th>
                  <th className="py-1.5 font-medium">Vente</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {c.utilisations.map((u) => (
                  <tr key={u.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3">{dateHeure(u.horodatage)}</td>
                    <td className="py-1.5 pr-3">
                      {u.borne.identifiant}{u.lieu ? ` · ${u.lieu.enseigne}` : ""}
                      {u.evenementCode && <span className="block text-xs text-ink-2">Événement {u.evenementCode}</span>}
                    </td>
                    <td className="py-1.5 pr-3">{euros(u.montantCents)} · {u.nb} tirage{u.nb > 1 ? "s" : ""}</td>
                    <td className="py-1.5 pr-3">
                      {u.accepte ? (
                        u.effet === "DEBITE" ? <>Débitée {euros(u.montantDebiteCents)}{u.soldeApresCents != null && <span className="text-xs text-ink-2"> · reste {euros(u.soldeApresCents)}</span>}</> : "Tirages offerts"
                      ) : (
                        <span className="text-warn-ink">Refusée : {RAISONS[u.raison ?? ""] ?? u.raison}</span>
                      )}
                      {u.accepte && u.annuleeLe && (
                        <span className="block text-xs text-ink-2">
                          Annulée le {dateHeure(u.annuleeLe)}{u.annulationRaison ? ` (${ANNULATIONS[u.annulationRaison] ?? u.annulationRaison})` : ""}{u.effet === "DEBITE" ? ", montant rendu" : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-xs">
                      {u.ventes.length
                        ? u.ventes.map((v) => (
                            <Link key={v.id} className="block text-accent hover:underline" href={`/paiements?q=${encodeURIComponent(v.transactionIdModule)}`}>
                              {euros(v.montantTtcCents)} · {STATUTS_PAIEMENT[v.statut]?.libelle ?? v.statut}
                            </Link>
                          ))
                        : <span className="font-mono text-ink-muted">{u.utilisationId}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink-muted">Pas encore présentée à une borne.</p>
        )}
      </div>

      {c.effet === "DEBITE" && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-ink-2">Crédits et retraits ({c.mouvements.length})</h3>
          {c.mouvements.length ? (
            <table className="w-full">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Date</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Montant</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Solde après</th>
                  <th className="py-1.5 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {c.mouvements.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-1.5 pr-3">{dateHeure(m.le)}{m.par && <span className="block text-xs text-ink-2">{nomDe(m.par)}</span>}</td>
                    <td className={`py-1.5 pr-3 text-right ${m.montantCents < 0 ? "text-bad" : ""}`}>{m.montantCents > 0 ? "+" : ""}{euros(m.montantCents)}</td>
                    <td className="py-1.5 pr-3 text-right">{euros(m.soldeApresCents)}</td>
                    <td className="py-1.5 text-ink-2">{m.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-ink-muted">Aucun crédit ni retrait.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Créditer (rechargement payé au lieu, geste commercial) ou retirer du crédit, avec une note */
function Mouvement({ id }: { id: number }) {
  const client = useQueryClient();
  const [montant, setMontant] = useState("");
  const [note, setNote] = useState("");
  const [erreurSaisie, setErreurSaisie] = useState<string | null>(null);
  const envoyer = useMutation({
    mutationFn: (montantCents: number) => api(`/cartes-lieu/${id}/mouvement`, { method: "POST", json: { montantCents, note: note.trim() || null } }),
    onSuccess: () => {
      setMontant("");
      setNote("");
      client.invalidateQueries({ queryKey: ["cartes-lieu"] });
    },
  });
  const soumettre = (signe: 1 | -1) => {
    const c = centimes(montant);
    if (!c || c <= 0) return setErreurSaisie("Saisissez un montant positif, par exemple 20 ou 6,50.");
    setErreurSaisie(null);
    envoyer.mutate(signe * c);
  };
  return (
    <div className="mt-3 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block w-32">
          <span className="etiquette">Montant (€)</span>
          <input className="champ" inputMode="decimal" placeholder="20" value={montant} onChange={(e) => setMontant(e.target.value)} />
        </label>
        <label className="block min-w-48 flex-1">
          <span className="etiquette">Note</span>
          <input className="champ" maxLength={500} placeholder="Rechargement payé au bar, geste commercial…" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" className="bouton" disabled={envoyer.isPending} onClick={() => soumettre(1)}>Créditer</button>
        <button type="button" className="bouton-second" disabled={envoyer.isPending} onClick={() => soumettre(-1)}>Retirer</button>
      </div>
      {erreurSaisie && <p className="mt-2 text-sm text-bad">{erreurSaisie}</p>}
      {envoyer.error && <Erreur erreur={envoyer.error} />}
    </div>
  );
}

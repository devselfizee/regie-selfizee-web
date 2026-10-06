import { jeton } from "./auth";

// Client de l'API Régie. Le jeton Keycloak est ajouté à chaque appel.
// "/api" est ajouté s'il manque : NEXT_PUBLIC_API_URL peut être l'URL du domaine seule.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003/api")
  .replace(/\/+$/, "")
  .replace(/(?<!\/api)$/, "/api");

export class ErreurApi extends Error {
  constructor(public status: number, public corps: { error?: string; message?: string; email?: string; champs?: { chemin: string; message: string }[] }) {
    super(corps.message ?? corps.error ?? `Erreur ${status}`);
  }
}

export async function api<T>(chemin: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...init } = options;
  const t = await jeton();
  const res = await fetch(`${API_URL}${chemin}`, {
    ...init,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...init.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });
  if (res.status === 204) return undefined as T;
  const corps = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErreurApi(res.status, corps);
  return corps as T;
}

/** Télécharge un fichier de l'API (export CSV) avec le jeton : un simple lien ne l'enverrait pas. */
export async function telecharger(chemin: string) {
  const t = await jeton();
  const res = await fetch(`${API_URL}${chemin}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new ErreurApi(res.status, await res.json().catch(() => ({})));
  const nom = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "export.csv";
  const url = URL.createObjectURL(await res.blob());
  const lien = Object.assign(document.createElement("a"), { href: url, download: nom });
  lien.click();
  URL.revokeObjectURL(url);
}

/** Query string à partir d'un objet (valeurs vides ignorées, tableaux joints par des virgules). */
export function qs(params: Record<string, string | number | (string | number)[] | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ─── Types (miroir des réponses de l'API) ───────────────────

export interface RefValeur {
  id: number;
  categorie: string;
  code: string;
  libelle: string;
  ordre: number;
  actif: boolean;
  parentId: number | null;
}

export interface Referentiel {
  listes: Record<string, RefValeur[]>;
  gammes: { id: number; code: string; libelle: string }[];
  typesModule: { id: number; code: string; libelle: string }[];
  commerciaux: { id: number; nom: string; prenom: string }[];
}

export interface Kpis {
  caTtcCents: number;
  caHtCents: number;
  nbVentes: number;
  panierMoyenCents: number;
  rembourseTtcCents: number;
  nbRefusees: number;
  nbAnnulees: number;
  tauxRefus: number;
  lieuxAvecVentes: number;
}

export interface Comparaisons {
  courant: Kpis;
  precedente: Kpis & { du: string; au: string };
  n1: Kpis & { du: string; au: string };
}

export interface PointSerie {
  periode: string;
  caTtcCents: number;
  nbVentes: number;
}

export interface StatsGlobales {
  periode: { du: string; au: string };
  granularite: Granularite;
  kpis: Comparaisons;
  serie: PointSerie[];
  serieN1: PointSerie[];
  classement: {
    lieuId: number;
    enseigne: string;
    ville: string | null;
    typeLieu: string;
    caTtcCents: number;
    nbVentes: number;
    joursAvecVente: number;
    caParJourVenteCents: number;
  }[];
  /** Réservé admin : commissions des périodes calculées comprises dans la période */
  commissions: { montantCents: number; nbPeriodes: number; nbAValider: number } | null;
  parc: {
    bornesAffectees: number;
    actives: number;
    bornesNonAffectees: number;
    inactives: { borneId: number; identifiant: string; lieuId: number; lieu: string; derniereVente: string | null; dernierHeartbeat: string | null }[];
  };
}

export interface StatsLieu {
  periode: { du: string; au: string };
  granularite: Granularite;
  kpis: Comparaisons;
  serie: PointSerie[];
  heatmap: { jourSemaine: number; heure: number; nbVentes: number; caTtcCents: number }[];
  joursSemaine: { jourSemaine: number; caTtcCents: number; nbVentes: number; joursAvecVente: number; caMoyenCents: number }[];
  meilleuresDates: { jour: string; caTtcCents: number; nbVentes: number }[];
  moyensPaiement: { moyen: string; caTtcCents: number; nbVentes: number; nbRefusees: number }[];
  modulesPaiement: { libelle: string; caTtcCents: number; nbVentes: number; nbRefusees: number }[];
  formules: { code: string; libelle: string | null; nbVentes: number; caTtcCents: number }[];
  montants: { montantCents: number; nbVentes: number }[];
  bornes: {
    borneId: number;
    identifiant: string;
    gamme: string;
    debut: string;
    fin: string | null;
    dernierHeartbeat: string | null;
    derniereVente: string | null;
    heartbeatsRecus: number;
  }[];
}

export type Granularite = "jour" | "semaine" | "mois" | "annee";

export interface LieuListe {
  id: number;
  enseigne: string;
  raisonSociale: string;
  ville: string | null;
  statut: string;
  saisonnalite: string;
  typeLieu: { libelle: string };
  commercial: { nom: string; prenom: string } | null;
  bornes: { id: number; identifiant: string; dernierHeartbeat: string | null; derniereVente: string | null }[];
  ca30jCents: number | null; // null : rôle sans accès au CA
  ventes30j: number | null;
}

export interface LieuFiche {
  id: number;
  statut: string;
  raisonSociale: string;
  enseigne: string;
  siret: string | null;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  latitude: string | null;
  longitude: string | null;
  typeLieuId: number;
  sousTypeId: number | null;
  standingId: number | null;
  saisonnalite: "ANNUEL" | "SAISONNIER";
  capaciteAccueil: number | null;
  frequentationJour: number | null;
  frequentationSemaine: number | null;
  zoneGeoId: number | null;
  tailleCommuneId: number | null;
  concurrencePhoto: boolean | null;
  concurrencePhotoNotes: string | null;
  interieurExterieur: "INTERIEUR" | "EXTERIEUR" | "MIXTE" | null;
  emplacementZoneId: number | null;
  visibilite: number | null;
  eclairageId: number | null;
  dateSignature: string | null;
  dateInstallation: string | null;
  dureeContratMois: number | null;
  commercialId: number | null;
  origineLeadId: number | null;
  notes: string | null;
  typeLieu: RefValeur;
  sousType: RefValeur | null;
  standing: RefValeur | null;
  zoneGeo: RefValeur | null;
  tailleCommune: RefValeur | null;
  emplacementZone: RefValeur | null;
  eclairage: RefValeur | null;
  origineLead: RefValeur | null;
  commercial: { id: number; nom: string; prenom: string } | null;
  clienteles: RefValeur[];
  contacts: { id: number; role: string; nom: string; prenom: string | null; email: string | null; telephone: string | null }[];
  horaires: { id: number; jourSemaine: number; ouverture: string; fermeture: string }[];
  saisons: { id: number; libelle: string | null; debut: string; fin: string }[];
  fermetures: { id: number; debut: string; fin: string; motif: string | null }[];
  affectations: {
    id: number;
    debut: string;
    fin: string | null;
    borne: { id: number; identifiant: string; numeroSerie: string; gamme: { libelle: string }; dernierHeartbeat: string | null };
  }[];
}

export interface BorneListe {
  id: number;
  identifiant: string;
  numeroSerie: string;
  statut: string;
  gamme: { id: number; libelle: string };
  modules: { id: number; numeroSerie: string | null; type: { id: number; code: string; libelle: string } }[];
  lieuActuel: { id: number; enseigne: string; ville: string | null } | null;
  affectationActuelle: { id: number; debut: string } | null;
  dernierHeartbeat: string | null;
  derniereVente: string | null;
  logicielVersion: string | null;
  enLigne: boolean;
  cleConfiguree: boolean;
}

export interface ErreurImport {
  id: string;
  code: string;
  message: string;
  transactionIdModule: string | null;
  statut: string;
  createdAt: string;
  payload: unknown;
  import: { id: string; borneIdentifiant: string | null; recuLe: string; type: string; ipSource: string | null };
}

// ─── Commissions ────────────────────────────────────────────

export type ModeleCommission = "AUCUNE" | "POURCENTAGE" | "POURCENTAGE_APRES_SEUIL" | "PALIERS" | "FORFAIT";
export type StatutReversement = "A_CALCULER" | "CALCULE" | "VALIDE" | "FACTURE_PAR_LIEU" | "AUTOFACTURE" | "PAYE";

export interface Contrat {
  id: number;
  version: number;
  dateEffet: string;
  dateFin: string | null;
  modele: ModeleCommission;
  base: "TTC" | "HT";
  netRemboursements: boolean;
  periodicite: "MOIS" | "TRIMESTRE" | "SAISON" | "ANNEE";
  tauxBp: number | null;
  seuilCents: number | null;
  seuilMode: "AU_DELA" | "DES_ATTEINTE" | null;
  seuilCumul: "PAR_PERIODE" | "CUMULE" | null;
  forfaitCents: number | null;
  minimumGarantiCents: number | null;
  paliersMode: "MARGINAL" | "GLOBAL" | null;
  paliers: { depuisCents: number; tauxBp: number }[];
  motifAvenant: string | null;
  description: string;
  creePar: { nom: string; prenom: string } | null;
  createdAt: string;
  _count: { reversements: number };
}

export interface LigneCalcul {
  libelle: string;
  baseCents?: number;
  tauxBp?: number;
  montantCents: number;
}

export interface Reversement {
  id: number;
  lieuId: number;
  periodeDebut: string;
  periodeFin: string;
  periode?: string;
  statut: StatutReversement;
  caTtcCents: number;
  caHtCents: number;
  rembourseCents: number;
  baseCalculCents: number;
  commissionCalculeeCents: number;
  ajustementsCents: number;
  montantAReverserCents: number;
  numeroFacture: string | null;
  calculeLe: string | null;
  valideLe: string | null;
  factureLe: string | null;
  payeLe: string | null;
  exporteComptaLe: string | null;
  detailCalcul: {
    periode: string;
    contrat: string;
    versionContrat: number;
    nbVentes: number;
    cumulAvantCents: number | null;
    minimumApplique: boolean;
    lignes: LigneCalcul[];
  } | null;
  lieu?: { id: number; enseigne: string; ville: string | null };
}

export interface ReleveReversement extends Reversement {
  lieu: { id: number; enseigne: string; ville: string | null; raisonSociale: string; siret: string | null; adresse: string | null; codePostal: string | null };
  contrat: { version: number; dateEffet: string };
  ajustements: { id: number; montantCents: number; motif: string; createdAt: string; user: { nom: string; prenom: string } }[];
  ventesParJour: { jour: string; nbVentes: number; caTtcCents: number; rembourseTtcCents: number }[];
}

export interface CommissionsLieu {
  contrats: Contrat[];
  enCours:
    | null
    | { contratId: number; periode: null; horsSaison: true }
    | {
        contratId: number;
        periode: { debut: string; fin: string; libelle: string };
        caTtcCents: number;
        baseCalculCents: number;
        commissionEstimeeCents: number;
        seuil: { seuilCents: number; atteintCents: number; cumule: boolean } | null;
        minimumGarantiCents: number | null;
      };
  reversements: Reversement[];
}

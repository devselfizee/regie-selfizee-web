// Programmation des événements d'un lieu (maquettes « configuration-evenements » du 10/11/2026) : l'événement
// par défaut tourne tout le temps, les événements programmés prennent sa place de leur début à leur fin.
// Les instants sont des heures de Paris écrites « AAAA-MM-JJTHH:mm » : ils se comparent comme des chaînes.
// Deux événements qui se chevauchent : celui qui commence le plus tard s'affiche (règle proposée, non validée).
// La borne ne change pas encore d'événement toute seule : tout ici est ce qui est PRÉVU, pas ce qu'elle affiche.

export interface Programme {
  id: number;
  nom: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  heureDebut: string | null;
  heureFin: string | null;
  version: number;
  publieeLe: string | null;
  modifieDepuisPublication: boolean;
}

/** Début et fin ; sans heure, du début du premier jour à la fin du dernier (comme l'API). */
export const instants = (e: Pick<Programme, "dateDebut" | "dateFin" | "heureDebut" | "heureFin">) => ({
  debut: `${e.dateDebut}T${e.heureDebut ?? "00:00"}`,
  fin: `${e.dateFin}T${e.heureFin ?? "24:00"}`,
});

const parisFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
/** Maintenant, en heure de Paris « AAAA-MM-JJTHH:mm ». */
export const maintenantParis = (d = new Date()) => parisFmt.format(d).replace(" ", "T");

/** Minutes depuis 1970 d'un instant « AAAA-MM-JJTHH:mm » (lu comme une heure sans fuseau : sert aux écarts). */
export const minutes = (instant: string) => {
  const [j, h] = instant.split("T");
  const [a, m, d] = j.split("-").map(Number);
  const [hh, mm] = (h ?? "00:00").split(":").map(Number);
  return Date.UTC(a, m - 1, d) / 60_000 + hh * 60 + mm;
};

export type Periode = "en-cours" | "a-venir" | "passe";
export function periode(e: Programme, maintenant = maintenantParis()): Periode {
  const { debut, fin } = instants(e);
  return fin <= maintenant ? "passe" : debut > maintenant ? "a-venir" : "en-cours";
}

/** Publié ; brouillon (jamais publié, à venir) ; jamais publié alors qu'il a commencé : à corriger. */
export type EtatPublication = "publie" | "brouillon" | "jamais";
export const etatPublication = (e: Programme, maintenant = maintenantParis()): EtatPublication =>
  e.version > 0 ? "publie" : periode(e, maintenant) === "a-venir" ? "brouillon" : "jamais";
export const LIBELLES_ETAT: Record<EtatPublication, string> = { publie: "publié", brouillon: "brouillon", jamais: "jamais publié" };

const deuxChiffres = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
/** « 12/11 à 20:00 » ; sans heure, la date seule. */
export const jourHeure = (date: string, heure: string | null) => `${deuxChiffres(date)}${heure ? ` à ${heure}` : ""}`;
/** Un instant « AAAA-MM-JJTHH:mm » lisible : « 12/11 à 20:00 » ; une fin de journée (24:00) devient le lendemain. */
export function instantLisible(instant: string) {
  const [j, h] = instant.split("T");
  if (h === "24:00") return deuxChiffres(new Date(Date.parse(`${j}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
  return jourHeure(j, h === "00:00" ? null : h);
}
/** « 12/11 à 20:00 → 28/11 à 06:00 », « 12/11 → 28/11 », « 12/11 » (une journée sans heure). */
export function duAu(e: Pick<Programme, "dateDebut" | "dateFin" | "heureDebut" | "heureFin">) {
  if (e.dateDebut === e.dateFin && !e.heureDebut && !e.heureFin) return deuxChiffres(e.dateDebut);
  return `${jourHeure(e.dateDebut, e.heureDebut)} → ${jourHeure(e.dateFin, e.heureFin)}`;
}

/** L'événement programmé affiché à cet instant (null : celui par défaut). */
export function affiche<T extends Programme>(liste: T[], instant: string): T | null {
  let choisi: T | null = null;
  for (const e of liste) {
    const { debut, fin } = instants(e);
    if (debut <= instant && instant < fin && (!choisi || debut > instants(choisi).debut || (debut === instants(choisi).debut && e.id > choisi.id))) choisi = e;
  }
  return choisi;
}

/** Le prochain changement d'événement prévu : à quel instant, et pour lequel (null : retour au par défaut). */
export function prochainChangement<T extends Programme>(liste: T[], maintenant = maintenantParis()): { instant: string; evenement: T | null } | null {
  const actuel = affiche(liste, maintenant);
  const bornes = [...new Set(liste.flatMap((e) => Object.values(instants(e))))].filter((i) => i > maintenant).sort();
  for (const instant of bornes) {
    const suivant = affiche(liste, instant);
    if (suivant?.id !== actuel?.id) return { instant, evenement: suivant };
  }
  return null;
}

/** Couples d'événements à venir ou en cours qui se chevauchent, avec celui qui l'emporte. */
export function chevauchements<T extends Programme>(liste: T[], maintenant = maintenantParis()) {
  const actifs = liste.filter((e) => instants(e).fin > maintenant).sort((a, b) => instants(a).debut.localeCompare(instants(b).debut));
  const couples: { a: T; b: T; debut: string; fin: string }[] = [];
  actifs.forEach((a, i) =>
    actifs.slice(i + 1).forEach((b) => {
      const ia = instants(a), ib = instants(b);
      if (ib.debut < ia.fin && ia.debut < ib.fin) couples.push({ a, b, debut: ib.debut, fin: ia.fin < ib.fin ? ia.fin : ib.fin });
    }),
  );
  return couples;
}

/** Lignes de la frise : un événement va sur la première ligne libre à son début. */
export function lignes<T extends Programme>(liste: T[]): Map<number, number> {
  const fins: string[] = [];
  const ligneDe = new Map<number, number>();
  for (const e of [...liste].sort((a, b) => instants(a).debut.localeCompare(instants(b).debut))) {
    const { debut, fin } = instants(e);
    let l = fins.findIndex((f) => f <= debut);
    if (l === -1) l = fins.push(fin) - 1;
    else fins[l] = fin;
    ligneDe.set(e.id, l);
  }
  return ligneDe;
}

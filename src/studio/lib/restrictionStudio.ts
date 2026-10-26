import { FORMATS, type Format } from "./gabarits";

// Restriction du studio au gabarit du kit qu'on habille depuis la fiche événement de la Régie :
// seuls ses formats (et gabarits du studio) sont proposés, et le catalogue de modèles ne montre
// que ceux du même format et du même nombre de poses. Posée par la page du studio avant de le monter.

export interface RestrictionStudio {
  /** Formats du studio autorisés, chacun limité à certains de ses gabarits si `gabarits` est donné. */
  formats: { id: string; gabarits?: string[] }[];
  /** Nombre de poses du gabarit du kit. */
  poses: number;
}

let courante: RestrictionStudio | null = null;

export function definirRestriction(r: RestrictionStudio | null) {
  courante = r;
}

/** Les formats permis, dans l'ordre de la restriction ; tous si rien n'est restreint. */
export function filtrerFormats(formats: Format[]): Format[] {
  if (!courante) return formats;
  return courante.formats.flatMap((r) => {
    const f = formats.find((x) => x.id === r.id);
    if (!f) return [];
    return [r.gabarits ? { ...f, gabarits: f.gabarits.filter((g) => r.gabarits!.includes(g.id)) } : f];
  });
}

/** Un modèle du catalogue (format booth + nombre de poses) est-il permis ? */
export function modelePermis(formatBoothId: number, poses: number): boolean {
  if (!courante) return true;
  if (poses !== courante.poses) return false;
  return filtrerFormats(FORMATS).some((f) => f.formatBoothId != null && Number(f.formatBoothId) === formatBoothId);
}

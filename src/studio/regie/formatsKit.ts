import type { GabaritEvenement } from "@/lib/api";
import type { RestrictionStudio } from "@/studio/lib/restrictionStudio";

// Formats du studio permis pour chaque gabarit du kit nightlife (même table que l'API,
// regie-selfizee-api src/config-evenement/cadres.ts, qui refuse tout autre format à l'enregistrement).
// Tous en 10x15 portrait (1240×1844), sauf la bandelette dessinée sur sa moitié visible (620×1844) :
// la carte souvenir de la bandelette et les deux cartes à QR de la « photo + deux cartes » viennent du kit.
export const FORMATS_KIT: Record<GabaritEvenement, RestrictionStudio & { libelle: string; note?: string }> = {
  bandelette: {
    libelle: "Bandelette 4 poses",
    formats: [{ id: "marque-page", gabarits: ["mp-4"] }],
    poses: 4,
    note: "Vous dessinez la bandelette (620×1844). La carte souvenir avec le QR et le code reste celle du kit.",
  },
  pola: { libelle: "Pola 1 pose", formats: [{ id: "polaroid" }, { id: "carte-postale-portrait" }], poses: 1 },
  planche: { libelle: "Planche 4 poses", formats: [{ id: "polaroid-multishoot", gabarits: ["polm-4"] }], poses: 4 },
  carte: {
    libelle: "Photo 10x15 + deux cartes à QR",
    formats: [{ id: "polaroid" }, { id: "carte-postale-portrait" }],
    poses: 1,
    note: "Vous dessinez la photo 10x15. Les deux cartes à QR de part et d'autre restent celles du kit.",
  },
};

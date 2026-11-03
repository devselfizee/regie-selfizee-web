import type { GabaritEvenement } from "@/lib/api";
import type { RestrictionStudio } from "@/studio/lib/restrictionStudio";

// Formats du studio permis pour chaque gabarit du kit nightlife (même table que l'API,
// regie-selfizee-api src/config-evenement/cadres.ts, qui refuse tout autre format à l'enregistrement).
// Tous en 10x15 portrait (1240×1844). La bandelette se dessine sur la page entière : la bande et la carte
// souvenir (miniatures, QR, code de séance) ; les deux cartes à QR de la « photo + deux cartes » viennent
// du kit. `qrObligatoire` : le QR du kit est recouvert par le dessin, le cadre doit poser le sien.
export const FORMATS_KIT: Record<GabaritEvenement, RestrictionStudio & { libelle: string; note?: string; qrObligatoire?: boolean }> = {
  bandelette: {
    libelle: "Bandelette 4 poses",
    formats: [{ id: "bandelette-carte", gabarits: ["bc-4"] }],
    poses: 4,
    qrObligatoire: true,
    note: "Vous dessinez la page entière : la bande et ses 4 photos à gauche, la carte souvenir à droite (QR code, code de séance).",
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

// Codes d'erreur envoyés par les bornes dans leurs signes de vie (référentiel publié dans heartbeat.v1.schema.json),
// en clair pour l'équipe (retour de Sébastien : « PRN_HORS_LIGNE » ne parle à personne).
const LIBELLES: Record<string, string> = {
  PRN_ABSENTE: "Imprimante non détectée",
  PRN_HORS_LIGNE: "Imprimante éteinte ou débranchée",
  PRN_PAPIER_FIN: "Plus de papier",
  PRN_PAPIER_ERREUR: "Papier coincé ou mal chargé",
  PRN_CAPOT: "Capot de l'imprimante ouvert",
  PRN_ERREUR: "Imprimante en erreur",
  TPE_NON_PRET: "Terminal de paiement pas prêt",
  TPE_MUET: "Terminal de paiement ne répond pas",
  TPE_OCCUPE: "Terminal de paiement occupé",
  CAM_ABSENTE: "Appareil photo non détecté",
  NET_INTERNET_KO: "Pas d'internet",
  NET_PORTAIL_CAPTIF: "Wi-Fi à page de connexion (portail captif)",
  SW_MODE_DEGRADE: "Logiciel en mode dégradé",
  SW_ECRAN_ADMIN: "Écran d'administration ouvert",
  ALIM_BATTERIE: "Sur batterie (secteur coupé)",
};

/** Libellé en clair d'un code d'erreur de borne ; un code inconnu reste tel quel */
export const libelleErreurBorne = (code: string) => LIBELLES[code] ?? code;

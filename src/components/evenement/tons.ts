import type { ReglagesEvenement } from "@/lib/api";

// Les quatre tons des textes de la borne, avec leurs phrases reprises du logiciel de la borne (maquettes
// « configuration-evenements » du 10/11/2026) : consignes de pose avant la photo, phrases du « +1 pour un
// pote ». La borne tire une phrase au hasard dans la liste à chaque pose.

export type Ton = ReglagesEvenement["lieu"]["ton"];

export const TONS: Record<Ton, { nom: string; resume: string; lieux: string; exemples: string[]; exemplePlusUn: string; poses: string[]; plusUn: string[] }> = {
  club: {
    nom: "Club",
    resume: "festif, la nuit",
    lieux: "Boîte, soirée étudiante",
    exemples: ["Pose de rappeur", "Regard de mannequin", "Tout le monde se serre !"],
    exemplePlusUn: "Une pour ton crush ?",
    poses: ["Grimace !", "Bisou !", "Pose de star", "Tout le monde se serre !", "Regard de mannequin", "Les bras en l'air !", "Clin d'œil !", "Pose de rappeur", "Cœur avec les doigts !", "Comme si c'était la dernière de la soirée !"],
    plusUn: ["Une photo pour maman ?", "Une pour ton crush ?", "Une pour ton ex ? Non. Pour ton pote, oui.", "Une pour ton coloc ?", "Une pour celui qui a payé l'entrée ?", "Une pour lundi, pour prouver que t'y étais ?"],
  },
  bar: {
    nom: "Bar",
    resume: "la tournée, sans drague",
    lieux: "Bar à bières, cave, afterwork",
    exemples: ["Santé, verres en l'air !", "Regard de connaisseur", "Comme si la tournée était offerte !"],
    exemplePlusUn: "Une pour celui qui paie la tournée ?",
    poses: ["Grimace !", "Santé, verres en l'air !", "Tout le monde se serre !", "Fou rire !", "Clin d'œil !", "Pose de star", "Bras dessus, bras dessous !", "Regard de connaisseur", "Comme si la tournée était offerte !", "Pouce en l'air !"],
    plusUn: ["Une pour le frigo ?", "Une pour le bureau lundi ?", "Une pour celui qui est au bar ?", "Une pour celui qui paie la tournée ?", "Une pour celui qui est arrivé en retard ?", "Une pour le tableau de liège ?"],
  },
  famille: {
    nom: "Famille",
    resume: "ni alcool ni drague",
    lieux: "Mariage, anniversaire",
    exemples: ["Grand sourire !", "Regarde ton voisin !", "Comme sur la photo de classe !"],
    exemplePlusUn: "Une pour mamie ?",
    poses: ["Grand sourire !", "Tout le monde se serre !", "Fou rire !", "Air surpris !", "Bisou !", "Les bras en l'air !", "Cœur avec les doigts !", "Bras dessus, bras dessous !", "Regarde ton voisin !", "Comme sur la photo de classe !"],
    plusUn: ["Une pour le frigo ?", "Une pour mamie ?", "Une pour l'album ?", "Une pour celui qui n'a pas pu venir ?", "Une pour le cadre du salon ?", "Une pour ta mère ?"],
  },
  pro: {
    nom: "Pro",
    resume: "sobre, générique",
    lieux: "Soirée d'entreprise, séminaire",
    exemples: ["Tous ensemble, souriez !", "Regardez la caméra !", "Sourire de gagnant !"],
    exemplePlusUn: "Une pour un collègue ?",
    poses: ["Grand sourire !", "Tous ensemble, souriez !", "Regardez la caméra !", "Resserrez-vous un peu !", "Sourire de gagnant !", "Pouce en l'air !", "Un petit salut à la caméra !", "Air surpris !", "Regard complice !", "Fou rire !"],
    plusUn: ["Une pour le bureau ?", "Une pour un collègue ?", "Une pour celui qui n'a pas pu venir ?", "Une pour la maison ?", "Une pour l'album ?", "Une pour le cadre du bureau ?"],
  },
};

export const libelleTon = (t: Ton) => `${TONS[t].nom} : ${TONS[t].resume}`;

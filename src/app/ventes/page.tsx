import { redirect } from "next/navigation";

// Ancienne adresse : la liste de tous les paiements est maintenant sur /paiements
export default function AnciennePageVentes() {
  redirect("/paiements");
}

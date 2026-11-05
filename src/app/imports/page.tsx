import { redirect } from "next/navigation";

// Les erreurs d'import sont un onglet du journal des bornes (retour de Sébastien, 05/11/2026)
export default function PageImports() {
  redirect("/journal?onglet=erreurs");
}

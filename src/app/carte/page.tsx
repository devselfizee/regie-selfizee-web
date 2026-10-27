import { redirect } from "next/navigation";

// Ancienne adresse de la carte : elle est maintenant sous Lieux (liste et carte, chacune son adresse)
export default function AncienneCarte() {
  redirect("/lieux/carte");
}

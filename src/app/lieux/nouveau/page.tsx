import { FormLieu } from "@/components/FormLieu";
import { EnTete } from "@/components/Etat";
import { Reserve } from "@/lib/session";

export default function NouveauLieu() {
  return (
    <Reserve roles={["ADMIN", "COMMERCIAL"]}>
      <EnTete titre="Nouveau lieu" sousTitre="Plus la fiche est complète, plus les statistiques croisées sont exploitables." />
      <FormLieu />
    </Reserve>
  );
}

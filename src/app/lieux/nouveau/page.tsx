import { FormLieu } from "@/components/FormLieu";
import { EnTete } from "@/components/Etat";

export default function NouveauLieu() {
  return (
    <>
      <EnTete titre="Nouveau lieu" sousTitre="Plus la fiche est complète, plus les statistiques croisées sont exploitables." />
      <FormLieu />
    </>
  );
}

import { FormLieu } from "@/components/FormLieu";
import { EnTete } from "@/components/Etat";
import { PageGuard } from "@/lib/perms";

export default async function NouveauLieu({ searchParams }: PageProps<"/lieux/nouveau">) {
  const prospect = (await searchParams).statut === "PROSPECT";
  return (
    <PageGuard perm="lieux.create">
      <EnTete
        titre={prospect ? "Nouveau prospect" : "Nouveau lieu"}
        sousTitre={
          prospect
            ? "Plus la fiche est complète (capacité, fréquentation, visibilité, clientèle…), plus l'estimation du potentiel est fiable."
            : "Plus la fiche est complète, plus les statistiques croisées sont exploitables."
        }
      />
      <FormLieu statut={prospect ? "PROSPECT" : undefined} />
    </PageGuard>
  );
}

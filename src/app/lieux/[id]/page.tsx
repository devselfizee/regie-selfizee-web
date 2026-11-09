import { PageGuard } from "@/lib/perms";
import { FicheLieu } from "./FicheLieu";

export default async function Page({ params, searchParams }: PageProps<"/lieux/[id]">) {
  const { id } = await params;
  const { onglet } = await searchParams;
  return (
    // Fiche d'un lieu : ses lieux (dont le lieu d'un partenaire) ou tous ; l'API applique le périmètre
    <PageGuard perm={["lieux.view_own", "lieux.view_any"]}>
      <FicheLieu id={Number(id)} ongletInitial={typeof onglet === "string" ? onglet : undefined} />
    </PageGuard>
  );
}

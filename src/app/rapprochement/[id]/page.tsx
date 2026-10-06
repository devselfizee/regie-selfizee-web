import { Suspense } from "react";
import { Rapport } from "./Rapport";

export default async function Page({ params }: PageProps<"/rapprochement/[id]">) {
  const { id } = await params;
  // useSearchParams (résultat de l'import) exige une frontière Suspense
  return (
    <Suspense>
      <Rapport id={Number(id)} />
    </Suspense>
  );
}

import { ModifierLieu } from "./ModifierLieu";

export default async function Page({ params, searchParams }: PageProps<"/lieux/[id]/modifier">) {
  const { id } = await params;
  const { onglet } = await searchParams;
  return <ModifierLieu id={Number(id)} ongletInitial={typeof onglet === "string" ? onglet : undefined} />;
}

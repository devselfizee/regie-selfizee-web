import { FicheLieu } from "./FicheLieu";

export default async function Page({ params, searchParams }: PageProps<"/lieux/[id]">) {
  const { id } = await params;
  const { onglet } = await searchParams;
  return <FicheLieu id={Number(id)} ongletInitial={typeof onglet === "string" ? onglet : undefined} />;
}

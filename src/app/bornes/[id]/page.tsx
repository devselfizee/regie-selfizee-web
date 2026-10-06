import { FicheBorne } from "./FicheBorne";

export default async function Page({ params }: PageProps<"/bornes/[id]">) {
  const { id } = await params;
  return <FicheBorne id={Number(id)} />;
}

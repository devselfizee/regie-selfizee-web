import { Releve } from "./Releve";

export default async function Page({ params }: PageProps<"/reversements/[id]">) {
  const { id } = await params;
  return <Releve id={Number(id)} />;
}

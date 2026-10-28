"use client";

import { Reserve } from "@/lib/session";
import { ListePaiements } from "@/components/ListePaiements";

export default function PagePaiements() {
  return (
    <Reserve roles={["ADMIN"]}>
      <ListePaiements />
    </Reserve>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDroits } from "@/lib/perms";
import { PAGES_ANALYSES } from "@/components/Analyses";

// Entrée « Analyses » du menu : vers le premier onglet permis
export default function PageAnalyses() {
  const a = useDroits();
  const router = useRouter();
  const cible = PAGES_ANALYSES.find((p) => a(p.perm))?.href ?? "/403";
  useEffect(() => {
    router.replace(cible);
  }, [cible, router]);
  return null;
}

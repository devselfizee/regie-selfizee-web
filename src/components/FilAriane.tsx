import Link from "next/link";

/**
 * Fil d'Ariane des pages de configuration de la borne : lieu (retour à sa fiche) › Configuration (l'onglet
 * du lieu) › page en cours, avec un niveau de plus (parent) pour les pages d'un événement, comme sa galerie.
 */
export function FilAriane({ lieuId, enseigne, page, parent }: { lieuId: number; enseigne: string; page: string; parent?: { href: string; libelle: string } }) {
  return (
    <nav aria-label="Fil d'Ariane" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <li>
          <Link href={`/lieux/${lieuId}`} className="hover:text-ink hover:underline" title="Retour à la fiche du lieu">
            <span aria-hidden>← </span>
            {enseigne}
          </Link>
        </li>
        <li aria-hidden>›</li>
        <li>
          <Link href={`/lieux/${lieuId}?onglet=configuration`} className="hover:text-ink hover:underline">Configuration</Link>
        </li>
        {parent && (
          <>
            <li aria-hidden>›</li>
            <li>
              <Link href={parent.href} className="hover:text-ink hover:underline">{parent.libelle}</Link>
            </li>
          </>
        )}
        <li aria-hidden>›</li>
        <li aria-current="page" className="font-medium text-ink-2">{page}</li>
      </ol>
    </nav>
  );
}

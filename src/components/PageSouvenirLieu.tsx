"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { dateHeure, nombre, pct } from "@/lib/format";
import { BoutonExport } from "./BoutonExport";
import { Badge, Chargement, Erreur, Section, Vide } from "./Etat";

// Onglet « Page souvenir » de la fiche lieu (CDC page souvenir § 9.1) : ce que les invités font de la page de leur
// QR (scans, inscriptions, opt-ins, carte à gratter) et les contacts qui ont accepté les bons plans du lieu.
// Seuls ces contacts opt-in lieu sont montrés et exportés ; l'opt-in Selfizee reste à Selfizee.

type Lot = "free" | "pct50" | "pct30" | "none";
interface Resume {
  seances: number;
  scans: number;
  inscriptions: number;
  optinsLieu: number;
  optinsSelfizee: number;
  livraisons: { aEnvoyer: number; envoyees: number; enAttenteMedia: number; introuvables?: number; echecs: number };
  cartes: number;
  lots: Record<Lot, number>;
  codesConsommes: number;
  evenements: { id: number; code: string; nom: string | null; habituel: boolean }[];
}
interface Contacts {
  total: number;
  contacts: { id: string; email: string; prenom: string | null; date: string; codeEvent: string; evenement: string | null; photoUuid: string; texteAccepte: string }[];
}

const PERIODES = { "30": "30 derniers jours", "90": "90 derniers jours", tout: "Depuis le début" } as const;
type Periode = keyof typeof PERIODES;
const jourIl = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const LOTS: { cle: Lot; libelle: string }[] = [
  { cle: "free", libelle: "Photo offerte" },
  { cle: "pct50", libelle: "−50 %" },
  { cle: "pct30", libelle: "−30 %" },
  { cle: "none", libelle: "Perdu" },
];

export function PageSouvenirLieu({ lieuId }: { lieuId: number }) {
  const [periode, setPeriode] = useState<Periode>("30");
  const [evenement, setEvenement] = useState<number | "">("");
  const requete = qs({ du: periode === "tout" ? undefined : jourIl(Number(periode)), evenement: evenement || undefined });
  const resume = useQuery({ queryKey: ["souvenir-resume", lieuId, requete], queryFn: () => api<Resume>(`/lieux/${lieuId}/souvenir/resume${requete}`), placeholderData: keepPreviousData });
  const contacts = useQuery({ queryKey: ["souvenir-contacts", lieuId, requete], queryFn: () => api<Contacts>(`/lieux/${lieuId}/souvenir/contacts${requete}`), placeholderData: keepPreviousData });

  if (resume.error) return <Erreur erreur={resume.error} />;
  if (!resume.data) return <Chargement />;
  const r = resume.data;
  const gagnes = r.cartes - r.lots.none;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="etiquette">Période</span>
          <select className="champ" value={periode} onChange={(e) => setPeriode(e.target.value as Periode)}>
            {Object.entries(PERIODES).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        {r.evenements.length > 1 && (
          <label className="block">
            <span className="etiquette">Événement</span>
            <select className="champ" value={evenement} onChange={(e) => setEvenement(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Tous</option>
              {r.evenements.map((e) => (
                <option key={e.id} value={e.id}>{e.habituel ? "Par défaut" : e.nom} · {e.code}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <Section titre="Entonnoir de la page souvenir">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Etape libelle="Séances reçues" valeur={r.seances} detail="photos arrivées de la borne" />
          <Etape libelle="Pages ouvertes" valeur={r.scans} detail={r.seances ? `${pct(Math.min(1, r.scans / r.seances))} des séances` : "QR scannés"} />
          <Etape libelle="Inscriptions" valeur={r.inscriptions} detail={r.scans ? `${pct(Math.min(1, r.inscriptions / r.scans))} des pages ouvertes` : "« Recevoir mes photos »"} />
          <Etape libelle="Contacts opt-in lieu" valeur={r.optinsLieu} detail={r.inscriptions ? `${pct(r.optinsLieu / r.inscriptions)} des inscrits` : "bons plans du lieu"} />
        </ol>
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Ligne libelle="Opt-in Selfizee (liste de Selfizee)" valeur={nombre(r.optinsSelfizee)} />
          <Ligne libelle="Cartes grattées" valeur={nombre(r.cartes)} />
          <Ligne libelle="Lots gagnés" valeur={`${nombre(gagnes)}${gagnes ? ` (${LOTS.filter((l) => l.cle !== "none" && r.lots[l.cle]).map((l) => `${l.libelle} : ${r.lots[l.cle]}`).join(", ")})` : ""}`} />
          <Ligne libelle="Codes gagnés utilisés à la borne" valeur={nombre(r.codesConsommes)} />
          <Ligne
            libelle="Mails de livraison"
            valeur={
              <span className="flex flex-wrap justify-end gap-1">
                {r.livraisons.envoyees > 0 && <Badge ton="ok">{r.livraisons.envoyees} envoyé{r.livraisons.envoyees > 1 ? "s" : ""}</Badge>}
                {r.livraisons.aEnvoyer > 0 && <Badge ton="warn">{r.livraisons.aEnvoyer} à envoyer</Badge>}
                {r.livraisons.enAttenteMedia > 0 && <Badge ton="neutre">{r.livraisons.enAttenteMedia} en attente de la photo</Badge>}
                {(r.livraisons.introuvables ?? 0) > 0 && <Badge ton="warn">{r.livraisons.introuvables} photo{r.livraisons.introuvables! > 1 ? "s" : ""} introuvable{r.livraisons.introuvables! > 1 ? "s" : ""}</Badge>}
                {r.livraisons.echecs > 0 && <Badge ton="crit">{r.livraisons.echecs} en échec</Badge>}
                {!r.livraisons.envoyees && !r.livraisons.aEnvoyer && !r.livraisons.enAttenteMedia && !r.livraisons.introuvables && !r.livraisons.echecs && "—"}
              </span>
            }
          />
        </dl>
        {(r.livraisons.aEnvoyer > 0 || r.livraisons.echecs > 0 || (r.livraisons.introuvables ?? 0) > 0) && (
          <p className="mt-3 text-xs text-ink-muted">
            Les mails partent dans la minute par Mailjet. « À envoyer » qui dure : Mailjet n&apos;est pas configuré ou refuse l&apos;envoi. « En échec » : adresse
            refusée par sa boîte, ou envoi impossible après plusieurs essais. « Photo introuvable » : la photo n&apos;est pas arrivée 24 h après la demande,
            l&apos;invité a été prévenu ; elle part si elle arrive.
          </p>
        )}
      </Section>

      <Section
        titre={`Contacts opt-in lieu${contacts.data ? ` (${nombre(contacts.data.total)})` : ""}`}
        actions={contacts.data && contacts.data.total > 0 ? <BoutonExport chemin={`/lieux/${lieuId}/souvenir/contacts.csv${requete}`}>Exporter en CSV</BoutonExport> : undefined}
      >
        <p className="mb-3 text-sm text-ink-2">
          Les invités qui ont coché « Les bons plans de ce lieu » sur la page de leur photo. Les autres inscrits n&apos;apparaissent pas : leur e-mail ne sert
          qu&apos;à leur envoyer leurs photos.
        </p>
        {contacts.error ? (
          <Erreur erreur={contacts.error} />
        ) : !contacts.data ? (
          <Chargement />
        ) : contacts.data.contacts.length === 0 ? (
          <Vide>Aucun contact opt-in sur la période.</Vide>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-2">
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Prénom</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Événement</th>
                </tr>
              </thead>
              <tbody>
                {contacts.data.contacts.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{c.email}</td>
                    <td className="px-3 py-2">{c.prenom ?? <span className="text-ink-muted">—</span>}</td>
                    <td className="px-3 py-2 tabular">{dateHeure(c.date)}</td>
                    <td className="px-3 py-2">
                      {c.evenement ?? "—"} <span className="font-mono text-xs text-ink-muted">{c.codeEvent}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {contacts.data.total > contacts.data.contacts.length && (
              <p className="mt-2 text-xs text-ink-muted">Les {contacts.data.contacts.length} plus récents ; l&apos;export CSV les contient tous.</p>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function Etape({ libelle, valeur, detail }: { libelle: string; valeur: number; detail: string }) {
  return (
    <li className="rounded-lg border border-line p-3">
      <span className="block text-xs text-ink-2">{libelle}</span>
      <span className="block text-2xl font-semibold tabular">{nombre(valeur)}</span>
      <span className="block text-xs text-ink-muted">{detail}</span>
    </li>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-1">
      <dt className="text-ink-2">{libelle}</dt>
      <dd className="tabular font-medium">{valeur}</dd>
    </div>
  );
}

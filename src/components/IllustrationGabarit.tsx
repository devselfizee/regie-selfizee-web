import type { GabaritEvenement } from "@/lib/api";

// Illustrations des gabarits du kit nightlife (fiche événement, créations graphiques) : le tirage tel
// qu'il sort de la borne, avec ses photos, ses cartes et son QR. Papier blanc, photos à la couleur
// d'accent (currentColor), QR en encre.

const ENCRE = "#1f2937";

function Photo({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const m = Math.min(w, h);
  const cx = x + w / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1.5} fill="currentColor" fillOpacity={0.16} />
      <circle cx={cx} cy={y + h * 0.42} r={m * 0.13} fill="currentColor" fillOpacity={0.45} />
      <path d={`M${cx - m * 0.26} ${y + h * 0.82} Q${cx} ${y + h * 0.46} ${cx + m * 0.26} ${y + h * 0.82} Z`} fill="currentColor" fillOpacity={0.45} />
    </g>
  );
}

function Qr({ x, y, s }: { x: number; y: number; s: number }) {
  const m = s / 7;
  const repere = (rx: number, ry: number) => (
    <g key={`${rx}-${ry}`}>
      <rect x={rx} y={ry} width={m * 2.6} height={m * 2.6} fill={ENCRE} />
      <rect x={rx + m * 0.55} y={ry + m * 0.55} width={m * 1.5} height={m * 1.5} fill="#ffffff" />
      <rect x={rx + m * 0.9} y={ry + m * 0.9} width={m * 0.8} height={m * 0.8} fill={ENCRE} />
    </g>
  );
  const modules = [[3.2, 0.4], [4.4, 1.6], [3.2, 3.2], [4.4, 4.4], [5.6, 3.2], [0.4, 4.4], [1.6, 5.6], [3.2, 5.6], [5.6, 5.6], [4.4, 3.2]];
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} fill="#ffffff" />
      {repere(x, y)}
      {repere(x + s - m * 2.6, y)}
      {repere(x, y + s - m * 2.6)}
      {modules.map(([i, j]) => <rect key={`${i}-${j}`} x={x + i * m} y={y + j * m} width={m} height={m} fill={ENCRE} />)}
    </g>
  );
}

/** Lignes de texte (titre, légende) */
function Lignes({ x, y, largeurs }: { x: number; y: number; largeurs: number[] }) {
  return (
    <g>
      {largeurs.map((l, i) => <rect key={i} x={x} y={y + i * 5} width={l} height={2.4} rx={1.2} fill={ENCRE} fillOpacity={i === 0 ? 0.55 : 0.25} />)}
    </g>
  );
}

const Coupe = ({ x, h }: { x: number; h: number }) => <line x1={x} y1={2} x2={x} y2={h - 2} stroke={ENCRE} strokeOpacity={0.35} strokeWidth={0.6} strokeDasharray="2 2" />;

export function IllustrationGabarit({ gabarit, className = "" }: { gabarit: GabaritEvenement; className?: string }) {
  const papier = (l: number, h: number) => <rect x={0} y={0} width={l} height={h} rx={2} fill="#ffffff" stroke={ENCRE} strokeOpacity={0.12} strokeWidth={0.8} />;
  const svg = (l: number, h: number, enfants: React.ReactNode, titre: string) => (
    <svg viewBox={`-2 -2 ${l + 4} ${h + 4}`} className={`text-accent drop-shadow-sm ${className}`} role="img" aria-label={titre}>
      {papier(l, h)}
      {enfants}
    </svg>
  );

  if (gabarit === "bandelette")
    return svg(
      124,
      184,
      <>
        {[6, 49, 92, 135].map((y) => <Photo key={y} x={5} y={y} w={52} h={39} />)}
        <Coupe x={62} h={184} />
        <Lignes x={70} y={18} largeurs={[40, 32]} />
        {/* Carte souvenir : miniatures des 4 photos, QR et code photo (positions du kit / 10) */}
        {[45, 66, 87, 108].map((y) => <Photo key={`m${y}`} x={79} y={y} w={28} h={20} />)}
        <Qr x={82} y={136} s={22} />
        <Lignes x={70} y={170} largeurs={[28]} />
      </>,
      "Bandelette 4 poses et carte souvenir avec QR",
    );
  if (gabarit === "pola")
    return svg(
      124,
      184,
      <>
        <Photo x={8} y={8} w={108} h={132} />
        <Lignes x={30} y={156} largeurs={[64, 44]} />
      </>,
      "Pola, une grande photo",
    );
  if (gabarit === "planche")
    return svg(
      124,
      184,
      <>
        {[[7, 7], [64, 7], [7, 70], [64, 70]].map(([x, y]) => <Photo key={`${x}-${y}`} x={x} y={y} w={53} h={60} />)}
        <Lignes x={30} y={150} largeurs={[64, 44]} />
      </>,
      "Planche, quatre photos",
    );
  if (gabarit === "paysage")
    return svg(184, 124, <Photo x={5} y={5} w={174} h={114} />, "Photo 10x15 paysage, pleine page");
  return svg(
    244,
    184,
    <>
      <Lignes x={8} y={20} largeurs={[36, 28]} />
      <Qr x={10} y={70} s={32} />
      <Coupe x={56} h={184} />
      <Photo x={62} y={8} w={120} h={168} />
      <Coupe x={188} h={184} />
      <Lignes x={196} y={20} largeurs={[36, 28]} />
      <Qr x={198} y={70} s={32} />
    </>,
    "Photo 10x15 et deux cartes à QR",
  );
}

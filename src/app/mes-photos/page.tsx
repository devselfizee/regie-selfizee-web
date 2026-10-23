"use client";

import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { API_URL } from "@/lib/api";
import s from "./mes-photos.module.css";

// Page publique « Mes photos » (CDC page souvenir § 4.7) : retrouver sa photo avec le code
// imprimé, ou recevoir par mail le lien vers toutes ses photos. Sans compte.

const PUBLIC_URL = `${API_URL.replace(/\/api$/, "")}/public/v1/mes-photos`;
// Caractères possibles d'un code de séance : pas de I, L, O, 0 ni 1
const NON_AUTORISES = /[^A-HJKMNP-Z2-9]/g;
const MESSAGE_INTROUVABLE = "On ne trouve pas ce code. Vérifie les six caractères.";

async function appeler(chemin: string, corps: unknown) {
  const res = await fetch(`${PUBLIC_URL}${chemin}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export default function MesPhotos() {
  return (
    <div className={s.page}>
      <div className={s.top}>
        <a href="https://selfizee.fr">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo fixe de 4 Ko */}
          <img src="/selfizee-logo.png" alt="Selfizee" width={200} height={34} />
        </a>
        <a href="https://selfizee.fr">selfizee.fr</a>
      </div>
      <main className={s.main}>
        <h1 className={s.titre}>
          Retrouve
          <br />
          tes photos.
        </h1>
        <p className={s.lead}>Tu as fait une photo sur une borne Selfizee ? Elle t&apos;attend ici, pendant 90 jours.</p>
        <div className={s.cartes}>
          <ParCode />
          <ParEmail />
        </div>
        <div className={s.aide}>
          <b>Pas de code et pas de mail ?</b> Si la borne est encore là, demande au staff du lieu : avec l&apos;heure de la photo, l&apos;écran
          d&apos;administration la retrouve. Sinon, écris-nous : <b>contact@selfizee.fr</b>.
        </div>
      </main>
      <footer className={s.pied}>Selfizee · photos et e-mails conservés 90 jours, puis effacés</footer>
    </div>
  );
}

function ParCode() {
  const [cases, setCases] = useState<string[]>(Array(6).fill(""));
  const champs = useRef<(HTMLInputElement | null)[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [demo, setDemo] = useState<string | null>(null);

  const remplir = (depuis: number, texte: string) => {
    const lettres = texte.toUpperCase().replace(NON_AUTORISES, "").slice(0, 6 - depuis).split("");
    if (!lettres.length) return;
    const n = [...cases];
    lettres.forEach((l, k) => (n[depuis + k] = l));
    setCases(n);
    setErreur(null);
    champs.current[Math.min(depuis + lettres.length, 5)]?.focus();
  };

  const touche = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !cases[i] && i > 0) {
      const n = [...cases];
      n[i - 1] = "";
      setCases(n);
      champs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && i > 0) champs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < 5) champs.current[i + 1]?.focus();
  };

  const coller = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    remplir(i, e.clipboardData.getData("text"));
  };

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    const code = cases.join("");
    if (code.length < 6) return setErreur(MESSAGE_INTROUVABLE);
    setEnvoi(true);
    setDemo(null);
    try {
      const r = await appeler("/code", { code });
      if (r.ok && r.json.url) {
        // Tant que la page souvenir n'existe pas (recherche simulée), on montre le lien au lieu d'y aller
        if (r.json.simulation) setDemo(r.json.url);
        else window.location.assign(r.json.url);
      } else setErreur(r.status === 429 ? r.json.message : MESSAGE_INTROUVABLE);
    } catch {
      setErreur("Connexion impossible. Réessaie dans un instant.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className={s.carte} aria-labelledby="titre-code">
      <svg className={s.eventail} width="150" height="70" viewBox="0 0 150 70" aria-hidden="true">
        <g transform="rotate(-12 45 50)"><rect x="20" y="14" width="46" height="56" fill="#fff" /><rect x="24" y="18" width="38" height="40" fill="#5a3d7a" /></g>
        <g><rect x="52" y="8" width="46" height="56" fill="#fff" /><rect x="56" y="12" width="38" height="40" fill="#8a4d9a" /></g>
        <g transform="rotate(12 105 50)"><rect x="84" y="14" width="46" height="56" fill="#fff" /><rect x="88" y="18" width="38" height="40" fill="#b85d9a" /></g>
      </svg>
      <h2 id="titre-code">
        Avec le code
        <br />
        imprimé sur ta photo
      </h2>
      <p>Six lettres et chiffres, sous la photo ou sur le coupon.</p>
      {demo && (
        <div className={s.demo} role="status">
          Démonstration : la page souvenir n&apos;est pas encore en ligne. Ce code mène à <a href={demo}>{demo}</a>
        </div>
      )}
      <form onSubmit={valider} noValidate>
        <div className={s.cases}>
          {cases.map((c, i) => (
            <input
              key={i}
              id={`code-${i + 1}`}
              ref={(el) => {
                champs.current[i] = el;
              }}
              value={c}
              maxLength={1}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label={`Caractère ${i + 1} du code`}
              aria-invalid={erreur ? true : undefined}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(NON_AUTORISES, "");
                if (!v) {
                  const n = [...cases];
                  n[i] = "";
                  setCases(n);
                } else remplir(i, v.slice(-1));
              }}
              onKeyDown={(e) => touche(i, e)}
              onPaste={(e) => coller(i, e)}
            />
          ))}
        </div>
        {erreur && <div className={s.erreur} role="alert">{erreur}</div>}
        <button className={s.bouton} type="submit" disabled={envoi}>{envoi ? "Recherche…" : "Voir ma photo"}</button>
      </form>
      <p className={s.petit}>Le code marche aussi à la borne, pour réimprimer.</p>
    </section>
  );
}

function ParEmail() {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appeler("/lien", { email });
      if (r.ok) setEnvoye(true);
      else if (r.status === 400) setErreur("Cette adresse e-mail n'est pas valide.");
      else setErreur(r.json.message ?? "Réessaie dans un instant.");
    } catch {
      setErreur("Connexion impossible. Réessaie dans un instant.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className={s.carte} aria-labelledby="titre-email">
      <h2 id="titre-email">
        Ou toutes tes photos,
        <br />
        avec ton e-mail
      </h2>
      <p>Celles que tu as déjà reçues par mail, tous lieux confondus. Pas de compte, pas de mot de passe : un lien par mail.</p>
      {envoye ? (
        <div className={s.envoye} role="status">
          <b>Regarde ta boîte mail.</b>
          Si des photos ont été envoyées à cette adresse, le lien arrive dans la minute. Il est valable 24 h.
        </div>
      ) : (
        <form onSubmit={valider}>
          <label className={s.champ} htmlFor="email">
            <span>E-mail</span>
            <input
              id="email"
              className={s.email}
              type="email"
              placeholder="prenom@exemple.fr"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {erreur && <div className={s.erreur} role="alert">{erreur}</div>}
          <button className={`${s.bouton} ${s.clair}`} type="submit" disabled={envoi}>{envoi ? "Envoi…" : "Recevoir le lien par mail"}</button>
        </form>
      )}
      <p className={s.petit}>Une photo reçue sans e-mail se retrouve avec son code.</p>
    </section>
  );
}

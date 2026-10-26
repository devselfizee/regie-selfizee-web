/**
 * Équivalent JavaScript du couple encode/decode utilisé côté PHP legacy
 * (event-selfizee-v2 — UtilitiesComponent) :
 *
 *   $slEncryption = base64_encode(base64_encode(base64_encode(serialize($data))));
 *   $slDecryption = unserialize(base64_decode(base64_decode(base64_decode($data))));
 *
 * Il ne s'agit PAS de chiffrement (aucune clé, aucune signature) : c'est de
 * l'obfuscation. N'importe qui peut décoder le paramètre — ne jamais y mettre
 * de secret, et considérer son contenu comme une entrée utilisateur.
 *
 * Le format `serialize` de PHP compte les chaînes en OCTETS (`s:10:"…"`), pas
 * en caractères UTF-16 : tout le travail se fait donc sur des « binary
 * strings » (1 char JS = 1 octet), converties depuis/vers l'UTF-8 aux
 * frontières. Sans ça, le moindre accent casserait la longueur annoncée.
 */

export type PhpValue =
  | null
  | boolean
  | number
  | string
  | PhpValue[]
  | { [key: string]: PhpValue };

export class SlCryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlCryptError";
  }
}

/* ═══════════════════════════════════════════════════════════════
   UTF-8 ↔ binary string
   ═══════════════════════════════════════════════════════════════ */

const CHUNK = 0x8000;

/** Chaîne JS (UTF-16) → binary string (1 char = 1 octet UTF-8). */
function toBinary(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

/** Binary string (1 char = 1 octet UTF-8) → chaîne JS. */
function fromBinary(bin: string): string {
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
  return new TextDecoder().decode(bytes);
}

/* ═══════════════════════════════════════════════════════════════
   serialize / unserialize
   ═══════════════════════════════════════════════════════════════ */

/** Clé de tableau PHP : une chaîne « entier canonique » devient une clé int. */
function serializeKey(key: string): string {
  if (/^(0|-?[1-9][0-9]*)$/.test(key) && Number.isSafeInteger(Number(key))) {
    return `i:${Number(key)};`;
  }
  const bin = toBinary(key);
  return `s:${bin.length}:"${bin}";`;
}

/**
 * Équivalent de `serialize()`. Retourne une binary string (les chaînes y sont
 * déjà en octets UTF-8), prête à passer dans base64.
 *
 * Types couverts : null, bool, int, float, string, array (liste et associatif).
 * Les objets PHP (`O:…`) ne sont pas produits — on n'en a pas besoin ici.
 */
export function phpSerialize(value: PhpValue): string {
  if (value === null || value === undefined) return "N;";

  switch (typeof value) {
    case "boolean":
      return `b:${value ? 1 : 0};`;

    case "number":
      if (Number.isNaN(value)) return "d:NAN;";
      if (!Number.isFinite(value)) return value > 0 ? "d:INF;" : "d:-INF;";
      if (Number.isSafeInteger(value)) return `i:${value};`;
      return `d:${value};`;

    case "string": {
      const bin = toBinary(value);
      return `s:${bin.length}:"${bin}";`;
    }

    case "object": {
      if (Array.isArray(value)) {
        let body = "";
        value.forEach((item, i) => {
          body += `i:${i};${phpSerialize(item)}`;
        });
        return `a:${value.length}:{${body}}`;
      }
      // `undefined` n'existe pas en PHP : on écarte ces clés plutôt que de
      // sérialiser un N; qui n'aurait pas été écrit côté PHP.
      const entries = Object.entries(value as Record<string, PhpValue>).filter(
        ([, v]) => v !== undefined,
      );
      let body = "";
      for (const [k, v] of entries) body += serializeKey(k) + phpSerialize(v);
      return `a:${entries.length}:{${body}}`;
    }
  }

  throw new SlCryptError(`Type non sérialisable : ${typeof value}`);
}

class Parser {
  private i = 0;
  private readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  private fail(msg: string): never {
    throw new SlCryptError(`unserialize : ${msg} (offset ${this.i})`);
  }

  private expect(char: string) {
    if (this.src[this.i] !== char) this.fail(`« ${char} » attendu`);
    this.i++;
  }

  /** Lit jusqu'au délimiteur (non consommé) et retourne le fragment. */
  private readUntil(delim: string): string {
    const end = this.src.indexOf(delim, this.i);
    if (end === -1) this.fail(`délimiteur « ${delim} » introuvable`);
    const chunk = this.src.slice(this.i, end);
    this.i = end;
    return chunk;
  }

  readValue(): PhpValue {
    const type = this.src[this.i];
    if (type === undefined) this.fail("fin de chaîne inattendue");

    switch (type) {
      case "N":
        this.i++;
        this.expect(";");
        return null;

      case "b": {
        this.i += 2; // "b:"
        const raw = this.readUntil(";");
        this.expect(";");
        return raw === "1";
      }

      case "i": {
        this.i += 2; // "i:"
        const raw = this.readUntil(";");
        this.expect(";");
        const n = Number(raw);
        if (!Number.isFinite(n)) this.fail(`entier invalide « ${raw} »`);
        return n;
      }

      case "d": {
        this.i += 2; // "d:"
        const raw = this.readUntil(";");
        this.expect(";");
        if (raw === "NAN") return NaN;
        if (raw === "INF") return Infinity;
        if (raw === "-INF") return -Infinity;
        const n = Number(raw);
        if (Number.isNaN(n)) this.fail(`flottant invalide « ${raw} »`);
        return n;
      }

      case "s": {
        this.i += 2; // "s:"
        const len = Number(this.readUntil(":"));
        if (!Number.isInteger(len) || len < 0) this.fail("longueur de chaîne invalide");
        this.expect(":");
        this.expect('"');
        // len est un nombre d'octets — on travaille sur la binary string, donc
        // 1 caractère = 1 octet et le découpage est direct.
        const bin = this.src.slice(this.i, this.i + len);
        if (bin.length !== len) this.fail("chaîne tronquée");
        this.i += len;
        this.expect('"');
        this.expect(";");
        return fromBinary(bin);
      }

      case "a": {
        this.i += 2; // "a:"
        const count = Number(this.readUntil(":"));
        if (!Number.isInteger(count) || count < 0) this.fail("taille de tableau invalide");
        this.expect(":");
        this.expect("{");
        const entries: [string | number, PhpValue][] = [];
        for (let n = 0; n < count; n++) {
          const key = this.readValue();
          if (typeof key !== "string" && typeof key !== "number") {
            this.fail("clé de tableau invalide");
          }
          entries.push([key, this.readValue()]);
        }
        this.expect("}");
        // Liste PHP (clés 0..n-1 dans l'ordre) → tableau JS ; sinon objet.
        const isList = entries.every(([k], idx) => k === idx);
        if (isList) return entries.map(([, v]) => v);
        const obj: Record<string, PhpValue> = {};
        for (const [k, v] of entries) obj[String(k)] = v;
        return obj;
      }

      case "O":
      case "C":
        this.fail("objets sérialisés non supportés");
        break;

      case "R":
      case "r":
        this.fail("références non supportées");
        break;
    }

    this.fail(`type « ${type} » inconnu`);
  }
}

/**
 * Équivalent de `unserialize()`. Attend une binary string (sortie directe de
 * base64_decode), pas une chaîne déjà décodée en UTF-8.
 */
export function phpUnserialize(input: string): PhpValue {
  const parser = new Parser(input);
  const value = parser.readValue();
  return value;
}

/* ═══════════════════════════════════════════════════════════════
   base64 ×3 (le « chiffrement » Selfizee)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Répare un base64 abîmé par le transport URL : variante base64url, `+`
 * transformé en espace par le décodage de query string, retours à la ligne,
 * padding absent.
 */
function normalizeBase64(token: string): string {
  const cleaned = token
    .trim()
    .replace(/\s/g, "+") // un espace ne peut venir que d'un « + » décodé
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = cleaned.length % 4;
  return pad === 0 ? cleaned : cleaned + "=".repeat(4 - pad);
}

/** `base64_encode(base64_encode(base64_encode(serialize($data))))` */
export function slEncrypt(data: PhpValue): string {
  return btoa(btoa(btoa(phpSerialize(data))));
}

/** `unserialize(base64_decode(base64_decode(base64_decode($data))))` */
export function slDecrypt(token: string): PhpValue {
  let raw: string;
  try {
    raw = atob(atob(atob(normalizeBase64(token))));
  } catch {
    throw new SlCryptError("Paramètre illisible (base64 invalide).");
  }
  return phpUnserialize(raw);
}

/** Variante non levante : retourne `null` au lieu de lancer. */
export function trySlDecrypt(token: string | null | undefined): PhpValue | null {
  if (!token) return null;
  try {
    return slDecrypt(token);
  } catch {
    return null;
  }
}

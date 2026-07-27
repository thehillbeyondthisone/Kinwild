import { CritterDNA } from '../creatures/schema';

/**
 * Critter DNA packed into a URL hash. base64 of UTF-8 JSON — a critter is
 * 500-1500 bytes, comfortably inside every browser's URL limit, and needs
 * no server or dependency.
 */

export function encodeDNA(dna: CritterDNA | CritterDNA[]): string {
  const json = JSON.stringify(dna);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return `${location.origin}${location.pathname}#dna=${encodeURIComponent(b64)}`;
}

/** Reads `#dna=` from the current URL. Returns [] when absent or malformed. */
export function decodeDNAFromHash(): CritterDNA[] {
  const m = location.hash.match(/[#&]dna=([^&]+)/);
  if (!m) return [];
  try {
    const bin = atob(decodeURIComponent(m[1]));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as CritterDNA | CritterDNA[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    console.warn('[share] bad #dna payload', e);
    return [];
  }
}

// Căutarea firmei la ANAF + verificarea CUI-ului. Aceeași copie e în supabase/functions/firma-cui/anaf.ts
// (Edge Functions se publică separat, fiecare cu fișierele ei).

/** CUI fără „RO”, spații sau alte caractere. */
export const cuiCurat = (v: unknown) => String(v ?? "").toUpperCase().replace(/^\s*RO/, "").replace(/\D/g, "");

/** Cifra de control a CUI-ului (cheia 753217532), 2–10 cifre. */
export function cuiValid(cui: string): boolean {
  if (!/^\d{2,10}$/.test(cui)) return false;
  const cifre = cui.slice(0, -1).padStart(9, "0").split("").map(Number);
  const cheie = [7, 5, 3, 2, 1, 7, 5, 3, 2];
  let s = 0;
  for (let i = 0; i < 9; i++) s += cifre[i] * cheie[i];
  let c = (s * 10) % 11;
  if (c === 10) c = 0;
  return c === Number(cui.slice(-1));
}

export type Firma = { cui: string; denumire: string; judet: string; localitate: string; caen: string; activa: boolean };

const titlu = (s: string) => s.toLowerCase().replace(/(^|[\s\-.(])([a-zăâîșşțţ])/g, (_, a, b) => a + b.toUpperCase());

/** Datele firmei de la ANAF. `false` = CUI inexistent, `null` = ANAF nu a răspuns. */
export async function anafFirma(cui: string): Promise<Firma | false | null> {
  const azi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
  try {
    const r = await fetch("https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui: Number(cui), data: azi }]), signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) { console.error("ANAF", r.status); return null; }
    const j = await r.json();
    const f = j?.found?.[0];
    if (!f) return false;
    const g = f.date_generale ?? {}, sed = f.adresa_sediu_social ?? {}, fisc = f.adresa_domiciliu_fiscal ?? {}, ina = f.stare_inactiv ?? {};
    const judetRaw = String(sed.sdenumire_Judet || fisc.ddenumire_Judet || "");
    const radiata = !!ina.dataRadiere || /RADIERE|RADIAT/i.test(String(g.stare_inregistrare ?? ""));
    return {
      cui,
      denumire: String(g.denumire ?? "").trim(),
      judet: /BUCURE/i.test(judetRaw) ? "București" : titlu(judetRaw),
      localitate: titlu(String(sed.sdenumire_Localitate || fisc.ddenumire_Localitate || "")),
      caen: String(g.cod_CAEN ?? "").trim(),
      activa: !ina.statusInactivi && !radiata,
    };
  } catch (e) {
    console.error("ANAF indisponibil", e);
    return null;
  }
}

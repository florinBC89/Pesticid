// Pesticid — dezabonare de la emailurile Pesticid.
//   POST { email, t }                         → din pagina agrosphere.eu/dezabonare/ (după ce omul apasă „Confirmă”)
//   POST ?email=…&t=… (List-Unsubscribe=One-Click) → butonul „Unsubscribe” din Gmail / Apple Mail (RFC 8058)
// t = HMAC-SHA256(webhook_secret, "dezabonare|" + email normalizat), primele 32 de caractere base64url — același calcul ca în `bun-venit`.
// Marchează toate rândurile cu acel email (orice plan) cu dezabonat_at; locul rezervat rămâne.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let SECRET = "";
async function secret() {
  if (SECRET) return SECRET;
  const r = await fetch(`${SB}/rest/v1/rpc/webhook_secret`, { method: "POST", headers: H, body: "{}" });
  if (r.ok) SECRET = String((await r.json()) ?? "");
  return SECRET;
}
async function token(email: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(await secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("dezabonare|" + email)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32);
}
function egal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* versiunea /pl/ a site-ului trimite limba: "pl" → mesajele pentru om vin în poloneză (codurile `error` rămân aceleași) */
const MESAJE_PL: Record<string, string> = {
  "A apărut o eroare. Încearcă din nou.": "Wystąpił błąd. Spróbuj ponownie.",
  "Acceptăm doar poze JPG, PNG și video MP4, MOV.": "Akceptujemy tylko zdjęcia JPG, PNG i filmy MP4, MOV.",
  "Adresa de email nu pare validă.": "Adres e-mail nie wygląda na prawidłowy.",
  "Ai trimis deja mai multe rapoarte. Încearcă din nou peste o oră.": "Wysłałeś już kilka zgłoszeń. Spróbuj ponownie za godzinę.",
  "Alege un subiect.": "Wybierz temat.",
  "Descrie problema în cel puțin 10 caractere.": "Opisz problem w co najmniej 10 znakach.",
  "Descrierea poate avea maxim 2000 de caractere.": "Opis może mieć maksymalnie 2000 znaków.",
  "Fișierele depășesc 50 MB în total.": "Pliki przekraczają łącznie 50 MB.",
  "Linkul de dezabonare nu e complet.": "Link do wypisania się jest niepełny.",
  "Linkul de dezabonare nu e valid. Folosește linkul din ultimul email primit.": "Link do wypisania się jest nieprawidłowy. Użyj linku z ostatniego otrzymanego e-maila.",
  "Nu am putut pregăti încărcarea. Încearcă din nou.": "Nie udało się przygotować przesyłania. Spróbuj ponownie.",
  "Nu am putut salva dezabonarea. Încearcă din nou.": "Nie udało się zapisać wypisania. Spróbuj ponownie.",
  "Prea multe fișiere într-un timp scurt. Încearcă din nou mai târziu.": "Zbyt wiele plików w krótkim czasie. Spróbuj ponownie później.",
  "Primim multe rapoarte acum. Încearcă din nou peste câteva minute.": "Otrzymujemy teraz wiele zgłoszeń. Spróbuj ponownie za kilka minut.",
  "Verificarea anti-robot nu a trecut. Reîncarcă pagina și încearcă din nou.": "Weryfikacja antyrobotowa nie powiodła się. Odśwież stronę i spróbuj ponownie.",
};
function mesajPl(m: string) {
  if (MESAJE_PL[m]) return MESAJE_PL[m];
  let x = m.match(/^Fișierul e prea mare \(max\. ([\d.,]+) MB\)\.$/); if (x) return `Plik jest za duży (maks. ${x[1]} MB).`;
  x = m.match(/^Poți atașa maxim (\d+) fișiere\.$/); if (x) return `Możesz dołączyć maksymalnie ${x[1]} plików.`;
  return m;
}
async function inLimba(res: Response, limba: unknown): Promise<Response> {
  if (limba !== "pl" || !(res.headers.get("Content-Type") ?? "").includes("application/json")) return res;
  const j = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (!j || typeof j.mesaj !== "string") return new Response(JSON.stringify(j), { status: res.status, headers: res.headers });
  return new Response(JSON.stringify({ ...j, mesaj: mesajPl(j.mesaj) }), { status: res.status, headers: res.headers });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return handle(req);
  const corp = await req.text();
  let limba: unknown = new URL(req.url).searchParams.get("limba");
  try { limba = JSON.parse(corp).limba ?? limba; } catch { /* corp gol la one-click */ }
  return inLimba(await handle(new Request(req.url, { method: "POST", headers: req.headers, body: corp })), limba);
});

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const url = new URL(req.url);
  let email = url.searchParams.get("email") ?? "", t = url.searchParams.get("t") ?? "";
  if (!email || !t) {
    try { const b = await req.json(); email = String(b.email ?? ""); t = String(b.t ?? ""); } catch { /* corp gol la one-click */ }
  }
  email = email.trim().toLowerCase();
  if (!email || email.length > 254 || !t) return json(400, { error: "date", mesaj: "Linkul de dezabonare nu e complet." });
  if (!(await secret())) return json(500, { error: "server", mesaj: "A apărut o eroare. Încearcă din nou." });
  if (!egal(t, await token(email))) return json(403, { error: "token", mesaj: "Linkul de dezabonare nu e valid. Folosește linkul din ultimul email primit." });
  const r = await fetch(`${SB}/rest/v1/lista_asteptare?email_norm=eq.${encodeURIComponent(email)}&dezabonat_at=is.null`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ dezabonat_at: new Date().toISOString() }),
  });
  if (!r.ok) return json(500, { error: "server", mesaj: "Nu am putut salva dezabonarea. Încearcă din nou." });
  return json(200, { ok: true });
}

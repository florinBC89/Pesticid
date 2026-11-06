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

Deno.serve(async (req: Request) => {
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
});

// AgroSphere — înscrierea pe lista de așteptare („Rezerv loc”).
//   POST { email, plan, sursa, ph_id, token, cui? }  → verifică tokenul Turnstile (anti-robot), apoi apelează rezerva_loc_srv
//   cu IP-ul omului (pentru limitele pe IP). Emailul de bun venit pleacă din triggerul existent pe lista_asteptare.
//   Planuri: `ferma` și `partener` (campaniile de lansare); `pro` / `agronom` rămân acceptate pentru site-ul vechi.
//   La `partener` CUI-ul e obligatoriu: verificăm cifra de control și firma la ANAF aici, pe server (nu ne bazăm pe pagină).
//   Dacă ANAF nu răspunde, rezervarea trece cu firma „neverificată” și o verificăm mai târziu.
// Secrete: TURNSTILE_SECRET (Edge Function Secrets). Fără el, înscrierile sunt refuzate (nu le lăsăm neverificate).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { anafFirma, cuiCurat, cuiValid } from "./anaf.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TS_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const GAZDE = ["agrosphere.eu", "www.agrosphere.eu", "pesticid.info", "www.pesticid.info", "florinbc89.github.io"];

const ipDin = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";

/* verificarea tokenului la Cloudflare; dacă Cloudflare nu răspunde deloc (rar), lăsăm cererea să treacă —
   limitele pe IP și pe minut rămân oricum active, iar un atacator nu poate provoca el căderea Cloudflare */
async function turnstile(token: unknown, ip: string, action: string): Promise<{ ok: boolean; coduri: string[] }> {
  if (!TS_SECRET) return { ok: false, coduri: ["secret-lipsa"] };
  const t = typeof token === "string" ? token : "";
  if (!t || t.length > 2048) return { ok: false, coduri: ["token-lipsa"] };
  const f = new FormData();
  f.append("secret", TS_SECRET); f.append("response", t); if (ip) f.append("remoteip", ip);
  let j: Record<string, unknown>;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f, signal: AbortSignal.timeout(8000) });
    j = await r.json();
  } catch (e) {
    console.error("turnstile indisponibil", e);
    return { ok: true, coduri: ["cloudflare-indisponibil"] };
  }
  const coduri = (j["error-codes"] as string[]) ?? [];
  if (!j.success) return { ok: false, coduri };
  if (j.hostname && !GAZDE.includes(String(j.hostname))) return { ok: false, coduri: ["gazda"] };
  if (j.action && j.action !== action) return { ok: false, coduri: ["action"] };
  return { ok: true, coduri };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "JSON invalid" }); }
  const email = String(b.email ?? "").trim(), plan = String(b.plan ?? "");
  if (!email || email.length > 254) return json(400, { error: "email", message: "email invalid" });
  if (!["ferma", "partener", "pro", "agronom"].includes(plan)) return json(400, { error: "plan", message: "plan invalid" });
  const cui = plan === "partener" ? cuiCurat(b.cui) : "";
  if (plan === "partener" && !cuiValid(cui)) return json(400, { error: "cui", message: "CUI-ul nu pare corect." });

  const ip = ipDin(req);
  const v = await turnstile(b.token, ip, "rezerva");
  if (!v.ok) {
    if (v.coduri.includes("secret-lipsa")) console.error("TURNSTILE_SECRET lipsă");
    return json(403, { error: "antibot", coduri: v.coduri, message: "Verificarea anti-robot nu a trecut." });
  }

  // partener: datele firmei le luăm din ANAF (firmă inexistentă sau inactivă → refuzăm)
  const firma: Record<string, string | null> = {};
  if (plan === "partener") {
    const f = await anafFirma(cui);
    if (f === false) return json(400, { error: "cui_negasit", message: "Nu am găsit firma la ANAF. Verifică CUI-ul." });
    if (f && !f.activa) return json(400, { error: "firma_inactiva", message: "Firma apare inactivă la ANAF." });
    Object.assign(firma, f ? { p_firma: f.denumire, p_judet: f.judet, p_caen: f.caen, p_anaf_stare: "activa" } : { p_anaf_stare: "neverificata" });
  }

  const r = await fetch(`${SB}/rest/v1/rpc/rezerva_loc_srv`, {
    method: "POST", headers: H,
    body: JSON.stringify({ p_email: email, p_plan: plan, p_sursa: String(b.sursa ?? "site").slice(0, 60), p_ph_id: b.ph_id ? String(b.ph_id).slice(0, 80) : null, p_ip: ip || null, ...(plan === "partener" ? { p_cui: cui, ...firma } : {}) }),
  });
  if (r.ok) return json(200, { ok: true });
  const e = await r.json().catch(() => ({})) as { message?: string; code?: string };
  const m = String(e.message ?? "");
  if (/loc deja rezervat/.test(m)) return json(409, { error: "deja_rezervat", message: "Firma are deja un loc rezervat." });
  if (/prea multe/.test(m)) return json(429, { error: "rate", message: m });
  if (/cui invalid/.test(m)) return json(400, { error: "cui", message: "CUI-ul nu pare corect." });
  if (/email invalid|plan invalid/.test(m)) return json(400, { error: "email", message: m });
  console.error("rezerva_loc_srv", r.status, m);
  return json(500, { error: "server", message: "A apărut o eroare." });
});

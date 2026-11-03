// Pesticid — trimite emailul de bun venit (Resend) după înscrierea pe lista de așteptare.
// Apelată de triggerul `trg_lista_asteptare_bun_venit` (pg_net) cu { record: { id } }, sau manual cu { id } / { id, dry: true } / { id, force: true } (retrimite chiar dacă conținutul e identic).
// Varianta după rangul pe plan: primii 100 PRO → pro-6, restul → pro-3; primii 20 AGRONOM → agronom-3, restul → agronom-45.
// Randarea e aceeași ca în emails/build.py (template.html + variants.json), ca să nu existe două versiuni ale emailurilor.
// Idempotentă: nu retrimite dacă rândul are `trimis_at`; Resend primește și un Idempotency-Key per rând.
// Secrete: RESEND_API_KEY; webhook_secret în Vault; opționale: EMAIL_FROM, EMAIL_REPLY_TO, EMAIL_ASSETS_URL, SITE_URL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import spec from "./variants.json" with { type: "json" };
import TEMPLATE from "./template.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
// secretul webhook-ului stă într-un singur loc: Vault (vault.webhook_secret), citit prin rpc-ul `webhook_secret` (doar service_role)
let WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const FROM = Deno.env.get("EMAIL_FROM") ?? "Pesticid <bun-venit@pesticid.info>";
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "";
const ASSETS = (Deno.env.get("EMAIL_ASSETS_URL") ?? "https://rpwmfhlmdscjpcrqqmyf.supabase.co/storage/v1/object/public/emails").replace(/\/$/, "");
const SITE = (Deno.env.get("SITE_URL") ?? "https://pesticid.info").replace(/\/$/, "");
const FONT = "Arial,Helvetica,sans-serif";
// numele fișierelor din bucket-ul Storage „emails” diferă de cele din șablon (urcate manual)
const ASSET_MAP: Record<string, string> = { "logo.png": "Logo-Pesticid.png", "icon-date.png": "date.png", "linkedin.png": "Linkedin.png", "twitter.png": "Twitter.png", "calc.png": "calculator.png", "hero-camp.jpg": "Hero newsletter image.jpg", "hero-vie.jpg": "Second image from newsletter.jpg",
  // dark theme (afișate doar de clienții cu prefers-color-scheme: dark / Outlook data-ogsc)
  "logo-white.png": "Logo-Pesticid-white.png", "twitter-white.png": "Twitter-white.png", "linkedin-white.png": "Linkedin-white.png", "footer-dark.jpg": "Footer-image-dark.jpg" };

type Row = { id: number; email: string; plan: string; trimis_at: string | null };
type Variant = Record<string, string | number | null> & { id: string; plan: string; rang_max: number | null; subject: string; bullets: string };
const VARIANTS = spec.variants as Variant[];
const CFG = spec.config as Record<string, string>;
const BULLETS = spec.bullets as Record<string, string[]>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const strong = (html: string, color = "#111111") =>
  html.replaceAll("<b>", `<strong style="font-weight:600;color:${color};">`).replaceAll("</b>", "</strong>");
function bulletRows(items: string[]) {
  return items.map((t) =>
    `        <tr><td width="22" valign="top" style="padding:5px 10px 5px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="22" height="22" align="center" valign="middle" bgcolor="#ceee58" style="background-color:#ceee58;border-radius:11px;font-family:${FONT};font-size:12px;line-height:22px;font-weight:600;color:#111111;">&#10003;</td></tr></table></td><td valign="top" style="padding:5px 0;font-family:${FONT};font-size:16px;line-height:24px;font-weight:400;color:#111111;">${strong(t)}</td></tr>`
  ).join("\n");
}
function render(variant: Variant, email: string): string {
  const v: Record<string, string> = { ...CFG };
  for (const k of Object.keys(variant)) v[k] = String(variant[k] ?? "");
  v.assets_url = ASSETS; v.site_url = SITE; v.calc_url = `${SITE}/#calculator`;
  v.email = esc(email); v.unsubscribe_url = `${SITE}/dezabonare?email=${encodeURIComponent(email)}`;
  v.bullets = bulletRows(BULLETS[variant.bullets]);
  for (const k of ["intro", "second_headline", "second_text", "offer_calc"]) v[k] = strong(v[k]);
  const sub = (_: string, key: string) => { if (!(key in v)) throw new Error(`token necunoscut în template: ${key}`); return v[key]; };
  let html = TEMPLATE.replace(/\{\{(\w+)\}\}/g, sub).replace(/\{\{(\w+)\}\}/g, sub);
  for (const [a, b] of Object.entries(ASSET_MAP)) html = html.replaceAll(`${ASSETS}/${a}`, `${ASSETS}/${encodeURIComponent(b)}`);
  return html;
}
function alegeVarianta(plan: string, rang: number): Variant {
  const ale = VARIANTS.filter((x) => x.plan === plan);
  return ale.find((x) => x.rang_max != null && rang <= x.rang_max) ?? ale.find((x) => x.rang_max == null) ?? VARIANTS[0];
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, Prefer: "return=representation", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`REST ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function loadSecret() {
  if (WEBHOOK_SECRET) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/webhook_secret`, { method: "POST", headers: H, body: "{}" });
  if (r.ok) WEBHOOK_SECRET = String(await r.json() ?? "").replace(/^"|"$/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  await loadSecret();
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) return json(401, { error: "unauthorized" });

  let body: { id?: number; record?: { id?: number }; dry?: boolean; force?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalid" }); }
  const id = Number(body.id ?? body.record?.id);
  if (!id) return json(400, { error: "id lipsă" });

  const rows: Row[] = await rest(`lista_asteptare?id=eq.${id}&select=id,email,plan,trimis_at`);
  const row = rows[0];
  if (!row) return json(404, { error: "rând inexistent" });
  if (row.trimis_at) return json(200, { skipped: "deja trimis", id });

  // rangul pe plan = câți s-au înscris pe același plan până la (și inclusiv) acest rând
  const cnt = await fetch(`${SUPABASE_URL}/rest/v1/lista_asteptare?plan=eq.${encodeURIComponent(row.plan)}&id=lte.${row.id}&select=id`, {
    headers: { ...H, Prefer: "count=exact", Range: "0-0" },
  });
  const rang = Number((cnt.headers.get("content-range") ?? "0/1").split("/")[1]) || 1;
  const variant = alegeVarianta(row.plan, rang);
  const html = render(variant, row.email);
  if (body.dry) return json(200, { id, rang, varianta: variant.id, subject: variant.subject, html_length: html.length, dry: true });
  if (!RESEND_KEY) return json(500, { error: "RESEND_API_KEY lipsă" });

  // cheia de idempotență depinde de conținut: același email nu pleacă de două ori, dar o versiune nouă a șablonului poate fi retrimisă
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html)))).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `bun-venit/${row.id}/${digest}${body.force ? "/" + Date.now() : ""}` },
    body: JSON.stringify({
      from: FROM, to: [row.email], subject: variant.subject, html,
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      headers: { "List-Unsubscribe": `<${SITE}/dezabonare?email=${encodeURIComponent(row.email)}>` },
      tags: [{ name: "tip", value: "bun-venit" }, { name: "varianta", value: variant.id }, { name: "plan", value: row.plan }],
    }),
  });
  const res = await send.json().catch(() => ({}));
  if (!send.ok) {
    await rest(`lista_asteptare?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ varianta: variant.id, rang, eroare: `${send.status}: ${JSON.stringify(res).slice(0, 300)}` }) });
    return json(502, { error: "Resend", status: send.status, res });
  }
  await rest(`lista_asteptare?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ varianta: variant.id, rang, trimis_at: new Date().toISOString(), resend_id: res.id ?? null, eroare: null }) });
  return json(200, { id, rang, varianta: variant.id, resend_id: res.id ?? null });
});

// Pesticid — primește webhook-urile Resend (livrat, click, respins, reclamat) și le trimite în PostHog ca `onb_email_*`,
// legate de sesiunea anonimă de pe site prin `ph_id` din lista_asteptare (distinct_id). Marchează și rândul din listă.
// Secrete: RESEND_WEBHOOK_SECRET (Signing secret din Resend → Webhooks), POSTHOG_KEY (Project API key, phc_…), opțional POSTHOG_HOST.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WH_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
const PH_KEY = Deno.env.get("POSTHOG_KEY") ?? "";
const PH_HOST = (Deno.env.get("POSTHOG_HOST") ?? "https://eu.i.posthog.com").replace(/\/$/, "");
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/* semnătura Svix: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)), secretul e base64 după prefixul whsec_ */
async function verify(req: Request, body: string): Promise<boolean> {
  if (!WH_SECRET) return false;
  const id = req.headers.get("svix-id") ?? "", ts = req.headers.get("svix-timestamp") ?? "", sigs = req.headers.get("svix-signature") ?? "";
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  // secretul poate fi lipit cu ghilimele, spații sau în varianta base64url; îl normalizăm înainte de decodare
  const b64 = WH_SECRET.trim().replace(/^["']|["']$/g, "").replace(/^whsec_/, "").replace(/-/g, "+").replace(/_/g, "/");
  let raw: Uint8Array;
  try { raw = Uint8Array.from(atob(b64 + "=".repeat((4 - b64.length % 4) % 4)), (c) => c.charCodeAt(0)); } catch { console.error("RESEND_WEBHOOK_SECRET nu e base64 valid"); return false; }
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sigs.split(" ").some((s) => s.split(",")[1] === expected);
}

const MAP: Record<string, string> = {
  "email.delivered": "onb_email_delivered", "email.clicked": "onb_email_clicked", "email.bounced": "onb_email_bounced",
  "email.complained": "onb_email_complained", "email.delivery_delayed": "onb_email_delayed",
};
const COL: Record<string, string> = { "email.delivered": "livrat_at", "email.clicked": "click_at", "email.bounced": "respins_at", "email.complained": "respins_at" };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const body = await req.text();
  if (!(await verify(req, body))) return json(401, { error: "semnătură invalidă" });
  let ev: { type: string; created_at?: string; data?: { email_id?: string; to?: string[]; tags?: Record<string, string>; click?: { link?: string }; bounce?: { type?: string } } };
  try { ev = JSON.parse(body); } catch { return json(400, { error: "JSON invalid" }); }
  const name = MAP[ev.type];
  if (!name) return json(200, { ignored: ev.type });
  const emailId = ev.data?.email_id ?? "";

  // deduplicare: Svix poate relivra același eveniment; id-ul lui e unic
  const svixId = req.headers.get("svix-id") ?? "";
  const dup = await fetch(`${SUPABASE_URL}/rest/v1/resend_webhook_ids?on_conflict=id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ id: svixId }),
  });
  if (dup.ok && (await dup.json()).length === 0) return json(200, { duplicate: svixId });

  // rândul din listă, după id-ul Resend
  const r = await fetch(`${SUPABASE_URL}/rest/v1/lista_asteptare?resend_id=eq.${encodeURIComponent(emailId)}&select=id,plan,varianta,ph_id`, { headers: H });
  const rows = r.ok ? await r.json() : [];
  const row = rows[0] ?? null;
  const col = COL[ev.type];
  if (row && col) {
    await fetch(`${SUPABASE_URL}/rest/v1/lista_asteptare?id=eq.${row.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ [col]: ev.created_at ?? new Date().toISOString(), ...(ev.type === "email.bounced" ? { eroare: `bounce: ${ev.data?.bounce?.type ?? ""}` } : {}) }) });
  }

  if (PH_KEY) {
    const distinct = row?.ph_id || `resend:${emailId}`;
    const link = ev.data?.click?.link ?? null;
    await fetch(`${PH_HOST}/i/v0/e/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: PH_KEY, event: name, distinct_id: distinct, timestamp: ev.created_at,
        properties: { source: "email", email_no: 1, tip: "bun-venit", plan: row?.plan ?? ev.data?.tags?.plan ?? null, varianta: row?.varianta ?? ev.data?.tags?.varianta ?? null, link, resend_id: emailId, $process_person_profile: !!row?.ph_id },
      }),
    });
  }
  return json(200, { ok: true, event: name, lista_id: row?.id ?? null });
});

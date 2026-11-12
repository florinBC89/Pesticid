// Pesticid — „Raportează o problemă” din site.
// Acțiuni (POST, JSON):
//   { action: "url", draft, nume, tip, marime }        → link semnat de upload în bucket-ul privat `rapoarte` (browserul urcă direct)
//   { action: "sterge", draft, path }                  → șterge un fișier atașat din ciornă (omul a apăsat ×)
//   { action: "trimite", draft, email, subiect, descriere, fisiere: [path], context, ph_id, hp, token }   (token = Turnstile, verificat la Cloudflare)
//                                                      → verifică fișierele (mărime + primii octeți), salvează raportul,
//                                                        trimite emailul (Resend) și adaugă un rând în Google Sheet
//   { action: "curata" } + x-webhook-secret            → pg_cron zilnic: șterge ciornele abandonate (>1 zi) și fișierele rapoartelor (>90 zile)
// Limite: max 5 fișiere, 50 MB în total; JPG/PNG max 10 MB, MP4/MOV max 20 MB.
// Secrete: RESEND_API_KEY (deja setat), TURNSTILE_SECRET; în Vault: webhook_secret, gsheet_url, gsheet_token (opțional; fără ele nu scrie în Sheet).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const TS_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";
const TO = Deno.env.get("RAPORT_TO") ?? "bostan.florin89@gmail.com";
const FROM = Deno.env.get("RAPORT_FROM") ?? "AgroSphere · Rapoarte <rapoarte@agrosphere.eu>";
const BUCKET = "rapoarte";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info" };

const MB = 1024 * 1024;
const MAX_FILES = 5, MAX_TOTAL = 50 * MB, MAX_IMG = 10 * MB, MAX_VID = 20 * MB;
const TIPURI: Record<string, "img" | "vid"> = { "image/jpeg": "img", "image/png": "img", "video/mp4": "vid", "video/quicktime": "vid" };
const EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4", mov: "video/quicktime" };
const SUBIECTE: Record<string, string> = {
  calculator: "Calculatorul de doză", cautare: "Căutarea de produse", date: "O doză sau un produs pare greșit",
  inscriere: "Înscrierea / emailul", altceva: "Altceva",
};
const LINK_ZILE = 90; // linkurile din email și din Sheet țin cât timp păstrăm fișierele

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[a-z]{2,}$/i;
// textul care începe cu = + - @ (sau tab/CR) ar fi interpretat de Google Sheets ca formulă → îl forțăm text cu apostrof
const celula = (v: unknown) => { const t = String(v ?? ""); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
/* text liber venit din browser: fără caractere de control / invizibile / de inversare a direcției (pot ascunde linkuri
   sau extensii de fișier), fără zeci de rânduri goale; NFC ca diacriticele să arate la fel peste tot */
const interval = (r: number[][]) => r.map(([a, b]) => String.fromCharCode(a) + "-" + String.fromCharCode(b)).join("");
const INVIZIBILE = new RegExp("[" + interval([[0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x2069], [0x2028, 0x2029], [0xfeff, 0xfeff], [0xad, 0xad]]) + "]", "g");
const CONTROL = new RegExp("[" + interval([[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f]]) + "]", "g");
const SPATIU_LA_CAPAT = new RegExp("[ " + String.fromCharCode(0xa0) + "]+\n", "g");
function curata(v: unknown, max: number, multiline = true) {
  let t = String(v ?? "").normalize("NFC").replace(INVIZIBILE, "").replace(/\r\n?/g, "\n").replace(CONTROL, "");
  t = multiline ? t.replace(/\t/g, " ").replace(SPATIU_LA_CAPAT, "\n").replace(/\n{3,}/g, "\n\n") : t.replace(/\s+/g, " ");
  return t.trim().slice(0, max);
}
/* linkurile din text nu mai sunt clickabile în Gmail / Sheets: https://site.com → hxxps://site[.]com */
const dezarmeaza = (t: string) => t
  .replace(/\b(h)(ttps?:\/\/)/gi, (_m, h, rest) => `${h}xx${rest.slice(2)}`)
  .replace(/\b((?:[a-z0-9-]+\.)+[a-z]{2,24})\b/gi, (m) => m.replace(/\./g, "[.]"));
const fmtMB = (b: number) => (b / MB).toLocaleString("ro-RO", { maximumFractionDigits: 1 }) + " MB";

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, Prefer: "return=representation", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`REST ${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function count(path: string) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
  return Number((r.headers.get("content-range") ?? "0/0").split("/")[1]) || 0;
}
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${SB}/rest/v1/rpc/${name}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  return r.ok ? String((await r.json()) ?? "") : "";
}
async function ipHash(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|pesticid-rapoarte"));
  return Array.from(new Uint8Array(d)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const since = (min: number) => new Date(Date.now() - min * 60000).toISOString();

function tipDin(nume: string, tip: string) {
  if (TIPURI[tip]) return tip;
  const ext = (nume.split(".").pop() ?? "").toLowerCase();
  return EXT[ext] ?? "";
}
const DIACRITICE = new RegExp("[" + interval([[0x0300, 0x036f]]) + "]", "g");
function numeSigur(nume: string) {
  const base = nume.normalize("NFD").replace(DIACRITICE, "").toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || "fisier").slice(-60);
}

/* primii octeți ai fișierului urcat: verificăm că e chiar JPG / PNG / MP4 / MOV, nu doar că așa pretinde numele */
async function inspecteaza(path: string): Promise<{ marime: number; ok: boolean }> {
  const r = await fetch(`${SB}/storage/v1/object/authenticated/${BUCKET}/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: "bytes=0-15" } });
  if (!r.ok && r.status !== 206) return { marime: 0, ok: false };
  const b = new Uint8Array(await r.arrayBuffer());
  const total = Number((r.headers.get("content-range") ?? "").split("/")[1]) || Number(r.headers.get("content-length")) || b.length;
  const s = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && s(1, 3) === "PNG";
  const vid = ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(s(4, 4));
  return { marime: total, ok: jpg || png || vid };
}
async function semneaza(path: string) {
  const r = await fetch(`${SB}/storage/v1/object/sign/${BUCKET}/${path}`, { method: "POST", headers: H, body: JSON.stringify({ expiresIn: LINK_ZILE * 86400 }) });
  if (!r.ok) return "";
  const j = await r.json();
  return j.signedURL ? `${SB}/storage/v1${j.signedURL}` : "";
}
async function stergeObiecte(paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    await fetch(`${SB}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }) });
  }
}

/* ---------------------------------------------------------------- acțiuni */
async function actUrl(req: Request, b: Record<string, unknown>) {
  if (!isUuid(b.draft)) return json(400, { error: "draft" });
  const nume = curata(b.nume, 200, false) || "fisier", marime = Number(b.marime) || 0;
  const tip = tipDin(nume, String(b.tip ?? ""));
  if (!tip) return json(400, { error: "tip", mesaj: "Acceptăm doar poze JPG, PNG și video MP4, MOV." });
  const max = TIPURI[tip] === "img" ? MAX_IMG : MAX_VID;
  if (marime <= 0 || marime > max) return json(400, { error: "marime", mesaj: `Fișierul e prea mare (max. ${max / MB} MB).` });
  const ip = await ipHash(req);
  if (await count(`rapoarte_fisiere?ip_hash=eq.${ip}&creat_at=gte.${since(60)}&select=path`) >= 40) return json(429, { error: "rate", mesaj: "Prea multe fișiere într-un timp scurt. Încearcă din nou mai târziu." });
  const existente: { marime: number }[] = await rest(`rapoarte_fisiere?draft=eq.${b.draft}&sters_at=is.null&raport_id=is.null&select=marime`);
  if (existente.length >= MAX_FILES) return json(400, { error: "prea_multe", mesaj: `Poți atașa maxim ${MAX_FILES} fișiere.` });
  if (existente.reduce((s, f) => s + Number(f.marime), 0) + marime > MAX_TOTAL) return json(400, { error: "total", mesaj: "Fișierele depășesc 50 MB în total." });
  const path = `${b.draft}/${Date.now().toString(36)}-${numeSigur(nume)}`;
  const s = await fetch(`${SB}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: H, body: "{}" });
  if (!s.ok) return json(502, { error: "storage", mesaj: "Nu am putut pregăti încărcarea. Încearcă din nou." });
  const { url } = await s.json();
  await rest("rapoarte_fisiere", { method: "POST", body: JSON.stringify({ path, draft: b.draft, nume, tip, marime, ip_hash: ip }) });
  return json(200, { path, url: `${SB}/storage/v1${url}`, tip });
}

async function actSterge(b: Record<string, unknown>) {
  if (!isUuid(b.draft) || typeof b.path !== "string" || !b.path.startsWith(`${b.draft}/`)) return json(400, { error: "path" });
  const rows = await rest(`rapoarte_fisiere?path=eq.${encodeURIComponent(b.path)}&draft=eq.${b.draft}&raport_id=is.null&select=path`);
  if (!rows.length) return json(200, { ok: true });
  await stergeObiecte([b.path]);
  await rest(`rapoarte_fisiere?path=eq.${encodeURIComponent(b.path)}`, { method: "PATCH", body: JSON.stringify({ sters_at: new Date().toISOString() }) });
  return json(200, { ok: true });
}

const GAZDE = ["agrosphere.eu", "www.agrosphere.eu", "pesticid.info", "www.pesticid.info", "florinbc89.github.io"];

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

async function actTrimite(req: Request, b: Record<string, unknown>) {
  if (b.hp) return json(200, { ok: true, nr: "000000" }); // câmpul ascuns e completat doar de roboți
  const email = curata(b.email, 254, false), subiect = String(b.subiect ?? ""), descriere = curata(b.descriere, 2000);
  if (!EMAIL_RE.test(email) || email.length > 254) return json(400, { error: "email", mesaj: "Adresa de email nu pare validă." });
  if (!SUBIECTE[subiect]) return json(400, { error: "subiect", mesaj: "Alege un subiect." });
  if (descriere.length < 10) return json(400, { error: "descriere", mesaj: "Descrie problema în cel puțin 10 caractere." });
  if (String(b.descriere ?? "").length > 2000) return json(400, { error: "descriere", mesaj: "Descrierea poate avea maxim 2000 de caractere." });
  const v = await turnstile(b.token, (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(), "raport");
  if (!v.ok) {
    if (v.coduri.includes("secret-lipsa")) console.error("TURNSTILE_SECRET lipsă");
    return json(403, { error: "antibot", coduri: v.coduri, mesaj: "Verificarea anti-robot nu a trecut. Reîncarcă pagina și încearcă din nou." });
  }
  const ip = await ipHash(req);
  if (await count(`rapoarte_probleme?ip_hash=eq.${ip}&creat_at=gte.${since(60)}&select=id`) >= 5) return json(429, { error: "rate", mesaj: "Ai trimis deja mai multe rapoarte. Încearcă din nou peste o oră." });
  if (await count(`rapoarte_probleme?creat_at=gte.${since(60)}&select=id`) >= 60) return json(429, { error: "rate", mesaj: "Primim multe rapoarte acum. Încearcă din nou peste câteva minute." });

  // fișierele: doar cele urcate în ciorna acestui formular, verificate pe server
  const cerute = Array.isArray(b.fisiere) ? (b.fisiere as unknown[]).filter((p) => typeof p === "string").slice(0, MAX_FILES) as string[] : [];
  let fisiere: { path: string; nume: string; tip: string; marime: number }[] = [];
  if (cerute.length) {
    if (!isUuid(b.draft)) return json(400, { error: "draft" });
    const rows: { path: string; nume: string; tip: string }[] = await rest(`rapoarte_fisiere?draft=eq.${b.draft}&sters_at=is.null&raport_id=is.null&select=path,nume,tip`);
    const respinse: string[] = [];
    for (const r of rows.filter((r) => cerute.includes(r.path))) {
      const i = await inspecteaza(r.path);
      const max = TIPURI[r.tip] === "img" ? MAX_IMG : MAX_VID;
      if (i.ok && i.marime > 0 && i.marime <= max) fisiere.push({ ...r, marime: i.marime }); else respinse.push(r.path);
    }
    let total = 0;
    fisiere = fisiere.filter((f) => (total += f.marime) <= MAX_TOTAL || (respinse.push(f.path), false));
    if (respinse.length) { await stergeObiecte(respinse); await rest(`rapoarte_fisiere?path=in.(${respinse.map((p) => `"${p}"`).join(",")})`, { method: "PATCH", body: JSON.stringify({ sters_at: new Date().toISOString() }) }); }
  }

  const ctx = (b.context && typeof b.context === "object" ? b.context : {}) as Record<string, unknown>;
  const context: Record<string, string> = {};
  for (const k of ["pagina", "dispozitiv", "ecran", "limba", "tab", "produs", "cultura", "tinta", "doza", "suprafata", "apa"]) if (ctx[k] != null && ctx[k] !== "") { const v = curata(ctx[k], 300, false); if (v) context[k] = v; }
  const [raport] = await rest("rapoarte_probleme", { method: "POST", body: JSON.stringify({ email, subiect, descriere, context, ip_hash: ip, ph_id: b.ph_id ? String(b.ph_id).slice(0, 80) : null }) });
  if (fisiere.length) await rest(`rapoarte_fisiere?path=in.(${fisiere.map((f) => `"${f.path}"`).join(",")})`, { method: "PATCH", body: JSON.stringify({ raport_id: raport.id }) });
  const linkuri = await Promise.all(fisiere.map(async (f) => ({ ...f, url: await semneaza(f.path) })));

  const erori: string[] = [];
  const upd: Record<string, unknown> = {};
  // 1. emailul către echipă (Reply = răspunzi direct omului)
  try {
    if (!RESEND_KEY) throw new Error("RESEND_API_KEY lipsă");
    const randuri = [["Nr. raport", `#${raport.nr}`], ["Subiect", SUBIECTE[subiect]], ["Email", email], ...Object.entries(context).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), k === "pagina" ? v : dezarmeaza(v)])];
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#111;max-width:640px">
<h2 style="margin:0 0 12px;font-size:20px">Problemă raportată · ${esc(SUBIECTE[subiect])}</h2>
<div style="white-space:pre-wrap;background:#f0f4fe;border-radius:12px;padding:14px 16px;margin-bottom:16px">${esc(dezarmeaza(descriere))}</div>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">${randuri.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5a6478;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;vertical-align:top">${esc(v)}</td></tr>`).join("")}</table>
${linkuri.length ? `<h3 style="margin:20px 0 8px;font-size:16px">Fișiere atașate (${linkuri.length})</h3>${linkuri.map((f) => `<div style="margin:0 0 10px">${TIPURI[f.tip] === "img" && f.url ? `<a href="${esc(f.url)}"><img src="${esc(f.url)}" width="160" alt="" style="display:block;max-width:160px;border-radius:8px;margin-bottom:4px"></a>` : ""}<a href="${esc(f.url)}" style="color:#111">${esc(f.nume)}</a> <span style="color:#5a6478">· ${fmtMB(f.marime)}</span></div>`).join("")}<p style="color:#5a6478;font-size:12px">Linkurile sunt private și funcționează ${LINK_ZILE} de zile; apoi fișierele se șterg automat.</p>` : ""}
</div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `raport/${raport.id}` },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: email, subject: `[AgroSphere #${raport.nr}] ${SUBIECTE[subiect]}: ${dezarmeaza(descriere).replace(/\s+/g, " ").slice(0, 60)}`, html, tags: [{ name: "tip", value: "raport-problema" }, { name: "subiect", value: subiect }] }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    upd.trimis_at = new Date().toISOString();
  } catch (e) { erori.push(String((e as Error).message ?? e)); }

  // 2. rândul din Google Sheet (Apps Script web app); fără URL configurat se sare peste
  try {
    const url = await rpc("config_secret", { p_name: "gsheet_url" });
    if (url) {
      const token = await rpc("config_secret", { p_name: "gsheet_token" });
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow",
        body: JSON.stringify(Object.fromEntries(Object.entries({
          nr: `#${raport.nr}`, data: new Date(raport.creat_at).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" }),
          subiect: SUBIECTE[subiect], status: "Nou", email, descriere: dezarmeaza(descriere),
          fisiere: linkuri.length, linkuri: linkuri.map((f) => f.url).join("\n"),
          pagina: context.pagina ?? "", dispozitiv: context.dispozitiv ?? "", ecran: context.ecran ?? "",
          produs: context.produs ?? "", cultura: context.cultura ?? "", tinta: context.tinta ?? "", doza: context.doza ?? "",
        }).map(([k, v]) => [k, typeof v === "string" ? celula(v) : v]).concat([["token", token]]))),
      });
      const t = await r.text();
      if (!r.ok || !/^ok/.test(t.trim())) throw new Error(`Sheet ${r.status}: ${t.slice(0, 120)}`);
      upd.sheet_at = new Date().toISOString();
    }
  } catch (e) { erori.push(String((e as Error).message ?? e)); }

  if (erori.length) upd.eroare = erori.join(" | ").slice(0, 500);
  if (Object.keys(upd).length) await rest(`rapoarte_probleme?id=eq.${raport.id}`, { method: "PATCH", body: JSON.stringify(upd) });
  return json(200, { ok: true, nr: raport.nr, fisiere: fisiere.length });
}

async function actCurata(req: Request) {
  const secret = await rpc("webhook_secret");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return json(401, { error: "unauthorized" });
  const azi = new Date().toISOString();
  const orfane: { path: string }[] = await rest(`rapoarte_fisiere?raport_id=is.null&sters_at=is.null&creat_at=lt.${since(24 * 60)}&select=path&limit=1000`);
  const vechi: { path: string }[] = await rest(`rapoarte_fisiere?raport_id=not.is.null&sters_at=is.null&creat_at=lt.${since(90 * 24 * 60)}&select=path&limit=1000`);
  const toate = [...orfane, ...vechi].map((r) => r.path);
  if (toate.length) {
    await stergeObiecte(toate);
    for (let i = 0; i < toate.length; i += 100) await rest(`rapoarte_fisiere?path=in.(${toate.slice(i, i + 100).map((p) => `"${p}"`).join(",")})`, { method: "PATCH", body: JSON.stringify({ sters_at: azi }) });
  }
  return json(200, { ok: true, orfane: orfane.length, vechi: vechi.length });
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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "JSON invalid" }); }
  try {
    switch (b.action) {
      case "url": return await inLimba(await actUrl(req, b), b.limba);
      case "sterge": return await actSterge(b);
      case "trimite": return await inLimba(await actTrimite(req, b), b.limba);
      case "curata": return await actCurata(req);
      default: return json(400, { error: "action" });
    }
  } catch (e) {
    console.error(e);
    return json(500, { error: "server", mesaj: "A apărut o eroare. Încearcă din nou." });
  }
});

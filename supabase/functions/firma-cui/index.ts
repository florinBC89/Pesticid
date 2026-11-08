// AgroSphere — caută firma după CUI pentru formularul „Primii 30 de parteneri fondatori” (varianta A din Figma).
//   POST { cui } → { gasit, cui, denumire, judet, localitate, caen, activa, deja_rezervat }
//   - cifra de control se verifică întâi (același calcul ca în pagină); dacă nu se potrivește → 400 { error: "control" }
//   - datele vin din serviciul public ANAF (PlatitorTvaRest v9); dacă ANAF nu răspunde → 200 { indisponibil: true }
//   - deja_rezervat: firma are deja un loc de partener (nu spunem cine l-a rezervat)
// Fără secrete în afară de cheia service_role (pentru partener_cui_rezervat).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { anafFirma, cuiCurat, cuiValid } from "./anaf.ts";

const SB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function dejaRezervat(cui: string): Promise<boolean> {
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/partener_cui_rezervat`, {
      method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_cui: cui }), signal: AbortSignal.timeout(5000),
    });
    return r.ok ? (await r.json()) === true : false;
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json(400, { error: "JSON invalid" }); }
  const cui = cuiCurat(b.cui);
  if (!cuiValid(cui)) return json(400, { error: "control", message: "CUI-ul nu pare corect." });

  const [firma, deja] = await Promise.all([anafFirma(cui), dejaRezervat(cui)]);
  if (firma === null) return json(200, { cui, indisponibil: true, deja_rezervat: deja });
  if (firma === false) return json(200, { cui, gasit: false, deja_rezervat: deja });
  return json(200, { ...firma, gasit: true, deja_rezervat: deja });
});

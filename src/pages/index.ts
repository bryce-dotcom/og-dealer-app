import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function decodeVIN(vin: string) {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
    const data = await res.json();
    const get = (name: string) => data.Results?.find((r: any) => r.Variable === name)?.Value || "";
    return { year: get("Model Year"), make: get("Make"), model: get("Model"), trim: get("Trim"), body: get("Body Class"), drive: get("Drive Type") };
  } catch (e) { return null; }
}

async function getMarketValue(year: string, make: string, model: string, miles = 80000) {
  const baseValues: Record<string, number> = {
    "Toyota": 28000, "Honda": 26000, "Ford": 25000, "Chevrolet": 24000, "Nissan": 22000,
    "Hyundai": 21000, "Kia": 20000, "BMW": 35000, "Mercedes-Benz": 38000, "Audi": 34000,
    "Lexus": 36000, "Jeep": 27000, "Ram": 32000, "GMC": 30000, "Subaru": 25000,
    "Mazda": 24000, "Volkswagen": 23000, "Alfa Romeo": 38000, "Dodge": 26000, "Buick": 27000,
  };
  const base = baseValues[make] || 24000;
  const age = new Date().getFullYear() - parseInt(year);
  const dep = Math.min(0.80, age * 0.11 + (miles / 140000) * 0.25);
  const est = Math.round(base * (1 - dep));
  return { est, low: Math.round(est * 0.88), high: Math.round(est * 1.12) };
}

async function getWeather() {
  try {
    const res = await fetch("https://wttr.in/Bluffdale+UT?format=%C+%t");
    if (res.ok) return await res.text();
  } catch (e) {}
  return null;
}

async function getInventoryInsights(dealerId: number) {
  const { data } = await supabase.from("inventory").select("*").eq("dealer_id", dealerId);
  if (!data?.length) return null;
  const makes = data.reduce((a: any, v: any) => { a[v.make] = (a[v.make] || 0) + 1; return a; }, {});
  const avgDays = Math.round(data.reduce((s: number, v: any) => s + Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86400000), 0) / data.length);
  const stale = data.filter((v: any) => Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86400000) > 45).length;
  return { count: data.length, makes, avgDays, stale };
}

async function getBestSellers(dealerId: number) {
  const { data } = await supabase.from("deals").select("*, inventory(make, model)").eq("dealer_id", dealerId);
  if (!data?.length) return null;
  const makes: Record<string, number> = {};
  data.forEach((d: any) => { const m = d.inventory?.make; if (m) makes[m] = (makes[m] || 0) + 1; });
  return Object.entries(makes).sort((a, b) => b[1] - a[1]).slice(0, 3);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, context } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("Missing API key");

    const q = message.toLowerCase();
    const dealerId = context?.dealer_id || 1;
    let data = "";

    // VIN
    const vin = message.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0];
    if (vin) {
      const v = await decodeVIN(vin);
      if (v) {
        const val = await getMarketValue(v.year, v.make, v.model, 80000);
        data += `\n[VIN ${vin}] ${v.year} ${v.make} ${v.model} ${v.trim} | ${v.body}, ${v.drive} | Value: $${val.low.toLocaleString()}-$${val.high.toLocaleString()}`;
      }
    }

    // Year Make Model
    const ymm = message.match(/(\d{4})\s+(\w+)\s+(\w+)/i);
    if (ymm && (q.includes("worth") || q.includes("value") || q.includes("price") || q.includes("research") || q.includes("buy"))) {
      const val = await getMarketValue(ymm[1], ymm[2], ymm[3], 80000);
      data += `\n[Market] ${ymm[1]} ${ymm[2]} ${ymm[3]} est. $${val.est.toLocaleString()} (range: $${val.low.toLocaleString()}-$${val.high.toLocaleString()})`;
    }

    // Weather
    if (q.includes("weather") || q.includes("outside") || q.includes("cold") || q.includes("hot")) {
      const w = await getWeather();
      if (w) data += `\n[Weather] Bluffdale: ${w}`;
    }

    // Inventory
    if (q.includes("inventory") || q.includes("stock") || q.includes("lot") || q.includes("cars")) {
      const ins = await getInventoryInsights(dealerId);
      if (ins) data += `\n[Inventory] ${ins.count} vehicles | Avg ${ins.avgDays} days on lot | ${ins.stale} over 45 days | Top: ${Object.entries(ins.makes).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}(${v})`).join(", ")}`;
    }

    // Best sellers
    if (q.includes("sell") || q.includes("best") || q.includes("moving") || q.includes("hot")) {
      const best = await getBestSellers(dealerId);
      if (best) data += `\n[Top Sellers] ${best.map(([m, c]) => `${m}: ${c}`).join(", ")}`;
    }

    const systemPrompt = `You're O.G. Arnie - 24 years running O.G. DiX Motor Club in Utah. You're the team's secret weapon.

VOICE:
- Quick, warm, confident. Like a favorite uncle who happens to be a business genius.
- SHORT responses. 1-2 sentences usually. 3 max unless they need detail.
- Never narrate actions. No asterisks. No "let me check" - just answer.
- Say "O.G." not "OG"
- Call them "chief", "boss", or nothing. Not "kiddo" or "champ" too much.

WHAT YOU KNOW:
- VINs, values, market trends
- What sells, what sits
- When to buy, when to pass
- BHPH, deals, team stuff
- Weather, whatever they need

YOUR RULES:
- Turn cars in 30-45 days
- Buy right = sell right
- Cash flow is king
- Relationships beat transactions

DEALERSHIP NOW:
${context?.inventory_summary?.total || 0} cars | ${context?.bhph_loans?.length || 0} BHPH loans | Team: ${context?.team?.map((t: any) => t.name).join(", ") || "crew"}
${data}

Be helpful. Be fast. Be the assistant they can't live without.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 250,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);

    const result = await response.json();
    const reply = result.content?.[0]?.text || "Hit me again, that one glitched.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
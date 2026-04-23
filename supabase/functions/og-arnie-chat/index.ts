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

// Compact a vehicle for the prompt. Keep it short, always include id + status so
// the LLM can emit a deep-link like /vehicle/:id.
function fmtVehicle(v: any) {
  const parts = [
    `id=${v.id}`,
    v.status ? `[${v.status}]` : "",
    [v.year, v.make, v.model, v.trim].filter(Boolean).join(" "),
  ];
  const details: string[] = [];
  if (v.vin) details.push(`VIN:${v.vin}`);
  if (v.stock_number) details.push(`stock#${v.stock_number}`);
  if (v.miles || v.mileage) details.push(`${(v.miles || v.mileage).toLocaleString()}mi`);
  if (v.purchase_price != null) details.push(`cost $${Number(v.purchase_price).toLocaleString()}`);
  if (v.sale_price != null) details.push(`sale $${Number(v.sale_price).toLocaleString()}`);
  if (v.created_at) {
    const days = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86400000);
    details.push(`${days}d on lot`);
  }
  return parts.filter(Boolean).join(" ") + (details.length ? " | " + details.join(", ") : "");
}

function fmtDeal(d: any) {
  const parts = [
    `id=${d.id}`,
    d.status ? `[${d.status}]` : (d.deal_status ? `[${d.deal_status}]` : ""),
    d.customer ? `cust:${d.customer}` : "",
    d.vehicle_id ? `vehicle_id=${d.vehicle_id}` : "",
    d.date ? `on ${d.date}` : "",
    d.price != null ? `$${Number(d.price).toLocaleString()}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function buildDealershipSection(ctx: any) {
  const lines: string[] = [];
  lines.push(`DEALER: ${ctx?.dealer?.name || "-"} (id=${ctx?.dealer_id || "?"}, state=${ctx?.dealer?.state || "-"})`);
  lines.push(`ACCESS: ${ctx?.user_access_level || "-"}`);

  const inv = ctx?.inventory;
  if (inv) {
    const byStatus = inv.by_status || {};
    lines.push(`INVENTORY TOTALS: ${inv.total} total | For Sale ${byStatus.for_sale ?? 0} | In Stock ${byStatus.in_stock ?? 0} | Sold ${byStatus.sold ?? 0} | BHPH ${byStatus.bhph ?? 0}`);
    const vehicles = Array.isArray(inv.vehicles) ? inv.vehicles : [];
    if (vehicles.length) {
      // Recent-first. Cap at 60 to keep prompt bounded.
      const slice = vehicles.slice(0, 60);
      lines.push(`VEHICLES (showing ${slice.length}/${vehicles.length}):`);
      slice.forEach((v: any) => lines.push("  - " + fmtVehicle(v)));
      if (vehicles.length > slice.length) {
        lines.push(`  ...and ${vehicles.length - slice.length} more (ask for specific VIN/stock# if needed).`);
      }
    }
  }

  const deals = ctx?.deals;
  if (deals) {
    lines.push(`DEALS: ${deals.total} total | Completed ${deals.by_status?.completed ?? 0} | Pending ${deals.by_status?.pending ?? 0}`);
    const list = Array.isArray(deals.list) ? deals.list : [];
    if (list.length) {
      const slice = list.slice(0, 40);
      lines.push(`RECENT DEALS (${slice.length}/${list.length}):`);
      slice.forEach((d: any) => lines.push("  - " + fmtDeal(d)));
    }
  }

  const customers = ctx?.customers;
  if (customers) {
    lines.push(`CUSTOMERS: ${customers.total} total`);
  }

  if (ctx?.bhph) {
    lines.push(`BHPH: ${ctx.bhph.active_loans || 0} active loans | $${Number(ctx.bhph.total_owed || 0).toLocaleString()} owed | $${Number(ctx.bhph.monthly_income || 0).toLocaleString()}/mo income`);
  }

  if (ctx?.employees) {
    lines.push(`TEAM: ${ctx.employees.active || 0}/${ctx.employees.total || 0} active — ${(ctx.employees.list || []).map((e: any) => e.name).filter(Boolean).slice(0, 10).join(", ")}`);
  }

  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, context } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("Missing API key");

    // CRITICAL: multi-tenant guard. Reject requests that don't identify the dealer.
    const dealerId = context?.dealer_id ?? context?.dealer?.id;
    if (!dealerId) {
      return new Response(
        JSON.stringify({ error: "dealer_id is required in context — refusing to answer without tenant scope." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const q = String(message || "").toLowerCase();
    let extra = "";

    // VIN lookup — unchanged, public data.
    const vin = message.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0];
    if (vin) {
      const v = await decodeVIN(vin);
      if (v) {
        const val = await getMarketValue(v.year, v.make, v.model, 80000);
        extra += `\n[VIN ${vin}] ${v.year} ${v.make} ${v.model} ${v.trim} | ${v.body}, ${v.drive} | Market est: $${val.low.toLocaleString()}-$${val.high.toLocaleString()}`;
      }
    }

    // Year Make Model market lookup.
    const ymm = message.match(/(\d{4})\s+(\w+)\s+(\w+)/i);
    if (ymm && (q.includes("worth") || q.includes("value") || q.includes("price") || q.includes("research") || q.includes("buy"))) {
      const val = await getMarketValue(ymm[1], ymm[2], ymm[3], 80000);
      extra += `\n[Market est] ${ymm[1]} ${ymm[2]} ${ymm[3]}: $${val.est.toLocaleString()} (range $${val.low.toLocaleString()}-$${val.high.toLocaleString()})`;
    }

    // Weather.
    if (q.includes("weather") || q.includes("outside") || q.includes("cold") || q.includes("hot")) {
      const w = await getWeather();
      if (w) extra += `\n[Weather] Bluffdale: ${w}`;
    }

    const dealership = buildDealershipSection(context);

    const systemPrompt = `You're O.G. Arnie — 24 years running O.G. DiX Motor Club in Utah. You're the team's secret weapon.

VOICE:
- Quick, warm, confident. Like a favorite uncle who happens to be a business genius.
- SHORT responses. 1-2 sentences usually. 3 max unless they need detail.
- Never narrate actions. No asterisks. No "let me check" — just answer.
- Say "O.G." not "OG"
- Call them "chief", "boss", or nothing.

DEEP-LINKS (IMPORTANT):
- Whenever you reference a SPECIFIC vehicle from INVENTORY, include a markdown link to its detail page: [2017 Interstate trailer](/vehicle/<id>)
- Whenever you reference a SPECIFIC deal, link it: [Deal #<id>](/deals)
- Use the ids from the DEALERSHIP DATA section below — do NOT invent ids.
- If the user asks for something you don't see in the data, say so plainly. Do NOT make up vehicles, customers, or sales that aren't in the list.

DATA RULES:
- The DEALERSHIP DATA below is the ONLY source of truth for this dealer's records. It is already filtered to dealer_id=${dealerId}.
- If a vehicle isn't listed, it's not in inventory — say "I don't see that one in the system" rather than guessing.
- When asked for "sold in last N months" or similar, filter the VEHICLES list by status=Sold and the created_at age yourself.

DEALERSHIP DATA (filtered to dealer_id=${dealerId}):
${dealership}
${extra}

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
        max_tokens: 500,
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

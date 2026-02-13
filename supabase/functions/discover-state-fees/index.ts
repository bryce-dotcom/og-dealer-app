import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
const serpApiKey = Deno.env.get("SERP_API_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// STATE NAME MAPPING
// ============================================
const stateNames: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
};

// ============================================
// AI PARSING PROMPT
// ============================================
function buildFeeExtractionPrompt(state: string, webContent: string): string {
  return `You are extracting vehicle registration fees from official state DMV documentation.

STATE: ${state}

WEB CONTENT FROM DMV WEBSITE:
${webContent.slice(0, 15000)}

YOUR TASK:
Extract ALL vehicle registration fees for this state. Common fee types include:
- Registration fee
- Title fee
- License plate fee
- Property tax / Ad valorem tax
- Emissions testing fee
- Safety inspection fee
- Doc/processing fees
- County-specific fees
- Age-based or weight-based fees

For each fee, determine:
1. fee_type: short identifier (e.g., "registration", "title", "property_tax")
2. fee_name: human-readable name
3. calculation_type: "flat", "percentage", "age_based", "weight_based", or "tiered"
4. formula: JSON object describing how to calculate it

FORMULA FORMATS:

FLAT FEE:
{
  "type": "flat",
  "amount": 44.00
}

PERCENTAGE (of vehicle price):
{
  "type": "percentage",
  "base_field": "price",
  "percentage": 0.05
}

AGE-BASED (like Utah property tax):
{
  "type": "age_based_percentage",
  "base_field": "msrp",
  "rates_by_age": {
    "0": 0.01,
    "1": 0.0085,
    "2": 0.007,
    "6+": 0.001
  },
  "minimum": 10
}

WEIGHT-BASED:
{
  "type": "weight_based",
  "weight_tiers": [
    {"min": 0, "max": 3000, "amount": 40},
    {"min": 3000, "max": 5000, "amount": 60}
  ],
  "default_amount": 80
}

TIERED (by value):
{
  "type": "tiered",
  "base_field": "price",
  "value_tiers": [
    {"min": 0, "max": 10000, "amount": 50},
    {"min": 10000, "max": 30000, "amount": 100}
  ],
  "default_amount": 150
}

RESPOND WITH VALID JSON ONLY - an array of fee objects:
[
  {
    "fee_type": "registration",
    "fee_name": "Annual Registration Fee",
    "calculation_type": "flat",
    "formula": {"type": "flat", "amount": 44.00},
    "source_agency": "State DMV",
    "source_url": "official URL if mentioned"
  }
]

If you cannot find specific fees or the content is unclear, return an empty array [].
Only include fees you are confident about. Do not guess.`;
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state } = await req.json();
    if (!state) throw new Error("state is required");

    const stateUpper = state.toUpperCase();
    const stateName = stateNames[stateUpper];

    if (!stateName) {
      throw new Error(`Invalid state code: ${state}`);
    }

    console.log(`[DISCOVER] Starting fee discovery for ${stateName} (${stateUpper})`);

    // Check if we already have fees for this state
    const { data: existing, error: checkError } = await supabase
      .from('state_fee_schedules')
      .select('fee_type, fee_name, human_verified')
      .eq('state', stateUpper);

    if (checkError) {
      console.error('[DISCOVER] Error checking existing fees:', checkError);
    }

    if (existing && existing.length > 0) {
      const humanVerified = existing.filter(f => f.human_verified).length;
      console.log(`[DISCOVER] ${stateName} already has ${existing.length} fees (${humanVerified} verified)`);

      return new Response(
        JSON.stringify({
          success: true,
          state: stateUpper,
          message: `${stateName} already has ${existing.length} fee schedules`,
          existing_fees: existing,
          newly_discovered: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // SEARCH FOR STATE DMV FEE SCHEDULES
    // ============================================
    let searchResults: any[] = [];
    const searchQuery = `${stateName} DMV vehicle registration fees schedule`;

    if (serpApiKey) {
      console.log(`[DISCOVER] Searching with SerpAPI: "${searchQuery}"`);

      try {
        const serpUrl = new URL("https://serpapi.com/search");
        serpUrl.searchParams.set("q", searchQuery);
        serpUrl.searchParams.set("api_key", serpApiKey);
        serpUrl.searchParams.set("num", "5");
        serpUrl.searchParams.set("gl", "us");

        const serpResponse = await fetch(serpUrl.toString());

        if (serpResponse.ok) {
          const serpData = await serpResponse.json();
          searchResults = (serpData.organic_results || [])
            .filter((r: any) => r.link && (r.link.includes('.gov') || r.link.includes('dmv')))
            .slice(0, 3);

          console.log(`[DISCOVER] Found ${searchResults.length} .gov results`);
        } else {
          console.log(`[DISCOVER] SerpAPI failed: ${serpResponse.status}`);
        }
      } catch (serpErr) {
        console.log(`[DISCOVER] SerpAPI error (non-fatal): ${serpErr}`);
      }
    } else {
      console.log('[DISCOVER] No SERP_API_KEY configured, skipping web search');
    }

    // Fallback: use common DMV URL patterns
    if (searchResults.length === 0) {
      const fallbackUrls = [
        `https://dmv.${stateUpper.toLowerCase()}.gov/`,
        `https://${stateUpper.toLowerCase()}dmv.gov/`,
        `https://www.${stateUpper.toLowerCase()}dmv.org/`,
      ];

      console.log(`[DISCOVER] Using fallback URLs: ${fallbackUrls.join(', ')}`);
      searchResults = fallbackUrls.map(link => ({ link, title: `${stateName} DMV`, snippet: '' }));
    }

    // ============================================
    // FETCH AND PARSE WEB CONTENT
    // ============================================
    let discoveredFees: any[] = [];
    let sourceUrl = '';

    for (const result of searchResults) {
      console.log(`[DISCOVER] Fetching: ${result.link}`);

      try {
        const pageResponse = await fetch(result.link, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });

        if (!pageResponse.ok) {
          console.log(`[DISCOVER] Failed to fetch ${result.link}: ${pageResponse.status}`);
          continue;
        }

        const htmlContent = await pageResponse.text();

        // Extract text content (simple approach - remove HTML tags)
        const textContent = htmlContent
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (textContent.length < 200) {
          console.log(`[DISCOVER] Content too short, skipping`);
          continue;
        }

        console.log(`[DISCOVER] Fetched ${textContent.length} chars, calling AI to parse...`);

        // ============================================
        // USE CLAUDE AI TO EXTRACT FEES
        // ============================================
        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            messages: [{
              role: "user",
              content: buildFeeExtractionPrompt(stateName, textContent)
            }]
          })
        });

        if (!aiResponse.ok) {
          console.log(`[DISCOVER] AI request failed: ${aiResponse.status}`);
          continue;
        }

        const aiData = await aiResponse.json();
        const aiText = aiData.content[0]?.text || "";

        // Parse AI response
        const jsonMatch = aiText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsedFees = JSON.parse(jsonMatch[0]);

          if (parsedFees.length > 0) {
            discoveredFees = parsedFees;
            sourceUrl = result.link;
            console.log(`[DISCOVER] AI extracted ${parsedFees.length} fees from ${result.link}`);
            break; // Success! Stop searching
          }
        }

      } catch (fetchErr) {
        console.log(`[DISCOVER] Error processing ${result.link}: ${fetchErr}`);
        continue;
      }
    }

    if (discoveredFees.length === 0) {
      console.log(`[DISCOVER] No fees discovered for ${stateName}`);

      return new Response(
        JSON.stringify({
          success: false,
          state: stateUpper,
          message: `Could not discover fees for ${stateName}. Manual entry required.`,
          searched_urls: searchResults.map(r => r.link),
          newly_discovered: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // INSERT DISCOVERED FEES TO DATABASE
    // ============================================
    const feesToInsert = discoveredFees.map(fee => ({
      state: stateUpper,
      fee_type: fee.fee_type,
      fee_name: fee.fee_name,
      calculation_type: fee.calculation_type,
      base_amount: fee.formula?.amount || null,
      formula: fee.formula,
      source_url: fee.source_url || sourceUrl,
      source_agency: fee.source_agency || `${stateName} DMV`,
      ai_discovered: true,
      human_verified: false,
      last_verified: null
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('state_fee_schedules')
      .insert(feesToInsert)
      .select();

    if (insertError) {
      throw new Error(`Failed to insert fees: ${insertError.message}`);
    }

    console.log(`[DISCOVER] Inserted ${inserted.length} fees for ${stateName}`);

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        state_name: stateName,
        newly_discovered: inserted.length,
        fees: inserted.map(f => ({
          fee_type: f.fee_type,
          fee_name: f.fee_name,
          calculation_type: f.calculation_type,
          formula: f.formula
        })),
        source_url: sourceUrl,
        message: `Discovered ${inserted.length} fees for ${stateName}. Requires human verification.`,
        requires_verification: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[DISCOVER] Error:", error);
    console.error("[DISCOVER] Error stack:", error.stack);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        error_type: error.name,
        stack: error.stack
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

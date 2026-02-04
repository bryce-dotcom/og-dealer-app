import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// State names for AI prompt
const stateNames: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
};

// Build the AI prompt for form discovery
function buildDiscoveryPrompt(stateName: string, stateCode: string): string {
  return `You are a DMV and automotive compliance expert. List ALL official forms required for used car dealers in ${stateName} (${stateCode}).

CRITICAL: Return ONLY a valid JSON array. No markdown, no explanation, no code blocks. Just the raw JSON array starting with [ and ending with ].

Include these form types (15-20 forms total):
1. DMV Title Transfer forms (Application for Title, Assignment of Title)
2. Bill of Sale (state-specific if available)
3. Odometer Disclosure Statement (federal requirement)
4. Power of Attorney forms
5. Dealer Report of Sale / Notice of Transfer
6. Temporary Permit / Transit Permit / Temp Tags
7. Sales Tax Collection forms
8. Damage Disclosure forms
9. Lien Release forms
10. Registration forms
11. FTC Buyers Guide (federal requirement for all used car dealers)
12. Truth in Lending Disclosure (Regulation Z) - for BHPH/financing
13. Retail Installment Sales Contract - for BHPH
14. Promissory Note - for BHPH
15. Security Agreement - for BHPH
16. Privacy Notice (GLBA) - for financing
17. Credit Application
18. Any state-specific required disclosures

For each form provide this EXACT structure:
{
  "form_number": "TC-656 or null if no official number",
  "form_name": "Full official name of the form",
  "category": "deal|title|financing|tax|disclosure|registration|compliance",
  "required_for": ["Cash", "BHPH", "Financing", "Wholesale"],
  "source_url": "URL to official form download or null",
  "download_url": "Direct PDF URL if known or null",
  "description": "Brief description of what the form is for",
  "is_fillable": true/false,
  "confidence": 0.95
}

Return 15-20 forms as a JSON array. Include both state-specific AND federal requirements.`;
}

// Call Claude AI to discover forms
async function discoverFormsWithAI(stateName: string, stateCode: string): Promise<any[]> {
  console.log(`[DISCOVER] Calling Claude AI for ${stateName} forms...`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: buildDiscoveryPrompt(stateName, stateCode)
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[DISCOVER] Claude API error: ${response.status} - ${errorText}`);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const aiText = data.content[0]?.text || "";
  console.log(`[DISCOVER] AI response length: ${aiText.length} chars`);

  // Extract JSON array from response (handle markdown code blocks)
  let jsonText = aiText;

  // Remove markdown code blocks if present
  const codeBlockMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1];
  }

  // Find the JSON array
  const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`[DISCOVER] Could not find JSON array in AI response`);
    console.error(`[DISCOVER] Raw response: ${aiText.substring(0, 500)}`);
    throw new Error("AI response did not contain valid JSON array");
  }

  const forms = JSON.parse(jsonMatch[0]);
  console.log(`[DISCOVER] AI discovered ${forms.length} forms`);

  return forms;
}

// Try to download PDF and upload to storage
async function tryDownloadPdf(form: any, stateCode: string): Promise<{
  storage_bucket: string | null;
  storage_path: string | null;
  file_size_bytes: number | null;
}> {
  const downloadUrl = form.download_url || form.source_url;

  if (!downloadUrl || !downloadUrl.endsWith('.pdf')) {
    return { storage_bucket: null, storage_path: null, file_size_bytes: null };
  }

  try {
    console.log(`[DISCOVER] Attempting to download: ${downloadUrl}`);

    const pdfResponse = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!pdfResponse.ok) {
      console.log(`[DISCOVER] PDF download failed (${pdfResponse.status})`);
      return { storage_bucket: null, storage_path: null, file_size_bytes: null };
    }

    const contentType = pdfResponse.headers.get("content-type") || "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      console.log(`[DISCOVER] Not a PDF (${contentType})`);
      return { storage_bucket: null, storage_path: null, file_size_bytes: null };
    }

    const pdfBytes = await pdfResponse.arrayBuffer();
    const fileSize = pdfBytes.byteLength;
    console.log(`[DISCOVER] Downloaded ${fileSize} bytes`);

    // Generate storage path
    const fileName = (form.form_number || form.form_name)
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .substring(0, 50);
    const storagePath = `staging/${stateCode}/${fileName}.pdf`;

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("form-staging")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) {
      console.log(`[DISCOVER] Upload error: ${uploadError.message}`);
      return { storage_bucket: null, storage_path: null, file_size_bytes: null };
    }

    console.log(`[DISCOVER] Uploaded to: ${storagePath}`);
    return {
      storage_bucket: "form-staging",
      storage_path: storagePath,
      file_size_bytes: fileSize
    };

  } catch (error) {
    console.log(`[DISCOVER] Download error: ${error}`);
    return { storage_bucket: null, storage_path: null, file_size_bytes: null };
  }
}

// Main handler
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, county } = await req.json();
    if (!state) throw new Error("State is required");

    const stateUpper = state.toUpperCase();
    const stateName = stateNames[stateUpper];
    if (!stateName) throw new Error(`Unknown state: ${state}`);

    console.log(`[DISCOVER] Starting form discovery for ${stateName} (${stateUpper})${county ? `, county: ${county}` : ''}`);

    // Check if forms already exist in form_staging for this state
    const { data: existingForms, error: existingError } = await supabase
      .from("form_staging")
      .select("id, form_number, form_name, category, status")
      .eq("state", stateUpper);

    if (existingError) {
      console.error(`[DISCOVER] Error checking existing forms:`, existingError);
    }

    if (existingForms && existingForms.length > 0) {
      console.log(`[DISCOVER] Found ${existingForms.length} existing forms for ${stateUpper}`);

      return new Response(
        JSON.stringify({
          success: true,
          source: "existing",
          state: stateUpper,
          state_name: stateName,
          forms_count: existingForms.length,
          forms: existingForms,
          message: `Found ${existingForms.length} existing forms for ${stateName}. Use clear_existing=true to rediscover.`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No existing forms - discover with AI
    console.log(`[DISCOVER] No existing forms, calling AI...`);

    let discoveredForms: any[] = [];

    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    discoveredForms = await discoverFormsWithAI(stateName, stateUpper);

    // Process and insert forms into form_staging
    const formsToInsert: any[] = [];
    let downloadedCount = 0;

    for (const form of discoveredForms) {
      // Try to download PDF
      const { storage_bucket, storage_path, file_size_bytes } = await tryDownloadPdf(form, stateUpper);

      if (storage_path) {
        downloadedCount++;
      }

      formsToInsert.push({
        state: stateUpper,
        form_number: form.form_number || null,
        form_name: form.form_name,
        category: form.category || "deal",
        source_url: form.source_url || null,
        source_agency: form.source_agency || null,
        download_url: form.download_url || null,
        version_string: null,
        storage_bucket,
        storage_path,
        file_size_bytes,
        is_fillable: form.is_fillable || false,
        ai_confidence: form.confidence || 0.85,
        status: "pending",
        analyzed_at: null,
        created_at: new Date().toISOString()
      });
    }

    // Insert into form_staging
    const { data: insertedForms, error: insertError } = await supabase
      .from("form_staging")
      .insert(formsToInsert)
      .select("id, form_number, form_name, category, status");

    if (insertError) {
      console.error(`[DISCOVER] Insert error:`, insertError);
      throw new Error(`Failed to insert forms: ${insertError.message}`);
    }

    const insertedCount = insertedForms?.length || 0;
    console.log(`[DISCOVER] Inserted ${insertedCount} forms, downloaded ${downloadedCount} PDFs`);

    return new Response(
      JSON.stringify({
        success: true,
        source: "ai_discovered",
        state: stateUpper,
        state_name: stateName,
        forms_found: insertedCount,
        forms_downloaded: downloadedCount,
        forms: insertedForms || [],
        message: `Discovered ${insertedCount} forms for ${stateName}. Downloaded ${downloadedCount} PDFs.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[DISCOVER] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

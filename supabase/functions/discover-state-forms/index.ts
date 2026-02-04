import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// Build the AI prompt for form discovery - DEMAND direct PDF URLs
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
  "source_url": "URL to official form page",
  "download_url": "DIRECT link to the PDF file - MUST end in .pdf when possible",
  "source_agency": "Name of the issuing agency (e.g. Utah State Tax Commission, FTC)",
  "description": "Brief description of what the form is for",
  "is_fillable": true or false,
  "confidence": 0.0 to 1.0
}

IMPORTANT FOR download_url:
- For Utah forms, use https://tax.utah.gov/forms/current/ prefix (e.g., https://tax.utah.gov/forms/current/tc-656.pdf)
- For Utah DMV, use https://dmv.utah.gov/forms/ prefix
- For federal FTC forms, use https://www.ftc.gov/system/files/ URLs
- For IRS forms, use https://www.irs.gov/pub/irs-pdf/ prefix
- ALWAYS provide DIRECT PDF download links, not form landing pages
- The download_url MUST be a direct link to a .pdf file that can be fetched

Return 15-20 forms as a JSON array. Include both state-specific AND federal requirements.`;
}

// Call Claude AI to discover forms
async function discoverFormsWithAI(
  stateName: string,
  stateCode: string,
  anthropicApiKey: string
): Promise<any[]> {
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
async function tryDownloadPdf(
  form: any,
  stateCode: string,
  supabase: any
): Promise<{
  storage_bucket: string | null;
  storage_path: string | null;
  file_size_bytes: number | null;
  download_error: string | null;
}> {
  const downloadUrl = form.download_url || form.source_url;

  if (!downloadUrl) {
    console.log(`[DISCOVER] No URL for form: ${form.form_number || form.form_name}`);
    return { storage_bucket: null, storage_path: null, file_size_bytes: null, download_error: "No URL provided" };
  }

  // Check if URL looks like it could be a PDF (relaxed check)
  const isPdfLike = downloadUrl.toLowerCase().includes('.pdf') ||
                    downloadUrl.toLowerCase().includes('/pdf/') ||
                    downloadUrl.toLowerCase().includes('download') ||
                    downloadUrl.toLowerCase().includes('form');

  if (!isPdfLike) {
    console.log(`[DISCOVER] URL doesn't look like PDF: ${downloadUrl}`);
    return { storage_bucket: null, storage_path: null, file_size_bytes: null, download_error: "URL doesn't appear to be a PDF" };
  }

  try {
    console.log(`[DISCOVER] Attempting to download: ${downloadUrl}`);

    // Create abort controller for 15 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const pdfResponse = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OGDealerBot/1.0)",
        "Accept": "application/pdf,*/*"
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!pdfResponse.ok) {
      console.log(`[DISCOVER] PDF download failed: HTTP ${pdfResponse.status} for ${downloadUrl}`);
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, download_error: `HTTP ${pdfResponse.status}` };
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfBuffer);
    const fileSize = pdfBytes.byteLength;

    console.log(`[DISCOVER] Downloaded ${fileSize} bytes from ${downloadUrl}`);

    // Verify PDF header - must start with %PDF-
    if (fileSize < 10) {
      console.log(`[DISCOVER] File too small to be PDF: ${fileSize} bytes`);
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, download_error: "File too small" };
    }

    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    if (!header.startsWith("%PDF")) {
      console.log(`[DISCOVER] Not a valid PDF (header: ${header})`);
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, download_error: "Invalid PDF header" };
    }

    console.log(`[DISCOVER] Valid PDF confirmed: ${fileSize} bytes`);

    // Generate storage path
    const formId = (form.form_number || form.form_name || "unknown")
      .replace(/[^a-zA-Z0-9-]/g, "_")
      .substring(0, 50);
    const storagePath = `staging/${stateCode}/${formId}.pdf`;

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("form-staging")
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) {
      console.log(`[DISCOVER] Upload error: ${uploadError.message}`);
      return { storage_bucket: null, storage_path: null, file_size_bytes: fileSize, download_error: `Upload failed: ${uploadError.message}` };
    }

    console.log(`[DISCOVER] SUCCESS - Uploaded to: form-staging/${storagePath}`);
    return {
      storage_bucket: "form-staging",
      storage_path: storagePath,
      file_size_bytes: fileSize,
      download_error: null
    };

  } catch (error: any) {
    const errorMsg = error.name === 'AbortError' ? 'Timeout after 15s' : error.message;
    console.log(`[DISCOVER] Download error for ${downloadUrl}: ${errorMsg}`);
    return { storage_bucket: null, storage_path: null, file_size_bytes: null, download_error: errorMsg };
  }
}

// Main handler
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Get env vars
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing Supabase configuration" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!anthropicApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { state, county, clear_existing } = body;

    if (!state) {
      throw new Error("State is required");
    }

    const stateUpper = state.toUpperCase();
    const stateName = stateNames[stateUpper];
    if (!stateName) {
      throw new Error(`Unknown state: ${state}`);
    }

    console.log(`[DISCOVER] ========================================`);
    console.log(`[DISCOVER] Starting form discovery for ${stateName} (${stateUpper})${county ? `, county: ${county}` : ''}`);
    console.log(`[DISCOVER] ========================================`);

    // Check if forms already exist in form_staging for this state
    const { data: existingForms, error: existingError } = await supabase
      .from("form_staging")
      .select("id, form_number, form_name, category, status, storage_path")
      .eq("state", stateUpper);

    if (existingError) {
      console.error(`[DISCOVER] Error checking existing forms:`, existingError);
    }

    // If forms exist and clear_existing not requested, return existing
    if (existingForms && existingForms.length > 0 && !clear_existing) {
      const withPdf = existingForms.filter(f => f.storage_path).length;
      console.log(`[DISCOVER] Found ${existingForms.length} existing forms (${withPdf} with PDFs) for ${stateUpper}`);

      return new Response(
        JSON.stringify({
          success: true,
          source: "existing",
          state: stateUpper,
          state_name: stateName,
          forms_count: existingForms.length,
          forms_with_pdf: withPdf,
          forms: existingForms,
          message: `Found ${existingForms.length} existing forms for ${stateName} (${withPdf} with PDFs). Use clear_existing=true to rediscover.`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If clear_existing, delete old forms first
    if (clear_existing && existingForms && existingForms.length > 0) {
      console.log(`[DISCOVER] Clearing ${existingForms.length} existing forms for ${stateUpper}`);
      const { error: deleteError } = await supabase
        .from("form_staging")
        .delete()
        .eq("state", stateUpper);

      if (deleteError) {
        console.error(`[DISCOVER] Error deleting existing forms:`, deleteError);
      }
    }

    // Discover with AI
    console.log(`[DISCOVER] Calling AI to discover forms...`);
    const discoveredForms = await discoverFormsWithAI(stateName, stateUpper, anthropicApiKey);

    // Process and insert forms into form_staging
    const results: { form_number: string | null; form_name: string; downloaded: boolean; error?: string }[] = [];
    let downloadedCount = 0;
    let insertedCount = 0;

    for (const form of discoveredForms) {
      console.log(`[DISCOVER] Processing: ${form.form_number || 'NO_NUMBER'} - ${form.form_name}`);

      // Try to download PDF
      const { storage_bucket, storage_path, file_size_bytes, download_error } = await tryDownloadPdf(form, stateUpper, supabase);

      const downloaded = !!storage_path;
      if (downloaded) {
        downloadedCount++;
      }

      // Insert into form_staging
      const insertData = {
        state: stateUpper,
        form_number: form.form_number || null,
        form_name: form.form_name,
        category: form.category || "deal",
        source_url: form.source_url || null,
        source_agency: form.source_agency || null,
        download_url: form.download_url || null,
        storage_bucket,
        storage_path,
        file_size_bytes,
        is_fillable: form.is_fillable || false,
        ai_confidence: form.confidence || 0.85,
        status: "pending",
        created_at: new Date().toISOString()
      };

      const { error: insertError } = await supabase
        .from("form_staging")
        .insert(insertData);

      if (insertError) {
        console.error(`[DISCOVER] Insert error for ${form.form_name}:`, insertError.message);
        results.push({
          form_number: form.form_number,
          form_name: form.form_name,
          downloaded,
          error: `Insert failed: ${insertError.message}`
        });
      } else {
        insertedCount++;
        results.push({
          form_number: form.form_number,
          form_name: form.form_name,
          downloaded,
          error: downloaded ? undefined : download_error || undefined
        });
      }
    }

    console.log(`[DISCOVER] ========================================`);
    console.log(`[DISCOVER] COMPLETE: ${insertedCount} forms inserted, ${downloadedCount} PDFs downloaded`);
    console.log(`[DISCOVER] ========================================`);

    return new Response(
      JSON.stringify({
        success: true,
        source: "ai_discovered",
        state: stateUpper,
        state_name: stateName,
        forms_found: discoveredForms.length,
        forms_inserted: insertedCount,
        forms_downloaded: downloadedCount,
        forms: results,
        message: `Discovered ${discoveredForms.length} forms for ${stateName}. Inserted ${insertedCount}, downloaded ${downloadedCount} PDFs.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[DISCOVER] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

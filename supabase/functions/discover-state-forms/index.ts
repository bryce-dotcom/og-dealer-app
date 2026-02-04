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

// ============================================================
// STEP A: AI RESEARCH - What forms does this state require?
// ============================================================
function buildResearchPrompt(stateName: string, stateCode: string): string {
  return `You are an expert on motor vehicle dealer compliance for ${stateName}.

List forms required for USED CAR DEALERS in ${stateName}. Focus on DMV, Tax Commission, and federal (FTC/NHTSA) requirements.

DO NOT include: IRS forms, generic business forms, forms from other states.
DO NOT provide any URLs.

Return ONLY a JSON array. No markdown, no explanation. Start with [ end with ].

Include these categories:

1. DMV/TITLE FORMS (category: "title")
   - Application for Title
   - Assignment of Title
   - Duplicate Title requests
   - Out-of-state title transfers

2. REGISTRATION FORMS (category: "registration")
   - Vehicle registration application
   - Dealer report of sale / Notice of transfer and release of liability
   - Temporary permits / Transit tags

3. TAX FORMS (category: "tax")
   - Motor vehicle sales tax return
   - Sales and use tax forms
   - Monthly/quarterly dealer tax returns

4. COMPLIANCE/DISCLOSURE FORMS (category: "compliance")
   - FTC Buyers Guide (federal - all used car dealers)
   - Odometer Disclosure Statement (federal requirement)
   - Damage disclosure / Salvage disclosure
   - As-Is disclosure / Warranty disclaimer
   - Lemon Law buyback disclosure (if applicable)

5. BHPH/FINANCING FORMS (category: "financing")
   - Truth in Lending Disclosure (Regulation Z)
   - Retail Installment Sales Contract
   - Promissory Note
   - Security Agreement
   - Privacy Notice (GLBA)
   - Right to Cure notice
   - Credit Application

6. DEAL DOCUMENTS (category: "deal")
   - Bill of Sale
   - Purchase Agreement / Buyer's Order
   - Power of Attorney
   - Lien Release forms

For EACH form, provide this exact structure:
{
  "form_number": "TC-656 (use official form number, or null if none)",
  "form_name": "Full official name of the form",
  "category": "title|registration|tax|compliance|financing|deal",
  "required_for": ["all"] or ["bhph"] or ["financing"] or ["all", "bhph"],
  "source_agency": "Utah State Tax Commission or Utah DMV or FTC or IRS etc",
  "description": "What this form is used for",
  "deadline": "45 days from sale or monthly by 25th or null if no deadline",
  "penalty": "Late fee amount or penalty description or null",
  "is_federal": true or false
}

Return 20-25 forms. Use official form numbers when available (TC-656 for Utah). Set form_number to null if unknown.`;
}

interface DiscoveredForm {
  form_number: string | null;
  form_name: string;
  category: string;
  required_for: string[];
  source_agency: string;
  description: string;
  deadline: string | null;
  penalty: string | null;
  is_federal: boolean;
}

async function researchFormsWithAI(
  stateName: string,
  stateCode: string,
  anthropicApiKey: string
): Promise<DiscoveredForm[]> {
  console.log(`[STEP A] Researching ${stateName} dealer requirements with AI...`);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2024-01-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: buildResearchPrompt(stateName, stateCode)
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[STEP A] Claude API error: ${response.status} - ${errorText}`);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const aiText = data.content[0]?.text || "";
  console.log(`[STEP A] AI response: ${aiText.length} chars`);

  // Extract JSON array from response
  let jsonText = aiText;
  const codeBlockMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1];
  }

  const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`[STEP A] Could not parse JSON from AI response`);
    throw new Error("AI response did not contain valid JSON array");
  }

  const forms: DiscoveredForm[] = JSON.parse(jsonMatch[0]);
  console.log(`[STEP A] AI identified ${forms.length} required forms`);

  // Log summary by category
  const byCategory: Record<string, number> = {};
  forms.forEach(f => {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  });
  console.log(`[STEP A] By category:`, byCategory);

  return forms;
}

// ============================================================
// STEP B: GOOGLE SEARCH - Find real PDF URLs via SerpAPI
// ============================================================

// URLs to REJECT - manufacturer sites, generic legal docs, etc.
const REJECTED_URL_PATTERNS = [
  'nissan', 'toyota', 'honda', 'ford', 'chevrolet', 'gmc', 'dodge', 'chrysler',
  'hyundai', 'kia', 'mazda', 'subaru', 'volkswagen', 'bmw', 'mercedes', 'audi',
  'manufacturer', 'rental', 'lease-agreement', 'chapter', 'statute', 'legislature',
  'law.justia', 'findlaw', 'lawserver', 'casetext', 'courtlistener'
];

// URLs to ACCEPT - official government and legal form sites
const ACCEPTED_DOMAINS = [
  '.gov', 'tax.utah.gov', 'dmv.utah.gov', 'dmv.', 'ftc.gov', 'nhtsa.gov',
  'dor.', 'revenue.', 'motor.', 'mvd.', 'dot.state'
];

function isValidPdfUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Reject manufacturer and irrelevant URLs
  for (const pattern of REJECTED_URL_PATTERNS) {
    if (lowerUrl.includes(pattern)) {
      return false;
    }
  }

  // Prefer .gov and official sites
  const hasAcceptedDomain = ACCEPTED_DOMAINS.some(domain => lowerUrl.includes(domain));

  // Must end in .pdf
  if (!lowerUrl.endsWith('.pdf')) {
    return false;
  }

  return true;
}

async function searchForPdfUrl(
  form: DiscoveredForm,
  stateName: string,
  stateCode: string,
  serpApiKey: string
): Promise<string | null> {
  const formId = form.form_number || form.form_name;
  console.log(`[STEP B] Searching for PDF: ${formId}`);

  // Build MOTOR-VEHICLE-SPECIFIC search queries
  const queries: string[] = [];

  // For federal forms, search federal sites FIRST
  if (form.is_federal) {
    const nameLower = form.form_name.toLowerCase();
    if (nameLower.includes('buyers guide') || nameLower.includes('ftc')) {
      queries.push(`FTC Buyers Guide auto dealer filetype:pdf site:ftc.gov`);
      queries.push(`FTC used car buyers guide filetype:pdf site:.gov`);
    }
    if (nameLower.includes('odometer')) {
      queries.push(`Odometer Disclosure Statement motor vehicle filetype:pdf site:nhtsa.gov`);
      queries.push(`federal odometer disclosure form filetype:pdf site:.gov`);
    }
    if (nameLower.includes('truth in lending') || nameLower.includes('tila')) {
      queries.push(`Truth in Lending Disclosure auto loan filetype:pdf site:.gov`);
    }
    if (nameLower.includes('privacy') || nameLower.includes('glba')) {
      queries.push(`GLBA Privacy Notice auto dealer filetype:pdf site:.gov`);
    }
  }

  // For forms WITH a form number (like TC-69, TC-656)
  if (form.form_number) {
    const formNum = form.form_number;

    // Utah-specific: TC- forms are on tax.utah.gov
    if (stateCode === 'UT' && formNum.toUpperCase().startsWith('TC')) {
      queries.push(`${formNum} site:tax.utah.gov filetype:pdf`);
      queries.push(`${formNum} site:dmv.utah.gov filetype:pdf`);
    }

    // State-specific government sites
    queries.push(`${formNum} site:.gov ${stateCode} filetype:pdf`);
    queries.push(`${formNum} ${stateName} motor vehicle form filetype:pdf site:.gov`);
    queries.push(`${formNum} ${stateName} DMV form filetype:pdf`);
    queries.push(`${formNum} ${stateName} auto dealer form PDF`);
  }

  // For forms WITHOUT a form number - be MORE specific about motor vehicles
  if (!form.form_number || queries.length < 3) {
    const formName = form.form_name;
    queries.push(`"${formName}" motor vehicle ${stateName} filetype:pdf site:.gov`);
    queries.push(`${formName} auto dealer ${stateName} filetype:pdf`);
    queries.push(`${formName} DMV ${stateName} form filetype:pdf`);
    queries.push(`${formName} vehicle ${stateCode} official form PDF`);
  }

  console.log(`[STEP B] Will try ${queries.length} search queries`);

  for (const query of queries) {
    try {
      console.log(`[STEP B] Query: ${query}`);
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpApiKey}&num=10`;

      const response = await fetch(url);
      if (!response.ok) {
        console.log(`[STEP B] SerpAPI error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const results = data.organic_results || [];
      console.log(`[STEP B] Got ${results.length} results`);

      // Find first VALID result with .pdf link
      for (const result of results) {
        const link = result.link || "";

        if (isValidPdfUrl(link)) {
          console.log(`[STEP B] ✓ Found valid PDF for ${formId}: ${link}`);
          return link;
        } else if (link.toLowerCase().endsWith('.pdf')) {
          console.log(`[STEP B] ✗ Rejected PDF (bad domain): ${link}`);
        }
      }

      console.log(`[STEP B] No valid PDF in results for this query`);
    } catch (err) {
      console.log(`[STEP B] Search error: ${err}`);
    }
  }

  console.log(`[STEP B] No PDF found for: ${formId}`);
  return null;
}

// ============================================================
// STEP C: DOWNLOAD PDF - Validate and upload to storage
// ============================================================
async function downloadAndUploadPdf(
  form: DiscoveredForm,
  pdfUrl: string,
  stateCode: string,
  supabase: any
): Promise<{
  storage_bucket: string | null;
  storage_path: string | null;
  file_size_bytes: number | null;
  error: string | null;
}> {
  const formId = form.form_number || form.form_name;
  console.log(`[STEP C] Downloading PDF for ${formId}: ${pdfUrl}`);

  try {
    // Create abort controller for 15 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(pdfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/pdf,*/*"
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, error: `HTTP ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const fileSize = bytes.byteLength;

    // Validate PDF header - must start with %PDF-
    if (fileSize < 10) {
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, error: "File too small" };
    }

    const header = String.fromCharCode(...bytes.slice(0, 5));
    if (!header.startsWith("%PDF")) {
      // Check if it's HTML (common redirect/block page)
      const firstChars = String.fromCharCode(...bytes.slice(0, 100));
      if (firstChars.toLowerCase().includes("<!doctype") || firstChars.toLowerCase().includes("<html")) {
        return { storage_bucket: null, storage_path: null, file_size_bytes: null, error: "Got HTML instead of PDF" };
      }
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, error: `Invalid PDF header: ${header}` };
    }

    console.log(`[STEP C] Valid PDF downloaded: ${fileSize} bytes`);

    // Generate storage path
    const sanitizedName = (form.form_number || form.form_name)
      .replace(/[^a-zA-Z0-9-]/g, "_")
      .substring(0, 50);
    const storagePath = `staging/${stateCode}/${sanitizedName}.pdf`;

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("form-staging")
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) {
      return { storage_bucket: null, storage_path: null, file_size_bytes: fileSize, error: `Upload failed: ${uploadError.message}` };
    }

    console.log(`[STEP C] Uploaded to: form-staging/${storagePath}`);
    return {
      storage_bucket: "form-staging",
      storage_path: storagePath,
      file_size_bytes: fileSize,
      error: null
    };

  } catch (err: any) {
    const errorMsg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { storage_bucket: null, storage_path: null, file_size_bytes: null, error: errorMsg };
  }
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Get env vars
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const serpApiKey = Deno.env.get("SERP_API_KEY"); // Note: SERP_API_KEY not SERPAPI_KEY

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

  if (!serpApiKey) {
    return new Response(
      JSON.stringify({ success: false, error: "SERP_API_KEY not configured - needed for Google search" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { state, clear_existing } = body;

    if (!state) {
      throw new Error("State is required");
    }

    const stateUpper = state.toUpperCase();
    const stateName = stateNames[stateUpper];
    if (!stateName) {
      throw new Error(`Unknown state: ${state}`);
    }

    console.log(`\n========================================`);
    console.log(`DISCOVER FORMS FOR ${stateName} (${stateUpper})`);
    console.log(`========================================\n`);

    // Check for existing forms
    const { data: existingForms, error: existingError } = await supabase
      .from("form_staging")
      .select("id, form_number, form_name, category, storage_path")
      .eq("state", stateUpper);

    if (existingError) {
      console.error(`Error checking existing forms:`, existingError);
    }

    if (existingForms && existingForms.length > 0 && !clear_existing) {
      const withPdf = existingForms.filter(f => f.storage_path).length;
      console.log(`Found ${existingForms.length} existing forms (${withPdf} with PDFs)`);

      return new Response(
        JSON.stringify({
          success: true,
          source: "existing",
          state: stateUpper,
          state_name: stateName,
          forms_count: existingForms.length,
          forms_with_pdf: withPdf,
          forms: existingForms.map(f => ({
            form_number: f.form_number,
            form_name: f.form_name,
            category: f.category,
            has_pdf: !!f.storage_path
          })),
          message: `Found ${existingForms.length} existing forms. Use clear_existing=true to rediscover.`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clear existing if requested
    if (clear_existing && existingForms && existingForms.length > 0) {
      console.log(`Clearing ${existingForms.length} existing forms...`);
      await supabase.from("form_staging").delete().eq("state", stateUpper);
    }

    // ========================================
    // STEP A: AI RESEARCH
    // ========================================
    const discoveredForms = await researchFormsWithAI(stateName, stateUpper, anthropicApiKey);

    // ========================================
    // STEP B & C: SEARCH + DOWNLOAD
    // ========================================
    const results: any[] = [];
    let formsWithPdf = 0;

    for (const form of discoveredForms) {
      const formId = form.form_number || form.form_name;
      console.log(`\n--- Processing: ${formId} ---`);

      // STEP B: Search for PDF URL
      const pdfUrl = await searchForPdfUrl(form, stateName, stateUpper, serpApiKey);

      // STEP C: Download if URL found
      let storage_bucket: string | null = null;
      let storage_path: string | null = null;
      let file_size_bytes: number | null = null;
      let downloadError: string | null = null;

      if (pdfUrl) {
        const downloadResult = await downloadAndUploadPdf(form, pdfUrl, stateUpper, supabase);
        storage_bucket = downloadResult.storage_bucket;
        storage_path = downloadResult.storage_path;
        file_size_bytes = downloadResult.file_size_bytes;
        downloadError = downloadResult.error;

        if (storage_path) {
          formsWithPdf++;
        }
      } else {
        downloadError = "No PDF URL found";
      }

      // Insert into database
      const insertData = {
        state: stateUpper,
        form_number: form.form_number,
        form_name: form.form_name,
        category: form.category,
        required_for: form.required_for,
        source_agency: form.source_agency,
        description: form.description,
        deadline_description: form.deadline,
        compliance_notes: form.penalty,
        download_url: pdfUrl,
        storage_bucket,
        storage_path,
        file_size_bytes,
        is_fillable: true,
        ai_confidence: 0.9,
        ai_discovered: true,
        status: "pending",
        created_at: new Date().toISOString()
      };

      const { error: insertError } = await supabase
        .from("form_staging")
        .insert(insertData);

      if (insertError) {
        console.error(`Insert error for ${formId}:`, insertError.message);
      }

      results.push({
        form_number: form.form_number,
        form_name: form.form_name,
        category: form.category,
        deadline: form.deadline,
        has_pdf: !!storage_path,
        error: downloadError
      });
    }

    console.log(`\n========================================`);
    console.log(`COMPLETE: ${discoveredForms.length} forms, ${formsWithPdf} PDFs`);
    console.log(`========================================\n`);

    return new Response(
      JSON.stringify({
        success: true,
        source: "discovered",
        state: stateUpper,
        state_name: stateName,
        forms_found: discoveredForms.length,
        forms_with_pdf: formsWithPdf,
        forms: results,
        message: `Discovered ${discoveredForms.length} forms for ${stateName}. Downloaded ${formsWithPdf} PDFs.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

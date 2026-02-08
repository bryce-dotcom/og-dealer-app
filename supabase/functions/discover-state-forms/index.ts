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
      "anthropic-version": "2023-06-01"
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
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
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

// URLs to REJECT - manufacturer sites, legislative docs, legal research sites
const REJECTED_URL_PATTERNS = [
  // Car manufacturers
  'nissan', 'toyota', 'honda', 'ford', 'chevrolet', 'gmc', 'dodge', 'chrysler',
  'hyundai', 'kia', 'mazda', 'subaru', 'volkswagen', 'bmw', 'mercedes', 'audi',
  'manufacturer', 'rental', 'lease-agreement',
  // Legislative / statutory - NOT fillable forms
  'legislature', 'le.utah.gov', '/bill', 'statute', '/code/', '.gov/code',
  '.gov/laws', '/laws/', '/legislation/', '/bills/', '/enrolled/',
  'session', 'fiscal', 'analysis',
  'senate', 'house', 'congress',
  // Legal research sites
  'law.justia', 'findlaw', 'lawserver', 'casetext', 'courtlistener', 'chapter'
];

// Domains to ACCEPT - official government and form sites
const ACCEPTED_DOMAINS = [
  '.gov', 'tax.utah.gov', 'dmv.utah.gov', 'dmv.', 'ftc.gov', 'nhtsa.gov',
  'dor.', 'revenue.', 'motor.', 'mvd.', 'dot.state'
];

// URL path patterns that indicate actual fillable forms (at least one must match)
const ACCEPTED_URL_PATTERNS = [
  '/forms/', '/form/', '/pub/', '/publications/',
  'tax.utah.gov', 'dmv.utah.gov', 'motorvehicle', 'dmv',
  'taxcommission', 'ftc.gov/tips', 'nhtsa.gov', 'irs.gov/pub', 'irs.gov/forms',
  'revenue', 'dor.', 'mvd.', 'motor.'
];

function isValidPdfUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();

  // Must end in .pdf
  if (!lowerUrl.endsWith('.pdf')) {
    return false;
  }

  // Reject legislative and irrelevant URLs
  for (const pattern of REJECTED_URL_PATTERNS) {
    if (lowerUrl.includes(pattern)) {
      console.log(`REJECTED URL (legislative/irrelevant): ${url} [matched: ${pattern}]`);
      return false;
    }
  }

  // Must match at least one accepted URL pattern (actual form sources)
  const hasAcceptedPattern = ACCEPTED_URL_PATTERNS.some(p => lowerUrl.includes(p));
  const hasAcceptedDomain = ACCEPTED_DOMAINS.some(d => lowerUrl.includes(d));

  if (!hasAcceptedPattern && !hasAcceptedDomain) {
    console.log(`REJECTED URL (no accepted pattern): ${url}`);
    return false;
  }

  console.log(`ACCEPTED URL: ${url}`);
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
      queries.push(`${formNum} site:tax.utah.gov/forms filetype:pdf`);
      queries.push(`${formNum} Utah Tax Commission form PDF`);
    }

    // Utah DMV forms
    if (stateCode === 'UT' && !formNum.toUpperCase().startsWith('TC')) {
      queries.push(`${formNum} site:dmv.utah.gov filetype:pdf`);
      queries.push(`${formNum} Utah DMV motor vehicle form PDF`);
    }

    // State-specific government sites
    queries.push(`${formNum} site:.gov ${stateCode} filetype:pdf`);
    queries.push(`${formNum} ${stateName} motor vehicle form filetype:pdf site:.gov`);
    queries.push(`${formNum} ${stateName} DMV form filetype:pdf`);
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
  pdfBytes: Uint8Array | null;
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
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, pdfBytes: null, error: `HTTP ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const fileSize = bytes.byteLength;

    // Validate PDF header - must start with %PDF-
    if (fileSize < 10) {
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, pdfBytes: null, error: "File too small" };
    }

    const header = String.fromCharCode(...bytes.slice(0, 5));
    if (!header.startsWith("%PDF")) {
      // Check if it's HTML (common redirect/block page)
      const firstChars = String.fromCharCode(...bytes.slice(0, 100));
      if (firstChars.toLowerCase().includes("<!doctype") || firstChars.toLowerCase().includes("<html")) {
        return { storage_bucket: null, storage_path: null, file_size_bytes: null, pdfBytes: null, error: "Got HTML instead of PDF" };
      }
      return { storage_bucket: null, storage_path: null, file_size_bytes: null, pdfBytes: null, error: `Invalid PDF header: ${header}` };
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
      return { storage_bucket: null, storage_path: null, file_size_bytes: fileSize, pdfBytes: bytes, error: `Upload failed: ${uploadError.message}` };
    }

    console.log(`[STEP C] Uploaded to: form-staging/${storagePath}`);
    return {
      storage_bucket: "form-staging",
      storage_path: storagePath,
      file_size_bytes: fileSize,
      pdfBytes: bytes,
      error: null
    };

  } catch (err: any) {
    const errorMsg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { storage_bucket: null, storage_path: null, file_size_bytes: null, pdfBytes: null, error: errorMsg };
  }
}

// ============================================================
// STEP D: AI VALIDATION - Classify downloaded PDF content
// ============================================================
interface ValidationResult {
  type: "form" | "rule" | "junk";
  confidence: number;
  reason: string;
  suggestedName?: string;
}

async function validatePdfContent(
  pdfBytes: Uint8Array,
  formName: string,
  formNumber: string | null,
  sourceUrl: string,
  stateCode: string,
  anthropicApiKey: string
): Promise<ValidationResult> {
  const formId = formNumber || formName;
  console.log(`[STEP D] Validating PDF content for: ${formId}`);

  // Send the actual PDF to Claude for analysis (up to 5MB)
  const maxSize = 5 * 1024 * 1024;
  const pdfToSend = pdfBytes.byteLength <= maxSize ? pdfBytes : pdfBytes.slice(0, maxSize);

  // Chunked base64 encoding to avoid stack overflow on large arrays
  let binaryStr = "";
  const chunkSize = 8192;
  for (let i = 0; i < pdfToSend.byteLength; i += chunkSize) {
    const chunk = pdfToSend.slice(i, i + chunkSize);
    binaryStr += String.fromCharCode(...chunk);
  }
  const pdfBase64 = btoa(binaryStr);

  const prompt = `You are validating a PDF document for a car dealership management system.

Expected document: "${formName}"${formNumber ? ` (Form ${formNumber})` : ""}
State: ${stateCode}
Source URL: ${sourceUrl}
File size: ${pdfBytes.byteLength} bytes

READ the PDF content and classify this document:

1. **FORM** - A fillable government form that dealers fill out. Title applications, tax returns, bill of sale, odometer disclosure, registration forms, etc. These typically have form fields, checkboxes, signature lines, form numbers like TC-69.

2. **RULE** - A compliance regulation, deadline requirement, instruction sheet, or official guidance document. NOT fillable but useful reference. Examples: fee schedules, instruction booklets, regulatory guidance.

3. **JUNK** - NOT relevant to car dealer operations. Court cases, legislative bills (S.B., H.B.), legal opinions, academic papers, manufacturer docs, news articles, mortgage/real estate forms, rulemaking notices, public comments.

REJECT as JUNK if the PDF contains:
- Court language: Plaintiff, Defendant, Appellant, Court of Appeals, Circuit, docket
- Legislative bills: S.B., H.B., General Session, Legislature, Senator, Representative
- Federal rulemaking: Federal Register, Notice of Proposed Rulemaking, public comment, docket
- Non-vehicle content: mortgage, real estate, insurance policy (not vehicle-related)

Return ONLY valid JSON, no markdown:
{"type":"form","confidence":0.95,"reason":"Brief explanation","suggestedName":"Clean official name"}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64
              }
            },
            {
              type: "text",
              text: prompt
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(`[STEP D] Claude API error: ${response.status} - ${errText}`);
      // On API error, default to accepting as form (don't block on validation failure)
      return { type: "form", confidence: 0.5, reason: "Validation API error - defaulting to form" };
    }

    const data = await response.json();
    const aiText = data.content[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`[STEP D] Could not parse validation response: ${aiText}`);
      return { type: "form", confidence: 0.5, reason: "Could not parse validation response" };
    }

    const result: ValidationResult = JSON.parse(jsonMatch[0]);
    console.log(`[STEP D] ${result.type.toUpperCase()}: ${formId} (${result.confidence}) - ${result.reason}`);
    return result;
  } catch (err: any) {
    console.log(`[STEP D] Validation error: ${err.message}`);
    return { type: "form", confidence: 0.5, reason: `Validation error: ${err.message}` };
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
    // STEP B, C, D: SEARCH + DOWNLOAD + VALIDATE
    // ========================================
    const results: any[] = [];
    let formsValidated = 0;
    let rulesFound = 0;
    let junkRejected = 0;
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
      let pdfBytes: Uint8Array | null = null;

      if (pdfUrl) {
        const downloadResult = await downloadAndUploadPdf(form, pdfUrl, stateUpper, supabase);
        storage_bucket = downloadResult.storage_bucket;
        storage_path = downloadResult.storage_path;
        file_size_bytes = downloadResult.file_size_bytes;
        downloadError = downloadResult.error;
        pdfBytes = downloadResult.pdfBytes;

        if (storage_path) {
          formsWithPdf++;
        }
      } else {
        downloadError = "No PDF URL found";
      }

      // STEP D: AI Validation (only if we got a valid PDF)
      let validationType: "form" | "rule" | "junk" = "form";
      let validationReason = "";
      let validationConfidence = 0.9;
      let suggestedName: string | undefined;

      if (pdfBytes && storage_path) {
        const validation = await validatePdfContent(
          pdfBytes, form.form_name, form.form_number,
          pdfUrl || "", stateUpper, anthropicApiKey
        );
        validationType = validation.type;
        validationReason = validation.reason;
        validationConfidence = validation.confidence;
        suggestedName = validation.suggestedName;
      }

      // Route based on validation type
      if (validationType === "junk") {
        junkRejected++;
        console.log(`[ROUTE] REJECTED JUNK: ${formId} - ${validationReason}`);

        // Delete uploaded PDF from storage
        if (storage_path) {
          await supabase.storage.from("form-staging").remove([storage_path]);
          console.log(`[ROUTE] Deleted junk PDF: ${storage_path}`);
        }

        results.push({
          form_number: form.form_number,
          form_name: form.form_name,
          category: form.category,
          type: "junk",
          reason: validationReason,
          has_pdf: false,
          error: `Rejected: ${validationReason}`
        });
        continue;
      }

      if (validationType === "rule") {
        rulesFound++;
        console.log(`[ROUTE] RULE FOUND: ${formId} - ${validationReason}`);

        // Insert into compliance_rules instead of form_staging
        const { error: ruleError } = await supabase
          .from("compliance_rules")
          .insert({
            state: stateUpper,
            agency_name: form.source_agency || "Unknown",
            agency_type: form.is_federal ? "federal" : "dmv",
            category: form.category,
            rule_name: suggestedName || form.form_name,
            rule_description: form.description || validationReason,
            applies_to_deal_types: form.required_for,
            deadline_days: form.deadline ? parseInt(form.deadline) || null : null,
            penalty_description: form.penalty,
            source_url: pdfUrl,
            ai_confidence: validationConfidence,
            ai_research_notes: `Auto-discovered. Validated as rule: ${validationReason}`,
            status: "active"
          });

        if (ruleError) {
          console.error(`[ROUTE] Rule insert error for ${formId}:`, ruleError.message);
        }

        // Keep PDF in storage but don't insert into form_staging
        results.push({
          form_number: form.form_number,
          form_name: form.form_name,
          category: form.category,
          type: "rule",
          reason: validationReason,
          has_pdf: !!storage_path,
          error: null
        });
        continue;
      }

      // Type === "form" - insert into form_staging as normal
      formsValidated++;
      console.log(`[ROUTE] FORM VALIDATED: ${formId}`);

      const insertData = {
        state: stateUpper,
        form_number: form.form_number,
        form_name: suggestedName || form.form_name,
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
        ai_confidence: validationConfidence,
        ai_discovered: true,
        ai_notes: validationReason,
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
        form_name: suggestedName || form.form_name,
        category: form.category,
        type: "form",
        reason: validationReason,
        deadline: form.deadline,
        has_pdf: !!storage_path,
        error: downloadError
      });
    }

    console.log(`\n========================================`);
    console.log(`COMPLETE: ${discoveredForms.length} discovered`);
    console.log(`  Forms validated: ${formsValidated}`);
    console.log(`  Rules found: ${rulesFound}`);
    console.log(`  Junk rejected: ${junkRejected}`);
    console.log(`  PDFs downloaded: ${formsWithPdf}`);
    console.log(`========================================\n`);

    return new Response(
      JSON.stringify({
        success: true,
        source: "discovered",
        state: stateUpper,
        state_name: stateName,
        forms_found: discoveredForms.length,
        forms_validated: formsValidated,
        rules_found: rulesFound,
        junk_rejected: junkRejected,
        forms_with_pdf: formsWithPdf,
        forms: results,
        message: `Discovered ${discoveredForms.length} for ${stateName}. ${formsValidated} forms, ${rulesFound} rules, ${junkRejected} junk rejected.`
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

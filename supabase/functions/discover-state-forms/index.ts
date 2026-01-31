import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// STATE NAMES
// ============================================
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

// ============================================
// SERPAPI - REAL GOOGLE SEARCH
// ============================================
interface SerpResult {
  title: string;
  link: string;
  snippet?: string;
  displayed_link?: string;
}

const searchGoogle = async (query: string): Promise<SerpResult[]> => {
  const apiKey = Deno.env.get("SERP_API_KEY");
  if (!apiKey) {
    console.log("[SERP] No API key configured");
    return [];
  }

  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=10`;

  try {
    console.log(`[SERP] Searching: ${query}`);
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error(`[SERP] Error: ${data.error}`);
      return [];
    }

    const results = data.organic_results || [];
    console.log(`[SERP] Found ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[SERP] Fetch error: ${err.message}`);
    return [];
  }
};

// ============================================
// URL VALIDATION
// ============================================
const validateUrl = async (url: string): Promise<{ valid: boolean; isPdf: boolean; isGov: boolean }> => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    const contentType = response.headers.get("content-type") || "";
    const isPdf = contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");
    const isGov = url.includes(".gov");

    return { valid: response.ok, isPdf, isGov };
  } catch {
    return { valid: false, isPdf: false, isGov: false };
  }
};

// ============================================
// PDF DOWNLOAD & UPLOAD
// ============================================
const downloadAndUploadPdf = async (
  state: string,
  formName: string,
  pdfUrl: string
): Promise<{ success: boolean; storedUrl?: string; error?: string }> => {
  try {
    console.log(`[PDF] Downloading: ${pdfUrl}`);

    const response = await fetch(pdfUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      return { success: false, error: "URL returned HTML, not PDF" };
    }

    const buffer = await response.arrayBuffer();

    // Verify PDF header
    const header = String.fromCharCode(...new Uint8Array(buffer.slice(0, 5)));
    if (!header.startsWith("%PDF")) {
      return { success: false, error: "Not a valid PDF" };
    }

    // Upload to storage
    const fileName = `${state}/${formName.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("form-pdfs")
      .upload(fileName, new Uint8Array(buffer), { contentType: "application/pdf" });

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data: urlData } = supabase.storage.from("form-pdfs").getPublicUrl(fileName);
    console.log(`[PDF] Uploaded: ${fileName}`);

    return { success: true, storedUrl: urlData.publicUrl };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ============================================
// FORM NUMBER EXTRACTION
// ============================================
const extractFormNumber = (text: string): string | null => {
  const patterns = [
    /\b(TC-\d{2,4}[A-Z]?)\b/i,           // Utah: TC-656
    /\b(VTR-\d{1,4}[A-Z]?)\b/i,          // Texas: VTR-271
    /\b(130-U)\b/i,                       // Texas: 130-U
    /\b(REG\s*\d{1,4}[A-Z]?)\b/i,        // California: REG 343
    /\b(HSMV\s*\d{4,6})\b/i,             // Florida: HSMV 82040
    /\b(\d{2}-\d{4})\b/,                  // Arizona: 96-0236
    /\b(VP-\d{1,4})\b/i,                  // Nevada: VP-104
    /\b(DR\s*\d{3,4})\b/i,               // Colorado: DR 2395
    /\b(MV-\d{1,3}[A-Z]?)\b/i,           // Georgia/PA: MV-1
    /\b(T-\d{1,3}[A-Z]?)\b/i,            // Georgia: T-7
    /\b(MVR-\d{1,4}[A-Z]?)\b/i,          // North Carolina: MVR-1
    /\b(BMV\s*\d{3,4})\b/i,              // Ohio: BMV 3774
    /\b(DTF-\d{3})\b/i,                  // New York: DTF-802
    /\b(VSD\s*\d{3})\b/i,                // Illinois: VSD 190
    /\b(TR-\d{1,3}[A-Z]?)\b/i,           // Michigan/RI: TR-11
    /\b(RD-\d{3})\b/i,                   // Michigan: RD-108
    /\b(VSA-\d{1,3}[A-Z]?)\b/i,          // Virginia: VSA-17A
    /\b(DLR-\d{1,2})\b/i,                // Virginia: DLR-1
    /\b(TD-\d{3}-\d{3})\b/i,             // Washington: TD-420-004
    /\b(735-\d{3,4})\b/i,                // Oregon: 735-226
    /\b(RMV-\d{1,2}[A-Z]?)\b/i,          // Massachusetts: RMV-1
    /\b(OS\/SS-\d{1,2}[A-Z]?)\b/i,       // New Jersey: OS/SS-8
    /\bForm\s+(\d{1,6}[A-Z]?)\b/i,       // Generic: Form 123
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
};

// ============================================
// BASELINE FORMS - Every dealer needs these
// ============================================
interface BaselineForm {
  form_name: string;
  category: string;
  description: string;
  deal_types: string[];
  federal?: boolean;
  search_terms: string[];
}

const baselineForms: BaselineForm[] = [
  // DEAL DOCUMENTS
  {
    form_name: "Bill of Sale",
    category: "deal",
    description: "Documents the sale transaction",
    deal_types: ["cash", "bhph", "traditional", "wholesale"],
    search_terms: ["bill of sale", "vehicle bill of sale"]
  },
  {
    form_name: "Title Application",
    category: "title",
    description: "Application to transfer vehicle title",
    deal_types: ["cash", "bhph", "traditional"],
    search_terms: ["title application", "certificate of title application", "title transfer"]
  },
  {
    form_name: "Odometer Disclosure Statement",
    category: "deal",
    description: "Federal requirement - disclose mileage",
    deal_types: ["cash", "bhph", "traditional", "wholesale"],
    federal: true,
    search_terms: ["odometer disclosure", "mileage statement"]
  },
  {
    form_name: "Power of Attorney",
    category: "title",
    description: "Authorizes dealer to sign title documents",
    deal_types: ["bhph", "traditional", "wholesale"],
    search_terms: ["power of attorney vehicle", "title power of attorney"]
  },
  {
    form_name: "Dealer Report of Sale",
    category: "title",
    description: "Notifies DMV of vehicle sale",
    deal_types: ["cash", "bhph", "traditional"],
    search_terms: ["dealer report of sale", "notice of sale", "report of sale"]
  },
  {
    form_name: "Temporary Permit",
    category: "title",
    description: "Temp tag while registration processes",
    deal_types: ["cash", "bhph", "traditional"],
    search_terms: ["temporary permit", "temp tag", "temporary registration", "transit permit"]
  },
  {
    form_name: "Buyers Guide",
    category: "deal",
    description: "FTC required - must display on all used vehicles",
    deal_types: ["cash", "bhph", "traditional"],
    federal: true,
    search_terms: ["FTC buyers guide", "used car buyers guide"]
  },
  {
    form_name: "Retail Installment Contract",
    category: "financing",
    description: "Finance agreement for BHPH sales",
    deal_types: ["bhph"],
    search_terms: ["retail installment contract", "motor vehicle retail installment"]
  },
  {
    form_name: "Truth in Lending Disclosure",
    category: "financing",
    description: "Federal Reg Z - disclose APR and finance charges",
    deal_types: ["bhph"],
    federal: true,
    search_terms: ["truth in lending", "TILA disclosure", "regulation z"]
  },
  {
    form_name: "Credit Application",
    category: "financing",
    description: "Application for vehicle financing",
    deal_types: ["bhph", "traditional"],
    search_terms: ["credit application auto", "vehicle financing application"]
  },
  {
    form_name: "Privacy Notice",
    category: "financing",
    description: "GLBA privacy disclosure",
    deal_types: ["bhph", "traditional"],
    federal: true,
    search_terms: ["GLBA privacy notice", "gramm leach bliley"]
  },
  {
    form_name: "Damage Disclosure",
    category: "disclosure",
    description: "Discloses known vehicle damage",
    deal_types: ["cash", "bhph", "traditional"],
    search_terms: ["damage disclosure statement", "vehicle damage disclosure"]
  },
  {
    form_name: "Lien Release",
    category: "title",
    description: "Releases existing lien on title",
    deal_types: ["cash", "bhph", "traditional"],
    search_terms: ["lien release", "lien satisfaction", "release of lien"]
  },
  {
    form_name: "Sales Tax Form",
    category: "tax",
    description: "Sales tax return or exemption",
    deal_types: [],
    search_terms: ["motor vehicle sales tax", "dealer sales tax return"]
  },
  {
    form_name: "Resale Certificate",
    category: "tax",
    description: "For dealer-to-dealer sales (no tax)",
    deal_types: ["wholesale"],
    search_terms: ["resale certificate", "dealer resale certificate"]
  },
];

// ============================================
// SEARCH AND DISCOVER FORMS
// ============================================
interface DiscoveredForm {
  form_name: string;
  form_number: string | null;
  source_url: string | null;
  stored_url: string | null;
  description: string;
  category: string;
  deal_types: string[];
  federal: boolean;
  pdf_validated: boolean;
  is_gov: boolean;
}

const discoverFormsForState = async (state: string, stateName: string): Promise<DiscoveredForm[]> => {
  const discovered: DiscoveredForm[] = [];
  const seenUrls = new Set<string>();

  for (const baseForm of baselineForms) {
    console.log(`[${state}] Searching for: ${baseForm.form_name}`);

    let bestResult: { url: string; formNumber: string | null; isGov: boolean; isPdf: boolean } | null = null;

    // Search for this form type
    for (const searchTerm of baseForm.search_terms) {
      // Prioritize .gov sites
      const govQuery = `${stateName} ${searchTerm} site:.gov filetype:pdf`;
      const govResults = await searchGoogle(govQuery);

      for (const result of govResults) {
        if (seenUrls.has(result.link)) continue;

        const validation = await validateUrl(result.link);
        if (validation.valid && validation.isPdf) {
          const formNumber = extractFormNumber(`${result.title} ${result.snippet || ""}`);
          bestResult = { url: result.link, formNumber, isGov: true, isPdf: true };
          seenUrls.add(result.link);
          break;
        }
      }

      if (bestResult) break;

      // If no .gov PDF found, try general search
      const generalQuery = `${stateName} ${searchTerm} pdf`;
      const generalResults = await searchGoogle(generalQuery);

      for (const result of generalResults) {
        if (seenUrls.has(result.link)) continue;
        if (result.link.includes("youtube.com") || result.link.includes("facebook.com")) continue;

        const validation = await validateUrl(result.link);
        if (validation.valid) {
          const formNumber = extractFormNumber(`${result.title} ${result.snippet || ""}`);
          if (validation.isPdf) {
            bestResult = { url: result.link, formNumber, isGov: validation.isGov, isPdf: true };
            seenUrls.add(result.link);
            break;
          } else if (!bestResult) {
            bestResult = { url: result.link, formNumber, isGov: validation.isGov, isPdf: false };
            seenUrls.add(result.link);
          }
        }
      }

      if (bestResult?.isPdf) break;

      // Small delay between searches
      await new Promise(r => setTimeout(r, 300));
    }

    // Create the discovered form
    const form: DiscoveredForm = {
      form_name: baseForm.form_name,
      form_number: bestResult?.formNumber || null,
      source_url: bestResult?.url || null,
      stored_url: null,
      description: baseForm.description,
      category: baseForm.category,
      deal_types: baseForm.deal_types,
      federal: baseForm.federal || false,
      pdf_validated: false,
      is_gov: bestResult?.isGov || false,
    };

    // If we found a PDF, try to download and store it
    if (bestResult?.isPdf && bestResult.url) {
      const uploadResult = await downloadAndUploadPdf(state, baseForm.form_name, bestResult.url);
      if (uploadResult.success && uploadResult.storedUrl) {
        form.stored_url = uploadResult.storedUrl;
        form.pdf_validated = true;
      }
    }

    discovered.push(form);
    console.log(`[${state}] ${baseForm.form_name}: ${form.pdf_validated ? "PDF stored" : form.source_url ? "URL found" : "Not found"}`);
  }

  return discovered;
};

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, dealer_id, clear_existing } = await req.json();
    if (!state) throw new Error("State is required");

    const stateUpper = state.toUpperCase();
    const stateName = stateNames[stateUpper];
    if (!stateName) throw new Error(`Unknown state: ${state}`);

    console.log(`[${stateUpper}] Starting form discovery for ${stateName}...`);

    // Clear existing if requested
    if (clear_existing) {
      await supabase.from("form_staging").delete().eq("state", stateUpper);
      console.log(`[${stateUpper}] Cleared existing forms`);
    }

    // Check existing forms
    const { data: existing } = await supabase
      .from("form_staging")
      .select("form_name")
      .eq("state", stateUpper);

    const existingNames = new Set(existing?.map(f => f.form_name?.toLowerCase()) || []);

    // Discover forms using SerpAPI
    const discovered = await discoverFormsForState(stateUpper, stateName);

    // Insert forms
    const toInsert: any[] = [];
    let pdfsFound = 0;
    let urlsFound = 0;

    for (const form of discovered) {
      if (existingNames.has(form.form_name.toLowerCase())) continue;

      const workflowStatus = form.pdf_validated ? "staging" : form.source_url ? "needs_upload" : "needs_upload";

      toInsert.push({
        form_name: form.form_name,
        form_number: form.form_number,
        state: stateUpper,
        source_url: form.stored_url || form.source_url,
        category: form.category,
        description: form.description + (form.federal ? " (Federal)" : ""),
        deal_types: form.deal_types.length > 0 ? form.deal_types : null,
        workflow_status: workflowStatus,
        form_number_confirmed: !!form.form_number,
        pdf_validated: form.pdf_validated,
        url_validated: !!form.source_url,
        ai_discovered: true,
        mapping_status: "pending",
        ...(dealer_id ? { dealer_id } : {}),
      });

      if (form.pdf_validated) pdfsFound++;
      else if (form.source_url) urlsFound++;
    }

    let insertedCount = 0;
    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from("form_staging")
        .insert(toInsert)
        .select("id");

      if (error) throw error;
      insertedCount = data?.length || 0;
    }

    // Group by deal type for response
    const byDealType: Record<string, any[]> = {
      cash: [], bhph: [], traditional: [], wholesale: [], reporting: []
    };

    for (const form of discovered) {
      if (form.deal_types.length === 0) {
        byDealType.reporting.push(form);
      } else {
        for (const dt of form.deal_types) {
          if (byDealType[dt]) byDealType[dt].push(form);
        }
      }
    }

    console.log(`[${stateUpper}] Complete: ${insertedCount} inserted, ${pdfsFound} PDFs, ${urlsFound} URLs`);

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        state_name: stateName,
        forms_discovered: discovered.length,
        forms_added: insertedCount,
        pdfs_downloaded: pdfsFound,
        urls_found: urlsFound,
        forms_by_deal_type: {
          cash: byDealType.cash.length,
          bhph: byDealType.bhph.length,
          traditional: byDealType.traditional.length,
          wholesale: byDealType.wholesale.length,
          reporting: byDealType.reporting.length,
        },
        forms: discovered.map(f => ({
          form_name: f.form_name,
          form_number: f.form_number,
          has_pdf: f.pdf_validated,
          has_url: !!f.source_url,
          is_gov: f.is_gov,
          category: f.category,
          deal_types: f.deal_types,
        })),
        message: `Found ${discovered.length} forms for ${stateName}. ${pdfsFound} PDFs downloaded, ${urlsFound} URLs found.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

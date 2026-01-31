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
// SERPAPI SEARCH
// ============================================
interface SerpResult {
  title: string;
  link: string;
  snippet?: string;
  displayed_link?: string;
}

const searchGoogle = async (query: string, logPrefix = "[SERP]"): Promise<SerpResult[]> => {
  const apiKey = Deno.env.get("SERP_API_KEY");
  if (!apiKey) {
    console.log(`${logPrefix} No API key configured`);
    return [];
  }

  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=15`;

  try {
    console.log(`${logPrefix} Searching: ${query}`);
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error(`${logPrefix} Error: ${data.error}`);
      return [];
    }

    const results = data.organic_results || [];
    console.log(`${logPrefix} Found ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`${logPrefix} Fetch error: ${err.message}`);
    return [];
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
    if (match) return match[1].replace(/\s+/g, " ").trim().toUpperCase();
  }
  return null;
};

// ============================================
// EXTRACT FORM NAME FROM TITLE/SNIPPET
// ============================================
const extractFormName = (title: string, snippet: string): string => {
  let name = title
    .replace(/\s*[-|]\s*(PDF|Download|Form|Official|State|DMV|Gov).*$/i, '')
    .replace(/\s*\.\s*pdf\s*$/i, '')
    .trim();

  if (name.length < 10 && snippet) {
    const firstSentence = snippet.split(/[.!?]/)[0];
    if (firstSentence.length > name.length) {
      name = firstSentence.substring(0, 100).trim();
    }
  }

  return name.substring(0, 150);
};

// ============================================
// FUZZY MATCH FORM NAMES
// ============================================
const fuzzyMatchScore = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union;
};

// ============================================
// CHECK URL FOR UPDATES
// ============================================
interface UrlCheckResult {
  accessible: boolean;
  isPdf: boolean;
  lastModified?: string;
  contentLength?: number;
  etag?: string;
}

const checkUrl = async (url: string): Promise<UrlCheckResult> => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });

    const contentType = response.headers.get("content-type") || "";
    const isPdf = contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");

    return {
      accessible: response.ok,
      isPdf,
      lastModified: response.headers.get("last-modified") || undefined,
      contentLength: parseInt(response.headers.get("content-length") || "0") || undefined,
      etag: response.headers.get("etag") || undefined,
    };
  } catch {
    return { accessible: false, isPdf: false };
  }
};

// ============================================
// USE AI TO COMPARE FORM NAMES (Optional)
// ============================================
const aiCompareFormNames = async (
  existingName: string,
  foundName: string,
  existingNumber: string | null,
  foundNumber: string | null
): Promise<{ isSameForm: boolean; confidence: number; reason: string }> => {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (existingNumber && foundNumber && existingNumber.toUpperCase() === foundNumber.toUpperCase()) {
    return { isSameForm: true, confidence: 0.95, reason: "Form numbers match exactly" };
  }

  const fuzzyScore = fuzzyMatchScore(existingName, foundName);
  if (fuzzyScore >= 0.8) {
    return { isSameForm: true, confidence: fuzzyScore, reason: "Names are very similar" };
  }
  if (fuzzyScore <= 0.2) {
    return { isSameForm: false, confidence: 1 - fuzzyScore, reason: "Names are very different" };
  }

  if (!anthropicKey) {
    return { isSameForm: fuzzyScore >= 0.5, confidence: fuzzyScore, reason: "Fuzzy match (no AI)" };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Are these two motor vehicle dealer forms the same form (possibly different versions)?

Existing form: "${existingName}" ${existingNumber ? `(${existingNumber})` : ''}
Found form: "${foundName}" ${foundNumber ? `(${foundNumber})` : ''}

Reply with JSON only: {"same": true/false, "confidence": 0.0-1.0, "reason": "brief reason"}`
        }]
      })
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.content[0]?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          isSameForm: result.same === true,
          confidence: result.confidence || 0.5,
          reason: result.reason || "AI comparison"
        };
      }
    }
  } catch (err) {
    console.log("[AI] Compare error:", err.message);
  }

  return { isSameForm: fuzzyScore >= 0.5, confidence: fuzzyScore, reason: "Fuzzy match fallback" };
};

// ============================================
// CATEGORIZE FORM
// ============================================
const categorizeForm = (title: string, snippet: string): string => {
  const text = `${title} ${snippet}`.toLowerCase();

  if (text.includes("title") || text.includes("registration") || text.includes("certificate")) return "title";
  if (text.includes("bill of sale") || text.includes("sales")) return "deal";
  if (text.includes("odometer") || text.includes("mileage")) return "disclosure";
  if (text.includes("tax") || text.includes("sales tax") || text.includes("exemption")) return "tax";
  if (text.includes("power of attorney") || text.includes("poa")) return "title";
  if (text.includes("lien") || text.includes("security")) return "financing";
  if (text.includes("damage") || text.includes("disclosure")) return "disclosure";
  if (text.includes("dealer") || text.includes("license")) return "licensing";

  return "deal";
};

// ============================================
// FOUND FORM INTERFACE
// ============================================
interface FoundForm {
  form_name: string;
  form_number: string | null;
  source_url: string;
  category: string;
  description: string;
  is_gov: boolean;
  is_pdf: boolean;
}

// ============================================
// NEWS ITEM INTERFACE
// ============================================
interface NewsItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  date: string;
  is_gov: boolean;
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, dealer_id } = await req.json();
    if (!state) throw new Error("State is required");

    const stateUpper = state.toUpperCase();
    const stateName = stateNames[stateUpper];
    if (!stateName) throw new Error(`Unknown state: ${state}`);

    console.log(`[${stateUpper}] Checking for form updates...`);

    // ============================================
    // 1. FETCH EXISTING FORMS
    // ============================================
    const { data: existingForms, error: fetchError } = await supabase
      .from("form_staging")
      .select("*")
      .eq("state", stateUpper);

    if (fetchError) throw fetchError;

    console.log(`[${stateUpper}] Found ${existingForms?.length || 0} existing forms`);

    // Build lookup maps
    const existingByNumber = new Map<string, any>();
    const existingByUrl = new Map<string, any>();
    const existingByName = new Map<string, any>();

    for (const form of existingForms || []) {
      if (form.form_number) {
        existingByNumber.set(form.form_number.toUpperCase(), form);
      }
      if (form.source_url) {
        existingByUrl.set(form.source_url, form);
      }
      if (form.form_name) {
        existingByName.set(form.form_name.toLowerCase(), form);
      }
    }

    // ============================================
    // 2. SEARCH FOR CURRENT FORM REQUIREMENTS
    // ============================================
    const currentYear = new Date().getFullYear();
    const searchQueries = [
      `${stateName} motor vehicle dealer required forms ${currentYear} site:.gov`,
      `${stateName} DMV dealer forms ${currentYear}`,
      `${stateName} auto dealer forms PDF site:.gov`,
      `${stateName} tax commission motor vehicle forms`,
      `${stateName} title registration dealer forms`,
    ];

    const allResults: SerpResult[] = [];
    const seenUrls = new Set<string>();

    for (const query of searchQueries) {
      const results = await searchGoogle(query, "[FORMS]");
      for (const r of results) {
        if (!seenUrls.has(r.link)) {
          seenUrls.add(r.link);
          allResults.push(r);
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[FORMS] Found ${allResults.length} unique form search results`);

    // ============================================
    // 3. PROCESS FOUND FORMS (PDF-focused)
    // ============================================
    const foundForms: FoundForm[] = [];
    const processedUrls = new Set<string>();

    for (const result of allResults) {
      if (result.link.includes("youtube.com") || result.link.includes("facebook.com")) continue;
      if (processedUrls.has(result.link)) continue;
      processedUrls.add(result.link);

      const urlCheck = await checkUrl(result.link);
      if (!urlCheck.accessible) continue;

      const formNumber = extractFormNumber(`${result.title} ${result.snippet || ""}`);
      const formName = extractFormName(result.title, result.snippet || "");

      const textLower = `${result.title} ${result.snippet || ""}`.toLowerCase();
      if (!textLower.includes("form") && !textLower.includes("application") &&
          !textLower.includes("title") && !textLower.includes("registration") &&
          !formNumber && !urlCheck.isPdf) {
        continue;
      }

      foundForms.push({
        form_name: formName,
        form_number: formNumber,
        source_url: result.link,
        category: categorizeForm(result.title, result.snippet || ""),
        description: (result.snippet || "").substring(0, 200),
        is_gov: result.link.includes(".gov"),
        is_pdf: urlCheck.isPdf,
      });
    }

    console.log(`[FORMS] Processed ${foundForms.length} potential forms`);

    // ============================================
    // 4. COMPARE FOUND FORMS WITH EXISTING
    // ============================================
    const newForms: FoundForm[] = [];
    const potentialUpdates: Array<{
      existing: any;
      found: FoundForm;
      reason: string;
      confidence: number;
    }> = [];
    const matchedExistingIds = new Set<string>();

    for (const found of foundForms) {
      let matched = false;

      if (found.form_number) {
        const existing = existingByNumber.get(found.form_number.toUpperCase());
        if (existing) {
          matched = true;
          matchedExistingIds.add(existing.id);

          if (existing.source_url !== found.source_url) {
            const existingCheck = existing.source_url ? await checkUrl(existing.source_url) : null;
            const foundCheck = await checkUrl(found.source_url);

            let reason = "Different source URL found";
            if (!existingCheck?.accessible && foundCheck.accessible) {
              reason = "Existing URL is broken, new URL works";
            } else if (found.is_gov && !existing.source_url?.includes(".gov")) {
              reason = "Found official .gov source";
            } else if (foundCheck.isPdf && !existingCheck?.isPdf) {
              reason = "Found direct PDF link";
            }

            potentialUpdates.push({
              existing: {
                id: existing.id,
                form_name: existing.form_name,
                form_number: existing.form_number,
                source_url: existing.source_url,
                last_verified: existing.url_validated_at || existing.updated_at,
              },
              found,
              reason,
              confidence: 0.9,
            });
          }
          continue;
        }
      }

      if (existingByUrl.has(found.source_url)) {
        matched = true;
        matchedExistingIds.add(existingByUrl.get(found.source_url).id);
        continue;
      }

      for (const [existingName, existing] of existingByName.entries()) {
        if (matchedExistingIds.has(existing.id)) continue;

        const comparison = await aiCompareFormNames(
          existing.form_name,
          found.form_name,
          existing.form_number,
          found.form_number
        );

        if (comparison.isSameForm && comparison.confidence >= 0.7) {
          matched = true;
          matchedExistingIds.add(existing.id);

          if (existing.source_url !== found.source_url) {
            potentialUpdates.push({
              existing: {
                id: existing.id,
                form_name: existing.form_name,
                form_number: existing.form_number,
                source_url: existing.source_url,
                last_verified: existing.url_validated_at || existing.updated_at,
              },
              found,
              reason: `${comparison.reason}; Different URL`,
              confidence: comparison.confidence,
            });
          }
          break;
        }
      }

      if (!matched) {
        if (found.form_number || found.is_pdf || found.is_gov) {
          newForms.push(found);
        }
      }
    }

    const unchangedCount = (existingForms?.length || 0) - matchedExistingIds.size +
      matchedExistingIds.size - potentialUpdates.length;

    console.log(`[FORMS] Results: ${newForms.length} new, ${potentialUpdates.length} updates, ${unchangedCount} unchanged`);

    // ============================================
    // 5. NEWS & NEWSLETTER SEARCHES (SEPARATE!)
    // ============================================
    console.log(`[NEWS] Starting separate news searches for ${stateName}...`);

    const newsQueries = [
      `${stateName} motor vehicle division news`,
      `${stateName} DMV newsletter`,
      `${stateName} auto dealer news ${currentYear}`,
      `${stateName} MVED announcement`,
      `${stateName} dealer regulation changes ${currentYear}`,
      `${stateName} DMV regulatory update`,
      `${stateName} motor vehicle enforcement news`,
    ];

    const newsletters: NewsItem[] = [];
    const seenNewsUrls = new Set<string>();

    for (const query of newsQueries) {
      console.log(`[NEWS] Searching: ${query}`);
      const results = await searchGoogle(query, "[NEWS]");

      for (const result of results) {
        // SKIP if it's a PDF - we want articles not forms
        if (result.link?.toLowerCase().endsWith('.pdf')) continue;

        // SKIP duplicates
        if (seenNewsUrls.has(result.link)) continue;
        seenNewsUrls.add(result.link);

        // SKIP social media
        if (result.link.includes("youtube.com") || result.link.includes("facebook.com")) continue;
        if (result.link.includes("linkedin.com") || result.link.includes("twitter.com")) continue;
        if (result.link.includes("instagram.com") || result.link.includes("tiktok.com")) continue;

        const snippetText = result.snippet || "";
        const titleText = result.title || "";
        const fullText = `${titleText} ${snippetText}`;

        // Check for old years (skip if too old)
        const hasOldYear = /201[0-9]|202[0-2]/.test(fullText);
        const hasRecentYear = /202[3-6]/.test(fullText);

        // Skip if it only mentions old years
        if (hasOldYear && !hasRecentYear) continue;

        // Extract source domain
        let source = "Unknown";
        try {
          source = new URL(result.link).hostname.replace(/^www\./, '');
        } catch {}

        newsletters.push({
          title: titleText.substring(0, 200),
          url: result.link,
          snippet: snippetText.substring(0, 300),
          source: source,
          date: hasRecentYear ? '2024+' : 'Unknown',
          is_gov: result.link.includes(".gov"),
        });
      }

      console.log(`[NEWS] Found ${newsletters.length} articles so far`);
      await new Promise(r => setTimeout(r, 300));
    }

    // Sort: .gov first, then by recent date
    newsletters.sort((a, b) => {
      if (a.is_gov && !b.is_gov) return -1;
      if (!a.is_gov && b.is_gov) return 1;
      if (a.date === '2024+' && b.date !== '2024+') return -1;
      if (a.date !== '2024+' && b.date === '2024+') return 1;
      return 0;
    });

    console.log(`[NEWS] Final count: ${newsletters.length} news articles`);

    // ============================================
    // 6. RETURN RESULTS
    // ============================================
    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        state_name: stateName,
        existing_count: existingForms?.length || 0,
        search_results_found: allResults.length,
        forms_analyzed: foundForms.length,
        scan_results: {
          new_forms: newForms.slice(0, 20),
          potential_updates: potentialUpdates.slice(0, 20),
          unchanged: Math.max(0, unchangedCount),
          newsletters: newsletters.slice(0, 20),
        },
        summary: {
          new_forms_count: newForms.length,
          potential_updates_count: potentialUpdates.length,
          unchanged_count: Math.max(0, unchangedCount),
          newsletters_count: newsletters.length,
        },
        message: `Found ${newForms.length} new forms, ${potentialUpdates.length} potential updates, and ${newsletters.length} news articles for ${stateName}.`,
        note: "No changes have been made. Review the results and use discover-state-forms or manual upload to add/update forms."
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

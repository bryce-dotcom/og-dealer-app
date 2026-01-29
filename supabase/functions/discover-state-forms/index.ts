import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// BASELINE FORMS - every used car dealer needs these
const baselineForms = [
  // DEAL DOCUMENTS (8)
  { form_name: "Bill of Sale", category: "deal", description: "Documents the sale transaction - required for every vehicle sale" },
  { form_name: "Buyers Order", category: "deal", description: "Purchase agreement with vehicle details, price, fees, and terms" },
  { form_name: "Odometer Disclosure Statement", category: "deal", description: "Federal requirement - must disclose mileage on all sales", federal: true },
  { form_name: "FTC Buyers Guide", category: "deal", description: "Federal requirement - must display on all used vehicles", federal: true },
  { form_name: "As-Is No Warranty Disclosure", category: "deal", description: "Discloses vehicle sold without warranty" },
  { form_name: "We-Owe / Due Bill", category: "deal", description: "Documents anything dealer owes buyer after sale" },
  { form_name: "Vehicle Delivery Receipt", category: "deal", description: "Buyer signs confirming vehicle receipt" },
  { form_name: "Vehicle Condition Report", category: "deal", description: "Documents vehicle condition at time of sale" },

  // TITLE & REGISTRATION (8)
  { form_name: "Title Application", category: "title", description: "Application to transfer or obtain vehicle title" },
  { form_name: "Dealer Report of Sale", category: "title", description: "Notifies DMV of vehicle sale by dealer" },
  { form_name: "Power of Attorney for Title", category: "title", description: "Authorizes dealer to sign title documents for buyer" },
  { form_name: "Secure Power of Attorney", category: "title", description: "Odometer-specific POA for title transfers" },
  { form_name: "Lien Release", category: "title", description: "Releases existing lien on vehicle title" },
  { form_name: "Duplicate Title Request", category: "title", description: "Request replacement title" },
  { form_name: "Temporary Permit", category: "title", description: "Temp tag while registration processes" },
  { form_name: "VIN Verification", category: "title", description: "Verifies VIN matches records" },

  // FINANCING / BHPH (11)
  { form_name: "Retail Installment Contract", category: "financing", description: "Finance agreement with payment terms" },
  { form_name: "Motor Vehicle Sales Contract", category: "financing", description: "Contract for financed vehicle purchase" },
  { form_name: "Security Agreement", category: "financing", description: "Establishes lien for financed purchases" },
  { form_name: "Truth in Lending Disclosure", category: "financing", description: "Federal Reg Z - disclose APR and finance charges", federal: true },
  { form_name: "Credit Application", category: "financing", description: "Application for vehicle financing" },
  { form_name: "Privacy Notice", category: "financing", description: "Federal GLBA privacy disclosure", federal: true },
  { form_name: "Right to Cure Default Notice", category: "financing", description: "Notice of default with right to cure" },
  { form_name: "Notice of Intent to Repossess", category: "financing", description: "Legal notice before repossession" },
  { form_name: "GAP Waiver Agreement", category: "financing", description: "GAP coverage agreement" },
  { form_name: "Payment Schedule", category: "financing", description: "Amortization showing all payments" },
  { form_name: "Arbitration Agreement", category: "financing", description: "Agreement to arbitrate disputes" },

  // TAX (3)
  { form_name: "Sales Tax Return", category: "tax", description: "Monthly/quarterly sales tax filing" },
  { form_name: "Sales Tax Exemption Certificate", category: "tax", description: "For tax-exempt purchases" },
  { form_name: "Resale Certificate", category: "tax", description: "For dealer-to-dealer sales" },

  // DISCLOSURES (6)
  { form_name: "Damage Disclosure Statement", category: "disclosure", description: "Discloses known damage" },
  { form_name: "Salvage Title Disclosure", category: "disclosure", description: "Discloses salvage title history" },
  { form_name: "Rebuilt Title Disclosure", category: "disclosure", description: "Discloses rebuilt/reconstructed title" },
  { form_name: "Frame Damage Disclosure", category: "disclosure", description: "Discloses structural damage" },
  { form_name: "Flood Damage Disclosure", category: "disclosure", description: "Discloses flood damage" },
  { form_name: "Accident History Disclosure", category: "disclosure", description: "Discloses known accidents" },

  // COMPLIANCE (4)
  { form_name: "Dealer License Application", category: "compliance", description: "Apply for dealer license" },
  { form_name: "Dealer License Renewal", category: "compliance", description: "Annual license renewal" },
  { form_name: "Surety Bond", category: "compliance", description: "Required dealer bond" },
  { form_name: "Consignment Agreement", category: "compliance", description: "Agreement to sell on consignment" },
];

// State form resources - where to find forms
const stateResources: Record<string, { dmv: string; tax: string; forms: string; formNumbers: Record<string, string> }> = {
  UT: {
    dmv: "https://dmv.utah.gov",
    tax: "https://tax.utah.gov",
    forms: "https://dmv.utah.gov/vehicles/dealers",
    formNumbers: {
      "Title Application": "TC-656",
      "Dealer Report of Sale": "TC-69",
      "Bill of Sale": "TC-843",
      "Power of Attorney for Title": "TC-842",
      "Temporary Permit": "TC-122",
      "Sales Tax Return": "TC-62M",
      "Dealer License Application": "MV-30",
    }
  },
  TX: {
    dmv: "https://www.txdmv.gov",
    tax: "https://comptroller.texas.gov",
    forms: "https://www.txdmv.gov/motorists/buying-or-selling-a-vehicle",
    formNumbers: {
      "Title Application": "Form 130-U",
      "Bill of Sale": "N/A - Custom",
      "Power of Attorney for Title": "VTR-271",
      "Temporary Permit": "Temp Tag",
    }
  },
  CA: {
    dmv: "https://www.dmv.ca.gov",
    tax: "https://www.cdtfa.ca.gov",
    forms: "https://www.dmv.ca.gov/portal/vehicle-industry-services/",
    formNumbers: {
      "Title Application": "REG 343",
      "Bill of Sale": "REG 135",
      "Power of Attorney for Title": "REG 260",
      "Odometer Disclosure Statement": "REG 262",
    }
  },
  FL: {
    dmv: "https://www.flhsmv.gov",
    tax: "https://floridarevenue.com",
    forms: "https://www.flhsmv.gov/motor-vehicles-tags-titles/",
    formNumbers: {
      "Title Application": "HSMV 82040",
      "Bill of Sale": "HSMV 82050",
      "Power of Attorney for Title": "HSMV 82053",
      "Odometer Disclosure Statement": "HSMV 82993",
    }
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, dealer_id, clear_existing } = await req.json();
    if (!state) throw new Error("State is required");

    const stateUpper = state.toUpperCase();
    const resources = stateResources[stateUpper] || {
      dmv: `https://dmv.${state.toLowerCase()}.gov`,
      tax: `https://tax.${state.toLowerCase()}.gov`,
      forms: `https://dmv.${state.toLowerCase()}.gov/forms`,
      formNumbers: {}
    };

    // Option to clear existing forms first
    if (clear_existing) {
      console.log(`[${stateUpper}] Clearing existing forms...`);
      const { error: deleteError } = await supabase
        .from("form_staging")
        .delete()
        .eq("state", stateUpper);
      if (deleteError) {
        console.error(`[${stateUpper}] Delete error:`, deleteError.message);
      }
    }

    // Get existing forms to avoid duplicates
    const { data: existing } = await supabase
      .from("form_staging")
      .select("form_name")
      .eq("state", stateUpper);

    const existingNames = new Set(existing?.map(f => f.form_name?.toLowerCase()).filter(Boolean) || []);

    console.log(`[${stateUpper}] Adding ${baselineForms.length} baseline forms...`);
    console.log(`[${stateUpper}] ${existingNames.size} already exist`);

    // Build forms to insert - ALL baseline forms that don't already exist
    const toInsert: any[] = [];
    let skippedCount = 0;

    for (const baseForm of baselineForms) {
      // Skip if already exists
      if (existingNames.has(baseForm.form_name.toLowerCase())) {
        skippedCount++;
        continue;
      }

      // Get state-specific form number if known
      const formNumber = resources.formNumbers[baseForm.form_name] || (baseForm.federal ? "FEDERAL" : null);

      toInsert.push({
        form_number: formNumber,
        form_name: baseForm.form_name,
        state: stateUpper,
        source_url: resources.forms, // Link to state forms page, not direct PDF
        category: baseForm.category,
        description: baseForm.description + (baseForm.federal ? " (Federal Requirement)" : ""),
        workflow_status: "staging",
        pdf_validated: false, // User needs to upload or find PDF
        ai_discovered: false, // These are baseline forms, not AI discovered
        ...(dealer_id ? { dealer_id } : {}),
      });
    }

    console.log(`[${stateUpper}] Inserting ${toInsert.length} forms (${skippedCount} already existed)...`);

    // Insert forms
    let insertedCount = 0;
    let insertError: string | null = null;

    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from("form_staging")
        .insert(toInsert)
        .select("id");

      if (error) {
        console.error(`[${stateUpper}] Insert error:`, error.message);
        insertError = error.message;
      } else {
        insertedCount = data?.length || 0;
      }
    }

    console.log(`[${stateUpper}] Done: ${insertedCount} inserted`);

    // Count by category
    const byCategory: Record<string, number> = {};
    for (const form of toInsert) {
      byCategory[form.category] = (byCategory[form.category] || 0) + 1;
    }

    // Build response
    const formsList = toInsert.map(f => ({
      form_name: f.form_name,
      form_number: f.form_number,
      category: f.category,
      description: f.description,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,

        // Summary
        baseline_forms: baselineForms.length,
        total_inserted: insertedCount,
        already_existed: skippedCount,

        // By category
        forms_by_category: byCategory,

        // State resources - where to find actual PDFs
        state_resources: {
          dmv: resources.dmv,
          tax: resources.tax,
          forms_page: resources.forms,
        },

        // Instructions
        next_steps: [
          `Visit ${resources.forms} to find official PDF forms`,
          "Upload PDFs for each form using the Upload button",
          "Or add direct PDF URLs to source_url field"
        ],

        // Full form list
        forms: formsList,

        ...(insertError ? { insert_error: insertError } : {}),
        message: `Added ${insertedCount} forms for ${stateUpper}. ${skippedCount} already existed. Visit ${resources.forms} to find PDFs.`
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

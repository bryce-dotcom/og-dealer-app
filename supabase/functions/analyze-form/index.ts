import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// All available deal context mappings
const dealContextFields = [
  // Dealer
  "dealer.dealer_name", "dealer.address", "dealer.city", "dealer.state", "dealer.zip",
  "dealer.phone", "dealer.license_number", "dealer.ein", "dealer.email",
  // Vehicle
  "vehicle.vin", "vehicle.year", "vehicle.make", "vehicle.model", "vehicle.trim",
  "vehicle.color", "vehicle.mileage", "vehicle.stock_number", "vehicle.body_type",
  "vehicle.engine", "vehicle.transmission", "vehicle.fuel_type",
  // Deal
  "deal.purchaser_name", "deal.purchaser_address", "deal.purchaser_city", "deal.purchaser_state",
  "deal.purchaser_zip", "deal.purchaser_phone", "deal.purchaser_email", "deal.purchaser_dl",
  "deal.co_buyer_name", "deal.co_buyer_address",
  "deal.date_of_sale", "deal.sale_price", "deal.trade_value", "deal.trade_payoff",
  "deal.down_payment", "deal.sales_tax", "deal.doc_fee", "deal.registration_fee",
  "deal.title_fee", "deal.total_price", "deal.salesperson",
  // Financing
  "financing.amount_financed", "financing.apr", "financing.interest_rate", "financing.term_months",
  "financing.monthly_payment", "financing.first_payment_date", "financing.final_payment_date",
  "financing.total_of_payments", "financing.finance_charge",
  // Lien
  "lien.holder_name", "lien.holder_address", "lien.holder_city", "lien.holder_state",
  "lien.holder_zip", "lien.amount", "lien.release_date",
  // Trade-in Vehicle
  "trade.vin", "trade.year", "trade.make", "trade.model", "trade.mileage",
  // Signatures
  "signature.buyer", "signature.co_buyer", "signature.dealer", "signature.date",
  // Odometer
  "odometer.reading", "odometer.status", "odometer.date",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, source_url } = await req.json();

    if (!form_id) {
      throw new Error("form_id is required");
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("Missing Anthropic API key");
    }

    // Fetch the form from staging
    const { data: form, error: formError } = await supabase
      .from("form_staging")
      .select("*")
      .eq("id", form_id)
      .single();

    if (formError || !form) {
      throw new Error(`Form not found: ${formError?.message || "Unknown error"}`);
    }

    console.log(`Analyzing form: ${form.form_number} - ${form.form_name}`);

    // Use AI to analyze the form and extract field mappings
    const systemPrompt = `You are an expert at analyzing DMV and auto dealer forms.

Your task: Analyze the given form and:
1. Identify all fillable PDF fields this form would typically have
2. Map each field to the appropriate deal context variable

Available deal context mappings:
${dealContextFields.join(", ")}

Response format - return ONLY valid JSON, no markdown:
{
  "detected_fields": [
    "BuyerName",
    "BuyerAddress",
    "VIN",
    "SalePrice",
    ...
  ],
  "field_mapping": {
    "BuyerName": "deal.purchaser_name",
    "BuyerAddress": "deal.purchaser_address",
    "VIN": "vehicle.vin",
    "SalePrice": "deal.sale_price",
    ...
  },
  "unmapped_fields": ["CustomField1"],
  "form_type": "title|registration|bill_of_sale|disclosure|tax|lien_release|power_of_attorney",
  "notes": "Any special notes about this form"
}

IMPORTANT:
- detected_fields should contain realistic PDF field names (like "BuyerName", "VIN_Number", "PurchasePrice")
- field_mapping maps each detected field to a deal context variable
- Put any fields you can't map in unmapped_fields
- Map as many fields as possible - the goal is 99%+ mapping
- Be thorough - a typical form has 15-30 fields`;

    const userPrompt = `Analyze this DMV/dealer form and identify all its fillable fields:

Form Number: ${form.form_number}
Form Name: ${form.form_name}
State: ${form.state}
${source_url ? `Source URL: ${source_url}` : ""}

Based on this form's purpose, identify:
1. All PDF field names this form would have
2. Map each field to deal context variables
3. Identify any fields that can't be mapped

Return comprehensive field detection - be thorough!`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "{}";

    // Parse the JSON response
    let analysis: any = {
      detected_fields: [],
      field_mapping: {},
      unmapped_fields: [],
      form_type: "other",
      notes: ""
    };

    try {
      let cleaned = content;
      cleaned = cleaned.replace(/```json\s*/gi, "");
      cleaned = cleaned.replace(/```\s*/g, "");

      const objectMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        cleaned = objectMatch[0];
      }

      cleaned = cleaned.trim();
      analysis = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
    }

    // Ensure arrays exist
    if (!Array.isArray(analysis.detected_fields)) {
      analysis.detected_fields = [];
    }
    if (!analysis.field_mapping || typeof analysis.field_mapping !== "object") {
      analysis.field_mapping = {};
    }
    if (!Array.isArray(analysis.unmapped_fields)) {
      analysis.unmapped_fields = [];
    }

    // Calculate mapping confidence
    const totalFields = analysis.detected_fields.length;
    const mappedFields = Object.keys(analysis.field_mapping).length;
    const mappingConfidence = totalFields > 0
      ? Math.round((mappedFields / totalFields) * 100)
      : 0;

    console.log(`Analysis complete: ${mappedFields}/${totalFields} fields mapped (${mappingConfidence}%)`);

    // Update the form_staging record with analysis results
    const { error: updateError } = await supabase
      .from("form_staging")
      .update({
        status: "analyzed",
        detected_fields: analysis.detected_fields,
        field_mapping: analysis.field_mapping,
        mapping_confidence: mappingConfidence,
        form_type: analysis.form_type || "other",
        ai_confidence: mappingConfidence / 100, // Keep this for backward compatibility
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", form_id);

    if (updateError) {
      console.error("Failed to update form:", updateError);
      throw new Error(`Failed to update form: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        form_id,
        form_number: form.form_number,
        total_fields: totalFields,
        mapped_fields: mappedFields,
        mapping_confidence: mappingConfidence,
        detected_fields: analysis.detected_fields,
        field_mapping: analysis.field_mapping,
        unmapped_fields: analysis.unmapped_fields,
        form_type: analysis.form_type,
        notes: analysis.notes,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

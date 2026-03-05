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

// ============================================
// UNIVERSAL SCHEMAS FOR EACH DATA TYPE
// ============================================
const schemas = {
  inventory: {
    required: ['vin', 'year', 'make', 'model'],
    optional: ['trim', 'color', 'miles', 'stock_number', 'purchase_price', 'sale_price', 'status', 'purchased_from']
  },
  deals: {
    required: ['vehicle_id', 'purchaser_name', 'date_of_sale', 'price'],
    optional: ['customer_id', 'down_payment', 'trade_allowance', 'sales_tax', 'apr', 'term_months', 'monthly_payment', 'salesman', 'phone', 'email', 'address', 'city', 'state', 'zip']
  },
  customers: {
    required: ['name'],
    optional: ['phone', 'email', 'address', 'city', 'state', 'zip', 'drivers_license', 'first_name', 'last_name']
  }
};

// ============================================
// NORMALIZE FIELD NAMES
// ============================================
function normalizeFieldName(fieldName: string): string {
  return fieldName
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-\.]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// AUTO-MAP FIELD NAMES (Pattern Matching)
// ============================================
function autoMapField(dealerColumn: string, dataType: string): { field: string | null; confidence: number; transformation?: string } {
  const name = normalizeFieldName(dealerColumn);

  // Common mappings for ALL types
  const commonMappings: Record<string, { field: string; confidence: number; transformation?: string }> = {
    // Inventory
    'vin': { field: 'vin', confidence: 0.98 },
    'vehicle identification number': { field: 'vin', confidence: 0.98 },
    'year': { field: 'year', confidence: 0.95 },
    'make': { field: 'make', confidence: 0.95 },
    'model': { field: 'model', confidence: 0.95 },
    'trim': { field: 'trim', confidence: 0.95 },
    'color': { field: 'color', confidence: 0.90 },
    'odometer': { field: 'miles', confidence: 0.95 },
    'mileage': { field: 'miles', confidence: 0.95 },
    'miles': { field: 'miles', confidence: 0.95 },
    'stock': { field: 'stock_number', confidence: 0.85 },
    'stock number': { field: 'stock_number', confidence: 0.95 },
    'stock no': { field: 'stock_number', confidence: 0.95 },
    'purchase price': { field: 'purchase_price', confidence: 0.95, transformation: 'parse_currency' },
    'purch price': { field: 'purchase_price', confidence: 0.90, transformation: 'parse_currency' },
    'cost': { field: 'purchase_price', confidence: 0.80, transformation: 'parse_currency' },
    'sale price': { field: 'sale_price', confidence: 0.95, transformation: 'parse_currency' },
    'asking price': { field: 'sale_price', confidence: 0.90, transformation: 'parse_currency' },
    'list price': { field: 'sale_price', confidence: 0.90, transformation: 'parse_currency' },
    'status': { field: 'status', confidence: 0.90 },
    'purchased from': { field: 'purchased_from', confidence: 0.95 },

    // Deals
    'buyer': { field: 'purchaser_name', confidence: 0.85 },
    'buyer name': { field: 'purchaser_name', confidence: 0.95 },
    'purchaser': { field: 'purchaser_name', confidence: 0.90 },
    'purchaser name': { field: 'purchaser_name', confidence: 0.98 },
    'customer name': { field: 'purchaser_name', confidence: 0.95 },
    'sale date': { field: 'date_of_sale', confidence: 0.95, transformation: 'parse_date' },
    'date of sale': { field: 'date_of_sale', confidence: 0.98, transformation: 'parse_date' },
    'purchase date': { field: 'date_of_sale', confidence: 0.95, transformation: 'parse_date' },
    'price': { field: 'price', confidence: 0.80, transformation: 'parse_currency' },
    'sale price': { field: 'price', confidence: 0.90, transformation: 'parse_currency' },
    'selling price': { field: 'price', confidence: 0.90, transformation: 'parse_currency' },
    'down payment': { field: 'down_payment', confidence: 0.95, transformation: 'parse_currency' },
    'down': { field: 'down_payment', confidence: 0.80, transformation: 'parse_currency' },
    'trade allowance': { field: 'trade_allowance', confidence: 0.95, transformation: 'parse_currency' },
    'trade in': { field: 'trade_allowance', confidence: 0.90, transformation: 'parse_currency' },
    'trade': { field: 'trade_allowance', confidence: 0.75, transformation: 'parse_currency' },
    'sales tax': { field: 'sales_tax', confidence: 0.95, transformation: 'parse_currency' },
    'tax': { field: 'sales_tax', confidence: 0.70, transformation: 'parse_currency' },
    'apr': { field: 'apr', confidence: 0.98, transformation: 'parse_number' },
    'interest rate': { field: 'apr', confidence: 0.90, transformation: 'parse_number' },
    'term': { field: 'term_months', confidence: 0.80, transformation: 'parse_number' },
    'term months': { field: 'term_months', confidence: 0.95, transformation: 'parse_number' },
    'monthly payment': { field: 'monthly_payment', confidence: 0.95, transformation: 'parse_currency' },
    'payment': { field: 'monthly_payment', confidence: 0.70, transformation: 'parse_currency' },
    'salesman': { field: 'salesman', confidence: 0.95 },
    'sales person': { field: 'salesman', confidence: 0.95 },
    'phone': { field: 'phone', confidence: 0.90, transformation: 'normalize_phone' },
    'email': { field: 'email', confidence: 0.95, transformation: 'validate_email' },
    'address': { field: 'address', confidence: 0.90 },
    'city': { field: 'city', confidence: 0.95 },
    'state': { field: 'state', confidence: 0.90 },
    'zip': { field: 'zip', confidence: 0.95 },
    'zip code': { field: 'zip', confidence: 0.95 },

    // Customers
    'customer': { field: 'name', confidence: 0.85 },
    'name': { field: 'name', confidence: 0.90 },
    'full name': { field: 'name', confidence: 0.95 },
    'first name': { field: 'first_name', confidence: 0.98 },
    'last name': { field: 'last_name', confidence: 0.98 },
    'drivers license': { field: 'drivers_license', confidence: 0.98 },
    'dl number': { field: 'drivers_license', confidence: 0.95 },
    'dl': { field: 'drivers_license', confidence: 0.85 },
  };

  if (commonMappings[name]) {
    return commonMappings[name];
  }

  // Pattern matching for context-specific fields
  if (dataType === 'inventory') {
    if (name.includes('stock') && (name.includes('no') || name.includes('num'))) {
      return { field: 'stock_number', confidence: 0.90 };
    }
    if (name.includes('purchase') && name.includes('price')) {
      return { field: 'purchase_price', confidence: 0.90, transformation: 'parse_currency' };
    }
  }

  if (dataType === 'deals') {
    if (name.includes('buyer') || name.includes('purchaser')) {
      return { field: 'purchaser_name', confidence: 0.85 };
    }
    if (name.includes('down') && name.includes('payment')) {
      return { field: 'down_payment', confidence: 0.90, transformation: 'parse_currency' };
    }
  }

  if (dataType === 'customers') {
    if (name.includes('first') && name.includes('name')) {
      return { field: 'first_name', confidence: 0.95 };
    }
    if (name.includes('last') && name.includes('name')) {
      return { field: 'last_name', confidence: 0.95 };
    }
  }

  return { field: null, confidence: 0 };
}

// ============================================
// AI MAPPING PROMPT
// ============================================
function buildMappingPrompt(dataType: string, dealerColumns: string[], sampleData: any[]): string {
  const schema = schemas[dataType as keyof typeof schemas];
  const requiredFields = schema.required.join(', ');
  const optionalFields = schema.optional.join(', ');

  const columnsWithSamples = dealerColumns.map((col, idx) => {
    const samples = sampleData.slice(0, 3).map(row => row[col]).filter(v => v);
    return `- "${col}": [${samples.map(s => `"${s}"`).join(', ')}]`;
  }).join('\n');

  return `You are mapping CSV columns to a ${dataType} database schema.

DEALER COLUMNS (with sample data):
${columnsWithSamples}

OUR ${dataType.toUpperCase()} SCHEMA:
REQUIRED: ${requiredFields}
OPTIONAL: ${optionalFields}

MAPPING RULES:
1. Map exact matches with 0.95+ confidence
2. Map close matches with 0.7-0.9 confidence
3. Leave unmapped if uncertain (<0.7 confidence)
4. For concatenation (first_name + last_name → name), specify concat_with
5. For transformations, specify: parse_currency, parse_date, parse_number, normalize_phone, validate_email

EXAMPLES:
- "Cust_Phone" → phone (confidence: 0.9, transformation: "normalize_phone")
- "First" + "Last" → name (confidence: 0.95, concat_with: ["First", "Last"])
- "Purch_Price" → purchase_price (confidence: 0.9, transformation: "parse_currency")
- "Sale Date" → date_of_sale (confidence: 0.95, transformation: "parse_date")

Respond with JSON array ONLY:
[
  {
    "dealer_column": "exact column name",
    "db_field": "field_name or null",
    "confidence": 0.0 to 1.0,
    "transformation": "optional transformation name",
    "concat_with": ["col1", "col2"] (optional)
  }
]`;
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { detected_columns, data_type, sample_data, dealer_id } = await req.json();

    if (!detected_columns || !data_type || !dealer_id) {
      throw new Error("Missing required fields: detected_columns, data_type, dealer_id");
    }

    console.log(`[MAP] Mapping ${detected_columns.length} columns for ${data_type} import (dealer: ${dealer_id})`);

    // Check for saved mappings (learning system)
    const { data: savedMappings } = await supabase
      .from('dealer_import_mappings')
      .select('*')
      .eq('dealer_id', dealer_id)
      .eq('data_type', data_type);

    const savedMappingsMap = new Map(
      (savedMappings || []).map(m => [m.dealer_column_name, m.db_field_name])
    );

    console.log(`[MAP] Found ${savedMappingsMap.size} saved mappings for this dealer`);

    // Phase 1: Auto-mapping (pattern matching + saved mappings)
    let mappings: any[] = [];
    let mappedCount = 0;

    for (const column of detected_columns) {
      // Check saved mappings first
      if (savedMappingsMap.has(column)) {
        mappings.push({
          dealer_column: column,
          db_field: savedMappingsMap.get(column),
          confidence: 0.98,
          source: 'saved',
          auto_mapped: true
        });
        mappedCount++;
      } else {
        const autoMap = autoMapField(column, data_type);
        mappings.push({
          dealer_column: column,
          db_field: autoMap.field,
          confidence: autoMap.confidence,
          transformation: autoMap.transformation,
          source: 'pattern',
          auto_mapped: !!autoMap.field
        });
        if (autoMap.field) mappedCount++;
      }
    }

    console.log(`[MAP] Auto-mapped ${mappedCount}/${detected_columns.length} columns`);

    // Phase 2: AI enhancement (if needed)
    if (anthropicApiKey && mappedCount < detected_columns.length * 0.8) {
      console.log(`[MAP] Running AI to improve mappings...`);

      try {
        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: buildMappingPrompt(data_type, detected_columns, sample_data || [])
            }]
          })
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiText = aiData.content[0]?.text || "";

          const jsonMatch = aiText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const aiMappings = JSON.parse(jsonMatch[0]);

            // Merge AI mappings
            for (const aiMap of aiMappings) {
              const existing = mappings.find(m => m.dealer_column === aiMap.dealer_column);
              if (!existing) continue;

              const aiConfidence = aiMap.confidence || 0.8;
              const autoConfidence = existing.confidence || 0;

              if (!existing.db_field && aiMap.db_field) {
                existing.db_field = aiMap.db_field;
                existing.confidence = aiConfidence;
                existing.transformation = aiMap.transformation;
                existing.concat_with = aiMap.concat_with;
                existing.source = 'ai';
                existing.ai_mapped = true;
                mappedCount++;
              } else if (existing.db_field && aiMap.db_field && aiConfidence > autoConfidence) {
                existing.db_field = aiMap.db_field;
                existing.confidence = aiConfidence;
                existing.transformation = aiMap.transformation;
                existing.concat_with = aiMap.concat_with;
                existing.source = 'ai';
                existing.ai_mapped = true;
              }
            }

            console.log(`[MAP] AI enhanced mappings. Total mapped: ${mappedCount}`);
          }
        }
      } catch (aiErr) {
        console.log(`[MAP] AI mapping failed (non-fatal):`, aiErr);
      }
    }

    // Calculate overall confidence and check required fields
    const avgConfidence = mappings.reduce((sum, m) => sum + (m.confidence || 0), 0) / mappings.length;
    const schema = schemas[data_type as keyof typeof schemas];
    const mappedFields = new Set(mappings.filter(m => m.db_field).map(m => m.db_field));
    const missingRequired = schema.required.filter(f => !mappedFields.has(f));
    const requiredFieldsPresent = missingRequired.length === 0;

    return new Response(
      JSON.stringify({
        success: true,
        mappings,
        avg_confidence: avgConfidence,
        mapped_count: mappedCount,
        total_count: detected_columns.length,
        required_fields_present: requiredFieldsPresent,
        missing_required: missingRequired,
        message: `Mapped ${mappedCount}/${detected_columns.length} columns (${Math.round(avgConfidence * 100)}% confidence)`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[MAP] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

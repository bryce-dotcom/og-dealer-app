import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!;

// ============================================
// PARSE CSV
// ============================================
function parseCSV(text: string): { columns: string[]; rows: any[] } {
  const lines = text.trim().split('\n');
  if (lines.length < 2) {
    throw new Error("CSV file must have at least a header row and one data row");
  }

  // Parse header
  const header = lines[0].split(',').map(col => col.trim().replace(/^"|"$/g, ''));

  // Parse rows
  const rows: any[] = [];
  for (let i = 1; i < Math.min(lines.length, 6); i++) { // First 5 data rows for preview
    const values = lines[i].split(',').map(val => val.trim().replace(/^"|"$/g, ''));
    const rowObj: any = {};
    header.forEach((col, idx) => {
      rowObj[col] = values[idx] || '';
    });
    rows.push(rowObj);
  }

  return { columns: header, rows };
}

// ============================================
// DETECT DATA TYPE (Pattern Matching + AI)
// ============================================
function detectDataTypeByPattern(columns: string[]): { type: string; confidence: number } {
  const normalizedCols = columns.map(c => c.toLowerCase().replace(/[_\-\s]/g, ''));

  // Inventory indicators
  const inventoryScore = [
    'vin', 'year', 'make', 'model', 'stock', 'stockno', 'stocknumber',
    'miles', 'mileage', 'odometer', 'color', 'purchaseprice', 'saleprice'
  ].filter(keyword => normalizedCols.some(col => col.includes(keyword))).length;

  // Deal indicators
  const dealScore = [
    'buyer', 'purchaser', 'customer', 'saledate', 'dateofsale', 'purchasedate',
    'downpayment', 'tradein', 'trade', 'totalprice', 'salesman', 'salesperson'
  ].filter(keyword => normalizedCols.some(col => col.includes(keyword))).length;

  // Customer indicators
  const customerScore = [
    'customer', 'firstname', 'lastname', 'phone', 'email', 'address',
    'city', 'state', 'zip', 'driverslicense', 'dl'
  ].filter(keyword => normalizedCols.some(col => col.includes(keyword))).length;

  // Pick highest score
  if (inventoryScore > dealScore && inventoryScore > customerScore) {
    return { type: 'inventory', confidence: Math.min(0.95, 0.5 + (inventoryScore * 0.1)) };
  }
  if (dealScore > inventoryScore && dealScore > customerScore) {
    return { type: 'deals', confidence: Math.min(0.95, 0.5 + (dealScore * 0.1)) };
  }
  if (customerScore > inventoryScore && customerScore > dealScore) {
    return { type: 'customers', confidence: Math.min(0.95, 0.5 + (customerScore * 0.1)) };
  }

  return { type: 'unknown', confidence: 0 };
}

async function detectDataTypeWithAI(columns: string[], sampleRows: any[]): Promise<{ type: string; confidence: number; reasoning: string }> {
  const prompt = `Analyze these columns and sample rows from a CSV file. Determine if this is:
A) Vehicle inventory data
B) Sales/deal records
C) Customer database
D) Unknown/Other

COLUMNS: ${columns.join(', ')}

SAMPLE ROWS (first 3):
${JSON.stringify(sampleRows.slice(0, 3), null, 2)}

RULES:
- Inventory has: VIN, year, make, model, stock numbers, purchase/sale prices
- Deals/Sales have: buyer/purchaser names, sale dates, down payments, trade-ins, vehicle references
- Customers have: names, phone, email, address, drivers license

Respond with JSON only:
{
  "type": "inventory" | "deals" | "customers" | "unknown",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    const aiData = await response.json();
    const aiText = aiData.content[0]?.text || "";

    // Extract JSON from response
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return result;
    }

    throw new Error("AI response did not contain valid JSON");
  } catch (error) {
    console.error("[ANALYZE] AI detection failed:", error);
    return { type: 'unknown', confidence: 0, reasoning: 'AI detection failed' };
  }
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_data, file_name, dealer_id } = await req.json();

    if (!file_data || !file_name || !dealer_id) {
      throw new Error("Missing required fields: file_data, file_name, dealer_id");
    }

    console.log(`[ANALYZE] Processing file: ${file_name} for dealer: ${dealer_id}`);

    // Decode base64 file data
    let fileContent: string;
    try {
      fileContent = atob(file_data);
    } catch (e) {
      throw new Error("Invalid base64 file data");
    }

    // Parse CSV (we'll add Excel support later)
    if (!file_name.toLowerCase().endsWith('.csv')) {
      throw new Error("Only CSV files are currently supported. Excel support coming soon.");
    }

    const { columns, rows } = parseCSV(fileContent);
    const rowCount = fileContent.split('\n').length - 1; // Total rows in file

    console.log(`[ANALYZE] Detected ${columns.length} columns, ${rowCount} rows`);
    console.log(`[ANALYZE] Columns:`, columns);

    // Phase 1: Pattern-based detection (fast)
    const patternResult = detectDataTypeByPattern(columns);
    console.log(`[ANALYZE] Pattern detection: ${patternResult.type} (${patternResult.confidence})`);

    // Phase 2: AI verification (if pattern is uncertain)
    let finalType = patternResult.type;
    let finalConfidence = patternResult.confidence;
    let aiReasoning = '';

    if (patternResult.confidence < 0.8 || patternResult.type === 'unknown') {
      console.log(`[ANALYZE] Running AI verification...`);
      const aiResult = await detectDataTypeWithAI(columns, rows);
      finalType = aiResult.type;
      finalConfidence = aiResult.confidence;
      aiReasoning = aiResult.reasoning;
      console.log(`[ANALYZE] AI detection: ${finalType} (${finalConfidence}) - ${aiReasoning}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data_type: finalType,
        confidence: finalConfidence,
        detected_columns: columns,
        sample_rows: rows,
        row_count: rowCount,
        ai_reasoning: aiReasoning,
        message: `Detected ${finalType} data with ${Math.round(finalConfidence * 100)}% confidence`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ANALYZE] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY");
    }

    const { transaction, categories, manual_expenses } = await req.json();

    // Build prompt for Claude
    const systemPrompt = `You are an AI bookkeeping assistant helping categorize bank transactions and find potential duplicates.

AVAILABLE CATEGORIES:
${categories.map((c: any) => `- ${c.name} (${c.icon}): ${c.type}`).join('\n')}

RECENT MANUAL EXPENSES (for matching):
${manual_expenses.map((e: any) => `- ${e.description} | $${e.amount} | ${e.expense_date} | Vendor: ${e.vendor || 'N/A'}`).join('\n')}

TRANSACTION TO ANALYZE:
Merchant: ${transaction.merchant_name}
Amount: $${Math.abs(transaction.amount)}
Date: ${transaction.transaction_date}
Type: ${transaction.is_income ? 'Income' : 'Expense'}

TASK:
1. Suggest the BEST category from the available categories list
2. Find potential matching manual expenses (look for same/similar amount, close dates within 3 days, related descriptions)
3. For each match, provide a confidence score (0-100) and brief reason

IMPORTANT: Return ONLY the category NAME without emojis or icons. For example:
- If category is "Fuel (⛽)", return "Fuel"
- If category is "Insurance (🛡️)", return "Insurance"
- If category is "Payroll (💰)", return "Payroll"

Respond in JSON format:
{
  "suggested_category": "category name without emoji",
  "confidence": 95,
  "matches": [
    {
      "expense_id": "uuid",
      "confidence": 85,
      "reason": "Same amount, same day, similar description"
    }
  ]
}

If no matches found, return empty matches array.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: "Analyze this transaction and provide categorization and matching results." }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Parse JSON from Claude's response
    let result;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      result = JSON.parse(jsonStr);
    } catch (e) {
      // Fallback if parsing fails
      result = {
        suggested_category: "Other",
        confidence: 50,
        matches: [],
        raw_response: content
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[CATEGORIZE] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

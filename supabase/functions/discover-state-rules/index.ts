import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { state } = await req.json()

    if (!state || state.length !== 2) {
      throw new Error('Valid 2-letter state code required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')

    console.log(`Discovering compliance rules for ${state}...`)

    // === STEP A: Ask Claude for ALL compliance rules ===
    const rulesPrompt = `You are an expert in US auto dealer compliance regulations. Research and provide ALL compliance rules for licensed used car dealers in ${state}.

Return a JSON object with this EXACT structure:
{
  "state_name": "Full state name",
  "rules": [
    {
      "rule_code": "${state}-XXX-001",
      "rule_name": "Name of rule",
      "category": "tax_reporting|title_registration|disclosure|licensing|record_keeping",
      "description": "What the dealer must do",
      "trigger_event": "sale|month_end|quarter_end|year_end",
      "frequency": "per_sale|monthly|quarterly|annual",
      "deadline_days": null or number (days from trigger for per_sale),
      "deadline_day_of_month": null or number (for monthly/quarterly),
      "deadline_description": "Human readable deadline",
      "reminder_days_before": [7, 3, 1],
      "reporting_period": "single_transaction|monthly|quarterly|annual",
      "aggregation_type": "none|count_sales|sum_tax|sum_gross",
      "applies_to": ["all"] or ["cash", "financing", "bhph", "wholesale"],
      "required_form_numbers": ["TC-123"] or [],
      "required_form_names": ["Form Name"],
      "penalty_type": "flat_fee|percentage|per_day|per_violation",
      "penalty_amount": null or number,
      "penalty_percentage": null or number,
      "penalty_description": "Penalty details",
      "source_agency": "Agency name",
      "legal_citation": "State code reference",
      "is_federal": false
    }
  ]
}

IMPORTANT RULES TO DISCOVER:
1. Sales tax reporting - frequency, due date, form number, penalties
2. Title/registration submission deadlines - days allowed, forms needed, late fees
3. Temporary tag/permit rules - duration, renewal rules
4. Dealer report of sale requirements
5. Odometer disclosure (federal but state may have additions)
6. Buyers Guide requirements (federal FTC)
7. Truth in Lending for BHPH/financing
8. NMVTIS reporting requirements (federal)
9. Any state-specific disclosures (lemon law, damage disclosure, etc.)
10. Record keeping requirements (how long to keep records)
11. Consignment/wholesale specific rules
12. Any dealer bond or licensing renewal deadlines

Include BOTH state-specific AND federal rules that apply (mark is_federal: true for federal).

Return ONLY valid JSON, no explanation.`

    const rulesResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: rulesPrompt }]
      })
    })

    if (!rulesResponse.ok) {
      throw new Error(`Anthropic API error: ${rulesResponse.status}`)
    }

    const rulesData = await rulesResponse.json()
    const rulesContent = rulesData.content[0]?.text || ''

    // Parse rules JSON
    let rulesJson: any
    try {
      const jsonMatch = rulesContent.match(/\{[\s\S]*\}/)
      rulesJson = JSON.parse(jsonMatch?.[0] || rulesContent)
    } catch (e) {
      console.error('Failed to parse rules:', rulesContent.substring(0, 500))
      throw new Error('Failed to parse AI rules response')
    }

    console.log(`Found ${rulesJson.rules?.length || 0} rules`)

    // === STEP B: Insert rules into compliance_rules ===
    const insertedRules: any[] = []
    for (const rule of rulesJson.rules || []) {
      const { data, error } = await supabase
        .from('compliance_rules')
        .insert({
          state: state.toUpperCase(),
          rule_code: rule.rule_code,
          rule_name: rule.rule_name,
          category: rule.category,
          description: rule.description,
          trigger_event: rule.trigger_event,
          frequency: rule.frequency,
          deadline_days: rule.deadline_days,
          deadline_day_of_month: rule.deadline_day_of_month,
          deadline_description: rule.deadline_description,
          reminder_days_before: rule.reminder_days_before,
          reporting_period: rule.reporting_period,
          aggregation_type: rule.aggregation_type,
          applies_to: rule.applies_to,
          required_form_numbers: rule.required_form_numbers,
          required_form_names: rule.required_form_names,
          penalty_type: rule.penalty_type,
          penalty_amount: rule.penalty_amount,
          penalty_percentage: rule.penalty_percentage,
          penalty_description: rule.penalty_description,
          source_agency: rule.source_agency,
          legal_citation: rule.legal_citation,
          is_federal: rule.is_federal || false
        })
        .select()
        .single()

      if (error) {
        console.error('Insert rule error:', error.message, rule.rule_name)
      } else {
        insertedRules.push(data)
      }
    }

    console.log(`Inserted ${insertedRules.length} rules`)

    // === STEP C: Ask Claude for form requirements per deal type ===
    const formsPrompt = `You are an expert in US auto dealer compliance. List ALL forms required for each deal type for used car dealers in ${state}.

Return a JSON object with this EXACT structure:
{
  "form_requirements": [
    {
      "deal_type": "cash|financing|bhph|wholesale",
      "form_number": "TC-123" or null,
      "form_name": "Form Name",
      "is_required": true,
      "is_federal": false,
      "category": "title|tax|disclosure|contract|financing|compliance",
      "data_fields_needed": ["buyer_name", "vehicle_vin", "sale_price"],
      "sort_order": 1
    }
  ]
}

DEAL TYPES TO COVER:
1. cash - outright purchase, no financing
2. financing - third-party lender financing
3. bhph - buy here pay here (dealer financing)
4. wholesale - dealer to dealer sale

FORMS TO INCLUDE:
- Title application
- Dealer report of sale
- Bill of sale
- Odometer disclosure (federal)
- FTC Buyers Guide (federal, used vehicles)
- Retail Installment Sales Contract (for financing/bhph)
- Truth in Lending disclosure (federal, for financing/bhph)
- Security agreement (for bhph)
- Promissory note (for bhph)
- Power of Attorney (if applicable)
- Damage disclosure (if state requires)
- Lemon law disclosure (if applicable)
- Any state-specific forms

data_fields_needed should list the universal field names needed:
buyer_name, buyer_address, buyer_city, buyer_state, buyer_zip, buyer_dl_number,
vehicle_vin, vehicle_year, vehicle_make, vehicle_model, vehicle_mileage,
sale_price, sale_date, down_payment, sales_tax, total_price,
amount_financed, apr, finance_charge, monthly_payment, term_months,
dealer_name, dealer_address, dealer_license,
lienholder_name, lienholder_address

Return ONLY valid JSON, no explanation.`

    const formsResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 6000,
        messages: [{ role: 'user', content: formsPrompt }]
      })
    })

    if (!formsResponse.ok) {
      throw new Error(`Anthropic API error on forms: ${formsResponse.status}`)
    }

    const formsData = await formsResponse.json()
    const formsContent = formsData.content[0]?.text || ''

    let formsJson: any
    try {
      const jsonMatch = formsContent.match(/\{[\s\S]*\}/)
      formsJson = JSON.parse(jsonMatch?.[0] || formsContent)
    } catch (e) {
      console.error('Failed to parse forms:', formsContent.substring(0, 500))
      throw new Error('Failed to parse AI forms response')
    }

    console.log(`Found ${formsJson.form_requirements?.length || 0} form requirements`)

    // === STEP D: Insert form requirements ===
    const insertedForms: any[] = []
    for (const form of formsJson.form_requirements || []) {
      const { data, error } = await supabase
        .from('form_requirements')
        .insert({
          state: state.toUpperCase(),
          deal_type: form.deal_type,
          form_number: form.form_number,
          form_name: form.form_name,
          is_required: form.is_required !== false,
          is_federal: form.is_federal || false,
          category: form.category,
          data_fields_needed: form.data_fields_needed,
          sort_order: form.sort_order
        })
        .select()
        .single()

      if (error) {
        console.error('Insert form error:', error.message, form.form_name)
      } else {
        insertedForms.push(data)
      }
    }

    console.log(`Inserted ${insertedForms.length} form requirements`)

    // === Return summary ===
    return new Response(
      JSON.stringify({
        success: true,
        state: state.toUpperCase(),
        state_name: rulesJson.state_name,
        rules_count: insertedRules.length,
        forms_count: insertedForms.length,
        rules: insertedRules.map((r: any) => ({ rule_code: r.rule_code, rule_name: r.rule_name })),
        form_requirements_by_deal_type: {
          cash: insertedForms.filter((f: any) => f.deal_type === 'cash').length,
          financing: insertedForms.filter((f: any) => f.deal_type === 'financing').length,
          bhph: insertedForms.filter((f: any) => f.deal_type === 'bhph').length,
          wholesale: insertedForms.filter((f: any) => f.deal_type === 'wholesale').length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

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

    const stateUpper = state.toUpperCase()

    // === GOLD STANDARD: Utah is manually curated, skip AI ===
    if (stateUpper === 'UT') {
      return new Response(
        JSON.stringify({
          success: true,
          state: 'UT',
          message: 'Utah is the gold standard - rules are manually curated. Use the admin UI to manage UT rules.',
          skipped: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')

    console.log(`Discovering compliance rules for ${stateUpper}...`)

    // === STEP A: Fetch Utah gold-standard rules as example ===
    const { data: utahRules, error: utahError } = await supabase
      .from('compliance_rules')
      .select('rule_code, rule_name, category, description, trigger_event, frequency, deadline_days, deadline_day_of_month, deadline_description, reminder_days_before, reporting_period, aggregation_type, applies_to, required_form_numbers, required_form_names, penalty_type, penalty_amount, penalty_percentage, penalty_description, source_agency, legal_citation, source_url, is_federal')
      .eq('state', 'UT')
      .order('category')

    if (utahError) {
      console.error('Failed to fetch Utah examples:', utahError.message)
    }

    const { data: utahForms, error: utahFormsError } = await supabase
      .from('form_requirements')
      .select('deal_type, form_number, form_name, is_required, is_federal, category, data_fields_needed, sort_order')
      .eq('state', 'UT')
      .order('deal_type')
      .order('sort_order')

    if (utahFormsError) {
      console.error('Failed to fetch Utah form examples:', utahFormsError.message)
    }

    const utahExampleRules = (utahRules || []).slice(0, 5)
    const utahExampleForms = (utahForms || []).slice(0, 8)

    console.log(`Loaded ${utahRules?.length || 0} UT rules and ${utahForms?.length || 0} UT form requirements as examples`)

    // === STEP B: Single AI call for BOTH rules and form requirements ===
    const prompt = `You are an expert in US auto dealer compliance regulations. I need you to research and provide ALL compliance rules AND form requirements for licensed used car dealers in ${stateUpper}.

CRITICAL REQUIREMENTS:
1. Form numbers must be REAL, ACTUAL form numbers used by this state's DMV/MVD/tax commission
2. Legal citations must be REAL statute/code references (e.g., "A.R.S. § 28-4414" for Arizona, NOT made-up codes)
3. Source URLs must be REAL .gov URLs where the form or rule can be found
4. Source agency must be the ACTUAL agency name (e.g., "Arizona Department of Transportation" NOT generic "State DMV")
5. If you are not confident a form number is real, set form_number to null rather than guessing

HERE IS AN EXAMPLE of the quality and format I expect. These are REAL Utah rules:
${JSON.stringify(utahExampleRules, null, 2)}

And REAL Utah form requirements:
${JSON.stringify(utahExampleForms, null, 2)}

Now provide the SAME quality data for ${stateUpper}. Return a JSON object with this EXACT structure:
{
  "state_name": "Full state name",
  "dmv_website": "https://actual-state-dmv-or-mvd.gov",
  "tax_commission_website": "https://actual-state-tax-agency.gov",
  "rules": [
    {
      "rule_code": "${stateUpper}-XXX-001",
      "rule_name": "Name of rule",
      "category": "tax_reporting|title_registration|disclosure|licensing|record_keeping",
      "description": "What the dealer must do",
      "trigger_event": "sale|month_end|quarter_end|year_end",
      "frequency": "per_sale|monthly|quarterly|annual",
      "deadline_days": null or number,
      "deadline_day_of_month": null or number,
      "deadline_description": "Human readable deadline",
      "reminder_days_before": [7, 3, 1],
      "reporting_period": "single_transaction|monthly|quarterly|annual",
      "aggregation_type": "none|count_sales|sum_tax|sum_gross",
      "applies_to": ["all"] or ["cash", "financing", "bhph", "wholesale"],
      "required_form_numbers": ["REAL-FORM-123"] or [],
      "required_form_names": ["Actual Form Name"],
      "penalty_type": "flat_fee|percentage|per_day|per_violation",
      "penalty_amount": null or number,
      "penalty_percentage": null or number,
      "penalty_description": "Penalty details",
      "source_agency": "Actual Agency Name",
      "source_url": "https://actual-url.gov/page",
      "legal_citation": "Real Statute § Reference",
      "is_federal": false
    }
  ],
  "form_requirements": [
    {
      "deal_type": "cash|financing|bhph|wholesale",
      "form_number": "REAL-123" or null,
      "form_name": "Actual Form Name",
      "is_required": true,
      "is_federal": false,
      "category": "title|tax|disclosure|contract|financing|compliance",
      "data_fields_needed": ["buyer_name", "vehicle_vin", "sale_price"],
      "sort_order": 1
    }
  ]
}

RULES TO DISCOVER:
1. Sales tax reporting - frequency, due date, REAL form number, penalties
2. Title/registration submission - days allowed, REAL forms, late fees
3. Temporary tag/permit rules - duration, renewal
4. Dealer report of sale requirements
5. Odometer disclosure (federal)
6. FTC Buyers Guide (federal)
7. Truth in Lending for BHPH/financing (federal)
8. NMVTIS reporting (federal)
9. State-specific disclosures (lemon law, damage, etc.)
10. Record keeping requirements
11. Consignment/wholesale rules
12. Dealer bond/licensing renewal deadlines

DEAL TYPES FOR FORM REQUIREMENTS:
1. cash - outright purchase
2. financing - third-party lender
3. bhph - buy here pay here (dealer financing)
4. wholesale - dealer to dealer

data_fields_needed should use these universal field names:
buyer_name, buyer_address, buyer_city, buyer_state, buyer_zip, buyer_dl_number,
vehicle_vin, vehicle_year, vehicle_make, vehicle_model, vehicle_mileage,
sale_price, sale_date, down_payment, sales_tax, total_price,
amount_financed, apr, finance_charge, monthly_payment, term_months,
dealer_name, dealer_address, dealer_license,
lienholder_name, lienholder_address

Include BOTH state-specific AND federal rules (mark is_federal: true for federal).
Return ONLY valid JSON, no explanation.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 12000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.content[0]?.text || ''

    // Parse combined JSON response
    let parsed: any
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(jsonMatch?.[0] || content)
    } catch (e) {
      console.error('Failed to parse response:', content.substring(0, 500))
      throw new Error('Failed to parse AI response')
    }

    console.log(`Parsed: ${parsed.rules?.length || 0} rules, ${parsed.form_requirements?.length || 0} form requirements`)

    // === STEP C: Insert rules into compliance_rules ===
    const insertedRules: any[] = []
    for (const rule of parsed.rules || []) {
      const { data: ruleData, error } = await supabase
        .from('compliance_rules')
        .insert({
          state: stateUpper,
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
          source_url: rule.source_url,
          legal_citation: rule.legal_citation,
          is_federal: rule.is_federal || false
        })
        .select()
        .single()

      if (error) {
        console.error('Insert rule error:', error.message, rule.rule_name)
      } else {
        insertedRules.push(ruleData)
      }
    }

    console.log(`Inserted ${insertedRules.length} rules`)

    // === STEP D: Insert form requirements ===
    const insertedForms: any[] = []
    for (const form of parsed.form_requirements || []) {
      const { data: formData, error } = await supabase
        .from('form_requirements')
        .insert({
          state: stateUpper,
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
        insertedForms.push(formData)
      }
    }

    console.log(`Inserted ${insertedForms.length} form requirements`)

    // === Return summary ===
    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        state_name: parsed.state_name,
        dmv_website: parsed.dmv_website,
        tax_commission_website: parsed.tax_commission_website,
        rules_count: insertedRules.length,
        forms_count: insertedForms.length,
        rules: insertedRules.map((r: any) => ({
          rule_code: r.rule_code,
          rule_name: r.rule_name,
          legal_citation: r.legal_citation,
          source_url: r.source_url
        })),
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

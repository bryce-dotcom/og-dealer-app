import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// State name mapping
const stateNames: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
}

// ============================================
// UTAH GOLD STANDARD - HARDCODED BENCHMARK
// This is the verified, correct data for Utah
// Used as example structure for AI to follow
// ============================================
const UTAH_RULES_EXAMPLE = [
  {
    rule_code: 'UT-TITLE-001',
    rule_name: 'Title Submission to DMV',
    category: 'title_registration',
    description: 'Submit title application to Utah DMV within 45 days of sale when temp permit is issued',
    trigger_event: 'sale',
    frequency: 'per_sale',
    deadline_days: 45,
    deadline_description: '45 days from date of sale',
    required_form_numbers: ['TC-656'],
    required_form_names: ['Vehicle Application for Utah Title'],
    penalty_type: 'flat_fee',
    penalty_amount: 25,
    penalty_description: '$25 late fee per transaction',
    source_agency: 'Utah DMV',
    legal_citation: 'Utah Code 41-3-301(1)(a)',
    source_url: 'https://le.utah.gov/xcode/Title41/Chapter3/41-3-S301.html',
    is_federal: false
  },
  {
    rule_code: 'UT-ODOM-001',
    rule_name: 'Odometer Disclosure Statement',
    category: 'disclosure',
    description: 'Provide written odometer disclosure to buyer at time of sale',
    trigger_event: 'sale',
    frequency: 'per_sale',
    deadline_days: 0,
    deadline_description: 'At time of sale',
    required_form_numbers: ['TC-891'],
    required_form_names: ['Odometer Disclosure Statement'],
    penalty_description: 'Federal criminal penalties - fines and imprisonment',
    source_agency: 'Utah DMV / NHTSA',
    legal_citation: 'Utah Code 41-1a-902',
    source_url: 'https://tax.utah.gov/forms/current/tc-891.pdf',
    is_federal: false
  },
  {
    rule_code: 'UT-TAX-001',
    rule_name: 'Monthly Sales Tax Return',
    category: 'tax_reporting',
    description: 'File sales tax return and remit collected tax. Monthly if annual liability >= $50,000',
    trigger_event: 'month_end',
    frequency: 'monthly',
    deadline_day_of_month: 31,
    deadline_description: 'Last day of month following filing period',
    required_form_numbers: ['TC-62S', 'TC-62M'],
    required_form_names: ['Sales and Use Tax Return'],
    penalty_type: 'percentage',
    penalty_percentage: 10,
    penalty_description: '10% penalty plus interest. Monthly filers lose 1.31% seller discount if late.',
    source_agency: 'Utah State Tax Commission',
    legal_citation: 'Utah Code 59-12-107',
    source_url: 'https://tax.utah.gov/sales/monthly',
    is_federal: false
  },
  {
    rule_code: 'UT-TEMP-001',
    rule_name: 'Temporary Permit Expiration',
    category: 'title_registration',
    description: 'Buyer temporary permit expires - must have permanent registration by this date',
    trigger_event: 'sale',
    frequency: 'per_sale',
    deadline_days: 45,
    deadline_description: 'Permit expires 45 days from issue date',
    penalty_description: 'Vehicle cannot be legally operated after permit expiration',
    source_agency: 'Utah DMV',
    legal_citation: 'Utah Code 41-3-302',
    source_url: 'https://dmv.utah.gov/mved/dealers-overview/title-delivery/',
    is_federal: false
  },
  {
    rule_code: 'UT-DISC-001',
    rule_name: 'Transaction Disclosure Form',
    category: 'disclosure',
    description: 'Provide transaction disclosure to buyer showing all fees and charges',
    trigger_event: 'sale',
    frequency: 'per_sale',
    deadline_days: 0,
    deadline_description: 'At time of sale',
    required_form_numbers: ['TC-466'],
    required_form_names: ['Transaction Disclosure Form'],
    penalty_description: 'MVED enforcement action',
    source_agency: 'Utah MVED',
    legal_citation: 'Utah Code 41-3-401',
    source_url: 'https://tax.utah.gov/forms/current/tc-466.pdf',
    is_federal: false
  }
]

const UTAH_FORMS_EXAMPLE = [
  { deal_type: 'cash', form_number: 'TC-656', form_name: 'Vehicle Application for Utah Title', category: 'title', sort_order: 1 },
  { deal_type: 'cash', form_number: 'TC-466', form_name: 'Transaction Disclosure Form', category: 'disclosure', sort_order: 2 },
  { deal_type: 'cash', form_number: 'TC-891', form_name: 'Odometer Disclosure Statement', category: 'disclosure', sort_order: 3 },
  { deal_type: 'cash', form_number: null, form_name: 'FTC Buyers Guide', category: 'disclosure', is_federal: true, sort_order: 4 },
  { deal_type: 'cash', form_number: null, form_name: 'Bill of Sale', category: 'contract', sort_order: 5 },
  { deal_type: 'bhph', form_number: 'TC-656', form_name: 'Vehicle Application for Utah Title', category: 'title', sort_order: 1 },
  { deal_type: 'bhph', form_number: 'TC-466', form_name: 'Transaction Disclosure Form', category: 'disclosure', sort_order: 2 },
  { deal_type: 'bhph', form_number: 'TC-891', form_name: 'Odometer Disclosure Statement', category: 'disclosure', sort_order: 3 },
  { deal_type: 'bhph', form_number: null, form_name: 'FTC Buyers Guide', category: 'disclosure', is_federal: true, sort_order: 4 },
  { deal_type: 'bhph', form_number: null, form_name: 'Retail Installment Sales Contract', category: 'financing', sort_order: 5 },
  { deal_type: 'bhph', form_number: null, form_name: 'Truth in Lending Disclosure', category: 'disclosure', is_federal: true, sort_order: 6 },
  { deal_type: 'bhph', form_number: null, form_name: 'Promissory Note', category: 'financing', sort_order: 7 },
  { deal_type: 'bhph', form_number: null, form_name: 'Security Agreement', category: 'financing', sort_order: 8 }
]

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
    const stateName = stateNames[stateUpper]
    if (!stateName) {
      throw new Error(`Unknown state code: ${state}`)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const serpApiKey = Deno.env.get('SERP_API_KEY')

    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')
    if (!serpApiKey) throw new Error('SERP_API_KEY not configured')

    console.log(`Discovering compliance rules for ${stateName} (${stateUpper}) using LIVE web data...`)

    // === STEP A: Web search for state dealer requirements ===
    const searches = [
      `${stateName} motor vehicle dealer title submission deadline days site:.gov`,
      `${stateName} DMV dealer forms requirements site:.gov`,
      `${stateName} dealer sales tax filing due date site:.gov`,
      `${stateName} temporary tag permit duration dealer`,
      `${stateName} dealer report of sale form number site:.gov`
    ]

    let allSearchContent = ''
    const foundUrls: string[] = []

    for (const query of searches) {
      console.log(`Searching: ${query}`)

      try {
        const searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpApiKey}&num=5`
        const searchResponse = await fetch(searchUrl)
        const searchResults = await searchResponse.json()

        const organicResults = searchResults.organic_results || []

        for (const result of organicResults.slice(0, 3)) {
          const url = result.link
          const title = result.title
          const snippet = result.snippet || ''

          const isGov = url.includes('.gov')

          allSearchContent += `\n\n--- SOURCE: ${title} ---\nURL: ${url}\nSnippet: ${snippet}\n`

          if (isGov && !foundUrls.includes(url) && foundUrls.length < 8) {
            foundUrls.push(url)

            try {
              console.log(`Fetching: ${url}`)
              const pageResponse = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                redirect: 'follow'
              })

              if (pageResponse.ok) {
                const contentType = pageResponse.headers.get('content-type') || ''
                if (contentType.includes('text/html')) {
                  const html = await pageResponse.text()
                  const textContent = html
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .substring(0, 8000)

                  allSearchContent += `\n\n--- FULL PAGE CONTENT: ${url} ---\n${textContent}\n`
                }
              }
            } catch (e: any) {
              console.log(`Failed to fetch ${url}: ${e.message}`)
            }
          }
        }

        await new Promise(r => setTimeout(r, 500))

      } catch (e: any) {
        console.log(`Search failed: ${e.message}`)
      }
    }

    console.log(`Collected content from ${foundUrls.length} .gov pages`)

    // === STEP B: Have Claude parse the LIVE content using HARDCODED Utah example ===
    const parsePrompt = `You are an expert in US auto dealer compliance regulations. I have gathered LIVE web content about ${stateName} (${stateUpper}) motor vehicle dealer requirements.

LIVE WEB CONTENT FROM ${stateName.toUpperCase()} GOVERNMENT SITES:
${allSearchContent.substring(0, 25000)}

=== UTAH GOLD STANDARD EXAMPLE ===
Use this as the STRUCTURE and DETAIL LEVEL to follow. Your output must match this format exactly.

UTAH COMPLIANCE RULES (example structure):
${JSON.stringify(UTAH_RULES_EXAMPLE, null, 2)}

UTAH FORM REQUIREMENTS (example structure):
${JSON.stringify(UTAH_FORMS_EXAMPLE, null, 2)}

=== YOUR TASK ===
Extract ${stateName}'s ACTUAL dealer compliance rules from the LIVE WEB CONTENT above.

CRITICAL REQUIREMENTS:
1. ONLY use information found in the web content above - do NOT make up data
2. Extract the REAL form numbers for ${stateName} (will be different from Utah's TC-### format)
3. Extract the REAL deadlines mentioned in the content
4. Include the actual URLs where you found each piece of information
5. If specific info is not in the content, use null - do NOT guess
6. Match the Utah example structure EXACTLY

Return this JSON structure:
{
  "state_name": "${stateName}",
  "sources_used": ["URLs that had useful info"],
  "rules": [
    {
      "rule_code": "${stateUpper}-TITLE-001",
      "rule_name": "Title Submission Deadline",
      "category": "title_registration|tax_reporting|disclosure",
      "description": "exact requirement from content",
      "trigger_event": "sale|month_end",
      "frequency": "per_sale|monthly|quarterly",
      "deadline_days": number or null,
      "deadline_day_of_month": number or null,
      "deadline_description": "exact wording from source",
      "reminder_days_before": [14, 7, 3],
      "required_form_numbers": ["REAL form numbers from content"],
      "required_form_names": ["form names from content"],
      "penalty_type": "flat_fee|percentage|per_day",
      "penalty_amount": number or null,
      "penalty_description": "from content",
      "source_agency": "agency name",
      "legal_citation": "statute reference if found",
      "source_url": "URL where found",
      "is_federal": false,
      "confidence": "high|medium|low"
    }
  ],
  "form_requirements": [
    {
      "deal_type": "cash|financing|bhph|wholesale",
      "form_number": "REAL number or null",
      "form_name": "form name",
      "is_federal": false,
      "category": "title|disclosure|contract|financing",
      "sort_order": 1
    }
  ],
  "notes": "anything important that didnt fit"
}

RULES TO EXTRACT (if found in content):
1. Title/registration submission deadline and forms
2. Temporary permit/tag duration
3. Sales tax filing frequency and due dates
4. Dealer report of sale requirements
5. Required disclosures (odometer, buyers guide, etc.)

FORM REQUIREMENTS: Provide for each deal type (cash, financing, bhph, wholesale) based on what the content says is required.

Return ONLY valid JSON. No explanation text.`

    const parseResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: parsePrompt }]
      })
    })

    if (!parseResponse.ok) {
      throw new Error(`Anthropic API error: ${parseResponse.status}`)
    }

    const parseData = await parseResponse.json()
    const parseContent = parseData.content[0]?.text || ''

    let parsedJson: any
    try {
      const jsonMatch = parseContent.match(/\{[\s\S]*\}/)
      parsedJson = JSON.parse(jsonMatch?.[0] || parseContent)
    } catch (e) {
      console.error('Failed to parse response:', parseContent.substring(0, 1000))
      throw new Error('Failed to parse AI response')
    }

    console.log(`Extracted ${parsedJson.rules?.length || 0} rules from live content`)

    // === STEP C: Insert rules (skip low confidence) ===
    const insertedRules: any[] = []
    for (const rule of parsedJson.rules || []) {
      if (rule.confidence === 'low') {
        console.log(`Skipping low confidence: ${rule.rule_name}`)
        continue
      }

      const { data, error } = await supabase
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
          reminder_days_before: rule.reminder_days_before || [14, 7, 3],
          reporting_period: rule.reporting_period || 'single_transaction',
          aggregation_type: rule.aggregation_type || 'none',
          applies_to: rule.applies_to || ['all'],
          required_form_numbers: rule.required_form_numbers,
          required_form_names: rule.required_form_names,
          penalty_type: rule.penalty_type,
          penalty_amount: rule.penalty_amount,
          penalty_description: rule.penalty_description,
          source_agency: rule.source_agency,
          legal_citation: rule.legal_citation,
          source_url: rule.source_url,
          is_federal: rule.is_federal || false
        })
        .select()
        .single()

      if (error) {
        console.error('Insert rule error:', error.message)
      } else {
        insertedRules.push(data)
      }
    }

    // === STEP D: Insert form requirements ===
    const insertedForms: any[] = []
    for (const form of parsedJson.form_requirements || []) {
      const { data, error } = await supabase
        .from('form_requirements')
        .insert({
          state: stateUpper,
          deal_type: form.deal_type,
          form_number: form.form_number,
          form_name: form.form_name,
          is_required: form.is_required !== false,
          is_federal: form.is_federal || false,
          category: form.category,
          sort_order: form.sort_order || 1
        })
        .select()
        .single()

      if (error) {
        console.error('Insert form error:', error.message)
      } else {
        insertedForms.push(data)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        state_name: stateName,
        method: 'live_web_search_with_hardcoded_benchmark',
        sources_searched: foundUrls,
        sources_used: parsedJson.sources_used,
        rules_count: insertedRules.length,
        forms_count: insertedForms.length,
        rules: insertedRules.map((r: any) => ({
          rule_code: r.rule_code,
          rule_name: r.rule_name,
          deadline_days: r.deadline_days,
          form_numbers: r.required_form_numbers,
          source_url: r.source_url
        })),
        notes: parsedJson.notes
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

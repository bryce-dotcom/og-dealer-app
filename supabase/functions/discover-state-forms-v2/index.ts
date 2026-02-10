import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1'

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
    const serpApiKey = Deno.env.get('SERP_API_KEY')

    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')
    if (!serpApiKey) throw new Error('SERP_API_KEY not configured')

    // === STEP A: Get form requirements for this state ===
    const { data: requirements, error: reqError } = await supabase
      .from('form_requirements')
      .select('*')
      .eq('state', state.toUpperCase())
      .order('deal_type')
      .order('sort_order')

    if (reqError) throw reqError

    if (!requirements || requirements.length === 0) {
      throw new Error(`No form requirements found for ${state}. Run discover-state-rules first.`)
    }

    console.log(`Found ${requirements.length} form requirements for ${state}`)

    // === STEP B: Dedupe - get unique forms to search for ===
    const uniqueForms = new Map<string, any>()
    for (const req of requirements) {
      const key = req.form_number || req.form_name
      if (!uniqueForms.has(key)) {
        uniqueForms.set(key, {
          form_number: req.form_number,
          form_name: req.form_name,
          is_federal: req.is_federal,
          category: req.category
        })
      }
    }

    console.log(`Searching for ${uniqueForms.size} unique forms`)

    const results: { found: any[]; not_found: any[]; rejected: any[] } = {
      found: [],
      not_found: [],
      rejected: []
    }

    // === STEP C: Search for each form individually ===
    for (const [key, form] of uniqueForms) {
      console.log(`\nSearching for: ${form.form_name} (${form.form_number || 'no number'})`)

      // Build targeted search query
      let searchQuery: string
      if (form.is_federal) {
        // Federal forms - search federal sites
        if (form.form_name.includes('Buyers Guide')) {
          searchQuery = 'FTC Buyers Guide dealer form filetype:pdf site:ftc.gov'
        } else if (form.form_name.includes('Odometer')) {
          searchQuery = 'odometer disclosure statement form filetype:pdf site:nhtsa.gov'
        } else if (form.form_name.includes('Truth in Lending')) {
          searchQuery = 'truth in lending disclosure form TILA filetype:pdf'
        } else {
          searchQuery = `${form.form_name} federal form filetype:pdf`
        }
      } else {
        // State forms - search state sites
        if (form.form_number) {
          searchQuery = `${form.form_number} ${state} form filetype:pdf site:.gov`
        } else {
          searchQuery = `"${form.form_name}" ${state} dealer form filetype:pdf`
        }
      }

      console.log(`Query: ${searchQuery}`)

      // Search via SerpAPI
      const searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(searchQuery)}&api_key=${serpApiKey}&num=5`

      let searchResults: any
      try {
        const searchResponse = await fetch(searchUrl)
        searchResults = await searchResponse.json()
      } catch (e: any) {
        console.log(`Search failed: ${e.message}`)
        results.not_found.push({ ...form, reason: 'Search failed' })
        continue
      }

      const organicResults = searchResults.organic_results || []

      if (organicResults.length === 0) {
        console.log('No search results')
        results.not_found.push({ ...form, reason: 'No search results' })
        continue
      }

      // === STEP D: Find a valid PDF from results ===
      let foundValidPdf = false

      for (const result of organicResults) {
        const url = result.link

        // Skip non-PDFs
        if (!url.toLowerCase().includes('.pdf') && !url.toLowerCase().includes('pdf')) {
          continue
        }

        // Skip known bad patterns
        const badPatterns = ['legislature', '/bill/', '/statute/', '/code/', 'court', 'case', 'manual', 'handbook', 'guide']
        if (badPatterns.some((p: string) => url.toLowerCase().includes(p))) {
          console.log(`Skipping bad URL pattern: ${url}`)
          continue
        }

        console.log(`Checking: ${url}`)

        // Try to download and validate
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 15000)

          const pdfResponse = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            redirect: 'follow',
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (!pdfResponse.ok) {
            console.log(`Download failed: ${pdfResponse.status}`)
            continue
          }

          const pdfBuffer = await pdfResponse.arrayBuffer()
          const pdfBytes = new Uint8Array(pdfBuffer)

          // Check PDF header
          if (pdfBytes.byteLength < 10) {
            console.log('File too small')
            continue
          }

          const headerStr = String.fromCharCode(...pdfBytes.slice(0, 5))
          if (!headerStr.startsWith('%PDF')) {
            console.log('Invalid PDF header')
            continue
          }

          console.log(`Valid PDF: ${pdfBytes.byteLength} bytes`)

          // === STEP E: Check if PDF has fillable form fields ===
          let formFieldCount = 0
          let formFieldNames: string[] = []
          try {
            const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
            const pdfForm = pdfDoc.getForm()
            const fields = pdfForm.getFields()
            formFieldCount = fields.length
            formFieldNames = fields.slice(0, 15).map((f: any) => f.getName())
            console.log(`PDF has ${formFieldCount} form fields`)
          } catch (e: any) {
            console.log(`Could not read form fields: ${e.message}`)
            formFieldCount = 0
          }

          // REJECT if no form fields - it's not a fillable form
          if (formFieldCount === 0) {
            console.log('REJECTED: No fillable form fields detected')
            results.rejected.push({ ...form, url, reason: 'No fillable form fields - not an actual form' })
            continue
          }

          console.log(`Form fields: ${formFieldNames.join(', ')}`)

          // === STEP F: Validate with Claude using actual field data ===
          const validatePrompt = `I'm looking for this specific form:
Form Name: ${form.form_name}
Form Number: ${form.form_number || 'N/A'}
Category: ${form.category}
State: ${form.is_federal ? 'Federal' : state}

I found a PDF that has ${formFieldCount} fillable form fields.
First field names: ${formFieldNames.join(', ')}
URL: ${url}
Page title: ${result.title}

Based on the FIELD NAMES, does this appear to be the correct form?

For example:
- A title application should have fields like: Year, Make, Model, VIN, Owner Name, Address
- A bill of sale should have: Seller, Buyer, Vehicle, Price, Date
- An odometer disclosure should have: Odometer Reading, Vehicle ID, Seller/Buyer signatures

REJECT if the field names suggest this is:
- A completely different form than what we're searching for
- An internal government processing form (not for dealers/public)
- A form from the wrong state

ACCEPT if field names reasonably match what the form should contain.

Respond with JSON only:
{"decision": "ACCEPT" or "REJECT", "confidence": 0.0-1.0, "reason": "brief explanation"}`

          const validateResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 200,
              messages: [{ role: 'user', content: validatePrompt }]
            })
          })

          if (!validateResponse.ok) {
            console.log('Validation API error, accepting by default')
          } else {
            const validateData = await validateResponse.json()
            const validateContent = validateData.content[0]?.text || ''

            try {
              const validation = JSON.parse(validateContent.match(/\{[^}]+\}/)?.[0] || '{}')

              if (validation.decision === 'REJECT') {
                console.log(`Rejected: ${validation.reason}`)
                results.rejected.push({ ...form, url, reason: validation.reason })
                continue
              }

              console.log(`Accepted: ${validation.reason}`)
            } catch (e) {
              console.log('Could not parse validation, accepting')
            }
          }

          // === STEP G: Save to form_staging ===
          const sanitizedName = (form.form_number || form.form_name)
            .replace(/[^a-zA-Z0-9-]/g, '_')
            .substring(0, 50)
          const storagePath = `staging/${state.toUpperCase()}/${sanitizedName}.pdf`

          const { error: uploadError } = await supabase.storage
            .from('form-staging')
            .upload(storagePath, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true
            })

          if (uploadError) {
            console.log(`Upload error: ${uploadError.message}`)
            continue
          }

          // Insert to form_staging
          const { error: insertError } = await supabase
            .from('form_staging')
            .insert({
              state: state.toUpperCase(),
              form_number: form.form_number,
              form_name: form.form_name,
              category: form.category,
              source_agency: form.is_federal ? 'Federal' : state.toUpperCase(),
              source_url: url,
              download_url: url,
              storage_bucket: 'form-staging',
              storage_path: storagePath,
              file_size_bytes: pdfBytes.byteLength,
              is_fillable: formFieldCount > 0,
              detected_fields: formFieldNames,
              ai_discovered: true,
              ai_confidence: 0.9,
              ai_notes: `${formFieldCount} fillable fields detected`,
              status: 'pending',
              created_at: new Date().toISOString()
            })

          if (insertError) {
            console.log(`Insert error: ${insertError.message}`)
          } else {
            console.log(`Saved: ${form.form_name}`)
            results.found.push({ ...form, url, storage_path: storagePath })
            foundValidPdf = true
            break // Found valid PDF for this form, move to next
          }

        } catch (e: any) {
          const msg = e.name === 'AbortError' ? 'Timeout (15s)' : e.message
          console.log(`Error processing URL: ${msg}`)
          continue
        }
      }

      if (!foundValidPdf && !results.rejected.some((r: any) => r.form_name === form.form_name)) {
        results.not_found.push({ ...form, reason: 'No valid PDF found in search results' })
      }

      // Rate limit - don't hammer APIs
      await new Promise(r => setTimeout(r, 1000))
    }

    // === Return summary ===
    return new Response(
      JSON.stringify({
        success: true,
        state: state.toUpperCase(),
        summary: {
          total_forms_needed: uniqueForms.size,
          found: results.found.length,
          not_found: results.not_found.length,
          rejected: results.rejected.length
        },
        found: results.found,
        not_found: results.not_found,
        rejected: results.rejected
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

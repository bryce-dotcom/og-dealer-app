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
    const { state, limit = 5, skip_existing = true } = await req.json()

    if (!state || state.length !== 2) {
      throw new Error('Valid 2-letter state code required')
    }

    const stateUpper = state.toUpperCase()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const serpApiKey = Deno.env.get('SERP_API_KEY')

    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')
    if (!serpApiKey) throw new Error('SERP_API_KEY not configured')

    console.log('========================================')
    console.log('DISCOVER FORMS FOR ' + stateUpper)
    console.log('Limit: ' + limit + ', Skip existing: ' + skip_existing)
    console.log('========================================')

    // === STEP A: Get form requirements for this state ===
    const { data: requirements, error: reqError } = await supabase
      .from('form_requirements')
      .select('*')
      .eq('state', stateUpper)
      .order('deal_type')
      .order('sort_order')

    if (reqError) throw reqError

    if (!requirements || requirements.length === 0) {
      throw new Error('No form requirements found for ' + stateUpper + '. Run discover-state-rules first.')
    }

    // === STEP B: Get existing forms in staging (to skip) ===
    let existingForms: string[] = []
    if (skip_existing) {
      const { data: existing } = await supabase
        .from('form_staging')
        .select('form_name, form_number, storage_path')
        .eq('state', stateUpper)
        .not('storage_path', 'is', null)

      existingForms = (existing || []).map((f: any) => f.form_number || f.form_name)
      console.log('Found ' + existingForms.length + ' existing forms with PDFs')
    }

    // === STEP C: Dedupe and filter - get unique forms to search for ===
    const uniqueForms = new Map<string, any>()
    for (const req of requirements) {
      const key = req.form_number || req.form_name

      if (skip_existing && existingForms.includes(key)) {
        continue
      }

      if (!uniqueForms.has(key)) {
        uniqueForms.set(key, {
          form_number: req.form_number,
          form_name: req.form_name,
          is_federal: req.is_federal,
          category: req.category
        })
      }
    }

    const formsToSearch = Array.from(uniqueForms.values()).slice(0, limit)

    console.log('Total requirements: ' + requirements.length)
    console.log('Unique forms needed: ' + uniqueForms.size)
    console.log('Forms to search this run: ' + formsToSearch.length)

    if (formsToSearch.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          state: stateUpper,
          message: 'All forms already have PDFs or no forms to search',
          summary: {
            total_requirements: requirements.length,
            existing_with_pdfs: existingForms.length,
            searched: 0
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const results: { found: any[]; not_found: any[]; rejected: any[] } = {
      found: [],
      not_found: [],
      rejected: []
    }

    // === STEP D: Search for each form ===
    for (const form of formsToSearch) {
      console.log('[STEP B] Searching for PDF: ' + (form.form_number || form.form_name))

      const queries: string[] = []

      if (form.is_federal) {
        if (form.form_name.includes('Buyers Guide')) {
          queries.push('FTC Buyers Guide used car form PDF')
        } else if (form.form_name.includes('Odometer')) {
          queries.push('federal odometer disclosure statement PDF')
        } else if (form.form_name.includes('Truth in Lending')) {
          queries.push('truth in lending disclosure form PDF')
        } else {
          queries.push(form.form_name + ' federal form PDF')
        }
      } else {
        if (form.form_number) {
          queries.push(form.form_number + ' ' + stateUpper + ' Tax Commission form PDF')
          queries.push('site:' + stateUpper.toLowerCase() + '.gov ' + form.form_number + ' PDF')
        }
        queries.push(form.form_name + ' ' + stateUpper + ' form PDF')
      }

      console.log('[STEP B] Will try ' + queries.length + ' search queries')

      let foundValidPdf = false

      for (const query of queries) {
        if (foundValidPdf) break

        console.log('[STEP B] Query: ' + query)

        try {
          const searchUrl = 'https://serpapi.com/search.json?q=' + encodeURIComponent(query) + '&api_key=' + serpApiKey + '&num=10'
          const searchResponse = await fetch(searchUrl)
          const searchResults = await searchResponse.json()

          const organicResults = searchResults.organic_results || []
          console.log('[STEP B] Got ' + organicResults.length + ' results')

          if (organicResults.length === 0) continue

          for (const result of organicResults.slice(0, 5)) {
            const url = result.link

            if (!url.toLowerCase().includes('.pdf')) continue

            const badPatterns = ['legislature', '/bill/', '/statute/', '/code/', 'court', 'case', 'manual', 'handbook', 'instructions']
            if (badPatterns.some((p: string) => url.toLowerCase().includes(p))) continue

            console.log('[STEP B] Found valid PDF: ' + url)

            try {
              console.log('[STEP C] Downloading PDF: ' + url)

              const pdfResponse = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                redirect: 'follow'
              })

              if (!pdfResponse.ok) continue

              const pdfBuffer = await pdfResponse.arrayBuffer()
              console.log('[STEP C] Valid PDF downloaded: ' + pdfBuffer.byteLength + ' bytes')

              const header = new Uint8Array(pdfBuffer.slice(0, 5))
              const headerStr = String.fromCharCode(...header)
              if (!headerStr.startsWith('%PDF')) continue

              // Detect form fields
              let formFieldCount = 0
              try {
                const pdfDoc = await PDFDocument.load(pdfBuffer)
                const pdfForm = pdfDoc.getForm()
                const fields = pdfForm.getFields()
                formFieldCount = fields.length
                console.log('[STEP D] PDF form fields detected: ' + formFieldCount)
              } catch (e) {
                console.log('[STEP D] Could not detect form fields: ' + e.message)
              }

              const fileName = (form.form_number || form.form_name.replace(/[^a-zA-Z0-9]/g, '_')) + '.pdf'
              const storagePath = 'staging/' + stateUpper + '/' + fileName

              const { error: uploadError } = await supabase.storage
                .from('form-staging')
                .upload(storagePath, pdfBuffer, {
                  contentType: 'application/pdf',
                  upsert: true
                })

              if (uploadError) {
                console.log('Upload error: ' + uploadError.message)
                continue
              }

              const { error: insertError } = await supabase
                .from('form_staging')
                .insert({
                  state: stateUpper,
                  form_number: form.form_number,
                  form_name: form.form_name,
                  category: form.category,
                  source_agency: form.is_federal ? 'Federal' : stateUpper,
                  source_url: url,
                  download_url: url,
                  storage_bucket: 'form-staging',
                  storage_path: storagePath,
                  file_size_bytes: pdfBuffer.byteLength,
                  form_field_count: formFieldCount,
                  is_fillable: formFieldCount > 0,
                  ai_discovered: true,
                  ai_confidence: 0.8,
                  ai_notes: 'Found via SerpAPI search',
                  status: 'pending',
                  created_at: new Date().toISOString()
                })

              if (insertError) {
                console.error('❌ DATABASE INSERT ERROR:')
                console.error('  Error Code: ' + (insertError.code || 'unknown'))
                console.error('  Message: ' + insertError.message)
                console.error('  Details: ' + (insertError.details || 'none'))
                console.error('  Hint: ' + (insertError.hint || 'none'))
                console.error('  Form: ' + form.form_number + ' - ' + form.form_name)

                // Add to results with error info
                results.found.push({
                  form_number: form.form_number,
                  form_name: form.form_name,
                  url,
                  storage_path: storagePath,
                  error: insertError.message,
                  error_code: insertError.code
                })
                continue
              }

              results.found.push({
                form_number: form.form_number,
                form_name: form.form_name,
                url,
                storage_path: storagePath
              })

              foundValidPdf = true
              break

            } catch (e: any) {
              console.log('Download error: ' + e.message)
              continue
            }
          }

          await new Promise(r => setTimeout(r, 300))

        } catch (e: any) {
          console.log('Search error: ' + e.message)
        }
      }

      if (!foundValidPdf) {
        console.log('[STEP B] No valid PDF found')
        results.not_found.push({
          form_number: form.form_number,
          form_name: form.form_name,
          reason: 'No valid PDF found'
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        summary: {
          total_requirements: requirements.length,
          existing_with_pdfs: existingForms.length,
          searched_this_run: formsToSearch.length,
          found: results.found.length,
          not_found: results.not_found.length
        },
        found: results.found,
        not_found: results.not_found,
        remaining: uniqueForms.size - formsToSearch.length
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

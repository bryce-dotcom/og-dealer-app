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
    const { storage_bucket, storage_path } = await req.json()

    if (!storage_bucket || !storage_path) {
      throw new Error('storage_bucket and storage_path are required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(storage_bucket)
      .download(storage_path)

    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`)

    const arrayBuffer = await fileData.arrayBuffer()
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })

    // Extract form fields
    let detectedFields: any[] = []
    try {
      const form = pdfDoc.getForm()
      const fields = form.getFields()

      detectedFields = fields.map(field => {
        const typeName = field.constructor.name
          .replace('PDF', '')
          .replace('Field', '')
          .toLowerCase()
        return {
          pdf_field: field.getName(),
          pdf_field_type: typeName,
          type: typeName,
          universal_fields: [],
          separator: ' ',
          confidence: 0,
          status: 'unmapped',
          matched: false
        }
      })

      console.log(`Extracted ${detectedFields.length} fields from PDF`)
    } catch (e) {
      console.log('PDF has no fillable fields or error extracting:', e.message)
    }

    return new Response(
      JSON.stringify({
        success: true,
        fields_count: detectedFields.length,
        detected_fields: detectedFields,
        page_count: pdfDoc.getPageCount()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

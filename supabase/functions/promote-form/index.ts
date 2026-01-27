import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, doc_type } = await req.json();

    if (!form_id) {
      throw new Error("form_id is required");
    }

    console.log(`Promoting form: ${form_id} to ${doc_type || 'deal'}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get form from staging
    const { data: form, error: formError } = await supabase
      .from('form_staging')
      .select('*')
      .eq('id', form_id)
      .single();

    if (formError || !form) {
      throw new Error(`Form not found: ${formError?.message || 'Unknown'}`);
    }

    console.log(`Form: ${form.form_number} - ${form.form_name}`);
    console.log(`Source URL: ${form.source_url}`);

    if (!form.source_url) {
      throw new Error("Form has no source_url - cannot download PDF");
    }

    // Download PDF from source URL
    console.log("Downloading PDF from source...");
    const pdfResponse = await fetch(form.source_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
    }

    const contentType = pdfResponse.headers.get('content-type') || '';
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      console.warn(`Unexpected content-type: ${contentType}`);
    }

    const pdfBytes = await pdfResponse.arrayBuffer();
    console.log(`Downloaded ${pdfBytes.byteLength} bytes`);

    if (pdfBytes.byteLength < 1000) {
      throw new Error(`PDF too small (${pdfBytes.byteLength} bytes) - likely an error page`);
    }

    // Generate storage path
    const safeFormNumber = (form.form_number || 'FORM').replace(/[^a-zA-Z0-9-]/g, '_');
    const state = (form.state || 'XX').toUpperCase();
    const storagePath = `${state}/${safeFormNumber}.pdf`;

    console.log(`Uploading to form-templates/${storagePath}`);

    // Upload to form-templates bucket
    const { error: uploadError } = await supabase.storage
      .from('form-templates')
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    console.log("Upload successful");

    // Update form_staging with storage_path and status
    const { error: updateError } = await supabase
      .from('form_staging')
      .update({
        status: 'approved',
        storage_path: storagePath,
        storage_bucket: 'form-templates',
        promoted_at: new Date().toISOString(),
        doc_type: doc_type || form.doc_type || 'deal',
        file_size_bytes: pdfBytes.byteLength
      })
      .eq('id', form_id);

    if (updateError) {
      throw new Error(`Failed to update form: ${updateError.message}`);
    }

    console.log(`Form ${form.form_number} promoted successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        form_number: form.form_number,
        form_name: form.form_name,
        storage_path: storagePath,
        file_size: pdfBytes.byteLength
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('Promote error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

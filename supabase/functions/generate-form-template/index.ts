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
    const { pdf_url, form_name, state, form_id } = await req.json();

    if (!pdf_url) {
      throw new Error("pdf_url is required");
    }

    console.log(`Generating HTML template for: ${form_name || 'Unknown Form'}`);
    console.log(`PDF URL: ${pdf_url}`);

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update status to generating
    if (form_id) {
      await supabase
        .from('form_staging')
        .update({ template_status: 'generating' })
        .eq('id', form_id);
    }

    // Download PDF and convert to base64
    console.log("Downloading PDF...");
    let pdfBase64: string;

    // Check if it's a Supabase storage URL or external URL
    if (pdf_url.includes('supabase.co/storage')) {
      // Extract bucket and path from URL
      const match = pdf_url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
      if (match) {
        const [, bucket, path] = match;
        const { data, error } = await supabase.storage.from(bucket).download(decodeURIComponent(path));
        if (error) throw new Error(`Failed to download from storage: ${error.message}`);
        const arrayBuffer = await data.arrayBuffer();
        pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      } else {
        throw new Error("Could not parse Supabase storage URL");
      }
    } else {
      // External URL
      const response = await fetch(pdf_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }

    console.log(`PDF downloaded: ${pdfBase64.length} base64 chars`);

    // Send to Claude API
    console.log("Sending to Claude API...");

    const prompt = `Analyze this PDF form image carefully. Create an EXACT HTML/CSS replica that matches the visual layout as precisely as possible.

REQUIREMENTS:
1. Recreate ALL text labels in their exact positions
2. Include ALL input fields, checkboxes, radio buttons, and signature lines
3. Recreate all headers, borders, boxes, and dividers exactly as shown
4. Use inline CSS for precise positioning (use flexbox or CSS grid for layout)
5. Mark each fillable field with a data-field attribute using snake_case naming
6. Use semantic field names that describe the data (e.g., data-field="buyer_name", data-field="vin", data-field="sale_price")
7. Return ONLY valid HTML - no markdown, no code blocks, no explanation
8. The HTML should be printable and look identical to the original when rendered
9. Use a fixed width of 8.5 inches (816px) for letter-size paper
10. Include a style tag at the top with print-friendly CSS

FIELD NAMING CONVENTIONS:
- Buyer/Purchaser info: buyer_name, buyer_address, buyer_city, buyer_state, buyer_zip, buyer_phone, buyer_email, buyer_dl_number
- Seller/Dealer info: dealer_name, dealer_address, dealer_city, dealer_state, dealer_zip, dealer_phone, dealer_license
- Vehicle info: year, make, model, vin, stock_number, miles, color, body_style
- Sale info: sale_price, trade_allowance, trade_payoff, down_payment, total_due, tax_amount, doc_fee, date_of_sale
- Financing: term_months, interest_rate, monthly_payment, apr, total_of_payments, first_payment_date

For signature lines, use: data-field="buyer_signature", data-field="seller_signature", data-field="signature_date"
For checkboxes use: <input type="checkbox" data-field="field_name">
For text inputs use: <span class="field-value" data-field="field_name"></span> styled as an underlined space

Return the complete HTML document starting with <!DOCTYPE html>.`;

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error("Claude API error:", errorText);
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    console.log("Claude response received");

    // Extract HTML from response
    let html = "";
    for (const block of claudeData.content) {
      if (block.type === "text") {
        html += block.text;
      }
    }

    // Clean up - remove any markdown code blocks if present
    html = html.replace(/```html\n?/gi, '').replace(/```\n?/gi, '').trim();

    // Ensure it starts with DOCTYPE
    if (!html.toLowerCase().startsWith('<!doctype')) {
      html = '<!DOCTYPE html>\n' + html;
    }

    console.log(`Generated HTML: ${html.length} chars`);

    // Extract field names from data-field attributes
    const fieldRegex = /data-field=["']([^"']+)["']/gi;
    const detectedFields: string[] = [];
    let match;
    while ((match = fieldRegex.exec(html)) !== null) {
      if (!detectedFields.includes(match[1])) {
        detectedFields.push(match[1]);
      }
    }

    console.log(`Detected ${detectedFields.length} fields:`, detectedFields);

    // Save HTML to storage
    const safeFormName = (form_name || 'form').replace(/[^a-zA-Z0-9-]/g, '_');
    const safeState = (state || 'XX').toUpperCase();
    const htmlPath = `${safeState}/${form_id || safeFormName}.html`;

    const { error: uploadError } = await supabase.storage
      .from('form-templates')
      .upload(htmlPath, new TextEncoder().encode(html), {
        contentType: 'text/html',
        upsert: true
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      // Continue anyway - we still return the HTML
    } else {
      console.log(`HTML saved to form-templates/${htmlPath}`);
    }

    // Update form_staging if form_id provided
    if (form_id) {
      const { error: updateError } = await supabase
        .from('form_staging')
        .update({
          template_status: 'ready',
          html_template_url: htmlPath,
          field_mapping: detectedFields.reduce((acc, field) => {
            acc[field] = null; // User will map these
            return acc;
          }, {} as Record<string, string | null>)
        })
        .eq('id', form_id);

      if (updateError) {
        console.error("Update error:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        html,
        detected_fields: detectedFields,
        html_path: htmlPath,
        form_name,
        state
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('Template generation error:', error);

    // Try to update status to failed
    try {
      const { form_id } = await req.clone().json();
      if (form_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from('form_staging')
          .update({ template_status: 'failed' })
          .eq('id', form_id);
      }
    } catch {}

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();

    if (!image) {
      return new Response(
        JSON.stringify({ error: 'Image data required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Use Claude's vision to extract VIN from image
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.startsWith('/9j') ? 'image/jpeg' : 'image/png',
                  data: image,
                },
              },
              {
                type: 'text',
                text: 'Extract the VIN (Vehicle Identification Number) from this image. A VIN is exactly 17 characters long and contains only letters (except I, O, Q) and numbers. Return ONLY the VIN, nothing else. If you cannot find a valid VIN, return "NOT_FOUND".',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Anthropic API error:', error);
      throw new Error('Failed to process image');
    }

    const data = await response.json();
    const extractedText = data.content?.[0]?.text?.trim() || '';

    // Validate VIN format (17 characters, alphanumeric, no I/O/Q)
    const vinPattern = /^[A-HJ-NPR-Z0-9]{17}$/;
    const vin = extractedText.toUpperCase();

    if (vinPattern.test(vin)) {
      return new Response(
        JSON.stringify({ vin, success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (vin === 'NOT_FOUND') {
      return new Response(
        JSON.stringify({ error: 'No VIN found in image', success: false }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          error: 'Invalid VIN format detected',
          extracted: extractedText,
          success: false
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

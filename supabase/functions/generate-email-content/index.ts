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
    const body = await req.json();
    console.log('Received request:', body);

    const { goal, tone, dealerName = 'OG Dealer', dealerState = 'UT' } = body;

    if (!goal) {
      return new Response(
        JSON.stringify({ error: 'Campaign goal is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('Missing ANTHROPIC_API_KEY');
      return new Response(
        JSON.stringify({ error: 'Missing API key configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling Anthropic API...');

    const systemPrompt = `You are an expert email marketing copywriter for automotive dealerships. Create compelling email campaigns.`;

    const userPrompt = `Create a ${goal} email for ${dealerName} dealership in ${dealerState}. Tone: ${tone || 'friendly'}.

Return ONLY a JSON object with this structure:
{
  "subject_line": "Great subject line here",
  "preview_text": "Preview text here",
  "body_html": "<h1>Email content here</h1>"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    console.log('Anthropic response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      return new Response(
        JSON.stringify({ error: `API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || '';

    console.log('AI generated content');

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response');
      // Return fallback
      return new Response(
        JSON.stringify({
          subject_line: 'Special Offer from ' + dealerName,
          preview_text: 'Check out our latest deals!',
          body_html: '<h1>Great Deals at ' + dealerName + '</h1><p>Visit us today!</p>'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailContent = JSON.parse(jsonMatch[0]);
    console.log('Success!');

    return new Response(
      JSON.stringify(emailContent),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        stack: error.stack
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

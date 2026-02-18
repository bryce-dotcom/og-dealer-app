import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { goal, tone, audience, keyPoints, customPrompt, dealerName, dealerState } = await req.json();

    if (!goal) {
      return new Response(
        JSON.stringify({ error: 'Campaign goal is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    });

    // Build the AI prompt based on campaign goal
    let systemPrompt = `You are an expert email marketing copywriter for automotive dealerships.
Your task is to create compelling, personalized email campaigns that drive engagement and sales.

Write emails that are:
- Clear and concise
- Customer-focused with benefits highlighted
- Action-oriented with clear calls-to-action
- Professional yet approachable
- Mobile-friendly (short paragraphs, scannable)

Always include:
1. An engaging subject line (under 50 characters)
2. Preview text (under 100 characters)
3. Well-formatted HTML email body with proper headings and spacing

Dealership: ${dealerName}
Location: ${dealerState}`;

    let userPrompt = '';

    // Goal-specific prompts
    switch (goal) {
      case 'promote_inventory':
        userPrompt = `Create an email promoting new vehicle inventory.
Tone: ${tone}
Key Details: ${keyPoints || 'New arrivals, great selection, competitive prices'}
${customPrompt ? `Additional instructions: ${customPrompt}` : ''}

Include: vehicle highlights, pricing appeal, urgency, clear CTA to visit/call`;
        break;

      case 'payment_reminder':
        userPrompt = `Create a friendly payment reminder email for BHPH customers.
Tone: ${tone} but always respectful and understanding
${customPrompt ? `Additional instructions: ${customPrompt}` : ''}

Include: payment amount, due date, payment options, contact info if they need help`;
        break;

      case 'thank_you':
        userPrompt = `Create a thank you email for recent vehicle purchasers.
Tone: ${tone} and grateful
${keyPoints ? `Vehicle details: ${keyPoints}` : ''}
${customPrompt ? `Additional instructions: ${customPrompt}` : ''}

Include: appreciation, vehicle care tips, referral request, contact info for questions`;
        break;

      case 'vehicle_match':
        userPrompt = `Create an alert email for customers looking for specific vehicles.
Tone: ${tone} and exciting
Vehicle details: ${keyPoints || 'Vehicle that matches their search criteria'}
${customPrompt ? `Additional instructions: ${customPrompt}` : ''}

Include: vehicle specs, why it matches their needs, urgency (won't last long), CTA to schedule viewing`;
        break;

      case 'newsletter':
        userPrompt = `Create a monthly dealership newsletter.
Tone: ${tone} and informative
Topics: ${keyPoints || 'New inventory, tips, promotions, dealership news'}
${customPrompt ? `Additional instructions: ${customPrompt}` : ''}

Include: 3-4 brief sections, mix of inventory and helpful content, clear CTAs`;
        break;

      case 'custom':
        userPrompt = `Create a custom email campaign.
Tone: ${tone}
${keyPoints ? `Key points to include: ${keyPoints}` : ''}
${customPrompt || 'Create an engaging email that fits the dealership brand'}`;
        break;

      default:
        userPrompt = `Create an email campaign.
Tone: ${tone}
Goal: ${goal}
${keyPoints ? `Details: ${keyPoints}` : ''}
${customPrompt ? `Instructions: ${customPrompt}` : ''}`;
    }

    userPrompt += `\n\nReturn a JSON object with this exact structure:
{
  "subject_line": "Engaging subject under 50 chars",
  "preview_text": "Preview text under 100 chars",
  "body_html": "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>Full HTML email content with proper formatting</div>"
}

IMPORTANT:
- Make the HTML clean and simple
- Use inline CSS for styling
- Include proper spacing with margin and padding
- Keep paragraphs short (2-3 sentences)
- Add a clear call-to-action button with this style:
  <a href="#" style="display: inline-block; padding: 12px 24px; background-color: #f97316; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Button Text</a>
- End with dealership signature and contact info
- Return ONLY the JSON object, no other text`;

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }],
    });

    // Extract the generated content
    const content = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON from response (Claude might wrap it in markdown)
    let jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const emailContent = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify(emailContent),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating email content:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate email content' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

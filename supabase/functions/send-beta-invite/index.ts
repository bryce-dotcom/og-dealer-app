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
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { dealer_id, dealer_name, recipient_email, recipient_name } = body;

    if (!dealer_id || !dealer_name || !recipient_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: dealer_id, dealer_name, recipient_email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Beta invitation email HTML template
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited: OG DiX Beta Access</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">

    <!-- Header -->
    <div style="text-align: center; margin-bottom: 40px;">
      <h1 style="font-size: 32px; font-weight: 700; margin: 0 0 8px 0; color: #f97316;">🚀 You're Invited!</h1>
      <p style="font-size: 18px; color: #a1a1aa; margin: 0;">OG DiX Beta Access</p>
    </div>

    <!-- Main Content -->
    <div style="background-color: #18181b; border-radius: 16px; padding: 32px; border: 1px solid #27272a;">
      <p style="font-size: 16px; line-height: 1.6; color: #d4d4d8; margin: 0 0 24px 0;">
        Hi ${recipient_name || 'there'},
      </p>

      <p style="font-size: 16px; line-height: 1.6; color: #d4d4d8; margin: 0 0 24px 0;">
        You've been selected to be one of the first beta testers for <strong style="color: #f97316;">OG DiX Motor Club</strong> - the all-in-one dealership management platform built specifically for independent dealers.
      </p>

      <!-- Beta Access Box -->
      <div style="background-color: #27272a; border-radius: 12px; padding: 20px; margin: 32px 0;">
        <h3 style="font-size: 14px; font-weight: 600; color: #a1a1aa; margin: 0 0 12px 0; text-transform: uppercase;">Your Beta Access</h3>
        <p style="margin: 8px 0;">
          <strong style="color: #f97316;">Login URL:</strong>
          <a href="https://app.ogdix.com" style="color: #3b82f6; text-decoration: none;">https://app.ogdix.com</a>
        </p>
        <p style="margin: 8px 0; font-size: 14px; color: #71717a;">
          Sign up with <strong style="color: #d4d4d8;">${recipient_email}</strong> to get started
        </p>
      </div>

      <!-- What is OG DiX -->
      <h3 style="font-size: 18px; font-weight: 600; color: #fff; margin: 32px 0 16px 0;">What is OG DiX?</h3>
      <p style="font-size: 15px; line-height: 1.6; color: #d4d4d8; margin: 0 0 16px 0;">
        A complete dealership management system that handles:
      </p>
      <ul style="margin: 0 0 24px 0; padding-left: 20px;">
        <li style="margin: 8px 0; color: #d4d4d8;">✅ Inventory management with VIN scanning</li>
        <li style="margin: 8px 0; color: #d4d4d8;">✅ Deal structuring (Cash, BHPH, Financing)</li>
        <li style="margin: 8px 0; color: #d4d4d8;">✅ Automatic document generation with state-specific forms</li>
        <li style="margin: 8px 0; color: #d4d4d8;">✅ Customer & payment tracking</li>
        <li style="margin: 8px 0; color: #d4d4d8;">✅ Team management with time clock</li>
        <li style="margin: 8px 0; color: #d4d4d8;">✅ AI-powered email marketing</li>
      </ul>

      <!-- Getting Started -->
      <h3 style="font-size: 18px; font-weight: 600; color: #fff; margin: 32px 0 16px 0;">Getting Started</h3>
      <div style="background-color: #27272a; border-left: 3px solid #f97316; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0; font-size: 14px; color: #d4d4d8; line-height: 1.6;">
          <strong>First 30 Minutes:</strong><br>
          1. Visit <a href="https://app.ogdix.com" style="color: #3b82f6;">app.ogdix.com</a><br>
          2. Sign up with your email<br>
          3. Complete the dealership onboarding wizard<br>
          4. Add your first vehicle<br>
          5. Create a test deal
        </p>
      </div>

      <!-- Beta Perks -->
      <h3 style="font-size: 18px; font-weight: 600; color: #fff; margin: 32px 0 16px 0;">🎁 Beta Tester Perks</h3>
      <ul style="margin: 0 0 24px 0; padding-left: 20px;">
        <li style="margin: 8px 0; color: #d4d4d8;">✨ <strong>Free access</strong> during beta (normally $199/month)</li>
        <li style="margin: 8px 0; color: #d4d4d8;">🏆 <strong>Founder pricing</strong> - Lock in special lifetime rate at launch</li>
        <li style="margin: 8px 0; color: #d4d4d8;">🎤 <strong>Direct influence</strong> - Your feedback shapes the product</li>
        <li style="margin: 8px 0; color: #d4d4d8;">📢 <strong>Early access</strong> to all new features</li>
      </ul>

      <!-- Support -->
      <div style="background-color: #1e293b; border-radius: 12px; padding: 20px; margin: 32px 0;">
        <h3 style="font-size: 16px; font-weight: 600; color: #fff; margin: 0 0 12px 0;">Need Help?</h3>
        <p style="margin: 0; font-size: 14px; color: #d4d4d8;">
          Email: <a href="mailto:bryce@ogdix.com" style="color: #3b82f6; text-decoration: none;">bryce@ogdix.com</a><br>
          Response time: Usually within 24 hours
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="https://app.ogdix.com" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 600;">
          Get Started Now 🚀
        </a>
      </div>

      <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 24px 0 0 0; text-align: center;">
        Thank you for being part of the OG DiX journey!<br>
        Let's revolutionize independent dealerships together! 🚀
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272a;">
      <p style="font-size: 13px; color: #71717a; margin: 0;">
        Bryce Westcott, Founder<br>
        OG DiX Motor Club<br>
        <a href="mailto:bryce@ogdix.com" style="color: #3b82f6; text-decoration: none;">bryce@ogdix.com</a>
      </p>
    </div>
  </div>
</body>
</html>
    `;

    const textContent = `
You're Invited: OG DiX Beta Access 🚀

Hi ${recipient_name || 'there'},

You've been selected to be one of the first beta testers for OG DiX Motor Club - the all-in-one dealership management platform built specifically for independent dealers.

YOUR BETA ACCESS
Login URL: https://app.ogdix.com
Email: ${recipient_email}

WHAT IS OG DIX?
A complete dealership management system that handles:
- Inventory management with VIN scanning
- Deal structuring (Cash, BHPH, Financing)
- Automatic document generation with state-specific forms
- Customer & payment tracking
- Team management with time clock
- AI-powered email marketing

GETTING STARTED
1. Visit https://app.ogdix.com
2. Sign up with your email
3. Complete the dealership onboarding wizard
4. Add your first vehicle
5. Create a test deal

BETA TESTER PERKS
- Free access during beta (normally $199/month)
- Founder pricing - Lock in special lifetime rate at launch
- Direct influence - Your feedback shapes the product
- Early access to all new features

NEED HELP?
Email: bryce@ogdix.com
Response time: Usually within 24 hours

Thank you for being part of the OG DiX journey!
Let's revolutionize independent dealerships together! 🚀

Bryce Westcott, Founder
OG DiX Motor Club
bryce@ogdix.com
    `;

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'OG DiX <noreply@ogdix.com>',
        to: [recipient_email],
        subject: "You're Invited: OG DiX Beta Access 🚀",
        html: htmlContent,
        text: textContent,
      }),
    });

    if (!resendResponse.ok) {
      const error = await resendResponse.text();
      console.error('Resend error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to send email via Resend', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resendData = await resendResponse.json();
    console.log('Email sent successfully:', resendData);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Beta invitation sent to ${recipient_email}`,
        email_id: resendData.id
      }),
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

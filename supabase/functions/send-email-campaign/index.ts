import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: 'campaign_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get recipient list
    let customers;
    if (campaign.segment_id) {
      // Get customers in segment (based on segment criteria)
      const { data: segment } = await supabase
        .from('customer_segments')
        .select('*')
        .eq('id', campaign.segment_id)
        .single();

      if (segment && segment.criteria) {
        // Apply segment criteria to filter customers
        // For now, get all customers - in production, apply filters based on segment.criteria
        const { data } = await supabase
          .from('customers')
          .select('*')
          .eq('dealer_id', campaign.dealer_id);
        customers = data || [];
      }
    } else {
      // Send to all customers
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('dealer_id', campaign.dealer_id);
      customers = data || [];
    }

    // Filter customers with valid emails and check preferences
    const validCustomers = [];
    for (const customer of customers) {
      if (!customer.email || !customer.email.includes('@')) continue;

      // Check customer preferences
      const { data: prefs } = await supabase
        .from('customer_preferences')
        .select('*')
        .eq('customer_id', customer.id)
        .single();

      // Skip if unsubscribed
      if (prefs && !prefs.email_enabled) continue;

      validCustomers.push(customer);
    }

    if (validCustomers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid recipients found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update campaign status
    await supabase
      .from('email_campaigns')
      .update({
        status: 'sending',
        recipient_count: validCustomers.length
      })
      .eq('id', campaign_id);

    // Send emails using Resend API
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    let sentCount = 0;
    let failedCount = 0;

    for (const customer of validCustomers) {
      try {
        // Personalize content
        let personalizedHtml = campaign.body_html
          .replace(/\{\{customer_name\}\}/g, customer.name || 'Valued Customer')
          .replace(/\{\{dealer_name\}\}/g, campaign.from_name || 'Our Dealership');

        // Send via Resend
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: `${campaign.from_name} <${campaign.from_email}>`,
            to: [customer.email],
            subject: campaign.subject_line,
            html: personalizedHtml,
            headers: {
              'X-Campaign-ID': campaign_id,
              'X-Customer-ID': customer.id,
            },
          }),
        });

        const resendData = await resendResponse.json();

        if (resendResponse.ok && resendData.id) {
          // Log successful send
          await supabase
            .from('email_logs')
            .insert({
              dealer_id: campaign.dealer_id,
              campaign_id: campaign_id,
              customer_id: customer.id,
              to_email: customer.email,
              to_name: customer.name,
              subject_line: campaign.subject_line,
              status: 'sent',
              external_id: resendData.id,
              sent_at: new Date().toISOString(),
            });

          sentCount++;
        } else {
          // Log failed send
          await supabase
            .from('email_logs')
            .insert({
              dealer_id: campaign.dealer_id,
              campaign_id: campaign_id,
              customer_id: customer.id,
              to_email: customer.email,
              to_name: customer.name,
              subject_line: campaign.subject_line,
              status: 'failed',
              error_message: resendData.message || 'Unknown error',
            });

          failedCount++;
        }

        // Rate limit: wait 100ms between sends to avoid hitting API limits
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Failed to send to ${customer.email}:`, error);
        failedCount++;

        // Log error
        await supabase
          .from('email_logs')
          .insert({
            dealer_id: campaign.dealer_id,
            campaign_id: campaign_id,
            customer_id: customer.id,
            to_email: customer.email,
            to_name: customer.name,
            subject_line: campaign.subject_line,
            status: 'failed',
            error_message: error.message,
          });
      }
    }

    // Update campaign with final stats
    await supabase
      .from('email_campaigns')
      .update({
        status: 'sent',
        sent_count: sentCount,
        sent_at: new Date().toISOString(),
      })
      .eq('id', campaign_id);

    return new Response(
      JSON.stringify({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        total_recipients: validCustomers.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error sending campaign:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send campaign' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@ogdealer.com';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      investor_id,
      notification_type,
      data
    } = await req.json();

    if (!notification_type) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing notification_type' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // For invite notifications, investor_id may be null - use data.email/full_name directly
    let investor: any;
    if (notification_type === 'invite' && !investor_id && data?.email) {
      investor = { email: data.email, full_name: data.full_name || 'Investor' };
    } else if (investor_id) {
      const { data: inv, error: investorError } = await supabase
        .from('investors')
        .select('*')
        .eq('id', investor_id)
        .single();

      if (investorError || !inv) {
        return new Response(
          JSON.stringify({ success: false, error: 'Investor not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }
      investor = inv;
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing investor_id or data.email' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Generate email content based on notification type
    const email = generateEmailContent(notification_type, investor, data);

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unknown notification type' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: investor.email,
        subject: email.subject,
        html: email.html
      })
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Failed to send email:', emailData);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email', details: emailData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, email_id: emailData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error sending notification:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function generateEmailContent(type: string, investor: any, data: any): any {
  const baseUrl = Deno.env.get('APP_URL') || 'https://ogdealer.com';
  const firstName = investor.full_name.split(' ')[0];

  switch (type) {
    case 'transfer_initiated':
      return {
        subject: `${data.type === 'deposit' ? 'Deposit' : 'Withdrawal'} of ${formatCurrency(data.amount)} Initiated`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; }
              .content { padding: 30px; }
              .amount { font-size: 36px; font-weight: bold; color: #1e40af; margin: 20px 0; }
              .info-box { background: #f1f5f9; border-radius: 8px; padding: 15px; margin: 20px 0; }
              .info-row { display: flex; justify-content: space-between; margin: 10px 0; }
              .label { color: #64748b; }
              .value { font-weight: 600; color: #0f172a; }
              .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
              .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Transfer Initiated</h1>
              </div>
              <div class="content">
                <p>Hi ${firstName},</p>
                <p>We've initiated a ${data.type} from your linked bank account.</p>

                <div class="amount">${formatCurrency(data.amount)}</div>

                <div class="info-box">
                  <div class="info-row">
                    <span class="label">Type:</span>
                    <span class="value">${data.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Bank Account:</span>
                    <span class="value">${data.bank_name || 'Your linked account'}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Estimated Settlement:</span>
                    <span class="value">${data.estimated_settlement || '3-5 business days'}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Transfer ID:</span>
                    <span class="value">${data.transfer_id?.substring(0, 20)}...</span>
                  </div>
                </div>

                <p>You'll receive another email when the transfer completes.</p>

                <a href="${baseUrl}/investor/capital" class="button">View Transaction</a>
              </div>
              <div class="footer">
                <p>OG Dealer Investor Portal</p>
                <p>Questions? Contact us at support@ogdealer.com</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    case 'transfer_completed':
      return {
        subject: `${data.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Completed ✅`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px; text-align: center; }
              .content { padding: 30px; }
              .checkmark { font-size: 48px; margin: 10px 0; }
              .amount { font-size: 36px; font-weight: bold; color: #059669; margin: 20px 0; }
              .info-box { background: #f1f5f9; border-radius: 8px; padding: 15px; margin: 20px 0; }
              .info-row { display: flex; justify-content: space-between; margin: 10px 0; }
              .label { color: #64748b; }
              .value { font-weight: 600; color: #0f172a; }
              .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
              .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="checkmark">✅</div>
                <h1>Transfer Completed!</h1>
              </div>
              <div class="content">
                <p>Hi ${firstName},</p>
                <p>Great news! Your ${data.type} has been completed successfully.</p>

                <div class="amount">${formatCurrency(data.amount)}</div>

                <div class="info-box">
                  <div class="info-row">
                    <span class="label">New Available Balance:</span>
                    <span class="value">${formatCurrency(data.new_balance)}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Total Invested:</span>
                    <span class="value">${formatCurrency(data.total_invested)}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Lifetime ROI:</span>
                    <span class="value">${data.lifetime_roi?.toFixed(2)}%</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Completed:</span>
                    <span class="value">${new Date().toLocaleDateString()}</span>
                  </div>
                </div>

                ${data.type === 'deposit'
                  ? '<p>Your capital is now available and will be deployed to purchase vehicles within 1-2 weeks.</p>'
                  : '<p>The funds have been transferred to your linked bank account.</p>'
                }

                <a href="${baseUrl}/investor/dashboard" class="button">View Portfolio</a>
              </div>
              <div class="footer">
                <p>OG Dealer Investor Portal</p>
                <p>Questions? Contact us at support@ogdealer.com</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    case 'transfer_failed':
      return {
        subject: `${data.type === 'deposit' ? 'Deposit' : 'Withdrawal'} Failed - Action Required ⚠️`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 30px; text-align: center; }
              .content { padding: 30px; }
              .warning { font-size: 48px; margin: 10px 0; }
              .amount { font-size: 36px; font-weight: bold; color: #dc2626; margin: 20px 0; }
              .error-box { background: #fef2f2; border: 2px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0; color: #991b1b; }
              .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
              .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="warning">⚠️</div>
                <h1>Transfer Failed</h1>
              </div>
              <div class="content">
                <p>Hi ${firstName},</p>
                <p>Unfortunately, your ${data.type} could not be completed.</p>

                <div class="amount">${formatCurrency(data.amount)}</div>

                <div class="error-box">
                  <strong>Reason:</strong> ${data.failure_reason || 'Unknown error'}<br><br>
                  <strong>What this means:</strong><br>
                  ${getFailureExplanation(data.failure_reason)}
                </div>

                <p><strong>Next steps:</strong></p>
                <ul>
                  <li>Check your bank account balance and status</li>
                  <li>Verify your account is in good standing</li>
                  <li>Try again with a different amount or payment method</li>
                  <li>Contact support if the issue persists</li>
                </ul>

                <a href="${baseUrl}/investor/capital" class="button">Try Again</a>
              </div>
              <div class="footer">
                <p>OG Dealer Investor Portal</p>
                <p>Need help? Email support@ogdealer.com or call (555) 123-4567</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    case 'invite':
      return {
        subject: `You're Invited to Invest with OG DiX`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
              .header h1 { margin: 0; font-size: 28px; }
              .content { padding: 30px; color: #1e293b; }
              .highlight-box { background: linear-gradient(135deg, #eff6ff, #f5f3ff); border: 2px solid #3b82f6; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center; }
              .highlight-box .rate { font-size: 36px; font-weight: bold; color: #1e40af; }
              .highlight-box .label { color: #64748b; font-size: 14px; }
              .button { display: inline-block; background: linear-gradient(135deg, #1e40af, #7c3aed); color: white; padding: 16px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 18px; margin: 20px 0; }
              .steps { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
              .step { display: flex; margin: 12px 0; }
              .step-num { background: #3b82f6; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; margin-right: 12px; flex-shrink: 0; }
              .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>You're Invited to Invest</h1>
                <p style="margin: 8px 0 0; opacity: 0.9;">OG DiX Dealer Investment Portal</p>
              </div>
              <div class="content">
                <p>Hi ${firstName},</p>
                <p>You've been personally invited to join our investor program. ${
                  data.pool_type === 'merchant_rate'
                    ? 'Every time we use your capital for a transaction, you automatically earn a percentage.'
                    : data.pool_type === 'fixed_return'
                    ? 'You\'ll earn a guaranteed fixed return on your investment, paid out on a regular schedule.'
                    : 'You\'ll earn a share of the profit on every vehicle transaction funded by your capital.'
                }</p>

                <div class="highlight-box">
                  ${data.pool_type === 'merchant_rate' ? `
                    <div class="rate">${data.rate || 3}% per transaction</div>
                    <div class="label">Earned automatically on every deal</div>
                  ` : data.pool_type === 'fixed_return' ? `
                    <div class="rate">${data.rate || 8.5}% annual return</div>
                    <div class="label">Paid ${data.payout_frequency || 'quarterly'}</div>
                  ` : `
                    <div class="rate">${data.rate || 60}% profit share</div>
                    <div class="label">Your share of every vehicle sale</div>
                  `}
                </div>

                <div class="steps">
                  <p style="font-weight: 600; margin-top: 0;">Getting started is easy:</p>
                  <div class="step"><div class="step-num">1</div><div>Click the button below to open your portal</div></div>
                  <div class="step"><div class="step-num">2</div><div>Review the investment terms</div></div>
                  <div class="step"><div class="step-num">3</div><div>Create your account & link your bank</div></div>
                </div>

                <div style="text-align: center;">
                  <a href="${data.invite_link}" class="button">Open Your Investor Portal</a>
                </div>

                <p style="color: #64748b; font-size: 13px;">This invitation was sent to ${investor.email}. If you didn't expect this, you can safely ignore it.</p>
              </div>
              <div class="footer">
                <p>OG DiX Dealer Software</p>
                <p>Questions? Reply to this email or contact support.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    case 'vehicle_purchased':
      return {
        subject: `New Vehicle Purchased with Your Capital 🚗`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); color: white; padding: 30px; text-align: center; }
              .content { padding: 30px; }
              .vehicle-info { background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0; }
              .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
              .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🚗 New Vehicle Purchased!</h1>
              </div>
              <div class="content">
                <p>Hi ${firstName},</p>
                <p>Great news! Your capital has been deployed to purchase a new vehicle:</p>

                <div class="vehicle-info">
                  <h2>${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}</h2>
                  <p><strong>VIN:</strong> ${data.vehicle.vin}</p>
                  <p><strong>Purchase Price:</strong> ${formatCurrency(data.purchase_price)}</p>
                  <p><strong>Your Capital Deployed:</strong> ${formatCurrency(data.capital_deployed)}</p>
                  <p><strong>Expected ROI:</strong> ${data.expected_roi}%</p>
                  <p><strong>Estimated Sale Date:</strong> ${data.estimated_sale_date}</p>
                </div>

                <p>We'll notify you when this vehicle sells and your profit is distributed!</p>

                <a href="${baseUrl}/investor/portfolio" class="button">View Investment</a>
              </div>
              <div class="footer">
                <p>OG Dealer Investor Portal</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    case 'vehicle_sold':
      return {
        subject: `Vehicle Sold - Profit Distributed! 💰`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              .header { background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); color: white; padding: 30px; text-align: center; }
              .content { padding: 30px; }
              .profit { font-size: 42px; font-weight: bold; color: #f59e0b; margin: 20px 0; }
              .vehicle-info { background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0; }
              .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
              .footer { background: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>💰 Vehicle Sold!</h1>
              </div>
              <div class="content">
                <p>Hi ${firstName},</p>
                <p>Congratulations! A vehicle you invested in has been sold and your profit has been distributed.</p>

                <div class="profit">+${formatCurrency(data.profit_earned)}</div>

                <div class="vehicle-info">
                  <h3>${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}</h3>
                  <p><strong>Purchase Price:</strong> ${formatCurrency(data.purchase_price)}</p>
                  <p><strong>Sale Price:</strong> ${formatCurrency(data.sale_price)}</p>
                  <p><strong>Gross Profit:</strong> ${formatCurrency(data.gross_profit)}</p>
                  <p><strong>Your Share (${data.profit_share}%):</strong> ${formatCurrency(data.profit_earned)}</p>
                  <p><strong>Days Held:</strong> ${data.days_held} days</p>
                  <p><strong>ROI:</strong> ${data.roi?.toFixed(2)}%</p>
                </div>

                <p>Your profit has been added to your available balance and is ready to withdraw or reinvest!</p>

                <a href="${baseUrl}/investor/portfolio" class="button">View Portfolio</a>
              </div>
              <div class="footer">
                <p>OG Dealer Investor Portal</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

    default:
      return null;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

function getFailureExplanation(reason: string): string {
  const explanations: { [key: string]: string } = {
    'insufficient_funds': 'Your bank account does not have sufficient funds to complete this transfer. Please check your balance and try again.',
    'account_closed': 'The linked bank account appears to be closed. Please link a different account.',
    'invalid_account': 'The bank account information is invalid. Please re-link your account.',
    'authorization_expired': 'The transfer authorization has expired. Please try again.',
    'transfer_limit_exceeded': 'This transfer exceeds your daily or monthly limit. Try a smaller amount.',
    'default': 'An unexpected error occurred. Please contact support for assistance.'
  };

  return explanations[reason] || explanations['default'];
}

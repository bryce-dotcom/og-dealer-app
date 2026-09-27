// PUBLIC (deploy with --no-verify-jwt). Backs "Forgot password?" on /login.
// Emails a set-password link via Resend (Supabase's built-in emailer is not
// reliable on this project). Always returns the same response whether or not
// the email has an account, so it can't be used to discover accounts.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPasswordLinkEmail } from '../_shared/passwordLink.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GENERIC_OK = { success: true, message: 'If that email has an account, a reset link is on its way.' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let email = '';
  try { email = String((await req.json())?.email || '').trim().toLowerCase(); } catch { /* fall through */ }
  if (!email || !email.includes('@') || email.length > 254) {
    return new Response(JSON.stringify({ error: 'Enter the email you sign in with.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } });

  const { error } = await sendPasswordLinkEmail({ supabase, email, mode: 'reset' });
  if (error) console.log('password reset send failed:', email, error);

  return new Response(JSON.stringify(GENERIC_OK), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

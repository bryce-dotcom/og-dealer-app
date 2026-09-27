// PUBLIC (deploy with --no-verify-jwt). Called by /employee-setup with the
// one-time token from the emailed link plus the password the person chose.
// Verifies the token server-side and sets the password, so the browser never
// has to hold a half-established session between page load and submit (that
// handoff is what failed on iOS Safari). The page then signs in normally with
// email + password.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid request' }); }

  const tokenHash = String(body?.token_hash || '').trim();
  const type = body?.type === 'recovery' ? 'recovery' : body?.type === 'invite' ? 'invite' : null;
  const password = String(body?.password || '');

  if (!tokenHash || !type) {
    return json(400, { code: 'link_invalid', error: 'This setup link is missing information. Open the newest email and tap the button again.' });
  }
  if (password.length < 8) {
    return json(400, { code: 'weak_password', error: 'Use at least 8 characters.' });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await verifier.auth.verifyOtp({ token_hash: tokenHash, type });
  if (verifyError || !verified?.user) {
    console.log('verifyOtp failed:', verifyError?.message);
    return json(400, {
      code: 'link_expired',
      error: 'This link has expired or was already used. Links work once and expire after 24 hours. Ask your manager to send a new invite, or use "Forgot password?" on the sign-in page.',
    });
  }

  const user = verified.user;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { error: pwError } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (pwError) {
    console.log('updateUserById failed:', pwError.message);
    return json(400, { code: 'password_rejected', error: pwError.message });
  }

  // Make sure the employee row points at this login (covers invites created
  // before user_id was being linked).
  if (user.email) {
    await admin
      .from('employees')
      .update({ user_id: user.id })
      .eq('email', user.email.toLowerCase())
      .is('user_id', null);
  }

  // The verification created a throwaway server-side session; nobody holds it,
  // so revoke it. Best effort.
  try { await verifier.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }

  return json(200, { success: true, email: user.email });
});

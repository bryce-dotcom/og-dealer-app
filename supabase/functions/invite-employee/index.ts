import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPasswordLinkEmail } from '../_shared/passwordLink.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function getDealerName(supabase: any, dealerId: number | string): Promise<string> {
  try {
    const { data } = await supabase.from('dealer_settings').select('dealer_name').eq('id', dealerId).single();
    return data?.dealer_name || 'the dealership';
  } catch { return 'the dealership'; }
}

// Sending an invite is always allowed, including for someone who already has a
// login: the link lets them (re)choose a password, which is exactly what a
// manager wants when an employee is locked out. Emails go through Resend.
async function sendInvite(supabase: any, email: string, name: string, dealerId: number | string) {
  const dealerName = await getDealerName(supabase, dealerId);
  return sendPasswordLinkEmail({ supabase, email, name, dealerName, mode: 'invite' });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('Invite employee request:', { ...body, hourly_rate: body.hourly_rate });

    // Resend an invite to an existing employee row
    if (body.resend && body.employee_id) {
      const { data: employee } = await supabase
        .from('employees')
        .select('email, name, dealer_id')
        .eq('id', body.employee_id)
        .single();

      if (!employee) return json(404, { error: 'Employee not found' });
      if (!employee.email) return json(400, { error: 'This employee has no email address. Add one first.' });

      const { userId, error: sendError } = await sendInvite(supabase, employee.email, employee.name || '', employee.dealer_id);
      if (sendError) return json(500, { error: `Failed to send invitation: ${sendError}` });

      await supabase
        .from('employees')
        .update({ invited_at: new Date().toISOString(), ...(userId ? { user_id: userId } : {}) })
        .eq('id', body.employee_id);

      return json(200, { success: true, message: `Invitation sent to ${employee.email}` });
    }

    // New invitation
    const { dealer_id, name, email, role, access_level, pay_type, hourly_rate, employee_id, existing_employee } = body;

    if (!dealer_id || !name || !email) {
      return json(400, { error: 'Missing required fields: dealer_id, name, email' });
    }

    // Inviting an employee row that already exists
    if (existing_employee && employee_id) {
      const { data: existingEmp } = await supabase
        .from('employees')
        .select('id')
        .eq('id', employee_id)
        .single();

      if (!existingEmp) return json(404, { error: 'Employee not found' });

      const { userId, error: sendError } = await sendInvite(supabase, email, name, dealer_id);
      if (sendError) return json(500, { error: `Failed to send invitation: ${sendError}` });

      await supabase
        .from('employees')
        .update({ invited_at: new Date().toISOString(), ...(userId ? { user_id: userId } : {}) })
        .eq('id', employee_id);

      return json(200, { success: true, message: `Invitation sent to ${email}` });
    }

    // Brand-new employee
    const { data: existing } = await supabase
      .from('employees')
      .select('id, email')
      .eq('dealer_id', dealer_id)
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) return json(400, { error: 'An employee with this email already exists' });

    const { userId: newUserId, error: sendErrorNew } = await sendInvite(supabase, email, name, dealer_id);
    if (sendErrorNew) return json(500, { error: `Failed to send invitation: ${sendErrorNew}` });

    const employeeData: any = {
      dealer_id,
      name,
      email: email.toLowerCase(),
      roles: role ? [role] : [],
      pay_type: [pay_type || 'hourly'],
      active: true,
      user_id: newUserId,
      invited_at: new Date().toISOString(),
      hourly_rate: 0,
      salary: 0,
      pto_days_per_year: 10,
      pto_accrued: 0,
      pto_used: 0
    };
    if (pay_type === 'hourly' && hourly_rate) {
      employeeData.hourly_rate = parseFloat(hourly_rate);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .insert(employeeData)
      .select()
      .single();

    // No auth-user rollback here: the login may pre-date this invite (the
    // helper reuses existing accounts), and deleting it would lock a real
    // person out. An unused auth user is harmless.
    if (employeeError) {
      console.error('Employee creation error:', employeeError);
      return json(500, { error: `Failed to create employee record: ${employeeError.message}` });
    }

    return json(200, { success: true, employee, message: `Invitation sent to ${email}` });
  } catch (error) {
    console.error('Function error:', error);
    return json(500, { error: error.message || 'Unknown error' });
  }
});

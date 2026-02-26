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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('Invite employee request:', { ...body, hourly_rate: body.hourly_rate });

    // Handle resend invitation
    if (body.resend && body.employee_id) {
      const { data: employee } = await supabase
        .from('employees')
        .select('email, user_id')
        .eq('id', body.employee_id)
        .single();

      if (!employee) {
        return new Response(
          JSON.stringify({ error: 'Employee not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (employee.user_id) {
        return new Response(
          JSON.stringify({ error: 'Employee has already accepted invitation' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Resend invitation using Supabase Auth
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(employee.email, {
        redirectTo: 'https://app.ogdix.com/employee-setup'
      });

      if (inviteError) {
        console.error('Resend invitation error:', inviteError);
        return new Response(
          JSON.stringify({ error: 'Failed to resend invitation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Invitation resent successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // New invitation
    const { dealer_id, name, email, role, access_level, pay_type, hourly_rate, employee_id, existing_employee } = body;

    if (!dealer_id || !name || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: dealer_id, name, email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If inviting existing employee, update their record instead of creating new
    if (existing_employee && employee_id) {
      const { data: existingEmp } = await supabase
        .from('employees')
        .select('id, email, user_id')
        .eq('id', employee_id)
        .single();

      if (!existingEmp) {
        return new Response(
          JSON.stringify({ error: 'Employee not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (existingEmp.user_id) {
        return new Response(
          JSON.stringify({ error: 'Employee already has app access' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Send invitation
      const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: 'https://app.ogdix.com/employee-setup',
        data: { dealer_id, name, role, access_level }
      });

      if (authError) {
        console.error('Auth invitation error:', authError);
        return new Response(
          JSON.stringify({ error: `Failed to send invitation: ${authError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update employee with user_id and invited_at
      await supabase
        .from('employees')
        .update({
          user_id: authData.user?.id,
          invited_at: new Date().toISOString()
        })
        .eq('id', employee_id);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Invitation sent to ${email}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if employee already exists
    const { data: existing } = await supabase
      .from('employees')
      .select('id, email')
      .eq('dealer_id', dealer_id)
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'An employee with this email already exists' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Send invitation via Supabase Auth (creates auth.users record)
    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: 'https://app.ogdix.com/employee-setup',
      data: {
        dealer_id,
        name,
        role,
        access_level
      }
    });

    if (authError) {
      console.error('Auth invitation error:', authError);
      return new Response(
        JSON.stringify({ error: `Failed to send invitation: ${authError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Auth user invited:', authData.user?.id);

    // Step 2: Create employee record in database
    const employeeData: any = {
      dealer_id,
      name,
      email: email.toLowerCase(),
      role,
      access_level: access_level || 'employee',
      pay_type: pay_type || 'hourly',
      active: true,
      invited_at: new Date().toISOString(),
      user_id: authData.user?.id || null
    };

    if (pay_type === 'hourly' && hourly_rate) {
      employeeData.hourly_rate = parseFloat(hourly_rate);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .insert(employeeData)
      .select()
      .single();

    if (employeeError) {
      console.error('Employee creation error:', employeeError);

      // Rollback: Delete the auth user if employee creation fails
      if (authData.user?.id) {
        await supabase.auth.admin.deleteUser(authData.user.id);
      }

      return new Response(
        JSON.stringify({ error: `Failed to create employee record: ${employeeError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Employee created successfully:', employee.id);

    return new Response(
      JSON.stringify({
        success: true,
        employee,
        message: `Invitation sent to ${email}`
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

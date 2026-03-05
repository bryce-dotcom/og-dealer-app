import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// BATCH IMPORT LOGIC
// ============================================
async function importInventoryBatch(rows: any[], dealerId: number, sessionId: string): Promise<{ success: number; errors: any[] }> {
  const BATCH_SIZE = 50;
  let successCount = 0;
  const errors: any[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Prepare records with import_session_id
    const records = batch.map(row => ({
      ...row,
      dealer_id: dealerId,
      import_session_id: sessionId,
      created_at: new Date().toISOString()
    }));

    // Check for duplicate VINs
    const vins = records.map(r => r.vin).filter(v => v);
    const { data: existingVehicles } = await supabase
      .from('inventory')
      .select('vin, id')
      .eq('dealer_id', dealerId)
      .in('vin', vins);

    const existingVINs = new Set((existingVehicles || []).map(v => v.vin));

    // Split into updates and inserts
    const toUpdate = records.filter(r => existingVINs.has(r.vin));
    const toInsert = records.filter(r => !existingVINs.has(r.vin));

    // Insert new vehicles
    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from('inventory')
        .insert(toInsert)
        .select();

      if (error) {
        console.error('[IMPORT] Insert error:', error);
        errors.push({ batch: i, type: 'insert', error: error.message });
      } else {
        successCount += data?.length || 0;
      }
    }

    // Update existing vehicles (using upsert)
    if (toUpdate.length > 0) {
      for (const record of toUpdate) {
        const { error } = await supabase
          .from('inventory')
          .update({
            ...record,
            import_session_id: sessionId
          })
          .eq('dealer_id', dealerId)
          .eq('vin', record.vin);

        if (error) {
          errors.push({ vin: record.vin, type: 'update', error: error.message });
        } else {
          successCount++;
        }
      }
    }

    // Update progress
    await supabase
      .from('import_sessions')
      .update({
        processed_rows: Math.min(i + BATCH_SIZE, rows.length),
        success_count: successCount
      })
      .eq('id', sessionId);
  }

  return { success: successCount, errors };
}

async function importDealsBatch(rows: any[], dealerId: number, sessionId: string): Promise<{ success: number; errors: any[] }> {
  const BATCH_SIZE = 50;
  let successCount = 0;
  const errors: any[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Prepare records
    const records = batch.map(row => ({
      ...row,
      dealer_id: dealerId,
      import_session_id: sessionId,
      created_at: new Date().toISOString(),
      deal_status: row.deal_status || 'Completed' // Default for historical imports
    }));

    // Insert deals (skip duplicates based on vehicle_id + date + purchaser)
    const { data, error } = await supabase
      .from('deals')
      .insert(records)
      .select();

    if (error) {
      console.error('[IMPORT] Deals insert error:', error);
      // Try individual inserts to identify problematic rows
      for (const record of records) {
        const { error: individualError } = await supabase
          .from('deals')
          .insert([record]);

        if (individualError) {
          errors.push({ record, error: individualError.message });
        } else {
          successCount++;
        }
      }
    } else {
      successCount += data?.length || 0;
    }

    // Update progress
    await supabase
      .from('import_sessions')
      .update({
        processed_rows: Math.min(i + BATCH_SIZE, rows.length),
        success_count: successCount
      })
      .eq('id', sessionId);
  }

  return { success: successCount, errors };
}

async function importCustomersBatch(rows: any[], dealerId: number, sessionId: string): Promise<{ success: number; errors: any[] }> {
  const BATCH_SIZE = 50;
  let successCount = 0;
  const errors: any[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Check for duplicate customers by phone or email
    const phones = batch.map(r => r.phone).filter(p => p);
    const emails = batch.map(r => r.email).filter(e => e);

    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('phone, email, id')
      .eq('dealer_id', dealerId)
      .or(`phone.in.(${phones.join(',')}),email.in.(${emails.join(',')})`);

    const existingPhones = new Set((existingCustomers || []).map(c => c.phone));
    const existingEmails = new Set((existingCustomers || []).map(c => c.email));

    // Filter out duplicates
    const toInsert = batch.filter(row => {
      const isDuplicate = (row.phone && existingPhones.has(row.phone)) ||
                          (row.email && existingEmails.has(row.email));
      if (isDuplicate) {
        errors.push({ record: row, error: 'Duplicate customer (phone or email exists)' });
      }
      return !isDuplicate;
    });

    if (toInsert.length > 0) {
      const records = toInsert.map(row => ({
        ...row,
        dealer_id: dealerId,
        import_session_id: sessionId,
        created_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('customers')
        .insert(records)
        .select();

      if (error) {
        console.error('[IMPORT] Customers insert error:', error);
        errors.push({ batch: i, type: 'insert', error: error.message });
      } else {
        successCount += data?.length || 0;
      }
    }

    // Update progress
    await supabase
      .from('import_sessions')
      .update({
        processed_rows: Math.min(i + BATCH_SIZE, rows.length),
        success_count: successCount
      })
      .eq('id', sessionId);
  }

  return { success: successCount, errors };
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { valid_rows, data_type, dealer_id, import_session_id, column_mappings } = await req.json();

    if (!valid_rows || !data_type || !dealer_id || !import_session_id) {
      throw new Error("Missing required fields: valid_rows, data_type, dealer_id, import_session_id");
    }

    console.log(`[IMPORT] Starting ${data_type} import: ${valid_rows.length} rows for dealer ${dealer_id}`);

    // Update session to processing
    await supabase
      .from('import_sessions')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        total_rows: valid_rows.length
      })
      .eq('id', import_session_id);

    // Execute import based on data type
    let result;
    if (data_type === 'inventory') {
      result = await importInventoryBatch(valid_rows, dealer_id, import_session_id);
    } else if (data_type === 'deals') {
      result = await importDealsBatch(valid_rows, dealer_id, import_session_id);
    } else if (data_type === 'customers') {
      result = await importCustomersBatch(valid_rows, dealer_id, import_session_id);
    } else {
      throw new Error(`Unknown data type: ${data_type}`);
    }

    // Save column mappings to learning system
    if (column_mappings && Array.isArray(column_mappings)) {
      for (const mapping of column_mappings) {
        if (!mapping.db_field) continue;

        await supabase
          .from('dealer_import_mappings')
          .upsert({
            dealer_id,
            data_type,
            dealer_column_name: mapping.dealer_column,
            db_field_name: mapping.db_field,
            usage_count: 1,
            last_used_at: new Date().toISOString()
          }, {
            onConflict: 'dealer_id,data_type,dealer_column_name',
            ignoreDuplicates: false
          });
      }
    }

    // Update session to completed
    await supabase
      .from('import_sessions')
      .update({
        status: result.errors.length > 0 ? 'completed' : 'completed',
        completed_at: new Date().toISOString(),
        success_count: result.success,
        error_count: result.errors.length,
        errors: result.errors.length > 0 ? result.errors : null
      })
      .eq('id', import_session_id);

    console.log(`[IMPORT] Complete: ${result.success} imported, ${result.errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        success_count: result.success,
        error_count: result.errors.length,
        errors: result.errors,
        message: `Successfully imported ${result.success} of ${valid_rows.length} rows`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[IMPORT] Error:", error);

    // Update session to failed
    if (req.json && (await req.json()).import_session_id) {
      const { import_session_id } = await req.json();
      await supabase
        .from('import_sessions')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          errors: [{ error: error.message }]
        })
        .eq('id', import_session_id);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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
// DATA TRANSFORMATIONS
// ============================================
function parseCurrency(value: string): number | null {
  if (!value) return null;
  const cleaned = String(value).replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(value: string): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  } catch {
    return null;
  }
}

function normalizePhone(value: string): string | null {
  if (!value) return null;
  const cleaned = String(value).replace(/\D/g, '');
  if (cleaned.length === 10) return cleaned;
  if (cleaned.length === 11 && cleaned[0] === '1') return cleaned.slice(1);
  return cleaned.length > 0 ? cleaned : null;
}

function validateEmail(value: string): string | null {
  if (!value) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value) ? value.toLowerCase() : null;
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

function applyTransformation(value: string, transformation: string): any {
  if (!value || value === '') return null;

  switch (transformation) {
    case 'parse_currency':
      return parseCurrency(value);
    case 'parse_date':
      return parseDate(value);
    case 'normalize_phone':
      return normalizePhone(value);
    case 'validate_email':
      return validateEmail(value);
    case 'parse_number':
      return parseNumber(value);
    default:
      return value?.trim() || null;
  }
}

// ============================================
// VALIDATION RULES
// ============================================
function validateInventoryRow(row: any, rowIndex: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!row.vin || row.vin.length !== 17) {
    errors.push(`Invalid VIN (must be 17 characters)`);
  }
  if (!row.year || row.year < 1900 || row.year > new Date().getFullYear() + 2) {
    errors.push(`Invalid year (${row.year})`);
  }
  if (!row.make) {
    errors.push(`Missing make`);
  }
  if (!row.model) {
    errors.push(`Missing model`);
  }

  // Optional but validated fields
  if (row.miles && (row.miles < 0 || row.miles > 999999)) {
    warnings.push(`Unusual mileage: ${row.miles}`);
  }
  if (row.purchase_price && row.purchase_price < 0) {
    errors.push(`Invalid purchase price: ${row.purchase_price}`);
  }
  if (row.sale_price && row.sale_price < 0) {
    errors.push(`Invalid sale price: ${row.sale_price}`);
  }

  return { errors, warnings };
}

async function validateDealsRow(row: any, rowIndex: number, dealerId: number): Promise<{ errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!row.purchaser_name) {
    errors.push(`Missing purchaser name`);
  }
  if (!row.date_of_sale) {
    errors.push(`Missing sale date`);
  }
  if (!row.price || row.price <= 0) {
    errors.push(`Invalid price: ${row.price}`);
  }

  // VIN lookup (if vehicle_id is a VIN, we need to look it up)
  if (row.vehicle_id) {
    const { data: vehicle } = await supabase
      .from('inventory')
      .select('id')
      .eq('dealer_id', dealerId)
      .eq('vin', row.vehicle_id)
      .single();

    if (!vehicle) {
      errors.push(`Vehicle not found: VIN ${row.vehicle_id}. Import vehicles first.`);
    } else {
      row.vehicle_id = vehicle.id; // Update to use internal ID
    }
  } else {
    warnings.push(`No vehicle linked to this deal`);
  }

  // Email validation
  if (row.email && !validateEmail(row.email)) {
    warnings.push(`Invalid email format: ${row.email}`);
  }

  return { errors, warnings };
}

function validateCustomersRow(row: any, rowIndex: number): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required field
  if (!row.name && !(row.first_name && row.last_name)) {
    errors.push(`Missing name (need 'name' or 'first_name' + 'last_name')`);
  }

  // Concatenate first/last if needed
  if (!row.name && row.first_name && row.last_name) {
    row.name = `${row.first_name} ${row.last_name}`;
  }

  // Phone validation
  if (row.phone && row.phone.replace(/\D/g, '').length < 10) {
    warnings.push(`Phone number may be invalid: ${row.phone}`);
  }

  // Email validation
  if (row.email && !validateEmail(row.email)) {
    warnings.push(`Invalid email format: ${row.email}`);
  }

  return { errors, warnings };
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rows, mappings, data_type, dealer_id } = await req.json();

    if (!rows || !mappings || !data_type || !dealer_id) {
      throw new Error("Missing required fields: rows, mappings, data_type, dealer_id");
    }

    console.log(`[VALIDATE] Validating ${rows.length} ${data_type} rows for dealer ${dealer_id}`);

    const validRows: any[] = [];
    const warningRows: any[] = [];
    const errorRows: any[] = [];

    // Transform and validate each row
    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const transformedRow: any = {};

      // Apply mappings and transformations
      for (const mapping of mappings) {
        if (!mapping.db_field) continue;

        const dealerValue = rawRow[mapping.dealer_column];

        // Handle concatenation
        if (mapping.concat_with) {
          const values = mapping.concat_with.map((col: string) => rawRow[col]).filter((v: string) => v);
          transformedRow[mapping.db_field] = values.join(' ');
        } else {
          transformedRow[mapping.db_field] = applyTransformation(
            dealerValue,
            mapping.transformation || 'none'
          );
        }
      }

      // Add dealer_id
      transformedRow.dealer_id = dealer_id;

      // Validate based on data type
      let validation;
      if (data_type === 'inventory') {
        validation = validateInventoryRow(transformedRow, i);
      } else if (data_type === 'deals') {
        validation = await validateDealsRow(transformedRow, i, dealer_id);
      } else if (data_type === 'customers') {
        validation = validateCustomersRow(transformedRow, i);
      } else {
        throw new Error(`Unknown data type: ${data_type}`);
      }

      // Categorize row
      if (validation.errors.length > 0) {
        errorRows.push({
          row: i + 2, // +2 because row 1 is header, and we're 0-indexed
          data: rawRow,
          errors: validation.errors
        });
      } else if (validation.warnings.length > 0) {
        warningRows.push({
          row: i + 2,
          data: transformedRow,
          warnings: validation.warnings
        });
      } else {
        validRows.push(transformedRow);
      }
    }

    console.log(`[VALIDATE] Results: ${validRows.length} valid, ${warningRows.length} warnings, ${errorRows.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        valid_rows: validRows,
        warning_rows: warningRows,
        error_rows: errorRows,
        validation_summary: {
          total: rows.length,
          valid: validRows.length,
          warnings: warningRows.length,
          errors: errorRows.length
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[VALIDATE] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

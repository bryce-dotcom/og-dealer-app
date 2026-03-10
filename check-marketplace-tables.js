import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rlzudfinlxonpbwacxpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsenVkZmlubHhvbnBid2FjeHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTk5MzksImV4cCI6MjA4NDE3NTkzOX0.93JAEAoYad2WStPpaZZbFAUR3cIKWF1PG5xEVmMkj4U';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('Checking marketplace tables...\n');

  const tables = ['marketplace_settings', 'marketplace_listings', 'marketplace_sync_log'];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          console.log('❌', table, '- TABLE DOES NOT EXIST');
          console.log('   Run the migration SQL in Supabase Dashboard\n');
        } else if (error.code === 'PGRST301' || error.message.includes('policy')) {
          console.log('⚠️ ', table, '- exists but RLS policy blocking');
          console.log('   This is normal - you need to be authenticated\n');
        } else {
          console.log('❌', table, '- Error:', error.code, error.message);
        }
      } else {
        console.log('✅', table, '- exists and accessible');
        console.log('   Rows:', data.length, '\n');
      }
    } catch (err) {
      console.log('❌', table, '- Exception:', err.message, '\n');
    }
  }

  console.log('\n=================================');
  console.log('If tables do not exist:');
  console.log('1. Copy SQL from: supabase/migrations/20260305000002_create_marketplace_sync.sql');
  console.log('2. Paste into: https://supabase.com/dashboard/project/rlzudfinlxonpbwacxpt/sql');
  console.log('3. Click Run');
  console.log('=================================');
}

checkTables().catch(console.error);

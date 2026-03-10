import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials. Make sure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const sql = readFileSync('./supabase/migrations/20260305000002_create_marketplace_sync.sql', 'utf8');

    console.log('Applying marketplace migration via edge function...');

    // Use the admin SQL execution edge function
    const { data, error } = await supabase.functions.invoke('execute-sql', {
      body: { sql }
    });

    if (error) {
      // If edge function doesn't exist, show instructions
      if (error.message?.includes('not found')) {
        console.log('\n⚠️  Cannot execute migration automatically.');
        console.log('\nPlease apply the migration manually:');
        console.log('1. Go to https://supabase.com/dashboard/project/rlzudfinlxonpbwacxpt/sql');
        console.log('2. Copy the contents of: supabase/migrations/20260305000002_create_marketplace_sync.sql');
        console.log('3. Paste and run in SQL Editor');
        console.log('\nOr use Supabase CLI:');
        console.log('   npx supabase db reset --local');
        console.log('   npx supabase db push');
        return;
      }
      throw error;
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(data);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.log('\nPlease apply the migration manually via Supabase Dashboard SQL Editor.');
    process.exit(1);
  }
}

applyMigration();

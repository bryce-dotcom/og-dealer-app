import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rlzudfinlxonpbwacxpt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsenVkZmlubHhvbnBid2FjeHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTk5MzksImV4cCI6MjA4NDE3NTkzOX0.93JAEAoYad2WStPpaZZbFAUR3cIKWF1PG5xEVmMkj4U'
);

// Check saved searches
const { data: searches, error } = await supabase
  .from('saved_vehicle_searches')
  .select('*');

console.log('\n=== SAVED SEARCHES ===');
console.log('Count:', searches?.length || 0);
if (searches && searches.length > 0) {
  searches.forEach(s => {
    console.log(`\n- "${s.name}" (ID: ${s.id})`);
    console.log(`  Active: ${s.active}`);
    console.log(`  Dealer: ${s.dealer_id}`);
    console.log(`  Criteria: ${s.year_min}-${s.year_max} ${s.make} ${s.model}`);
  });
} else {
  console.log('NO SEARCHES FOUND!');
}
if (error) console.error('Error:', error);

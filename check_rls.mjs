import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rlzudfinlxonpbwacxpt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsenVkZmlubHhvbnBid2FjeHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTk5MzksImV4cCI6MjA4NDE3NTkzOX0.93JAEAoYad2WStPpaZZbFAUR3cIKWF1PG5xEVmMkj4U'
);

// Try to insert a test search
const { data, error } = await supabase
  .from('saved_vehicle_searches')
  .insert({
    dealer_id: 1,
    name: 'Test Search',
    make: 'Ford',
    active: true
  })
  .select();

console.log('Insert result:', data);
console.log('Insert error:', error);

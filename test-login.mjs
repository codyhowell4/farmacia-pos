import { createClient } from '@supabase/supabase-js';

const url = 'https://ieinjhonepkudxxpmuly.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllaW5qaG9uZXBrdWR4eHBtdWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NDc2MzgsImV4cCI6MjA5MDMyMzYzOH0.Zc79127QCi3VcrK_WYWv_-cQdBtpweYqTt3zziMJBno';

const supabase = createClient(url, key);

async function test() {
  console.log('1. Autenticando con Supabase...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'cody@howell.marketing',
    password: 'password' // We don't know the password, so it will likely reject, BUT if it hangs we know the auth endpoint is dead.
  });
  
  if (authError) {
    console.error('Auth Error:', authError.message);
    // Even if it auth errors, let's grab the user ID using service role if we could, but we can't.
    // Let's just try to query profiles blindly to see if RLS hangs!
  } else {
    console.log('Auth Success:', authData.user.id);
  }

  console.log('2. Consultando perfiles...');
  const { data, error } = await supabase
    .from('profiles')
    .select('*, locations(name), organizations(name, slug)')
    .limit(1);

  if (error) {
    console.log('Profiles Query Error:', error.message);
  } else {
    console.log('Profiles Query Success:', data);
  }
}

test().then(() => console.log('Finished!')).catch(console.error);

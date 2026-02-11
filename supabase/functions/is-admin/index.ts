// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@^2.41.0"
import { corsHeaders } from '../_shared/cors.ts'

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // Use Service Role Key for admin checks

console.log('is-admin function invoked'); // Basic logging

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Creating Supabase client');
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
      auth: {
        // It's crucial to set persistSession to false for server-side operations
        // to avoid errors related to localStorage not being available.
        persistSession: false,
      },
    })

    console.log('Getting user session');
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError) {
      console.error('Error getting user:', userError.message);
      return new Response(JSON.stringify({ isAdmin: false, error: 'Error fetching user: ' + userError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401, // Unauthorized or error fetching user
      })
    }

    if (!user) {
      console.log('No user found in session');
      return new Response(JSON.stringify({ isAdmin: false, error: 'User not authenticated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401, // Unauthorized
      })
    }

    console.log(`User ID: ${user.id} - Checking admin status`);

    // Check if the user ID exists in the admin_users table
    // Use the service role client for this check, as RLS might restrict access otherwise
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: adminEntry, error: adminError } = await adminSupabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(); // Use maybeSingle to get one record or null

    if (adminError) {
      console.error('Error checking admin table:', adminError.message);
      return new Response(JSON.stringify({ isAdmin: false, error: 'Database error checking admin status: ' + adminError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    const isAdmin = !!adminEntry; // True if adminEntry is not null
    console.log(`User ${user.id} admin status: ${isAdmin}`);

    // Check if the user has API access (separate from admin)
    const { data: apiAccessEntry } = await adminSupabase
      .from('api_access_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const hasApiAccess = isAdmin || !!apiAccessEntry;
    console.log(`User ${user.id} API access: ${hasApiAccess}`);

    return new Response(JSON.stringify({ isAdmin, hasApiAccess }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Caught unhandled error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/is-admin' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

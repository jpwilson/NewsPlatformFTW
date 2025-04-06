// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@^2.41.0'
import { corsHeaders } from '../_shared/cors.ts'

// Helper function to check for admin privileges
async function isAdminUser(supabaseClient: SupabaseClient): Promise<boolean> {
  const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
  if (userError || !user) {
    console.error('Admin check failed:', userError?.message || 'No user')
    return false
  }

  // Use service role for this specific check to bypass RLS if needed
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('Error checking admin_users table:', error.message)
    return false
  }
  return !!data // True if a record was found
}

console.log('admin-articles function initialized')

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Create a client with the user's token for auth check
  const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    global: {
      headers: { Authorization: req.headers.get('Authorization')! },
    },
    auth: { persistSession: false },
  })

  try {
    // --- Admin Check ---
    const isAdmin = await isAdminUser(supabaseClient)
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }
    console.log('Admin user verified.')

    // --- Routing based on method ---
    const url = new URL(req.url)
    // Path after proxy/Supabase routing is typically /<function-name>/<param1>/<param2>...
    // e.g., /admin-articles/100
    const pathSegments = url.pathname.substring(1).split('/') // Remove leading /, then split: ['admin-articles', '100']
    const functionName = pathSegments[0] // Should be 'admin-articles'
    // Check if there's a segment *after* the function name
    const articleId = pathSegments.length > 1 ? parseInt(pathSegments[1], 10) : null

    console.log(`Parsed path: functionName=${functionName}, articleId=${articleId}`) // Add log for debugging

    // Use service role client for database operations from now on
    const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey)

    if (req.method === 'GET' && functionName === 'admin-articles' && !articleId) {
      // GET /admin-articles - Fetch all articles
      console.log('Handling GET /admin-articles')
      const { data, error } = await supabaseAdminClient
        .from('articles')
        // Only select columns that exist
        .select('id, title, created_at, view_count, channels(name)') 
        .order('created_at', { ascending: false })

      if (error) throw error
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })

    } else if (req.method === 'PATCH' && functionName === 'admin-articles' && articleId) {
      // PATCH /admin-articles/:id - Update article metrics
      console.log(`Handling PATCH /admin-articles/${articleId}`)
      const updates = await req.json()
      console.log('Received updates:', updates)

      // Validate updates - only allow specific fields that exist
      const allowedUpdates: { [key: string]: number } = {}
      if (typeof updates.view_count === 'number' && updates.view_count >= 0) { // Add non-negative check
        allowedUpdates.view_count = updates.view_count
      }

      if (Object.keys(allowedUpdates).length === 0) {
        return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }

      console.log('Applying updates:', allowedUpdates)
      const { data, error } = await supabaseAdminClient
        .from('articles')
        .update(allowedUpdates)
        .eq('id', articleId)
        // Only select columns that exist
        .select('id, title, view_count') 
        .single() // Expect only one row

      if (error) {
        console.error(`Error updating article ${articleId}:`, error.message)
        if (error.code === 'PGRST116') { // PostgREST code for no rows found
          return new Response(JSON.stringify({ error: `Article with ID ${articleId} not found` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          })
        }
        throw error // Rethrow other errors
      }

      console.log(`Article ${articleId} updated successfully.`)
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })

    } else {
      // Method/path not supported
      console.warn(`Method/path not handled: ${req.method} ${url.pathname}`) // Log unhandled
      return new Response(JSON.stringify({ error: 'Method or path not allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      })
    }
  } catch (error) {
    console.error('Unhandled error in admin-articles:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/admin-articles' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

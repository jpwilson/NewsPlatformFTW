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
      
      // First fetch the articles with basic info including admin counts
      const { data: articles, error } = await supabaseAdminClient
        .from('articles')
        .select('id, title, created_at, view_count, admin_like_count, admin_dislike_count, channels(name)') 
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Then get reaction counts for all articles
      const articleIds = articles.map(article => article.id)
      
      // Get all user reactions for these articles
      const { data: reactions, error: reactionsError } = await supabaseAdminClient
        .from('reactions')
        .select('article_id, is_like, user_id')
        .in('article_id', articleIds)
        .gt('user_id', 0) // Only count real user reactions
      
      if (reactionsError) {
        console.error('Error fetching reactions:', reactionsError)
        // Continue anyway, we'll just show admin counts only
      }
      
      // Calculate real user like/dislike counts for each article
      const userReactionCounts = {}
      
      if (reactions) {
        reactions.forEach(reaction => {
          if (!userReactionCounts[reaction.article_id]) {
            userReactionCounts[reaction.article_id] = { likes: 0, dislikes: 0 }
          }
          
          if (reaction.is_like) {
            userReactionCounts[reaction.article_id].likes++
          } else {
            userReactionCounts[reaction.article_id].dislikes++
          }
        })
      }
      
      // Combine user reactions with admin counts for the total
      const articlesWithTotalCounts = articles.map(article => {
        // Get user reaction counts (or 0 if none)
        const userLikes = userReactionCounts[article.id]?.likes || 0;
        const userDislikes = userReactionCounts[article.id]?.dislikes || 0;
        
        // Get admin-set counts
        const adminLikes = article.admin_like_count || 0;
        const adminDislikes = article.admin_dislike_count || 0;
        
        // Calculate total counts (user + admin)
        const totalLikes = userLikes + adminLikes;
        const totalDislikes = userDislikes + adminDislikes;
        
        console.log(`Article ${article.id}: ${userLikes} user likes + ${adminLikes} admin likes = ${totalLikes} total`);
        
        return {
          ...article,
          like_count: totalLikes,
          dislike_count: totalDislikes
        }
      })
      
      return new Response(JSON.stringify(articlesWithTotalCounts), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })

    } else if (req.method === 'PATCH' && functionName === 'admin-articles' && articleId) {
      // PATCH /admin-articles/:id - Update article metrics
      console.log(`Handling PATCH /admin-articles/${articleId}`)
      const updates = await req.json()
      console.log('Received updates:', JSON.stringify(updates))

      // Log the request headers to check authentication 
      console.log('Request headers:', Object.fromEntries(req.headers.entries()))
      
      // Validate updates - only allow specific fields that exist
      const allowedUpdates: { [key: string]: number } = {}
      if (typeof updates.view_count === 'number' && updates.view_count >= 0) {
        allowedUpdates.view_count = updates.view_count
      }
      
      // Add admin_like_count and admin_dislike_count to allowed updates
      if (typeof updates.like_count === 'number' && updates.like_count >= 0) {
        // We'll calculate the admin_like_count below after getting user likes
        console.log(`Like count update requested: ${updates.like_count}`)
      }
      
      if (typeof updates.dislike_count === 'number' && updates.dislike_count >= 0) {
        // We'll calculate the admin_dislike_count below after getting user dislikes
        console.log(`Dislike count update requested: ${updates.dislike_count}`)
      }

      // First get the article and current reaction counts
      let updatedArticle = null
      let userLikeCount = 0
      let userDislikeCount = 0
      
      try {
        // Get the article first
        const { data: article, error: articleError } = await supabaseAdminClient
          .from('articles')
          .select('id, title, view_count, admin_like_count, admin_dislike_count')
          .eq('id', articleId)
          .single()
          
        if (articleError || !article) {
          console.error(`Error getting article ${articleId}:`, articleError?.message || 'Not found')
          return new Response(JSON.stringify({ error: `Article with ID ${articleId} not found` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          })
        }
        
        updatedArticle = article
        
        // Get user-generated likes count
        const { data: userLikes, error: likesError } = await supabaseAdminClient
          .from('reactions')
          .select('id')
          .eq('article_id', articleId)
          .eq('is_like', true)
          .gt('user_id', 0) // Only real user reactions
          
        if (likesError) {
          console.error(`Error getting user like count:`, likesError.message)
          throw likesError
        }
        
        userLikeCount = userLikes?.length || 0
        
        // Get user-generated dislikes count
        const { data: userDislikes, error: dislikesError } = await supabaseAdminClient
          .from('reactions')
          .select('id')
          .eq('article_id', articleId)
          .eq('is_like', false)
          .gt('user_id', 0) // Only real user reactions
          
        if (dislikesError) {
          console.error(`Error getting user dislike count:`, dislikesError.message)
          throw dislikesError
        }
        
        userDislikeCount = userDislikes?.length || 0
        
        // Now set the admin counts based on the target values
        if (typeof updates.like_count === 'number' && updates.like_count >= 0) {
          // If target is less than user count, set admin count to 0 (can't remove real reactions)
          if (updates.like_count <= userLikeCount) {
            allowedUpdates.admin_like_count = 0
          } else {
            // Set admin count to make up the difference
            allowedUpdates.admin_like_count = updates.like_count - userLikeCount
          }
          console.log(`Setting admin_like_count to ${allowedUpdates.admin_like_count} to reach target of ${updates.like_count}`)
        }
        
        if (typeof updates.dislike_count === 'number' && updates.dislike_count >= 0) {
          // If target is less than user count, set admin count to 0 (can't remove real reactions)
          if (updates.dislike_count <= userDislikeCount) {
            allowedUpdates.admin_dislike_count = 0
          } else {
            // Set admin count to make up the difference
            allowedUpdates.admin_dislike_count = updates.dislike_count - userDislikeCount
          }
          console.log(`Setting admin_dislike_count to ${allowedUpdates.admin_dislike_count} to reach target of ${updates.dislike_count}`)
        }
        
        // Apply the updates if we have any
        if (Object.keys(allowedUpdates).length > 0) {
          console.log('Applying article updates:', allowedUpdates)
          const { data, error } = await supabaseAdminClient
            .from('articles')
            .update(allowedUpdates)
            .eq('id', articleId)
            .select('id, title, view_count, admin_like_count, admin_dislike_count')
            .single()
          
          if (error) {
            console.error(`Error updating article ${articleId}:`, error.message)
            throw error
          }
          
          updatedArticle = data
          console.log(`Article ${articleId} updated successfully.`)
        }
        
        // Calculate the total like and dislike counts
        const totalLikeCount = userLikeCount + (updatedArticle.admin_like_count || 0)
        const totalDislikeCount = userDislikeCount + (updatedArticle.admin_dislike_count || 0)
        
        // Prepare the final response
        const response = {
          ...updatedArticle,
          like_count: totalLikeCount,
          dislike_count: totalDislikeCount
        }
        
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
        
      } catch (error) {
        console.error(`Error updating article metrics:`, error)
        return new Response(JSON.stringify({ error: error.message || 'Failed to update article metrics' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        })
      }

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

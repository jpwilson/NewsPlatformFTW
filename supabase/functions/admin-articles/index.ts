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
      
      // First fetch the articles with basic info
      const { data: articles, error } = await supabaseAdminClient
        .from('articles')
        .select('id, title, created_at, view_count, channels(name)') 
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Then get reaction counts for all articles
      const articleIds = articles.map(article => article.id)
      
      // Get all reactions for these articles
      const { data: reactions, error: reactionsError } = await supabaseAdminClient
        .from('reactions')
        .select('article_id, is_like')
        .in('article_id', articleIds)
      
      if (reactionsError) {
        console.error('Error fetching reactions:', reactionsError)
        // Continue anyway, we'll just show 0 for likes/dislikes
      }
      
      // Calculate like/dislike counts for each article
      const reactionCounts = {}
      
      if (reactions) {
        reactions.forEach(reaction => {
          if (!reactionCounts[reaction.article_id]) {
            reactionCounts[reaction.article_id] = { likes: 0, dislikes: 0 }
          }
          
          if (reaction.is_like) {
            reactionCounts[reaction.article_id].likes++
          } else {
            reactionCounts[reaction.article_id].dislikes++
          }
        })
      }
      
      // Add reaction counts to each article
      const articlesWithReactions = articles.map(article => ({
        ...article,
        like_count: reactionCounts[article.id]?.likes || 0,
        dislike_count: reactionCounts[article.id]?.dislikes || 0
      }))
      
      return new Response(JSON.stringify(articlesWithReactions), {
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

      // Process the article update first if we have any allowed updates
      let updatedArticle = null
      
      if (Object.keys(allowedUpdates).length > 0) {
        console.log('Applying article updates:', allowedUpdates)
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
        
        updatedArticle = data
        console.log(`Article ${articleId} updated successfully.`)
      } else if (
        (typeof updates.like_count !== 'number' || updates.like_count < 0) && 
        (typeof updates.dislike_count !== 'number' || updates.dislike_count < 0)
      ) {
        return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }
      
      // Handle reaction counts update if specified
      if (typeof updates.like_count === 'number' && updates.like_count >= 0) {
        console.log(`Setting like count for article ${articleId} to ${updates.like_count}`)
        
        // First, get the article if we don't have it yet
        if (!updatedArticle) {
          const { data: article, error } = await supabaseAdminClient
            .from('articles')
            .select('id, title')
            .eq('id', articleId)
            .single()
            
          if (error) {
            console.error(`Error getting article ${articleId}:`, error.message)
            return new Response(JSON.stringify({ error: `Article with ID ${articleId} not found` }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 404,
            })
          }
          
          updatedArticle = article
        }
        
        // Get current like count
        const { data: likes, error: likesError } = await supabaseAdminClient
          .from('reactions')
          .select('id')
          .eq('article_id', articleId)
          .eq('is_like', true)
          
        if (likesError) {
          console.error(`Error getting like count for article ${articleId}:`, likesError.message)
          throw likesError
        }
        
        const currentLikes = likes.length
        const targetLikes = updates.like_count
        
        if (targetLikes > currentLikes) {
          // We need to add likes - create admin reactions
          const likesToAdd = targetLikes - currentLikes
          console.log(`Adding ${likesToAdd} admin likes`)
          
          // Check if is_admin_generated column exists before creating reactions
          let shouldAddAdminGeneratedField = false
          try {
            const { data: columnCheck, error: columnError } = await supabaseAdminClient
              .from('reactions')
              .select('is_admin_generated')
              .limit(1)
              
            if (!columnError) {
              // Column exists
              shouldAddAdminGeneratedField = true
            } else {
              console.log('is_admin_generated column does not exist, skipping this property')
            }
          } catch (e) {
            console.log('Error checking for is_admin_generated column, skipping this property')
          }
          
          // Create special admin user reactions
          const newLikes = []
          for (let i = 0; i < likesToAdd; i++) {
            const like: any = {
              article_id: articleId,
              user_id: 0, // Special admin user ID
              is_like: true
            }
            
            if (shouldAddAdminGeneratedField) {
              like.is_admin_generated = true
            }
            
            newLikes.push(like)
          }
          
          const { error: insertError } = await supabaseAdminClient
            .from('reactions')
            .insert(newLikes)
            
          if (insertError) {
            console.error(`Error adding admin likes:`, insertError.message)
            throw insertError
          }
        } else if (targetLikes < currentLikes) {
          // Need to remove some likes - remove admin-generated ones first
          const likesToRemove = currentLikes - targetLikes
          console.log(`Removing ${likesToRemove} admin likes`)
          
          let adminLikesToRemove = []
          
          // Check if is_admin_generated column exists
          try {
            const { data: columnCheck, error: columnError } = await supabaseAdminClient
              .from('reactions')
              .select('is_admin_generated')
              .limit(1)
              
            if (!columnError) {
              // Column exists, try to select admin-generated likes first
              const { data: adminLikes, error: adminLikesError } = await supabaseAdminClient
                .from('reactions')
                .select('id')
                .eq('article_id', articleId)
                .eq('is_like', true)
                .eq('is_admin_generated', true)
                .limit(likesToRemove)
                
              if (!adminLikesError && adminLikes.length > 0) {
                adminLikesToRemove = adminLikes
              }
            }
          } catch (e) {
            console.log('Error checking for is_admin_generated column, skipping admin filtering')
          }
          
          // If we didn't find enough admin-generated likes (or if the column doesn't exist),
          // get regular likes to make up the difference
          if (adminLikesToRemove.length < likesToRemove) {
            const regularLikesToRemove = likesToRemove - adminLikesToRemove.length
            
            const { data: regularLikes, error: regularLikesError } = await supabaseAdminClient
              .from('reactions')
              .select('id')
              .eq('article_id', articleId)
              .eq('is_like', true)
              .limit(regularLikesToRemove)
              
            if (regularLikesError) {
              console.error(`Error getting regular likes:`, regularLikesError.message)
              throw regularLikesError
            }
            
            // Combine admin likes and regular likes
            if (regularLikes.length > 0) {
              adminLikesToRemove = [...adminLikesToRemove, ...regularLikes]
            }
          }
          
          // Remove the reactions
          if (adminLikesToRemove.length > 0) {
            const likeIdsToRemove = adminLikesToRemove.map(like => like.id)
            const { error: deleteError } = await supabaseAdminClient
              .from('reactions')
              .delete()
              .in('id', likeIdsToRemove)
              
            if (deleteError) {
              console.error(`Error removing likes:`, deleteError.message)
              throw deleteError
            }
          }
        }
      }
      
      // Handle dislike count update if specified
      if (typeof updates.dislike_count === 'number' && updates.dislike_count >= 0) {
        console.log(`Setting dislike count for article ${articleId} to ${updates.dislike_count}`)
        
        // First, get the article if we don't have it yet
        if (!updatedArticle) {
          const { data: article, error } = await supabaseAdminClient
            .from('articles')
            .select('id, title')
            .eq('id', articleId)
            .single()
            
          if (error) {
            console.error(`Error getting article ${articleId}:`, error.message)
            return new Response(JSON.stringify({ error: `Article with ID ${articleId} not found` }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 404,
            })
          }
          
          updatedArticle = article
        }
        
        // Get current dislike count
        const { data: dislikes, error: dislikesError } = await supabaseAdminClient
          .from('reactions')
          .select('id')
          .eq('article_id', articleId)
          .eq('is_like', false)
          
        if (dislikesError) {
          console.error(`Error getting dislike count for article ${articleId}:`, dislikesError.message)
          throw dislikesError
        }
        
        const currentDislikes = dislikes.length
        const targetDislikes = updates.dislike_count
        
        if (targetDislikes > currentDislikes) {
          // We need to add dislikes - create admin reactions
          const dislikesToAdd = targetDislikes - currentDislikes
          console.log(`Adding ${dislikesToAdd} admin dislikes`)
          
          // Check if is_admin_generated column exists before creating reactions
          let shouldAddAdminGeneratedFieldForDislikes = false
          try {
            const { data: columnCheck, error: columnError } = await supabaseAdminClient
              .from('reactions')
              .select('is_admin_generated')
              .limit(1)
              
            if (!columnError) {
              // Column exists
              shouldAddAdminGeneratedFieldForDislikes = true
            } else {
              console.log('is_admin_generated column does not exist, skipping this property')
            }
          } catch (e) {
            console.log('Error checking for is_admin_generated column, skipping this property')
          }
          
          // Create special admin user reactions
          const newDislikes = []
          for (let i = 0; i < dislikesToAdd; i++) {
            const dislike: any = {
              article_id: articleId,
              user_id: 0, // Special admin user ID
              is_like: false
            }
            
            if (shouldAddAdminGeneratedFieldForDislikes) {
              dislike.is_admin_generated = true
            }
            
            newDislikes.push(dislike)
          }
          
          const { error: insertDislikeError } = await supabaseAdminClient
            .from('reactions')
            .insert(newDislikes)
            
          if (insertDislikeError) {
            console.error(`Error adding admin dislikes:`, insertDislikeError.message)
            throw insertDislikeError
          }
        } else if (targetDislikes < currentDislikes) {
          // Need to remove some dislikes - remove admin-generated ones first
          const dislikesToRemove = currentDislikes - targetDislikes
          console.log(`Removing ${dislikesToRemove} admin dislikes`)
          
          let adminDislikesToRemove = []
          
          // Check if is_admin_generated column exists
          try {
            const { data: columnCheck, error: columnError } = await supabaseAdminClient
              .from('reactions')
              .select('is_admin_generated')
              .limit(1)
              
            if (!columnError) {
              // Column exists, try to select admin-generated dislikes first
              const { data: adminDislikes, error: adminDislikesError } = await supabaseAdminClient
                .from('reactions')
                .select('id')
                .eq('article_id', articleId)
                .eq('is_like', false)
                .eq('is_admin_generated', true)
                .limit(dislikesToRemove)
                
              if (!adminDislikesError && adminDislikes.length > 0) {
                adminDislikesToRemove = adminDislikes
              }
            }
          } catch (e) {
            console.log('Error checking for is_admin_generated column, skipping admin filtering')
          }
          
          // If we didn't find enough admin-generated dislikes (or if the column doesn't exist),
          // get regular dislikes to make up the difference
          if (adminDislikesToRemove.length < dislikesToRemove) {
            const regularDislikesToRemove = dislikesToRemove - adminDislikesToRemove.length
            
            const { data: regularDislikes, error: regularDislikesError } = await supabaseAdminClient
              .from('reactions')
              .select('id')
              .eq('article_id', articleId)
              .eq('is_like', false)
              .limit(regularDislikesToRemove)
              
            if (regularDislikesError) {
              console.error(`Error getting regular dislikes:`, regularDislikesError.message)
              throw regularDislikesError
            }
            
            // Combine admin dislikes and regular dislikes
            if (regularDislikes.length > 0) {
              adminDislikesToRemove = [...adminDislikesToRemove, ...regularDislikes]
            }
          }
          
          // Remove the reactions
          if (adminDislikesToRemove.length > 0) {
            const dislikeIdsToRemove = adminDislikesToRemove.map(dislike => dislike.id)
            const { error: deleteError } = await supabaseAdminClient
              .from('reactions')
              .delete()
              .in('id', dislikeIdsToRemove)
              
            if (deleteError) {
              console.error(`Error removing dislikes:`, deleteError.message)
              throw deleteError
            }
          }
        }
      }
      
      // Get the updated reaction counts
      const { data: updatedLikes, error: updatedLikesError } = await supabaseAdminClient
        .from('reactions')
        .select('id')
        .eq('article_id', articleId)
        .eq('is_like', true)
        
      if (updatedLikesError) {
        console.error(`Error getting updated like count:`, updatedLikesError.message)
        throw updatedLikesError
      }
      
      const { data: updatedDislikes, error: updatedDislikesError } = await supabaseAdminClient
        .from('reactions')
        .select('id')
        .eq('article_id', articleId)
        .eq('is_like', false)
        
      if (updatedDislikesError) {
        console.error(`Error getting updated dislike count:`, updatedDislikesError.message)
        throw updatedDislikesError
      }
      
      // Prepare the final response with all updated metrics
      const response = {
        ...updatedArticle,
        like_count: updatedLikes.length,
        dislike_count: updatedDislikes.length
      }
      
      return new Response(JSON.stringify(response), {
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

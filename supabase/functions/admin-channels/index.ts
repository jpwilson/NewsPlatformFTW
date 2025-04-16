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

console.log('admin-channels function initialized')

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
    const pathSegments = url.pathname.substring(1).split('/')
    const functionName = pathSegments[0] // Should be 'admin-channels'
    const channelId = pathSegments.length > 1 ? parseInt(pathSegments[1], 10) : null

    console.log(`Parsed path: functionName=${functionName}, channelId=${channelId}`)

    // Use service role client for database operations from now on
    const supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey)

    if (req.method === 'GET' && functionName === 'admin-channels' && !channelId) {
      // GET /admin-channels - Fetch all channels with subscriber counts
      console.log('Handling GET /admin-channels')
      
      // Get all channels with their basic info including admin_subscriber_count
      const { data: channels, error } = await supabaseAdminClient
        .from('channels')
        .select(`
          id, 
          name, 
          description, 
          created_at, 
          user_id,
          admin_subscriber_count
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching channels:', error.message)
        throw error
      }
      
      // Get the real subscriber count for each channel using the subscriptions table
      const channelIds = channels.map(channel => channel.id)
      
      // Count real subscribers for each channel
      const subscriberCounts = {}
      
      // Get subscriber counts for all channels at once
      const { data: subscriptions, error: subError } = await supabaseAdminClient
        .from('subscriptions')
        .select('channel_id')
        .in('channel_id', channelIds)
      
      if (subError) {
        console.error('Error getting subscriptions:', subError.message)
        // Continue anyway with what we have
      } else {
        // Count subscriptions per channel
        if (subscriptions) {
          subscriptions.forEach(sub => {
            if (!subscriberCounts[sub.channel_id]) {
              subscriberCounts[sub.channel_id] = 0
            }
            subscriberCounts[sub.channel_id]++
          })
        }
      }
      
      // Combine the real subscriber counts with admin-set counts
      const channelsWithTotalCounts = channels.map(channel => {
        const realSubscriberCount = subscriberCounts[channel.id] || 0
        const adminSubscriberCount = channel.admin_subscriber_count || 0
        const totalSubscriberCount = realSubscriberCount + adminSubscriberCount
        
        return {
          ...channel,
          real_subscriber_count: realSubscriberCount,
          subscriber_count: totalSubscriberCount
        }
      })
      
      return new Response(JSON.stringify(channelsWithTotalCounts), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })

    } else if (req.method === 'PATCH' && functionName === 'admin-channels' && channelId) {
      // PATCH /admin-channels/:id - Update channel subscriber count
      console.log(`Handling PATCH /admin-channels/${channelId}`)
      const updates = await req.json()
      console.log('Received updates:', JSON.stringify(updates))
      
      // Validate updates - only allow specific fields
      if (typeof updates.subscriber_count !== 'number' || updates.subscriber_count < 0) {
        return new Response(JSON.stringify({ error: 'Invalid subscriber_count provided' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
      }
      
      // Get the channel and current real subscriber count
      const { data: channel, error: channelError } = await supabaseAdminClient
        .from('channels')
        .select('id, name, admin_subscriber_count')
        .eq('id', channelId)
        .single()
        
      if (channelError || !channel) {
        console.error(`Error getting channel ${channelId}:`, channelError?.message || 'Not found')
        return new Response(JSON.stringify({ error: `Channel with ID ${channelId} not found` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        })
      }
      
      // Get real subscriber count
      const { data: subscriptions, error: countError } = await supabaseAdminClient
        .from('subscriptions')
        .select('id')
        .eq('channel_id', channelId)
      
      if (countError) {
        console.error(`Error getting subscription count:`, countError.message)
        throw countError
      }
      
      const realSubscriberCount = subscriptions?.length || 0
      
      // Calculate admin subscriber count needed to reach target
      let adminSubscriberCount = 0
      if (updates.subscriber_count > realSubscriberCount) {
        adminSubscriberCount = updates.subscriber_count - realSubscriberCount
      }
      
      console.log(`Channel ${channelId}: ${realSubscriberCount} real subscribers + ${adminSubscriberCount} admin subscriber count`)
      
      // Update the admin_subscriber_count in the database
      const { data: updatedChannel, error: updateError } = await supabaseAdminClient
        .from('channels')
        .update({ admin_subscriber_count: adminSubscriberCount })
        .eq('id', channelId)
        .select('id, name, admin_subscriber_count')
        .single()
      
      if (updateError) {
        console.error(`Error updating channel ${channelId}:`, updateError.message)
        throw updateError
      }
      
      // Return the updated channel data with total subscriber count
      const response = {
        ...updatedChannel,
        real_subscriber_count: realSubscriberCount,
        subscriber_count: realSubscriberCount + updatedChannel.admin_subscriber_count
      }
      
      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } else {
      // Unsupported route or method
      return new Response(JSON.stringify({ error: 'Not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }
  } catch (error) {
    console.error('Error in admin-channels function:', error instanceof Error ? error.message : String(error))
    return new Response(
      JSON.stringify({
        error: `Server error: ${error instanceof Error ? error.message : String(error)}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
}) 
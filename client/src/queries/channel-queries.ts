import { User } from "@shared/schema";
import { supabase } from "@/lib/supabase";

// Fetch subscribers for a channel
export async function fetchChannelSubscribers(channelId: string): Promise<User[]> {
  // Get the session token
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token || '';
  
  console.log(`Fetching subscribers for channel: ${channelId}`);
  
  const response = await fetch(`${import.meta.env.VITE_API_URL}/api/channels/${channelId}/subscribers`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to fetch subscribers: ${response.status}`, errorText);
    throw new Error(`Failed to fetch channel subscribers: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('Subscribers data received:', data);
  
  return data;
} 
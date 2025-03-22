import { User } from "@shared/schema";
import { supabase } from "@/lib/supabase";

// Fetch subscribers for a channel
export async function fetchChannelSubscribers(channelId: string): Promise<User[]> {
  // Get the session token
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token || '';
  
  console.log(`Fetching subscribers for channel: ${channelId}`);
  
  // Fixed URL formation to ensure it's correct
  const apiBaseUrl = import.meta.env.VITE_API_URL || '';
  const apiUrl = apiBaseUrl.endsWith('/') 
    ? `${apiBaseUrl}api/channels/${channelId}/subscribers`
    : `${apiBaseUrl}/api/channels/${channelId}/subscribers`;
    
  console.log(`Making request to: ${apiUrl}`);
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Check for non-200 responses
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch subscribers: ${response.status}`, errorText);
      throw new Error(`Failed to fetch subscribers: ${response.status}`);
    }

    // First check if the response is actually JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Try to get the content as text to help with debugging
      const text = await response.text();
      if (text.includes('<!DOCTYPE html>')) {
        console.error('Received HTML instead of JSON');
        throw new Error('Server returned HTML instead of JSON');
      }
      
      // Try to parse it anyway, in case the Content-Type header is just wrong
      try {
        const data = JSON.parse(text);
        console.log('Successfully parsed non-JSON response as JSON:', data);
        return Array.isArray(data) ? data : [];
      } catch (e) {
        console.error('Not valid JSON:', text.substring(0, 100));
        throw new Error('Server returned an invalid response');
      }
    }
    
    // Normal JSON handling
    const data = await response.json();
    console.log('Subscribers data received:', data);
    
    if (!Array.isArray(data)) {
      console.warn('API returned non-array data:', data);
      return [];
    }
    
    return data;
  } catch (error) {
    console.error('Error in fetchChannelSubscribers:', error);
    throw error;
  }
} 
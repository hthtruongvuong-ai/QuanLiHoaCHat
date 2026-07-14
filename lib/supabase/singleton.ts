import { createBrowserClient } from '@/lib/supabase/client';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (!client) {
    client = createBrowserClient();
  }
  return client;
}

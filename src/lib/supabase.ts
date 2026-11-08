import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Cliente do Supabase usado só no servidor (Server Components e Server Actions). */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no .env.local (veja .env.example).");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Fallback to the project's own Supabase instance if env vars are not set
const SUPABASE_URL = 'https://hytpkikjcazitcxflkym.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_waRChF9iX_A9SgJXD3J4Og_Uefp-zcy';

// Use env vars if available (local dev), otherwise fall back to production values
const url = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

const supabaseClient: SupabaseClient = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sb-auth-token-convexa',
  },
});

export const getSupabase = async (): Promise<SupabaseClient> => {
  return supabaseClient;
};

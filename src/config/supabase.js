import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isValidUrl = supabaseUrl && /^https?:\/\//i.test(supabaseUrl);

if (!isValidUrl) {
  console.warn(
    '\n⚠️  [Supabase Config Warning]: SUPABASE_URL in server/.env is missing or set to placeholder ("' +
    supabaseUrl +
    '").\n👉 Please update server/.env with your actual Supabase URL (e.g. https://xxxx.supabase.co) and SUPABASE_SERVICE_ROLE_KEY.\n'
  );
}

// Service-role client — server-side ONLY. Never expose this key to the client.
export const supabase = isValidUrl
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

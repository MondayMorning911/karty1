import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://dummy.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

if (supabaseUrl === 'https://dummy.supabase.co') {
  console.warn('[Supabase] Missing credentials for server supabase client. Please configure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey);

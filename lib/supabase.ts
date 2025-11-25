import { createClient } from '@supabase/supabase-js';

// Credentials provided by user
const SUPABASE_URL = 'https://mtwkkzwveuskdcjkaiag.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wCP1B81ATC-jjMx99mq14A_3J18p_dO';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
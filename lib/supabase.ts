// lib/supabase.js
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ipwbhpkggjyqvxqonvsa.supabase.co';   // <-- paste your URL here
const supabaseAnonKey = 'sb_publishable_V86J5ITPzSlEkjptm4PQdg_w7jc1Aw-';                       // <-- paste your anon key here

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
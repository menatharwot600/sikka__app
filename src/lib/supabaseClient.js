import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY غير موجود. تأكد من ملء ملف .env بالقيم الصحيحة من Supabase (Settings > API).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

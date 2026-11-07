// =====================================================================
// FILE: js/supabase.js  (KHÔNG CẦN SỬA)
// Tạo kết nối tới Supabase. Các file khác chỉ việc: import { sb } ...
// =====================================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

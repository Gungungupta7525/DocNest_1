// js/supabase.js

// Supabase project configuration
const SUPABASE_URL = "https://bfporuvvhuvlhthkchsj.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_7SbnB3CqVzdaFSMb9-egGw_KypQ-g1q";

// Create Supabase client
const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

// Make it available globally to the rest of DocNest
window.supabaseClient = supabaseClient;

// Connection initialization message
console.log("✅ Supabase client initialized successfully");
console.log("Supabase URL:", SUPABASE_URL);
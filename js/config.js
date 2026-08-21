const SUPABASE_URL = "https://ovkhxtduzkvzkbluqjbs.supabase.co";
const SUPABASE_KEY = "sb_publishable_WZ4hph12sO2skyD-AKg5dg_28gVML0o";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: {
        params: { eventsPerSecond: 10 }
    }
});

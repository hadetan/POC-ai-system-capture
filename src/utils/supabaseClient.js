import { createClient } from '@supabase/supabase-js';
import { defaultRuntimeConfig } from './runtimeConfig.js';

let cachedClient = null;
let cachedConfigKey = '';

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

export const initializeSupabaseClient = async ({ configProvider = defaultRuntimeConfig } = {}) => {
    const config = await configProvider.getConfig();
    const supabaseUrl = normalizeString(config.SUPABASE_URL);
    const supabaseAnonKey = normalizeString(config.SUPABASE_ANON_KEY);
    const redirectUri = normalizeString(config.SUPABASE_REDIRECT_URI);

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY.');
    }

    const cacheKey = `${supabaseUrl}::${supabaseAnonKey}`;
    if (!cachedClient || cachedConfigKey !== cacheKey) {
        cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                autoRefreshToken: false,
                detectSessionInUrl: false,
                persistSession: true,
                storageKey: 'interview-assistant-app-auth'
            }
        });
        cachedConfigKey = cacheKey;
    }

    return {
        client: cachedClient,
        config,
        redirectUri
    };
};

export const resetCachedSupabaseClient = () => {
    cachedClient = null;
    cachedConfigKey = '';
};

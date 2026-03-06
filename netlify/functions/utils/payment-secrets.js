const { createClient } = require('@supabase/supabase-js');

const SECRET_SCHEMA = 'whatsapp';
const SECRET_TABLE = 'secrets';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cacheExpiresAt = 0;
let cachedSecrets = {};

function getSupabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY;
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = getSupabaseServiceKey();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase admin credentials');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

async function fetchSecretsFromDb(supabase, keys) {
  const requestedKeys = [...new Set((keys || []).filter(Boolean))];
  if (requestedKeys.length === 0) {
    return {};
  }

  const now = Date.now();
  const needsRefresh = now >= cacheExpiresAt || requestedKeys.some((key) => !(key in cachedSecrets));
  if (!needsRefresh) {
    const fromCache = {};
    requestedKeys.forEach((key) => {
      fromCache[key] = cachedSecrets[key] || '';
    });
    return fromCache;
  }

  const { data, error } = await supabase
    .schema(SECRET_SCHEMA)
    .from(SECRET_TABLE)
    .select('key, value')
    .in('key', requestedKeys);

  if (error) {
    console.error('[payment-secrets] Failed to fetch secrets:', error);
    throw new Error('Failed to fetch payment secrets from DB');
  }

  const nextCache = {};
  if (data) {
    data.forEach((item) => {
      nextCache[item.key] = normalizeValue(item.value);
    });
  }

  requestedKeys.forEach((key) => {
    if (!(key in nextCache)) {
      nextCache[key] = '';
    }
  });

  cachedSecrets = {
    ...cachedSecrets,
    ...nextCache
  };
  cacheExpiresAt = now + CACHE_TTL_MS;

  return nextCache;
}

async function resolvePaymentSecrets(keys, supabase) {
  const requestedKeys = [...new Set((keys || []).filter(Boolean))];
  if (requestedKeys.length === 0) {
    return {};
  }

  const resolved = {};
  const missingFromEnv = [];

  requestedKeys.forEach((key) => {
    const envValue = normalizeValue(process.env[key]);
    if (envValue) {
      resolved[key] = envValue;
    } else {
      missingFromEnv.push(key);
    }
  });

  if (missingFromEnv.length === 0) {
    return resolved;
  }

  const admin = supabase || getSupabaseAdmin();
  const dbSecrets = await fetchSecretsFromDb(admin, missingFromEnv);
  missingFromEnv.forEach((key) => {
    resolved[key] = normalizeValue(dbSecrets[key]);
  });

  return resolved;
}

module.exports = {
  getSupabaseAdmin,
  getSupabaseServiceKey,
  resolvePaymentSecrets
};

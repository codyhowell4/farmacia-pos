// ============================================================
// akauntingApi.js — Akaunting REST API client
// Uses axios with Basic Auth + X-Company header
// ============================================================
import axios from 'axios';

let _client = null;
let _config = null;

// ── RETRY UTIL ──────────────────────────────────────────────

/**
 * Retry wrapper for transient Akaunting API failures.
 * Retries on: 429, 500+, timeouts, network errors.
 * Does NOT retry: 400, 401, 403, 404, 422.
 */
const withRetry = async (fn, retries = 3, baseDelay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = e.response?.status;
      const isRetryable =
        status === 429 ||
        status >= 500 ||
        e.code === 'ECONNABORTED' ||
        e.code === 'ETIMEDOUT' ||
        e.code === 'ERR_NETWORK';
      if (!isRetryable || i === retries - 1) throw e;
      const delay = baseDelay * Math.pow(2, i);
      console.warn(`[Akaunting API] retry ${i + 1}/${retries} after ${delay}ms — ${e.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
};

/**
 * Configure the Akaunting API client with credentials.
 * @param {{apiUrl: string, companyId: number, apiEmail: string, apiPassword: string}} config
 */
export const configureClient = (config) => {
  _config = config;
  _client = axios.create({
    baseURL: config.apiUrl.replace(/\/$/, ''), // strip trailing slash
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Company': String(config.companyId),
    },
    auth: {
      username: config.apiEmail,
      password: config.apiPassword,
    },
    timeout: 15000,
  });

  // Request interceptor: add company_id query param to every request
  // Akaunting's company.identify middleware checks ?company_id before X-Company header
  _client.interceptors.request.use(
    (req) => {
      if (_config?.companyId) {
        req.params = { ...req.params, company_id: _config.companyId };
      }
      console.log('[Akaunting API] →', req.method?.toUpperCase(), req.url, req.params);
      return req;
    },
    (err) => Promise.reject(err)
  );

  // Response interceptor for uniform error handling + logging
  _client.interceptors.response.use(
    (res) => {
      console.log('[Akaunting API] ←', res.status, res.config?.url, res.data);
      return res;
    },
    (err) => {
      const status = err.response?.status;
      const responseData = err.response?.data;
      const rawMessage = responseData?.message || err.message || 'Error desconocido';

      // Log full error details for debugging
      console.error('[Akaunting API] ✕ ERROR', {
        status,
        url: err.config?.url,
        method: err.config?.method,
        responseData,
        headers: err.config?.headers,
        code: err.code,
      });

      if (status === 422 && responseData) {
        console.error(
          '[Akaunting API] FULL VALIDATION RESPONSE',
          JSON.stringify(responseData, null, 2)
        );
      }

      if (status >= 500) {
        console.error('[Akaunting API] FULL SERVER ERROR');
        console.error('  status:', status);
        console.error('  url:', err.config?.url);
        console.error('  method:', err.config?.method);
        console.error('  request payload:', err.config?.data);
        console.error(
          '  response body:',
          JSON.stringify(responseData, null, 2)
        );
      }

      let message = rawMessage;
      if (status === 401) {
        message = 'Credenciales de Akaunting inválidas. Verifica el email y la contraseña de la API.';
      } else if (status === 403) {
        const url = err.config?.url || '';
        if (url.includes('/documents')) {
          message = 'Permiso denegado en Akaunting (403) para documentos/facturas. Verifica que: (1) el usuario tenga permiso "read-api", (2) tenga permisos de facturas (sales-invoices) y transacciones bancarias (banking-transactions), y (3) el ID de empresa sea correcto.';
        } else if (url.includes('/contacts')) {
          message = 'Permiso denegado en Akaunting (403) para contactos/clientes. Verifica que: (1) el usuario tenga permiso "read-api", (2) tenga permisos de clientes (sales-customers), y (3) el ID de empresa sea correcto.';
        } else {
          message = 'Permiso denegado en Akaunting (403). Verifica que: (1) el usuario tenga permiso "read-api", (2) tenga los permisos específicos del módulo, y (3) el ID de empresa sea correcto.';
        }
      } else if (status === 404) {
        message = 'Recurso no encontrado en Akaunting. Es posible que haya sido eliminado.';
      } else if (status === 422) {
        message = `Datos inválidos: ${rawMessage}`;
      } else if (status === 429) {
        message = 'Demasiadas solicitudes a Akaunting. Espera un momento e intenta de nuevo.';
      } else if (status >= 500) {
        // Preserve raw server message; do not mask it
        message = rawMessage || `Error interno del servidor (${status})`;
      } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        message = 'Tiempo de espera agotado. Akaunting no respondió a tiempo.';
      } else if (err.code === 'ERR_NETWORK') {
        message = 'Error de red. Posible problema de CORS o el servidor no está disponible.';
      }

      return Promise.reject(new Error(`Akaunting ${status ? '(' + status + ') ' : ''}${message}`));
    }
  );
};

const getClient = () => {
  if (!_client) throw new Error('Cliente de Akaunting no configurado. Guarda la configuración primero.');
  return _client;
};

// ── CONNECTION ──────────────────────────────────────────────

/**
 * Test the API connection by hitting a PROTECTED endpoint.
 * /api/ping is public and does NOT verify credentials — we use /api/companies instead.
 */
export const testConnection = async () => {
  const client = getClient();
  try {
    const { data } = await client.get('/api/companies');
    return { ok: true, data: data?.data || data };
  } catch (err) {
    // If companies fails, try ping just to confirm server is up
    try {
      const { data } = await client.get('/api/ping');
      return { ok: false, pingOnly: true, data, error: err.message };
    } catch {
      throw err;
    }
  }
};

export const getCompanies = async () => {
  const client = getClient();
  const { data } = await client.get('/api/companies');
  return data?.data || data;
};

// ── CONTACTS (Customers) ────────────────────────────────────
// Akaunting 3.1.x requires `search=type:customer` query param for the
// contacts API, otherwise the permission middleware resolves to
// `permission:read-` (non-existent) and returns 403.

export const getContacts = async (params = {}) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.get('/api/contacts', {
    params: { ...params, search: 'type:customer' },
  });
  return data?.data || data;
});

export const createContact = async (contactData) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.post('/api/contacts', contactData, {
    params: { search: 'type:customer' },
  });
  return data?.data || data;
});

export const updateContact = async (id, contactData) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.put(`/api/contacts/${id}`, contactData, {
    params: { search: 'type:customer' },
  });
  return data?.data || data;
});

// ── ITEMS (Products) ────────────────────────────────────────

export const getItems = async (params = {}) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.get('/api/items', { params });
  return data?.data || data;
});

export const createItem = async (itemData) => withRetry(async () => {
  const client = getClient();
  console.log('[Akaunting API] createItem payload:', JSON.stringify(itemData, null, 2));
  const { data } = await client.post('/api/items', itemData);
  return data?.data || data;
});

export const updateItem = async (id, itemData) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.put(`/api/items/${id}`, itemData);
  return data?.data || data;
});

// ── DOCUMENTS (Invoices) ────────────────────────────────────
// Akaunting 3.1.x requires `search=type:invoice` query param for the
// documents API, otherwise the permission middleware resolves to
// `permission:create-` / `permission:read-` (non-existent) and returns 403.
// The middleware ONLY reads query params, NOT the request body.

export const getDocuments = async (params = {}) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.get('/api/documents', {
    params: { ...params, search: 'type:invoice' },
  });
  return data?.data || data;
});

export const createDocument = async (docData) => withRetry(async () => {
  const client = getClient();
  console.log('[Akaunting API] createDocument payload:', JSON.stringify(docData, null, 2));
  const { data } = await client.post('/api/documents', docData, {
    params: { search: 'type:invoice' },
  });
  return data?.data || data;
});

export const updateDocument = async (id, docData) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.put(`/api/documents/${id}`, docData, {
    params: { search: 'type:invoice' },
  });
  return data?.data || data;
});

// ── SETTINGS ────────────────────────────────────────────────

export const getSettings = async (params = {}) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.get('/api/settings', { params });
  return data?.data || data;
});

// ── DOCUMENT TRANSACTIONS (Payments) ────────────────────────

export const getDocumentTransactions = async (documentId) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.get(`/api/documents/${documentId}/transactions`);
  return data?.data || data;
});

export const createDocumentTransaction = async (documentId, txData) => withRetry(async () => {
  const client = getClient();
  const url = `/api/documents/${documentId}/transactions`;
  console.log('[Akaunting API] createDocumentTransaction request:', {
    url,
    documentId,
    payload: txData,
  });
  const { data } = await client.post(url, txData);
  console.log('[Akaunting API] createDocumentTransaction response:', data);
  return data?.data || data;
});

// ── TAXES ───────────────────────────────────────────────────

export const getTaxes = async () => withRetry(async () => {
  const client = getClient();
  const { data } = await client.get('/api/taxes');
  return data?.data || data;
});

export const createTax = async (taxData) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.post('/api/taxes', taxData);
  return data?.data || data;
});

// ── CATEGORIES ──────────────────────────────────────────────

export const getCategories = async (params = {}) => withRetry(async () => {
  const client = getClient();
  const { data } = await client.get('/api/categories', { params });
  return data?.data || data;
});

// ── ACCOUNTS ────────────────────────────────────────────────

export const getAccounts = async () => withRetry(async () => {
  const client = getClient();
  const { data } = await client.get('/api/accounts');
  return data?.data || data;
});

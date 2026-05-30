// ============================================================
// akauntingApi.js — Akaunting REST API client
// Uses axios with Basic Auth + X-Company header
// ============================================================
import axios from 'axios';

let _client = null;
let _config = null;

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

  // Response interceptor for uniform error handling
  _client.interceptors.response.use(
    (res) => res,
    (err) => {
      const message = err.response?.data?.message || err.message || 'Error desconocido';
      const status = err.response?.status;
      throw new Error(`Akaunting ${status ? '(' + status + ') ' : ''}${message}`);
    }
  );
};

const getClient = () => {
  if (!_client) throw new Error('Cliente de Akaunting no configurado. Guarda la configuración primero.');
  return _client;
};

// ── CONNECTION ──────────────────────────────────────────────

export const testConnection = async () => {
  const client = getClient();
  const { data } = await client.get('/api/ping');
  return data;
};

export const getCompanies = async () => {
  const client = getClient();
  const { data } = await client.get('/api/companies');
  return data?.data || data;
};

// ── CONTACTS (Customers) ────────────────────────────────────

export const getContacts = async (params = {}) => {
  const client = getClient();
  const { data } = await client.get('/api/contacts', { params });
  return data?.data || data;
};

export const createContact = async (contactData) => {
  const client = getClient();
  const { data } = await client.post('/api/contacts', contactData);
  return data?.data || data;
};

export const updateContact = async (id, contactData) => {
  const client = getClient();
  const { data } = await client.put(`/api/contacts/${id}`, contactData);
  return data?.data || data;
};

// ── ITEMS (Products) ────────────────────────────────────────

export const getItems = async (params = {}) => {
  const client = getClient();
  const { data } = await client.get('/api/items', { params });
  return data?.data || data;
};

export const createItem = async (itemData) => {
  const client = getClient();
  const { data } = await client.post('/api/items', itemData);
  return data?.data || data;
};

export const updateItem = async (id, itemData) => {
  const client = getClient();
  const { data } = await client.put(`/api/items/${id}`, itemData);
  return data?.data || data;
};

// ── DOCUMENTS (Invoices) ────────────────────────────────────

export const getDocuments = async (params = {}) => {
  const client = getClient();
  const { data } = await client.get('/api/documents', { params });
  return data?.data || data;
};

export const createDocument = async (docData) => {
  const client = getClient();
  const { data } = await client.post('/api/documents', docData);
  return data?.data || data;
};

export const updateDocument = async (id, docData) => {
  const client = getClient();
  const { data } = await client.put(`/api/documents/${id}`, docData);
  return data?.data || data;
};

// ── DOCUMENT TRANSACTIONS (Payments) ────────────────────────

export const createDocumentTransaction = async (documentId, txData) => {
  const client = getClient();
  const { data } = await client.post(`/api/documents/${documentId}/transactions`, txData);
  return data?.data || data;
};

// ── TAXES ───────────────────────────────────────────────────

export const getTaxes = async () => {
  const client = getClient();
  const { data } = await client.get('/api/taxes');
  return data?.data || data;
};

export const createTax = async (taxData) => {
  const client = getClient();
  const { data } = await client.post('/api/taxes', taxData);
  return data?.data || data;
};

// ── ACCOUNTS ────────────────────────────────────────────────

export const getAccounts = async () => {
  const client = getClient();
  const { data } = await client.get('/api/accounts');
  return data?.data || data;
};

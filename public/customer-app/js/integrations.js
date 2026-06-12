// Health Platform Integrations
// Fitbit and Garmin OAuth handlers — DISABLED (not yet enabled)

const INTEGRATION_CONFIG = {
  fitbit: {
    name: 'Fitbit',
    icon: '⌚',
    color: '#00B0B9',
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    scope: 'activity heartrate sleep weight profile',
    description: 'Sincroniza pasos, frecuencia cardíaca, sueño y peso'
  },
  garmin: {
    name: 'Garmin',
    icon: '📍',
    color: '#007CC2',
    authUrl: 'https://connect.garmin.com/oauthConfirm',
    scope: 'activity sleep',
    description: 'Sincroniza actividades deportivas y métricas de salud'
  }
};

export const Integrations = {
  // Check if user has connected a provider
  isConnected(provider) {
    const connections = JSON.parse(localStorage.getItem('healthConnections') || '{}');
    return connections[provider]?.connected || false;
  },

  // Get connection info
  getConnection(provider) {
    const connections = JSON.parse(localStorage.getItem('healthConnections') || '{}');
    return connections[provider] || null;
  },

  // Save connection — REQUIRES real OAuth tokens; mock tokens are rejected
  saveConnection(provider, data) {
    // Reject mock/demo tokens to prevent fake data injection
    const token = data?.accessToken || '';
    if (token.startsWith('mock_') || token.startsWith('demo_')) {
      console.warn('[Integrations] Rejected mock token for', provider);
      return false;
    }
    const connections = JSON.parse(localStorage.getItem('healthConnections') || '{}');
    connections[provider] = {
      ...data,
      connected: true,
      connectedAt: new Date().toISOString()
    };
    localStorage.setItem('healthConnections', JSON.stringify(connections));
    return true;
  },

  // Remove connection
  disconnect(provider) {
    const connections = JSON.parse(localStorage.getItem('healthConnections') || '{}');
    delete connections[provider];
    localStorage.setItem('healthConnections', JSON.stringify(connections));
  },

  // Initiate Fitbit OAuth — NOT ENABLED
  connectFitbit() {
    console.log('[Integrations] Fitbit OAuth not enabled');
    return false;
  },

  // Initiate Garmin OAuth — NOT ENABLED
  connectGarmin() {
    console.log('[Integrations] Garmin OAuth not enabled');
    return false;
  },

  // Sync Fitbit data — NOT ENABLED, returns empty data
  async syncFitbitData() {
    console.log('[Integrations] Fitbit sync not enabled');
    return {
      steps: 0,
      heartRate: null,
      sleep: null,
      weight: null,
      lastSync: null
    };
  },

  // Get all integrations status
  getAllIntegrations() {
    return Object.entries(INTEGRATION_CONFIG).map(([key, config]) => ({
      id: key,
      ...config,
      connected: this.isConnected(key),
      lastSync: this.getConnection(key)?.lastSync || null
    }));
  },

  // Get synced data from all providers — returns empty aggregation
  getAggregatedData() {
    return {
      steps: 0,
      heartRate: null,
      sleep: null,
      weight: null,
      sources: []
    };
  }
};

// Handle OAuth callbacks — NOT ENABLED
export function handleOAuthCallback(provider, code) {
  console.log('[Integrations] OAuth callback not enabled for', provider);
  return false;
}

// Render integrations list for UI — returns disabled placeholder
export function renderIntegrationsList() {
  return `
    <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 16px; text-align: center; color: white;">
      <div style="font-size: 2rem; margin-bottom: 8px;">⌚</div>
      <div style="font-weight: 700; font-size: 1rem; margin-bottom: 4px;">Integraciones próximamente</div>
      <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">Fitbit/Garmin support is not enabled yet.</div>
    </div>
  `;
}

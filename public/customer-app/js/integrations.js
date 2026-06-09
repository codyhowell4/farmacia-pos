// Health Platform Integrations
// Fitbit and Garmin OAuth handlers

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

// Generate PKCE challenge for secure OAuth
function generatePKCE() {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Simple hash for challenge (in production, use proper SHA256)
  const challenge = btoa(verifier).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  return { verifier, challenge };
}

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

  // Save connection
  saveConnection(provider, data) {
    const connections = JSON.parse(localStorage.getItem('healthConnections') || '{}');
    connections[provider] = {
      ...data,
      connected: true,
      connectedAt: new Date().toISOString()
    };
    localStorage.setItem('healthConnections', JSON.stringify(connections));
  },

  // Remove connection
  disconnect(provider) {
    const connections = JSON.parse(localStorage.getItem('healthConnections') || '{}');
    delete connections[provider];
    localStorage.setItem('healthConnections', JSON.stringify(connections));
  },

  // Initiate Fitbit OAuth
  connectFitbit() {
    const clientId = 'YOUR_FITBIT_CLIENT_ID'; // Replace with actual client ID
    const redirectUri = encodeURIComponent(window.location.origin + '/fitbit-callback');
    const { verifier, challenge } = generatePKCE();
    
    // Store verifier for callback
    sessionStorage.setItem('fitbit_pkce_verifier', verifier);
    
    const authUrl = `${INTEGRATION_CONFIG.fitbit.authUrl}?` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `redirect_uri=${redirectUri}&` +
      `scope=${encodeURIComponent(INTEGRATION_CONFIG.fitbit.scope)}&` +
      `code_challenge=${challenge}&` +
      `code_challenge_method=S256`;
    
    window.location.href = authUrl;
  },

  // Initiate Garmin OAuth
  connectGarmin() {
    const clientId = 'YOUR_GARMIN_CLIENT_ID'; // Replace with actual client ID
    const redirectUri = encodeURIComponent(window.location.origin + '/garmin-callback');
    
    // Garmin uses OAuth 1.0a, which requires server-side handling
    // For demo, we'll use a simplified flow
    alert('Conexión con Garmin requiere configuración del servidor. Por favor contacta al administrador.');
    
    // In production, this would redirect to your backend which handles OAuth 1.0a
    // window.location.href = `/api/integrations/garmin/auth?redirect_uri=${redirectUri}`;
  },

  // Mock sync data (for demo purposes)
  async syncFitbitData() {
    // In production, this would call your backend API
    // const response = await fetch('/api/integrations/fitbit/sync');
    
    // Mock data for demo
    const mockData = {
      steps: 8432,
      heartRate: { resting: 62, avg: 72 },
      sleep: { duration: 7.5, efficiency: 88 },
      weight: 68.2,
      lastSync: new Date().toISOString()
    };
    
    // Store synced data
    localStorage.setItem('fitbit_last_sync', JSON.stringify(mockData));
    
    return mockData;
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

  // Get synced data from all providers
  getAggregatedData() {
    const data = {
      steps: 0,
      heartRate: null,
      sleep: null,
      weight: null,
      sources: []
    };

    // Check Fitbit data
    const fitbitData = localStorage.getItem('fitbit_last_sync');
    if (fitbitData) {
      const parsed = JSON.parse(fitbitData);
      data.steps += parsed.steps || 0;
      data.heartRate = parsed.heartRate || data.heartRate;
      data.sleep = parsed.sleep || data.sleep;
      data.weight = parsed.weight || data.weight;
      data.sources.push('Fitbit');
    }

    return data;
  }
};

// Handle OAuth callbacks
export function handleOAuthCallback(provider, code) {
  // In production, send code to backend to exchange for tokens
  // For demo, we simulate a successful connection
  
  Integrations.saveConnection(provider, {
    accessToken: 'mock_token_' + Date.now(),
    refreshToken: 'mock_refresh_' + Date.now(),
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  });
  
  return true;
}

// Render integrations list for UI
export function renderIntegrationsList() {
  const integrations = Integrations.getAllIntegrations();
  
  return integrations.map(int => `
    <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 16px; border-left: 4px solid ${int.connected ? int.color : 'rgba(255,255,255,0.3)'};">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 2rem;">${int.icon}</div>
          <div>
            <div style="font-weight: 700; color: white; font-size: 1rem;">${int.name}</div>
            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">${int.description}</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          ${int.connected 
            ? `<span style="background: rgba(0,212,170,0.2); color: #00d4aa; padding: 4px 12px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; border: 1px solid rgba(0,212,170,0.3);">✓ Conectado</span>`
            : `<span style="background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); padding: 4px 12px; border-radius: 12px; font-size: 0.7rem;">No conectado</span>`
          }
        </div>
      </div>
      
      ${int.connected ? `
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <button onclick="sync${int.name}Data()" style="flex: 1; padding: 10px; background: ${int.color}; color: white; border: none; border-radius: 12px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">
            🔄 Sincronizar
          </button>
          <button onclick="disconnect${int.name}()" style="padding: 10px 16px; background: rgba(239,68,68,0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; font-size: 0.85rem; cursor: pointer;">
            ✕
          </button>
        </div>
        ${int.lastSync ? `<div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); margin-top: 8px;">Última sincronización: ${new Date(int.lastSync).toLocaleString('es-MX')}</div>` : ''}
      ` : `
        <button onclick="connect${int.name}()" style="width: 100%; padding: 12px; background: ${int.color}; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; margin-top: 8px; opacity: 0.9;">
          Conectar con ${int.name}
        </button>
      `}
    </div>
  `).join('');
}

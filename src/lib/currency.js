// Shared MXN currency formatter
// Usage: formatMXN(1234.5) => "MX$1,234.50"

export const formatMXN = (amount) => {
  if (isNaN(amount) || amount === null || amount === undefined) return 'MX$0.00';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(amount);
};

// Default IVA settings stored in localStorage under 'pharmacy_tax_settings'
export const DEFAULT_TAX_SETTINGS = {
  ivaEnabled: true,
  ivaRate: 16, // percent
};

export const getTaxSettings = () => {
  try {
    const stored = localStorage.getItem('pharmacy_tax_settings');
    return stored ? { ...DEFAULT_TAX_SETTINGS, ...JSON.parse(stored) } : DEFAULT_TAX_SETTINGS;
  } catch {
    return DEFAULT_TAX_SETTINGS;
  }
};

export const saveTaxSettings = (settings) => {
  localStorage.setItem('pharmacy_tax_settings', JSON.stringify(settings));
};

export const calcIVA = (subtotal, settings) => {
  if (!settings?.ivaEnabled) return 0;
  return subtotal * ((settings?.ivaRate ?? 16) / 100);
};

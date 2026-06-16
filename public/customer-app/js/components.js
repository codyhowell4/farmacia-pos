// js/components.js

// --- INLINE SVG ICONS ---
export const ICONS = {
  prescription: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/><path d="M15 5l4 4"/></svg>`,
  otc: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  vitamins: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7V9a7 7 0 0 0-14 0v6a7 7 0 0 0 7 7z"/><path d="M12 2v4"/><path d="M8 9h8"/><path d="M8 13h8"/></svg>`,
  cart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  trash: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  plus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  minus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  upload: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  pill: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 0 0-7-7l-10 10a4.95 4.95 0 0 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>`,
  dashboard: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`,
  search: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  user: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  box: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
  heart: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  activity: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  trendingUp: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  trendingDown: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  calendar: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  award: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>`,
  message: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  users: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  book: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
  calculator: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>`,
  droplet: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  shield: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  phone: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  edit: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  star: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  target: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  flame: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  alert: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  thermometer: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`,
  scale: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16l-4-8-4 8"/><path d="M4 20h16"/></svg>`,
  zap: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  menu: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  x: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  home: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  arrowRight: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  filter: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  download: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  eye: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  printer: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  share: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  chevronDown: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  bell: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  mapPin: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  creditCard: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  gift: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  percent: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`
};

// Helper function to format dates in Spanish
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-MX', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

// Helper function to format currency in MXN
function formatMXN(amount) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount);
}

// Helper to get vital metric display name
function getVitalDisplayName(metricType) {
  const names = {
    weight: 'Peso',
    height: 'Altura',
    blood_pressure: 'Presión Arterial',
    blood_glucose: 'Glucosa en Sangre',
    heart_rate: 'Frecuencia Cardíaca',
    temperature: 'Temperatura',
    waist_circumference: 'Circunferencia de Cintura',
    oxygen_saturation: 'Saturación de Oxígeno'
  };
  return names[metricType] || metricType;
}

// Helper to get vital metric icon
function getVitalIcon(metricType) {
  const icons = {
    weight: ICONS.scale,
    height: ICONS.activity,
    blood_pressure: ICONS.heart,
    blood_glucose: ICONS.droplet,
    heart_rate: ICONS.activity,
    temperature: ICONS.thermometer,
    waist_circumference: ICONS.user,
    oxygen_saturation: ICONS.activity
  };
  return icons[metricType] || ICONS.activity;
}

// Helper to get vital metric unit
function getVitalUnit(metricType) {
  const units = {
    weight: 'kg',
    height: 'cm',
    blood_pressure: 'mmHg',
    blood_glucose: 'mg/dL',
    heart_rate: 'bpm',
    temperature: '°C',
    waist_circumference: 'cm',
    oxygen_saturation: '%'
  };
  return units[metricType] || '';
}

// Renders the storefront medicine cards grid (Mobile Layout)
export function renderMedicineGrid(medicines, cart) {
  if (medicines.length === 0) {
    return `<div class="text-center w-full mt-4">
      <p style="color: var(--text-muted);">No se encontraron medicamentos con ese criterio.</p>
    </div>`;
  }

  return medicines.map(med => {
    const cartItem = cart.find(item => item.medicineId === med.id);
    const cartQty = cartItem ? cartItem.quantity : 0;
    const isOutOfStock = med.stock <= 0;
    const isMaxedOut = cartQty >= med.stock;
    const isPrescription = med.requiresPrescription;

    let catIcon = ICONS.otc;
    if (med.category === 'prescription') catIcon = ICONS.prescription;
    if (med.category === 'vitamins') catIcon = ICONS.vitamins;

    return `
      <div class="medicine-card med-${med.category}" id="card-${med.id}">
        <div class="med-icon-wrapper">
          ${catIcon}
        </div>
        <div class="med-content">
          <div class="med-brand">${med.brand}</div>
          <h3 class="med-name">${med.name}</h3>
        </div>
        
        <div class="med-meta">
          <span class="med-price">${formatMXN(med.price)}</span>
          ${isOutOfStock ? `
            <span class="out-of-stock-text">Sin stock</span>
          ` : `
            <button 
              class="add-to-cart-btn" 
              onclick="window.dispatchAddToCart('${med.id}')"
              ${isMaxedOut ? 'disabled' : ''}
              title="${isMaxedOut ? 'Límite de stock' : 'Agregar'}"
            >
              ${ICONS.plus}
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Renders the medicine info details modal body
export function renderMedicineDetailsModal(med) {
  let catIcon = ICONS.otc;
  if (med.category === 'prescription') catIcon = ICONS.prescription;
  if (med.category === 'vitamins') catIcon = ICONS.vitamins;

  const categoryLabel = {
    'prescription': 'Con Prescripción',
    'otc': 'Sin Prescripción',
    'vitamins': 'Vitaminas'
  }[med.category] || med.category;

  return `
    <div class="flex items-center gap-4 mb-4">
      <div class="med-icon-wrapper med-${med.category}" style="margin-bottom: 0; background: var(--primary-light); color: var(--primary); padding: 1rem; border-radius: var(--border-radius-md)">
        ${catIcon}
      </div>
      <div>
        <h3 style="font-size: 1.3rem; font-weight: 800;">${med.name}</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; font-weight: 700; text-transform: uppercase;">${med.brand} • ${categoryLabel}</p>
      </div>
    </div>
    <div class="flex flex-col gap-4">
      <div>
        <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--text-secondary); margin-bottom: 0.25rem;">Descripción</h4>
        <p style="font-size: 0.9rem; line-height: 1.5; color: var(--text-secondary);">${med.description}</p>
      </div>
      <div class="flex justify-between" style="border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); padding: 0.75rem 0;">
        <div>
          <h4 style="font-size: 0.8rem; font-weight: 800; color: var(--text-secondary);">Dosis Sugerida</h4>
          <p style="font-size: 0.9rem; font-weight: 600; color: var(--primary);">${med.dosage}</p>
        </div>
        <div style="text-align: right;">
          <h4 style="font-size: 0.8rem; font-weight: 800; color: var(--text-secondary);">Tamaño del paquete</h4>
          <p style="font-size: 0.9rem; font-weight: 600;">${med.unit}</p>
        </div>
      </div>
      <div>
        <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--text-secondary); margin-bottom: 0.25rem;">Efectos Secundarios Conocidos</h4>
        <p style="font-size: 0.85rem; color: var(--danger); font-weight: 600;">${med.sideEffects || 'Ninguno reportado'}</p>
      </div>
      <div class="flex justify-between items-center mt-4">
        <div>
          <span style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">${formatMXN(med.price)}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Stock disponible: ${med.stock} unidades</span>
        </div>
        <button 
          class="submit-btn" 
          onclick="window.dispatchAddToCart('${med.id}'); document.getElementById('details-modal').classList.remove('open'); document.getElementById('modal-overlay').classList.remove('open');"
          ${med.stock <= 0 ? 'disabled' : ''}
          style="width: auto; padding: 0.75rem 1.5rem;"
        >
          Agregar al Carrito
        </button>
      </div>
    </div>
  `;
}

// Renders the cart drawer list of items
export function renderCartItems(cartItems) {
  if (cartItems.length === 0) {
    return `
      <div class="text-center mt-4 flex flex-col items-center gap-4" style="padding: 3rem 1rem;">
        <span style="font-size: 3rem; color: var(--text-muted);">${ICONS.cart}</span>
        <p style="color: var(--text-muted); font-weight: 600;">Tu carrito está vacío.</p>
        <p style="font-size: 0.8rem; color: var(--text-muted);">Agrega medicamentos con o sin prescripción del catálogo.</p>
      </div>
    `;
  }

  return cartItems.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <h4 class="cart-item-name">${item.name}</h4>
        <span class="cart-item-brand">${item.brand}</span>
        <div class="cart-item-price">${formatMXN(item.price * item.quantity)}</div>
        ${item.requiresPrescription ? `
          <div style="font-size: 0.7rem; color: var(--accent); font-weight: 700; margin-top: 0.25rem; display: flex; align-items: center; gap: 0.15rem;">
            ${ICONS.prescription} Requiere Prescripción Aprobada
          </div>
        ` : ''}
      </div>
      <div class="cart-item-actions">
        <div class="qty-selector">
          <button class="qty-btn" onclick="window.dispatchCartQty('${item.medicineId}', ${item.quantity - 1})">${ICONS.minus}</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="qty-btn" onclick="window.dispatchCartQty('${item.medicineId}', ${item.quantity + 1})">${ICONS.plus}</button>
        </div>
        <button class="remove-item-btn" onclick="window.dispatchRemoveFromCart('${item.medicineId}')">
          ${ICONS.trash} Quitar
        </button>
      </div>
    </div>
  `).join('');
}

// Renders list of uploaded prescriptions
export function renderPrescriptionQueue(prescriptions, isAdmin = false) {
  if (prescriptions.length === 0) {
    return `<p style="color: var(--text-muted);" class="text-center mt-4">No hay prescripciones enviadas aún.</p>`;
  }

  const statusLabels = {
    'pendiente': 'Pendiente',
    'aprobada': 'Aprobada',
    'rechazada': 'Rechazada'
  };

  return prescriptions.map(rx => `
    <div class="rx-item">
      <div class="rx-details">
        <div class="rx-avatar">
          ${ICONS.prescription}
        </div>
        <div class="rx-info">
          <h4>${rx.medicineName}</h4>
          <p><strong>Paciente:</strong> ${rx.patientName} | <strong>Doctor:</strong> ${rx.doctorName}</p>
          <p><strong>Archivo:</strong> ${rx.fileName} | ${formatDate(rx.uploadDate)}</p>
        </div>
      </div>
      <div class="flex flex-col items-end gap-2">
        <span class="rx-status rx-status-${rx.status}">${statusLabels[rx.status] || rx.status}</span>
        ${(isAdmin && rx.status === 'pendiente') ? `
          <div class="actions-cell">
            <button class="table-btn table-btn-primary" onclick="window.dispatchApproveRx('${rx.id}')">Aprobar</button>
            <button class="table-btn table-btn-danger" onclick="window.dispatchRejectRx('${rx.id}')">Rechazar</button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// Renders the orders history list
export function renderOrdersHistory(orders, isAdmin = false) {
  if (orders.length === 0) {
    return `<p style="color: var(--text-muted);" class="text-center mt-4">No hay pedidos realizados aún.</p>`;
  }

  const statusLabels = {
    'preparando': 'Preparando',
    'listo': 'Listo para Recoger/Enviar',
    'entregado': 'Entregado',
    'cancelado': 'Cancelado'
  };

  return orders.map(order => `
    <div class="order-card">
      <div class="order-header-info">
        <div>
          <span class="order-id">${order.id}</span>
          <span class="order-date">${formatDate(order.date)}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="status-badge status-${order.status}">${statusLabels[order.status] || order.status}</span>
          ${isAdmin ? `
            <select 
              onchange="window.dispatchUpdateOrderStatus('${order.id}', this.value)" 
              style="padding: 0.25rem 0.5rem; border-radius: var(--border-radius-sm); border: 1px solid var(--border-color); font-size: 0.75rem; font-weight: 700; background: var(--bg-app); color: var(--text-primary);"
            >
              <option value="preparando" ${order.status === 'preparando' ? 'selected' : ''}>Preparando</option>
              <option value="listo" ${order.status === 'listo' ? 'selected' : ''}>Listo</option>
              <option value="entregado" ${order.status === 'entregado' ? 'selected' : ''}>Entregado</option>
              <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
          ` : ''}
        </div>
      </div>
      
      <div class="order-details-grid">
        <div>
          <h5 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.5rem;">Artículos</h5>
          <ul class="order-items-list">
            ${order.items.map(item => `
              <li class="order-item-detail">
                <span>${item.name} (x${item.quantity})</span>
                <span>${formatMXN(item.price * item.quantity)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        <div class="order-meta-info" style="border-left: 1px solid var(--border-color); padding-left: 1rem;">
          <p><strong>Cliente:</strong> ${order.patientName}</p>
          <p><strong>Método de Entrega:</strong> ${order.deliveryType === 'delivery' ? 'Entrega a Domicilio' : 'Recoger en Tienda'}</p>
          ${order.address ? `<p><strong>Dirección:</strong> ${order.address}</p>` : ''}
          ${order.prescriptionId ? `<p style="color: var(--accent); font-weight: 700;"><strong>Prescripción:</strong> Aprobada (${order.prescriptionId})</p>` : ''}
          <div style="font-size: 1.1rem; font-weight: 800; color: var(--primary); margin-top: 0.5rem; display: flex; justify-content: space-between;">
            <span>Total:</span>
            <span>${formatMXN(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// Renders the pill reminders panel
export function renderReminders(reminders) {
  if (reminders.length === 0) {
    return `<div class="text-center w-full mt-4" style="padding: 2rem;">
      <p style="color: var(--text-muted);">No hay recordatorios de medicamentos configurados. ¡Crea uno para seguir tus dosis diarias!</p>
    </div>`;
  }

  return reminders.map(rem => `
    <div class="reminder-card ${rem.takenToday ? 'taken' : ''}">
      <div class="reminder-left">
        <div 
          class="reminder-checkbox ${rem.takenToday ? 'checked' : ''}" 
          onclick="window.dispatchToggleReminder('${rem.id}')"
        >
          ${ICONS.check}
        </div>
        <div class="reminder-info">
          <h4>${rem.medicineName}</h4>
          <p>${ICONS.clock} ${rem.time} • ${rem.days.join(', ')}</p>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        ${rem.takenToday ? `
          <span style="font-size: 0.7rem; color: var(--success); font-weight: 800; text-transform: uppercase;">Tomado</span>
        ` : `
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Pendiente</span>
        `}
        <button class="reminder-delete-btn" onclick="window.dispatchDeleteReminder('${rem.id}')" title="Eliminar Recordatorio">
          ${ICONS.trash}
        </button>
      </div>
    </div>
  `).join('');
}

// Renders the pharmacist admin dashboard inventory table
export function renderInventoryTable(medicines) {
  return `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Medicamento</th>
            <th>Marca</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${medicines.map(med => {
            const categoryLabel = {
              'prescription': 'Con Prescripción',
              'otc': 'Sin Prescripción',
              'vitamins': 'Vitaminas'
            }[med.category] || med.category;
            
            return `
            <tr>
              <td>
                <div class="flex items-center gap-2">
                  <span style="color: var(--primary);">${ICONS.pill}</span>
                  <div>
                    <strong>${med.name}</strong>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${med.unit}</div>
                  </div>
                </div>
              </td>
              <td>${med.brand}</td>
              <td><span class="badge badge-${med.category}">${categoryLabel}</span></td>
              <td><strong>${formatMXN(med.price)}</strong></td>
              <td>
                <span style="font-weight: 700; color: ${med.stock <= 5 ? 'var(--danger)' : 'inherit'}">
                  ${med.stock} ${med.stock <= 5 ? '(Bajo)' : ''}
                </span>
              </td>
              <td>
                <div class="actions-cell">
                  <button class="table-btn table-btn-primary" onclick="window.dispatchEditMedicine('${med.id}')">Editar</button>
                  <button class="table-btn table-btn-danger" onclick="window.dispatchDeleteMedicine('${med.id}')">Eliminar</button>
                </div>
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Renders vitals summary cards
export function renderVitalsSummary(vitals, userProfile) {
  const latestWeight = vitals.find(v => v.metricType === 'weight');
  const latestBP = vitals.find(v => v.metricType === 'blood_pressure');
  const latestGlucose = vitals.find(v => v.metricType === 'blood_glucose');
  const latestHR = vitals.find(v => v.metricType === 'heart_rate');

  const cards = [];
  
  if (latestWeight) {
    cards.push({
      icon: ICONS.scale,
      label: 'Peso',
      value: `${latestWeight.value1} ${latestWeight.unit}`,
      date: formatDate(latestWeight.loggedAt),
      color: 'var(--primary)'
    });
  }
  
  if (latestBP) {
    cards.push({
      icon: ICONS.heart,
      label: 'Presión Arterial',
      value: `${latestBP.value1}/${latestBP.value2} ${latestBP.unit}`,
      date: formatDate(latestBP.loggedAt),
      color: 'var(--danger)'
    });
  }
  
  if (latestGlucose) {
    cards.push({
      icon: ICONS.droplet,
      label: 'Glucosa',
      value: `${latestGlucose.value1} ${latestGlucose.unit}`,
      date: formatDate(latestGlucose.loggedAt),
      context: latestGlucose.context,
      color: 'var(--warning)'
    });
  }
  
  if (latestHR) {
    cards.push({
      icon: ICONS.activity,
      label: 'Frec. Cardíaca',
      value: `${latestHR.value1} ${latestHR.unit}`,
      date: formatDate(latestHR.loggedAt),
      color: 'var(--accent)'
    });
  }

  if (cards.length === 0) {
    return `<p style="color: var(--text-muted); text-align: center;">No hay signos vitales registrados. ¡Comienza a registrar tu salud hoy!</p>`;
  }

  return `
    <div class="vitals-grid">
      ${cards.map(card => `
        <div class="vital-card" style="border-left-color: ${card.color}">
          <div class="vital-icon" style="color: ${card.color}">${card.icon}</div>
          <div class="vital-content">
            <span class="vital-label">${card.label}</span>
            <span class="vital-value">${card.value}</span>
            ${card.context ? `<span class="vital-context">${card.context}</span>` : ''}
            <span class="vital-date">${card.date}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Renders vitals history table
export function renderVitalsHistory(vitals) {
  if (vitals.length === 0) {
    return `<p class="text-center" style="color: var(--text-muted); padding: 2rem;">No hay registros de signos vitales.</p>`;
  }

  return `
    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Métrica</th>
            <th>Valor</th>
            <th>Contexto</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${vitals.slice(0, 50).map(vital => {
            let valueDisplay = `${vital.value1}`;
            if (vital.value2) valueDisplay += ` / ${vital.value2}`;
            valueDisplay += ` ${vital.unit}`;
            
            return `
            <tr>
              <td>${formatDate(vital.loggedAt)}</td>
              <td>
                <div class="flex items-center gap-2">
                  <span style="color: var(--primary);">${getVitalIcon(vital.metricType)}</span>
                  ${getVitalDisplayName(vital.metricType)}
                </div>
              </td>
              <td><strong>${valueDisplay}</strong></td>
              <td>${vital.context || '-'}</td>
              <td>
                <button class="table-btn table-btn-danger" onclick="window.dispatchDeleteVital('${vital.id}')">
                  ${ICONS.trash}
                </button>
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Renders adherence dashboard
export function renderAdherenceDashboard(stats) {
  const getColor = (pct) => {
    if (pct >= 90) return 'var(--success)';
    if (pct >= 70) return 'var(--warning)';
    return 'var(--danger)';
  };

  const periods = [
    { label: '7 Días', value: stats.sevenDays },
    { label: '30 Días', value: stats.thirtyDays },
    { label: '90 Días', value: stats.ninetyDays }
  ];

  return `
    <div class="adherence-dashboard">
      <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 1rem;">Adherencia Medicamentosa</h3>
      <div class="adherence-cards">
        ${periods.map(period => `
          <div class="adherence-card">
            <div class="adherence-ring" style="--percentage: ${period.value}; --color: ${getColor(period.value)}">
              <span class="adherence-value">${period.value}%</span>
            </div>
            <span class="adherence-label">${period.label}</span>
          </div>
        `).join('')}
      </div>
      ${stats.sevenDays >= 95 ? `
        <div class="streak-banner">
          ${ICONS.flame} ¡Racha de adherencia perfecta!
        </div>
      ` : ''}
    </div>
  `;
}

// Renders health goals
export function renderHealthGoals(goals) {
  if (goals.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${ICONS.target}</div>
        <h4>No tienes metas activas</h4>
        <p>Establece metas de salud para mantenerte motivado y ganar puntos</p>
      </div>
    `;
  }

  return `
    <div class="goals-grid">
      ${goals.map(goal => {
        const progress = goal.baselineValue !== goal.targetValue
          ? Math.min(100, Math.max(0, 
              goal.goalType === 'weight_loss'
                ? ((goal.baselineValue - goal.currentValue) / (goal.baselineValue - goal.targetValue)) * 100
                : ((goal.currentValue - goal.baselineValue) / (goal.targetValue - goal.baselineValue)) * 100
            ))
          : 0;
        
        const statusLabels = {
          'active': 'En Progreso',
          'completed': 'Completada',
          'expired': 'Expirada'
        };
        
        return `
        <div class="goal-card ${goal.status}">
          <div class="goal-header">
            <h4>${goal.title}</h4>
            <span class="goal-status-badge status-${goal.status}">${statusLabels[goal.status]}</span>
          </div>
          <div class="goal-progress-container">
            <div class="goal-progress-bar">
              <div class="goal-progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="goal-progress-stats">
              <span>Inicio: ${goal.baselineValue} ${goal.unit}</span>
              <span>Actual: ${goal.currentValue} ${goal.unit}</span>
              <span>Meta: ${goal.targetValue} ${goal.unit}</span>
            </div>
          </div>
          <div class="goal-footer">
            <span>Fecha límite: ${formatDate(goal.targetDate)}</span>
            ${goal.status === 'active' ? `
              <button class="table-btn table-btn-primary" onclick="window.dispatchUpdateGoalProgress('${goal.id}')">
                Actualizar
              </button>
            ` : ''}
          </div>
        </div>
      `}).join('')}
    </div>
  `;
}

// Renders reward points and tier
export function renderRewardsSummary(rewards) {
  const tierLabels = {
    'bronze': { name: 'Bronce', color: '#cd7f32', next: 500 },
    'silver': { name: 'Plata', color: '#c0c0c0', next: 1000 },
    'gold': { name: 'Oro', color: '#ffd700', next: 2000 },
    'platinum': { name: 'Platino', color: '#e5e4e2', next: null }
  };

  const currentTier = tierLabels[rewards.tier];
  const progressToNext = currentTier.next 
    ? Math.min(100, (rewards.lifetimePoints / currentTier.next) * 100)
    : 100;

  return `
    <div class="rewards-summary">
      <div class="tier-card" style="border-color: ${currentTier.color}">
        <div class="tier-icon" style="background: ${currentTier.color}20; color: ${currentTier.color}">
          ${ICONS.award}
        </div>
        <div class="tier-info">
          <span class="tier-name" style="color: ${currentTier.color}">Nivel ${currentTier.name}</span>
          <span class="tier-points">${rewards.totalPoints} puntos disponibles</span>
        </div>
      </div>
      
      ${currentTier.next ? `
        <div class="tier-progress">
          <div class="tier-progress-bar">
            <div class="tier-progress-fill" style="width: ${progressToNext}%; background: ${currentTier.color}"></div>
          </div>
          <span class="tier-progress-text">${rewards.lifetimePoints} / ${currentTier.next} puntos para ${tierLabels[rewards.tier === 'bronze' ? 'silver' : rewards.tier === 'silver' ? 'gold' : 'platinum'].name}</span>
        </div>
      ` : '<div class="tier-max">¡Nivel máximo alcanzado!</div>'}
      
      <div class="points-actions">
        <button class="table-btn table-btn-primary" onclick="window.dispatchShowPointsHistory()">
          ${ICONS.clock} Historial
        </button>
        <button class="table-btn table-btn-primary" onclick="window.dispatchRedeemPoints()">
          ${ICONS.gift} Canjear
        </button>
      </div>
    </div>
  `;
}

// Renders achievements
export function renderAchievements(userAchievements, allAchievements) {
  const unlockedKeys = userAchievements.map(a => a.badgeKey);
  
  return `
    <div class="achievements-grid">
      ${allAchievements.map(achievement => {
        const isUnlocked = unlockedKeys.includes(achievement.key);
        const unlockDate = isUnlocked 
          ? userAchievements.find(a => a.badgeKey === achievement.key)?.unlockedAt 
          : null;
        
        return `
        <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <div class="achievement-icon">${achievement.icon}</div>
          <div class="achievement-info">
            <h4>${achievement.name}</h4>
            <p>${achievement.description}</p>
            <span class="achievement-points">+${achievement.points} pts</span>
          </div>
          ${isUnlocked ? `
            <div class="achievement-unlocked">
              ${ICONS.check} Desbloqueado ${unlockDate ? formatDate(unlockDate) : ''}
            </div>
          ` : `
            <div class="achievement-locked">
              ${ICONS.shield} Bloqueado
            </div>
          `}
        </div>
      `}).join('')}
    </div>
  `;
}

// Renders dependent profiles
export function renderDependentProfiles(profiles) {
  if (profiles.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${ICONS.users}</div>
        <h4>No hay familiares registrados</h4>
        <p>Agrega perfiles para familiares dependientes (hijos, padres) para gestionar su salud</p>
      </div>
    `;
  }

  const relationshipLabels = {
    'hijo': 'Hijo/a',
    'hija': 'Hijo/a',
    'padre': 'Padre',
    'madre': 'Madre',
    'esposo': 'Esposo/a',
    'esposa': 'Esposo/a',
    'hermano': 'Hermano/a',
    'abuelo': 'Abuelo/a',
    'otro': 'Otro'
  };

  return `
    <div class="dependents-grid">
      ${profiles.map(profile => {
        const age = Math.floor((new Date() - new Date(profile.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000));
        const vaccineCount = profile.vaccineRecords?.length || 0;
        
        return `
        <div class="dependent-card">
          <div class="dependent-header">
            <div class="dependent-avatar">
              ${profile.fullName.charAt(0).toUpperCase()}
            </div>
            <div class="dependent-info">
              <h4>${profile.fullName}</h4>
              <span>${relationshipLabels[profile.relationship] || profile.relationship} • ${age} años</span>
            </div>
          </div>
          <div class="dependent-details">
            ${profile.bloodType ? `<span><strong>Tipo Sangre:</strong> ${profile.bloodType}</span>` : ''}
            ${profile.allergies?.length ? `<span><strong>Alergias:</strong> ${profile.allergies.join(', ')}</span>` : ''}
            ${profile.conditions?.length ? `<span><strong>Condiciones:</strong> ${profile.conditions.join(', ')}</span>` : ''}
          </div>
          <div class="dependent-vaccines">
            <span>${ICONS.shield} ${vaccineCount} vacunas registradas</span>
          </div>
          <div class="dependent-actions">
            <button class="table-btn table-btn-primary" onclick="window.dispatchViewDependent('${profile.id}')">
              ${ICONS.eye} Ver
            </button>
            <button class="table-btn table-btn-primary" onclick="window.dispatchAddVaccine('${profile.id}')">
              ${ICONS.plus} Vacuna
            </button>
            <button class="table-btn table-btn-danger" onclick="window.dispatchDeleteDependent('${profile.id}')">
              ${ICONS.trash}
            </button>
          </div>
        </div>
      `}).join('')}
    </div>
  `;
}

// Renders vaccine schedule
export function renderVaccineSchedule(schedule, vaccineRecords = []) {
  const receivedVaccines = vaccineRecords.map(v => v.vaccineName.toLowerCase());
  
  return `
    <div class="vaccine-schedule">
      ${schedule.map(entry => {
        const allReceived = entry.vaccines.every(v => 
          receivedVaccines.some(rv => rv.includes(v.toLowerCase()))
        );
        
        return `
        <div class="vaccine-schedule-item ${allReceived ? 'completed' : ''}">
          <div class="vaccine-age">${entry.age}</div>
          <div class="vaccine-list">
            ${entry.vaccines.map(vaccine => {
              const isReceived = receivedVaccines.some(rv => rv.includes(vaccine.toLowerCase()));
              return `
              <div class="vaccine-item ${isReceived ? 'received' : 'pending'}">
                ${isReceived ? ICONS.check : ICONS.shield} ${vaccine}
              </div>
            `}).join('')}
          </div>
        </div>
      `}).join('')}
    </div>
  `;
}

// Renders health guides
export function renderHealthGuides(guides) {
  if (guides.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">${ICONS.book}</div>
        <h4>No se encontraron guías</h4>
      </div>
    `;
  }

  const categoryLabels = {
    'nutrition': 'Nutrición',
    'exercise': 'Ejercicio',
    'chronic': 'Enfermedades Crónicas',
    'medication': 'Medicamentos',
    'mental': 'Salud Mental',
    'prevention': 'Prevención'
  };

  return `
    <div class="guides-grid">
      ${guides.map(guide => `
        <div class="guide-card" onclick="window.dispatchOpenGuide('${guide.id}')">
          <div class="guide-category">${categoryLabels[guide.category] || guide.category}</div>
          <h4>${guide.title}</h4>
          <p>${guide.content.substring(0, 120)}...</p>
          <div class="guide-footer">
            <span>${ICONS.clock} ${guide.readTime} de lectura</span>
            <span class="guide-tags">${guide.tags.slice(0, 2).join(', ')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Renders chat messages
export function renderChatMessages(messages) {
  if (messages.length === 0) {
    return `<div class="chat-empty">${ICONS.message} No hay mensajes aún. ¡Inicia la conversación!</div>`;
  }

  return `
    <div class="chat-messages">
      ${messages.map(msg => `
        <div class="chat-message ${msg.senderRole}">
          <div class="chat-bubble">
            <p>${msg.messageText}</p>
            <span class="chat-time">${new Date(msg.sentAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Renders emergency contacts
export function renderEmergencyContacts(contacts) {
  if (contacts.length === 0) {
    return `<p style="color: var(--text-muted);">No hay contactos de emergencia registrados.</p>`;
  }

  return `
    <div class="emergency-contacts">
      ${contacts.map(contact => `
        <div class="emergency-contact-card">
          <div class="emergency-contact-info">
            <strong>${contact.name}</strong>
            <span>${contact.relationship}</span>
            <a href="tel:${contact.phone}" class="emergency-phone">${ICONS.phone} ${contact.phone}</a>
          </div>
          <button class="table-btn table-btn-danger" onclick="window.dispatchDeleteEmergencyContact('${contact.id}')">
            ${ICONS.trash}
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

// Renders wellness reminders
export function renderWellnessReminders(reminders) {
  if (reminders.length === 0) {
    return `<p style="color: var(--text-muted);">No hay recordatorios de bienestar configurados.</p>`;
  }

  const typeLabels = {
    'annual_checkup': 'Chequeo Anual',
    'dental': 'Revisión Dental',
    'vision': 'Revisión de la Vista',
    'screening': 'Estudio de Detección',
    'custom': 'Personalizado'
  };

  return `
    <div class="wellness-reminders">
      ${reminders.map(reminder => {
        const daysUntil = Math.ceil((new Date(reminder.nextDueDate) - new Date()) / (1000 * 60 * 60 * 24));
        const isOverdue = daysUntil < 0;
        
        return `
        <div class="wellness-reminder-card ${isOverdue ? 'overdue' : ''} ${!reminder.isActive ? 'inactive' : ''}">
          <div class="wellness-reminder-info">
            <h4>${typeLabels[reminder.type] || reminder.title}</h4>
            <span>Próximo: ${formatDate(reminder.nextDueDate)}</span>
            ${isOverdue ? `<span class="overdue-badge">${ICONS.alert} Vencido (${Math.abs(daysUntil)} días)</span>` : 
              daysUntil <= 7 ? `<span class="soon-badge">${ICONS.clock} En ${daysUntil} días</span>` : ''}
          </div>
          <div class="wellness-reminder-actions">
            <button class="table-btn table-btn-primary" onclick="window.dispatchCompleteWellness('${reminder.id}')">
              ${ICONS.check} Completado
            </button>
            <button class="table-btn table-btn-danger" onclick="window.dispatchDeleteWellnessReminder('${reminder.id}')">
              ${ICONS.trash}
            </button>
          </div>
        </div>
      `}).join('')}
    </div>
  `;
}

// Renders BMI calculator result
export function renderBMICard(bmiData, height, weight) {
  const categoryColors = {
    'Bajo peso': '#3b82f6',
    'Normal': '#10b981',
    'Sobrepeso': '#f59e0b',
    'Obesidad': '#ef4444'
  };

  return `
    <div class="calculator-result-card">
      <div class="bmi-display">
        <div class="bmi-value" style="color: ${categoryColors[bmiData.category]}">${bmiData.bmi}</div>
        <div class="bmi-category" style="color: ${categoryColors[bmiData.category]}">${bmiData.category}</div>
      </div>
      <div class="bmi-details">
        <p><strong>Peso:</strong> ${weight} kg</p>
        <p><strong>Altura:</strong> ${height} cm</p>
        <p><strong>Rango saludable:</strong> ${bmiData.healthyWeightRange}</p>
      </div>
      <div class="bmi-scale">
        <div class="bmi-scale-bar">
          <div class="bmi-scale-marker" style="left: ${Math.min(100, Math.max(0, (bmiData.bmi - 15) / 20 * 100))}%"></div>
        </div>
        <div class="bmi-scale-labels">
          <span>15</span>
          <span>18.5</span>
          <span>25</span>
          <span>30</span>
          <span>35</span>
        </div>
      </div>
    </div>
  `;
}

// Renders TDEE calculator result
export function renderTDEECard(tdee, weight, height, age, gender, activityLevel) {
  const activityLabels = {
    'sedentary': 'Sedentario',
    'light': 'Ligero',
    'moderate': 'Moderado',
    'active': 'Activo',
    'very_active': 'Muy Activo'
  };

  return `
    <div class="calculator-result-card">
      <h4>Gasto Energético Total Diario (TDEE)</h4>
      <div class="tdee-value">${tdee} <span>calorías/día</span></div>
      <div class="tdee-details">
        <p>Para mantener tu peso actual de <strong>${weight} kg</strong></p>
        <p>Nivel de actividad: <strong>${activityLabels[activityLevel]}</strong></p>
      </div>
      <div class="tdee-goals">
        <div class="tdee-goal">
          <span>Pérdida de peso</span>
          <strong>${tdee - 500} cal</strong>
        </div>
        <div class="tdee-goal">
          <span>Mantenimiento</span>
          <strong>${tdee} cal</strong>
        </div>
        <div class="tdee-goal">
          <span>Ganancia muscular</span>
          <strong>${tdee + 300} cal</strong>
        </div>
      </div>
    </div>
  `;
}

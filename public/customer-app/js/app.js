// Simple Farmacia App
import { Store } from './store.js?v=8';
import { getGuideCategories, getGuideArticles, getArticle, searchGuides } from './data.js?v=8';
import { 
  calculateBMR, 
  calculateTDEE, 
  calculateBodyFatFromBMI,
  calculateLeanMass,
  getBodyFatCategory,
  calculateIdealWeightRange,
  calculateMacros,
  calculateWaterIntake,
  calculateHeartRateZones,
  calculateProteinGoal,
  calculateWeightGoalPlan,
  calculateRecommendedExercise,
  searchFoods,
  COMMON_FOODS
} from './calculations.js';
import { Integrations, renderIntegrationsList } from './integrations.js';
import { VoiceAI, HealthFAQ } from './voiceAI.js';
import { FastingTracker, SleepTracker, CheckInSystem } from './tracking.js';
import { NotificationManager } from './notifications.js';

// State
let currentPage = 'home';

// DOM Elements
const mainContent = document.getElementById('main-content');
const searchInput = document.getElementById('search');
const navItems = document.querySelectorAll('.nav-item');
const menuBtn = document.getElementById('menu-btn');
const closeMenuBtn = document.getElementById('close-menu-btn');
const menuOverlay = document.getElementById('menu-overlay');
const menuPanel = document.getElementById('menu-panel');
const menuItems = document.querySelectorAll('.menu-item');
const notifBtn = document.getElementById('notif-btn');
const notifBadge = document.getElementById('notif-badge');

// Initialize
// Auth state
let currentAuthUser = null;
let currentCustomerProfile = null;

document.addEventListener('DOMContentLoaded', () => {
  // Check if onboarding is needed
  if (!Store.isOnboardingComplete()) {
    showOnboardingModal();
  }
  
  renderHome(); // Start with Today page
  setupNavigation();
  setupMenuNavigation();
  setupSearch();
  
  // Set home nav as active by default
  navItems.forEach(nav => nav.classList.remove('active'));
  document.querySelector('[data-page="home"]')?.classList.add('active');
  
  // Initial cart badge update
  updateCartBadge();
  
  // Initialize auth (check for existing session)
  initAuth();
  
  // Request notification permission (after short delay so UI loads first)
  setTimeout(() => {
    requestNotificationPermission();
  }, 2000);
  
  // Initialize notification center
  initNotificationCenter();
  
  // Listen for dose taken/skipped events from service worker
  window.addEventListener('doseTaken', (e) => {
    Store.markDoseTaken(e.detail.scheduleId, e.detail.doseId);
    renderSalud();
  });
  
  window.addEventListener('doseSkipped', (e) => {
    Store.markDoseSkipped(e.detail.scheduleId, e.detail.doseId);
    renderSalud();
  });
});

// ============================================================
// AUTHENTICATION
// ============================================================

async function initAuth() {
  if (!FarmaciaAPI.isSupabaseAvailable()) {
    console.log('[Auth] Supabase not available, staying in guest mode');
    updateMenuUserInfo();
    return;
  }
  
  try {
    const user = await FarmaciaAPI.getCurrentUser();
    if (user) {
      currentAuthUser = user;
      console.log('[Auth] Session restored for:', user.email);
      
      // Try to load customer profile
      currentCustomerProfile = await FarmaciaAPI.getCustomerProfile();
      
      // Ensure customer record exists
      await FarmaciaAPI.ensureCustomerProfile(currentCustomerProfile?.name);
      
      updateMenuUserInfo();
    } else {
      console.log('[Auth] No active session');
      updateMenuUserInfo();
    }
  } catch (e) {
    console.warn('[Auth] Session check failed:', e);
    updateMenuUserInfo();
  }
}

function updateMenuUserInfo() {
  const nameEl = document.getElementById('menu-user-name');
  const statusEl = document.getElementById('menu-user-status');
  const avatarEl = document.getElementById('menu-user-avatar');
  const loginBtn = document.getElementById('menu-btn-login');
  const signupBtn = document.getElementById('menu-btn-signup');
  const logoutBtn = document.getElementById('menu-btn-logout');
  const loginItem = document.getElementById('menu-item-login');
  const signupItem = document.getElementById('menu-item-signup');
  
  if (!nameEl) return;
  
  if (currentAuthUser) {
    const displayName = currentCustomerProfile?.name || currentAuthUser.user_metadata?.full_name || currentAuthUser.email;
    nameEl.textContent = displayName;
    statusEl.textContent = currentAuthUser.email || 'Conectado';
    avatarEl.textContent = '👤';
    
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (loginItem) loginItem.style.display = 'none';
    if (signupItem) signupItem.style.display = 'none';
  } else {
    const profile = Store.getProfile();
    nameEl.textContent = profile.name || 'Invitado';
    statusEl.textContent = '🏆 Nivel Plata • 350 pts';
    avatarEl.textContent = '👤';
    
    if (loginBtn) loginBtn.style.display = 'block';
    if (signupBtn) signupBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (loginItem) loginItem.style.display = 'flex';
    if (signupItem) signupItem.style.display = 'flex';
  }
}

function renderLogin() {
  closeMenu();
  mainContent.innerHTML = `
    <div style="padding: 1.5rem 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
      <h1 style="margin: 0; font-size: 1.4rem; font-weight: 700;">🔑 Iniciar Sesión</h1>
      <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Accede a tu cuenta de Farmacia Apollo</p>
    </div>
    
    <div style="padding: 1.5rem 1rem;">
      <div class="glass-card" style="padding: 1.5rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: white;">Correo electrónico</label>
          <input type="email" id="login-email" placeholder="tu@email.com" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; font-size: 1rem; color: white; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: white;">Contraseña</label>
          <input type="password" id="login-password" placeholder="••••••••" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; font-size: 1rem; color: white; box-sizing: border-box;">
        </div>
        
        <button onclick="handleLogin()" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer; margin-bottom: 1rem;">Iniciar sesión</button>
        
        <div style="text-align: center; color: rgba(255,255,255,0.6); font-size: 0.85rem;">
          ¿No tienes cuenta? <button onclick="renderSignup()" style="background: none; border: none; color: #f59e0b; font-weight: 600; cursor: pointer;">Regístrate</button>
        </div>
        
        <div id="login-error" style="display: none; margin-top: 1rem; padding: 0.75rem; background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.3); border-radius: 10px; color: #ff6b6b; font-size: 0.85rem; text-align: center;"></div>
      </div>
      
      <div style="text-align: center; margin-top: 1.5rem; color: rgba(255,255,255,0.5); font-size: 0.8rem;">
        O continúa como <button onclick="renderHome()" style="background: none; border: none; color: #00d4aa; cursor: pointer;">invitado</button>
      </div>
    </div>
  `;
}

async function handleLogin() {
  const email = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  const errorEl = document.getElementById('login-error');
  
  if (!email || !password) {
    errorEl.textContent = 'Por favor ingresa tu correo y contraseña';
    errorEl.style.display = 'block';
    return;
  }
  
  errorEl.style.display = 'none';
  
  const { data, error } = await FarmaciaAPI.signIn(email, password);
  
  if (error) {
    errorEl.textContent = 'Correo o contraseña incorrectos';
    errorEl.style.display = 'block';
    return;
  }
  
  currentAuthUser = data.user;
  currentCustomerProfile = await FarmaciaAPI.getCustomerProfile();
  await FarmaciaAPI.ensureCustomerProfile(currentCustomerProfile?.name);
  
  updateMenuUserInfo();
  renderHome();
  showToast('Bienvenido de vuelta, ' + (currentCustomerProfile?.name || currentAuthUser.email), 'success');
}

function renderSignup() {
  closeMenu();
  mainContent.innerHTML = `
    <div style="padding: 1.5rem 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
      <h1 style="margin: 0; font-size: 1.4rem; font-weight: 700;">✨ Crear Cuenta</h1>
      <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Únete a Farmacia Apollo</p>
    </div>
    
    <div style="padding: 1.5rem 1rem;">
      <div class="glass-card" style="padding: 1.5rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: white;">Nombre completo</label>
          <input type="text" id="signup-name" placeholder="María García" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; font-size: 1rem; color: white; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: white;">Correo electrónico</label>
          <input type="email" id="signup-email" placeholder="tu@email.com" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; font-size: 1rem; color: white; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: white;">Contraseña</label>
          <input type="password" id="signup-password" placeholder="Mínimo 6 caracteres" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; font-size: 1rem; color: white; box-sizing: border-box;">
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: white;">Confirmar contraseña</label>
          <input type="password" id="signup-confirm" placeholder="Repite tu contraseña" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; font-size: 1rem; color: white; box-sizing: border-box;">
        </div>
        
        <button onclick="handleSignup()" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer; margin-bottom: 1rem;">Crear cuenta</button>
        
        <div style="text-align: center; color: rgba(255,255,255,0.6); font-size: 0.85rem;">
          ¿Ya tienes cuenta? <button onclick="renderLogin()" style="background: none; border: none; color: #f59e0b; font-weight: 600; cursor: pointer;">Inicia sesión</button>
        </div>
        
        <div id="signup-error" style="display: none; margin-top: 1rem; padding: 0.75rem; background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.3); border-radius: 10px; color: #ff6b6b; font-size: 0.85rem; text-align: center;"></div>
        
        <div id="signup-success" style="display: none; margin-top: 1rem; padding: 0.75rem; background: rgba(0,212,170,0.2); border: 1px solid rgba(0,212,170,0.3); border-radius: 10px; color: #00d4aa; font-size: 0.85rem; text-align: center;"></div>
      </div>
      
      <div style="text-align: center; margin-top: 1.5rem; color: rgba(255,255,255,0.5); font-size: 0.8rem;">
        O continúa como <button onclick="renderHome()" style="background: none; border: none; color: #00d4aa; cursor: pointer;">invitado</button>
      </div>
    </div>
  `;
}

async function handleSignup() {
  const name = document.getElementById('signup-name')?.value.trim();
  const email = document.getElementById('signup-email')?.value.trim();
  const password = document.getElementById('signup-password')?.value;
  const confirm = document.getElementById('signup-confirm')?.value;
  const errorEl = document.getElementById('signup-error');
  const successEl = document.getElementById('signup-success');
  
  if (!name || !email || !password) {
    errorEl.textContent = 'Por favor completa todos los campos';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }
  
  if (password.length < 6) {
    errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }
  
  if (password !== confirm) {
    errorEl.textContent = 'Las contraseñas no coinciden';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }
  
  errorEl.style.display = 'none';
  
  const { data, error } = await FarmaciaAPI.signUp(email, password, name);
  
  if (error) {
    errorEl.textContent = error.message || 'Error al crear la cuenta. Intenta de nuevo.';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }
  
  currentAuthUser = data.user;
  
  // Try to create customer profile
  const customerId = await FarmaciaAPI.ensureCustomerProfile(name);
  if (customerId) {
    successEl.textContent = '✅ Cuenta creada. Verifica tu correo electrónico para activar tu cuenta.';
  } else {
    successEl.textContent = '✅ Cuenta creada. Tu perfil de cliente se vinculará al iniciar sesión.';
  }
  successEl.style.display = 'block';
  
  updateMenuUserInfo();
  
  // If email confirmation is not required, auto-login feel
  if (data.session) {
    currentCustomerProfile = await FarmaciaAPI.getCustomerProfile();
    setTimeout(() => renderHome(), 1500);
  }
}

async function handleLogout() {
  if (!confirm('¿Cerrar sesión?')) return;
  
  await FarmaciaAPI.signOut();
  currentAuthUser = null;
  currentCustomerProfile = null;
  
  updateMenuUserInfo();
  closeMenu();
  renderHome();
  showToast('Sesión cerrada', 'info');
}

window.handleLogout = handleLogout;

// Request notification permission
async function requestNotificationPermission() {
  const status = NotificationManager.getStatus();
  
  if (!status.supported) {
    console.log('Notifications not supported in this browser');
    return;
  }
  
  if (status.permission === 'default') {
    const granted = await NotificationManager.requestPermission();
    if (granted) {
      // Schedule notifications for existing schedules
      const schedules = Store.getMedicineSchedules();
      for (const schedule of schedules) {
        if (schedule.active) {
          await NotificationManager.scheduleAllDoses(schedule);
        }
      }
      showToast('Notificaciones activadas. Recibirás alertas cuando sea hora de tus medicamentos.', 'success');
    }
  } else if (status.permission === 'granted') {
    // Already granted, schedule notifications for existing schedules
    const schedules = Store.getMedicineSchedules();
    for (const schedule of schedules) {
      if (schedule.active) {
        await NotificationManager.scheduleAllDoses(schedule);
      }
    }
  }
}

// ============================================
// NOTIFICATION CENTER
// ============================================

let notifPollInterval = null;
let __notificationsCache = [];

function initNotificationCenter() {
  if (notifBtn) {
    notifBtn.addEventListener('click', showNotificationModal);
  }
  // Initial poll
  pollNotificationCount();
  // Poll every 30 seconds
  notifPollInterval = setInterval(pollNotificationCount, 30000);
}

async function pollNotificationCount() {
  try {
    const count = await FarmaciaAPI.getUnreadNotificationCount();
    updateNotificationBadge(count);
  } catch (err) {
    console.log('[Notifications] Poll failed:', err.message);
  }
}

function updateNotificationBadge(count) {
  if (!notifBadge) return;
  if (count > 0) {
    notifBadge.textContent = count > 99 ? '99+' : count;
    notifBadge.style.display = 'block';
  } else {
    notifBadge.style.display = 'none';
  }
}

async function showNotificationModal() {
  // Fetch notifications
  let notifications = [];
  try {
    notifications = await FarmaciaAPI.getNotifications();
    __notificationsCache = notifications;
  } catch (err) {
    console.error('[Notifications] Failed to load:', err);
    showToast('No se pudieron cargar las notificaciones', 'error');
    return;
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const typeIcons = {
    prescription: '📄',
    refill: '💊',
    appointment: '📅',
    order: '📦',
    default: '🔔'
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays < 7) return `Hace ${diffDays} d`;
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  };

  const itemsHtml = notifications.length > 0
    ? notifications.map(n => `
      <div class="notification-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}" onclick="markCustomerNotificationRead('${n.id}')">
        <div class="notification-icon ${n.type || 'default'}">${typeIcons[n.type] || typeIcons.default}</div>
        <div class="notification-content">
          <div class="notification-title">${escapeHtml(n.title)}</div>
          <div class="notification-message">${escapeHtml(n.message)}</div>
          <div class="notification-time">${formatTime(n.createdAt)}</div>
        </div>
        ${n.isRead ? '' : '<div class="notification-dot"></div>'}
      </div>
    `).join('')
    : `<div class="notification-empty">
        <div class="icon">🔔</div>
        <div>No tienes notificaciones</div>
      </div>`;

  const modal = document.createElement('div');
  modal.className = 'notification-modal';
  modal.id = 'notification-modal-overlay';
  modal.innerHTML = `
    <div class="notification-panel">
      <div class="notification-header">
        <h3>🔔 Notificaciones ${unreadCount > 0 ? `<span style="font-size:0.85rem;opacity:0.8;">(${unreadCount} sin leer)</span>` : ''}</h3>
        <div style="display: flex; gap: 0.5rem;">
          ${unreadCount > 0 ? `<button onclick="markAllCustomerNotificationsRead()">Marcar todas</button>` : ''}
          <button onclick="closeNotificationModal()">Cerrar</button>
        </div>
      </div>
      <div class="notification-list">
        ${itemsHtml}
      </div>
    </div>
  `;

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeNotificationModal();
  });

  document.body.appendChild(modal);
}

function closeNotificationModal() {
  document.getElementById('notification-modal-overlay')?.remove();
}

async function markCustomerNotificationRead(id) {
  try {
    await FarmaciaAPI.markNotificationRead(id);
    // Update local cache
    const n = __notificationsCache.find(x => x.id === id);
    if (n) n.isRead = true;
    // Refresh badge
    const unreadCount = __notificationsCache.filter(x => !x.isRead).length;
    updateNotificationBadge(unreadCount);
    // Re-render modal
    closeNotificationModal();
    showNotificationModal();
  } catch (err) {
    console.error('[Notifications] Failed to mark read:', err);
  }
}

async function markAllCustomerNotificationsRead() {
  try {
    await FarmaciaAPI.markAllNotificationsRead();
    // Update local cache
    __notificationsCache.forEach(n => n.isRead = true);
    updateNotificationBadge(0);
    closeNotificationModal();
    showNotificationModal();
  } catch (err) {
    console.error('[Notifications] Failed to mark all read:', err);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Navigation
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      currentPage = page;
      
      // Update active nav
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update menu active state too
      updateMenuActiveState(page);
      
      // Render page
      renderPage(page);
    });
  });
}

// Hamburger Menu Navigation
function setupMenuNavigation() {
  // Open menu
  menuBtn?.addEventListener('click', openMenu);
  
  // Close menu
  closeMenuBtn?.addEventListener('click', closeMenu);
  menuOverlay?.addEventListener('click', closeMenu);
  
  // Menu item clicks
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      currentPage = page;
      
      // Update active states
      updateMenuActiveState(page);
      navItems.forEach(nav => nav.classList.remove('active'));
      const matchingNav = document.querySelector(`.bottom-nav .nav-item[data-page="${page}"]`);
      if (matchingNav) matchingNav.classList.add('active');
      
      // Close menu and render
      closeMenu();
      renderPage(page);
    });
  });
}

function openMenu() {
  menuOverlay?.classList.add('active');
  menuPanel?.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeMenu() {
  menuOverlay?.classList.remove('active');
  menuPanel?.classList.remove('active');
  document.body.style.overflow = '';
}

function updateMenuActiveState(page) {
  menuItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.page === page) {
      item.classList.add('active');
    }
  });
}

function renderPage(page) {
  // Clear any running intervals
  if (window.fastTimerInterval) clearInterval(window.fastTimerInterval);
  
  // Scroll to top
  window.scrollTo(0, 0);
  
  switch(page) {
    case 'home': renderHome(); break;
    case 'body': renderBody(); break;
    case 'health': renderSalud(); break;
    case 'consulta': renderConsulta(); break;
    case 'appointments': renderAppointments(); break;
    case 'recetas': renderRecetas(); break;
    case 'caregiver': renderCaregiver(); break;
    case 'store': renderStore(); break;
    case 'shop': renderShop(); break;
    case 'orders': renderOrders(); break;
    case 'settings': renderSettings(); break;
    case 'emergency-id': renderEmergencyID(); break;
    case 'fasting': renderFasting(); break;
    case 'sleep': renderSleep(); break;
    case 'checkin': renderCheckIn(); break;
    case 'integrations': renderIntegrations(); break;
    case 'guides': renderHealthGuides(); break;
    case 'login': renderLogin(); break;
    case 'signup': renderSignup(); break;
    default: renderHome();
  }
}

// Update cart badge on navigation
function updateCartBadge() {
  const badge = document.getElementById('nav-cart-badge');
  if (!badge) return;
  
  const count = Store.getCartCount();
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

// Search - simplified
function setupSearch() {
  // Search is now only for store/catalog
  searchInput?.addEventListener('input', (e) => {
    if (currentPage === 'store' && e.target.value) {
      // Simple filter implementation
      const term = e.target.value.toLowerCase();
      const cards = document.querySelectorAll('.medicine-card');
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(term) ? 'flex' : 'none';
      });
    }
  });
}

// Format MXN
function formatPrice(price) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(price);
}

// Render Home - Glassmorphism Daily Dashboard
function renderHome() {
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const steps = Store.getDailySteps() || 8432;
  const stepsGoal = Store.getStepsGoal() || 10000;
  const waterIntake = Store.getWaterIntake() || 6;
  const waterGoal = 8;
  const caloriesBurned = Store.getDailyCalories() || 1250;
  const caloriesConsumed = Store.getCaloriesConsumed() || 0;
  const proteinConsumed = Store.getProteinConsumed() || 0;
  const proteinGoal = Store.getProteinGoal() || 120;
  const foodLog = Store.getFoodLog() || [];
  const activeMinutes = Store.getActiveMinutes() || 45;
  
  // Get streak (would come from Store in real implementation)
  const streakDays = 12;
  
  // Calculate display values
  const exerciseGoal = 60;
  const calorieGoal = Store.getCalorieGoal() || 1825;
  const exerciseMins = activeMinutes;
  const stepsFormatted = steps >= 1000 ? (steps / 1000).toFixed(1) + 'k' : steps;
  const overallProgress = Math.min(100, Math.round((steps / stepsGoal) * 100));
  
  // Calculate filled segments for water tracker (14 segments total)
  const filledSegments = Math.min(14, Math.floor((waterIntake / waterGoal) * 14));
  const isHalfFilled = (waterIntake / waterGoal) * 14 % 1 >= 0.5;
  
  // SVG gradient definition
  const svgGradient = `
    <svg width="0" height="0" style="position:absolute;">
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#1e3a8a"/>
          <stop offset="50%" style="stop-color:#0d9488"/>
          <stop offset="100%" style="stop-color:#e2e8f0"/>
        </linearGradient>
      </defs>
    </svg>
  `;
  
  // Generate water segments
  let waterSegmentsHTML = '';
  for (let i = 0; i < 14; i++) {
    let segmentClass = 'segment';
    let style = '';
    if (i === 0) style = 'border-radius: 20px 0 0 20px; width: 16px;';
    if (i === 13) style = 'border-radius: 0 20px 20px 0; width: 16px;';
    
    if (i < filledSegments) {
      segmentClass += ' filled';
    } else if (i === filledSegments && isHalfFilled) {
      segmentClass += ' half-filled';
    }
    
    waterSegmentsHTML += `<div class="${segmentClass}" style="${style}"></div>`;
  }
  
  mainContent.innerHTML = `
    ${svgGradient}
    
    <!-- Date Header -->
    <div class="date-header">
      <div class="day">${today}</div>
      <div class="title">Farmacia Apollo</div>
      <div class="subtitle">Cuidamos de ti, cuidamos tu salud</div>
    </div>

    <!-- Daily Progress Ring Card (Silver Ring) -->
    <div style="margin: 0 16px 20px; padding: 24px; display: flex; justify-content: center;">
      <div style="position: relative; width: 180px; height: 180px;">
        <svg viewBox="0 0 100 100" style="transform: rotate(-90deg); width: 100%; height: 100%;">
          <!-- Background silver ring (dimmed) -->
          <circle cx="50" cy="50" r="42" fill="none" stroke="#64748b" stroke-width="10" opacity="0.25"/>
          <!-- Progress silver ring (bright metallic) -->
          <circle cx="50" cy="50" r="42" fill="none" stroke="#c0c0c0" stroke-width="10" 
            stroke-linecap="round"
            stroke-dasharray="264"
            stroke-dashoffset="${264 - (overallProgress / 100) * 264}"
            style="filter: drop-shadow(0 0 4px rgba(192, 192, 192, 0.6)); transition: stroke-dashoffset 0.8s ease;"
          />
        </svg>
        <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
          <div style="font-size: 2.5rem; font-weight: 800; color: white; line-height: 1; text-shadow: 0 2px 8px rgba(0,0,0,0.3);">${overallProgress}%</div>
          <div style="font-size: 0.8rem; color: rgba(255,255,255,0.85); margin-top: 4px; line-height: 1.3;">de tu meta<br>diaria</div>
        </div>
      </div>
    </div>

    <!-- Streak Card -->
    <div class="streak-card">
      <div class="flame">🔥</div>
      <div class="content">
        <div class="days">${streakDays} días</div>
        <div class="message">¡Sigue con tu racha!</div>
      </div>
    </div>

    <!-- Quick Action Buttons -->
    <div class="quick-action-grid" style="margin-bottom: 16px;">
      <button class="quick-action-btn glass-card" onclick="showFoodLogModal()" style="padding: 16px 8px;">
        <span class="icon">🍽️</span>
        <span class="label">Comida</span>
        <span class="value" style="color: rgba(255,255,255,0.9); font-weight: 500; font-size: 0.75rem;">${caloriesConsumed}/${calorieGoal} kcal</span>
        <span class="value" style="color: #00d4aa; font-weight: 600; font-size: 0.7rem;">${proteinConsumed}/${proteinGoal}g prot</span>
      </button>
      <button class="quick-action-btn glass-card" onclick="showQuickExerciseLog()" style="padding: 16px 12px;">
        <span class="icon">🏃</span>
        <span class="label">Ejercicio</span>
        <span class="value" style="color: rgba(255,255,255,0.9); font-weight: 500;">${exerciseMins}/${exerciseGoal}</span>
      </button>
      <button class="quick-action-btn glass-card" onclick="showLogModal('steps')" style="padding: 16px 12px;">
        <span class="icon">👣</span>
        <span class="label">Pasos</span>
        <span class="value" style="color: rgba(255,255,255,0.9); font-weight: 500;">${steps}/${stepsGoal}</span>
      </button>
    </div>

    <!-- Water Tracker -->
    <div style="margin: 0 16px 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 0 4px;">
        <span style="color: white; font-size: 0.9rem; font-weight: 600;">💧 Hidratación</span>
        <span style="color: rgba(255,255,255,0.8); font-size: 0.85rem;">${waterIntake}/${waterGoal} vasos</span>
      </div>
      <div class="segmented-progress" style="margin-bottom: 12px;">
        ${waterSegmentsHTML}
      </div>
      <button onclick="addWaterFromTracker()" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
        <span>💧</span> Agregar vaso de agua
      </button>
    </div>

    <!-- Food Log Card -->
    <div class="glass-card" style="margin: 16px; padding: 20px; position: relative; overflow: visible;">
      <div class="header" style="justify-content: center; color: white; font-size: 1.1rem; margin-bottom: 16px;">
        <span>🍽️</span>
        <span style="font-weight: 700;">Registro de Comidas</span>
        <span style="font-weight: 400; font-size: 0.9rem; opacity: 0.8; margin-left: 4px;">${foodLog.length || 1} items</span>
      </div>
      
      ${foodLog.length > 0 ? foodLog.slice(0, 2).map((item, idx) => `
        <div class="food-item" style="background: white; color: #333; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-radius: 12px; margin-bottom: 12px;">
          <div class="icon" style="background: #f1f5f9; border-radius: 8px; font-size: 1.5rem;">${item.emoji || '🍽️'}</div>
          <div class="info">
            <div class="name" style="color: #1e293b; font-size: 1rem; font-weight: 600;">${item.name}</div>
            <div class="details" style="color: #64748b; font-size: 0.85rem;">${item.calories} kcal • ${item.protein || 0}g proteína</div>
          </div>
          <button onclick="deleteFoodItem(${item.id || idx})" style="background: none; border: none; color: #ef4444; font-size: 1.2rem; cursor: pointer; padding: 8px;">×</button>
        </div>
      `).join('') : `
        <div class="food-item" style="background: white; color: #333; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-radius: 12px; margin-bottom: 12px;">
          <div class="icon" style="background: #f1f5f9; border-radius: 8px;">🥚</div>
          <div class="info">
            <div class="name" style="color: #1e293b; font-size: 1rem; font-weight: 600;">Huevo</div>
            <div class="details" style="color: #64748b; font-size: 0.85rem;">70 kcal • 6g proteína</div>
          </div>
        </div>
      `}
      
      <!-- Calorie & Protein Progress -->
      <div style="text-align: center; margin-top: 20px;">
        <div style="display: flex; justify-content: space-around; margin-bottom: 16px;">
          <div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-bottom: 4px;">Calorías</div>
            <div style="font-size: 1.1rem; color: white; font-weight: 700;">${caloriesConsumed} / ${calorieGoal}</div>
          </div>
          <div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-bottom: 4px;">Proteína</div>
            <div style="font-size: 1.1rem; color: #00d4aa; font-weight: 700;">${proteinConsumed} / ${proteinGoal}g</div>
          </div>
        </div>
        <div class="progress-bar" style="height: 6px; background: rgba(255,255,255,0.2); width: 80%; margin: 0 auto 8px;">
          <div class="fill" style="width: ${Math.min(100, (caloriesConsumed / calorieGoal) * 100)}%; background: #1e3a8a; border-radius: 4px;"></div>
        </div>
        <div class="progress-bar" style="height: 4px; background: rgba(255,255,255,0.2); width: 80%; margin: 0 auto;">
          <div class="fill" style="width: ${Math.min(100, (proteinConsumed / proteinGoal) * 100)}%; background: #00d4aa; border-radius: 4px;"></div>
        </div>
      </div>

      <!-- Sparkle Icon -->
      <div style="position: absolute; bottom: 20px; right: 20px; font-size: 2rem; color: white; filter: drop-shadow(0 0 10px white);">
        ✨
      </div>
    </div>
    
    <!-- Bottom spacing for nav -->
    <div style="height: 100px;"></div>
  `;
}
window.addWaterFromTracker = function() {
  Store.addWater(1);
  renderHome();
};

// Render Health - Enhanced with Edit
function renderHealth() {
  const vitals = Store.getVitalsLog() || [];
  const profile = Store.getProfile();
  const height = profile.height;
  
  // Get latest vitals and calculate trends
  const getVitalWithTrend = (type, defaultVal) => {
    const typeVitals = vitals.filter(v => v.type === type);
    const latest = typeVitals.pop()?.value || defaultVal;
    const previous = typeVitals.pop()?.value;
    let trend = null;
    if (previous && latest !== defaultVal) {
      const latestNum = parseFloat(latest);
      const prevNum = parseFloat(previous);
      if (!isNaN(latestNum) && !isNaN(prevNum)) {
        const diff = latestNum - prevNum;
        if (Math.abs(diff) < 0.01) trend = 'stable';
        else trend = diff > 0 ? 'up' : 'down';
      }
    }
    return { value: latest, trend };
  };
  
  const weightData = getVitalWithTrend('weight', 68.2);
  const bpData = getVitalWithTrend('bloodPressure', '120/80');
  const glucoseData = getVitalWithTrend('glucose', 95);
  const hrData = getVitalWithTrend('heartRate', 72);
  const tempData = getVitalWithTrend('temperature', '--');
  
  const latestWeight = weightData.value;
  const latestBP = bpData.value;
  const latestGlucose = glucoseData.value;
  const latestHR = hrData.value;
  const latestTemp = tempData.value;
  
  // Trend arrow helper
  const trendArrow = (trend) => {
    if (!trend) return '';
    const colors = { up: '#ef4444', down: '#00d4aa', stable: '#94a3b8' };
    const arrows = { up: '↑', down: '↓', stable: '→' };
    return `<span style="color: ${colors[trend]}; font-size: 0.9rem; margin-left: 4px;">${arrows[trend]}</span>`;
  };
  
  // Calculate BMI and other metrics if height is available
  let bmi = null, bmiCategory = null, bmiPosition = 0;
  let metricsHTML = '';
  
  if (height && latestWeight) {
    const heightM = height / 100;
    bmi = (latestWeight / (heightM * heightM)).toFixed(1);
    
    if (bmi < 18.5) { bmiCategory = { label: 'Bajo peso', color: '#003366' }; bmiPosition = 15; }
    else if (bmi < 25) { bmiCategory = { label: 'Normal', color: '#00A86B' }; bmiPosition = 35; }
    else if (bmi < 30) { bmiCategory = { label: 'Sobrepeso', color: '#00A86B' }; bmiPosition = 60; }
    else { bmiCategory = { label: 'Obeso', color: '#ef4444' }; bmiPosition = 85; }
    
    // Calculate all health metrics
    const age = profile.birthdate ? Math.floor((new Date() - new Date(profile.birthdate)) / (365.25 * 24 * 60 * 60 * 1000)) : 35;
    const bmr = calculateBMR(latestWeight, height, age, profile.gender || 'female');
    const activityLevel = Store.getActivityLevel();
    const tdee = calculateTDEE(bmr, activityLevel);
    const bodyFat = calculateBodyFatFromBMI(parseFloat(bmi), age, profile.gender || 'female');
    const bodyFatCat = getBodyFatCategory(bodyFat, profile.gender || 'female');
    const leanMass = calculateLeanMass(latestWeight, bodyFat);
    const idealWeight = calculateIdealWeightRange(height);
    const waterIntake = calculateWaterIntake(latestWeight);
    const macros = calculateMacros(tdee, 'maintain');
    
    metricsHTML = `
    <!-- Metabolism Card (BMR & TDEE) -->
    <div class="medicine-card" style="flex-direction: column; padding: 1rem; margin-bottom: 1rem; background: linear-gradient(135deg, #f0fdf4, #dcfce7);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600;">🔥 Metabolismo</span>
        <button onclick="showActivityModal()" style="font-size: 0.7rem; background: var(--primary); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Editar Actividad</button>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div style="text-align: center;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">BMR (Reposo)</div>
          <div style="font-size: 1.4rem; font-weight: 700; color: var(--primary);">${Math.round(bmr)}</div>
          <div style="font-size: 0.65rem; color: var(--text-muted);">kcal/día</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 0.75rem; color: var(--text-muted);">TDEE (Total)</div>
          <div style="font-size: 1.4rem; font-weight: 700; color: #00A86B;">${tdee}</div>
          <div style="font-size: 0.65rem; color: var(--text-muted);">kcal/día • ${getActivityLabel(activityLevel)}</div>
        </div>
      </div>
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #bbf7d0;">
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Distribución recomendada:</div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <span style="background: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem;">🥩 ${macros.protein}g proteína</span>
          <span style="background: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem;">🍚 ${macros.carbs}g carbohidratos</span>
          <span style="background: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem;">🥑 ${macros.fat}g grasa</span>
        </div>
      </div>
    </div>

    <!-- Body Composition Card -->
    <div class="medicine-card" style="flex-direction: column; padding: 1rem; margin-bottom: 1rem; background: linear-gradient(135deg, #eff6ff, #e8f4f8);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600;">💪 Composición Corporal</span>
        <span style="font-size: 0.75rem; background: ${bodyFatCat.color}20; color: ${bodyFatCat.color}; padding: 2px 8px; border-radius: 12px;">${bodyFatCat.label}</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
        <div style="text-align: center;">
          <div style="font-size: 0.7rem; color: var(--text-muted);">Grasa</div>
          <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">${bodyFat.toFixed(1)}%</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 0.7rem; color: var(--text-muted);">Masa Magra</div>
          <div style="font-size: 1.2rem; font-weight: 700; color: #003366;">${leanMass.toFixed(1)} kg</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 0.7rem; color: var(--text-muted);">Peso Ideal</div>
          <div style="font-size: 1.2rem; font-weight: 700; color: #00A86B;">${idealWeight.min}-${idealWeight.max}</div>
        </div>
      </div>
    </div>

    <!-- BMI Card -->
    <div class="medicine-card" style="flex-direction: column; padding: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <span style="font-weight: 600;">📏 IMC (Índice de Masa Corporal)</span>
        <span style="font-size: 0.8rem; color: ${bmiCategory.color}; font-weight: 600;">${bmiCategory.label}</span>
      </div>
      <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary); margin-bottom: 0.25rem;">${bmi}</div>
      <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.5rem;">Altura: ${height} cm • Peso: ${latestWeight} kg</div>
      <div style="width: 100%; height: 8px; background: linear-gradient(90deg, #003366 0%, #00A86B 40%, #C0C0C0 70%, #DC2626 100%); border-radius: 4px; position: relative;">
        <div style="position: absolute; left: ${bmiPosition}%; top: -4px; width: 4px; height: 16px; background: var(--text-primary); border-radius: 2px;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); margin-top: 0.25rem;">
        <span>Bajo</span><span>Normal</span><span>Sobrepeso</span><span>Obeso</span>
      </div>
    </div>

    <!-- Hydration Card -->
    <div class="medicine-card" style="flex-direction: column; padding: 1rem; margin-bottom: 1rem; background: linear-gradient(135deg, #ecfeff, #cffafe);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <span style="font-weight: 600;">💧 Hidratación Recomendada</span>
      </div>
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="font-size: 2.5rem;">💧</div>
        <div>
          <div style="font-size: 1.5rem; font-weight: 700; color: #06b6d4;">${(waterIntake / 1000).toFixed(1)} L</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${Math.round(waterIntake / 250)} vasos de 250ml</div>
        </div>
      </div>
    </div>`;
  } else {
    metricsHTML = `
    <div class="medicine-card" style="flex-direction: column; padding: 1rem; margin-bottom: 1rem; background: var(--primary-light); border: 1px dashed var(--primary); cursor: pointer;" onclick="showHeightModal(() => renderHealth())">
      <div style="text-align: center;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📏</div>
        <div style="font-weight: 600; color: var(--primary); margin-bottom: 0.25rem;">Configurar altura para calcular métricas</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">Toca aquí para agregar tu altura y ver BMR, TDEE, etc.</div>
      </div>
    </div>`;
  }
  
  mainContent.innerHTML = `
    <div class="hero" style="background: linear-gradient(135deg, #ef4444, #f97316);">
      <h1>❤️ Mi Salud</h1>
      <p>Registra y monitorea tus signos vitales</p>
      <button class="btn btn-white" onclick="showHealthModal()">+ Registrar Signo Vital</button>
    </div>

    <!-- Latest Vitals Grid -->
    <h3 class="section-title">📊 Últimos Registros</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
      <div class="medicine-card" style="flex-direction: column; align-items: center; text-align: center; padding: 1rem; cursor: pointer; position: relative;" onclick="showHealthModal('weight')">
        <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">⚖️</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary); display: flex; align-items: center;">${latestWeight}${trendArrow(weightData.trend)}</div>
        <div style="font-size: 0.7rem; color: var(--text-secondary);">Peso (kg)</div>
      </div>
      <div class="medicine-card" style="flex-direction: column; align-items: center; text-align: center; padding: 1rem; cursor: pointer; position: relative;" onclick="showHealthModal('bloodPressure')">
        <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🫀</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary);">${latestBP}</div>
        <div style="font-size: 0.7rem; color: var(--text-secondary);">Presión</div>
      </div>
      <div class="medicine-card" style="flex-direction: column; align-items: center; text-align: center; padding: 1rem; cursor: pointer; position: relative;" onclick="showHealthModal('glucose')">
        <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🩸</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary); display: flex; align-items: center;">${latestGlucose}${trendArrow(glucoseData.trend)}</div>
        <div style="font-size: 0.7rem; color: var(--text-secondary);">Glucosa</div>
      </div>
      <div class="medicine-card" style="flex-direction: column; align-items: center; text-align: center; padding: 1rem; cursor: pointer; position: relative;" onclick="showHealthModal('heartRate')">
        <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">💓</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary); display: flex; align-items: center;">${latestHR}${trendArrow(hrData.trend)}</div>
        <div style="font-size: 0.7rem; color: var(--text-secondary);">Cardíaca</div>
      </div>
      <div class="medicine-card" style="flex-direction: column; align-items: center; text-align: center; padding: 1rem; cursor: pointer; position: relative;" onclick="showHealthModal('temperature')">
        <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🌡️</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary); display: flex; align-items: center;">${latestTemp}${trendArrow(tempData.trend)}</div>
        <div style="font-size: 0.7rem; color: var(--text-secondary);">Temperatura °C</div>
      </div>
      <div class="medicine-card" style="flex-direction: column; align-items: center; text-align: center; padding: 1rem; cursor: pointer; position: relative;" onclick="showHealthModal()">
        <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">➕</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary);">Agregar</div>
        <div style="font-size: 0.7rem; color: var(--text-secondary);">Nuevo registro</div>
      </div>
    </div>

    ${metricsHTML}

    <!-- History -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <h3 class="section-title" style="margin: 0;">📋 Historial Reciente</h3>
      <button style="font-size: 0.75rem; background: transparent; border: none; color: var(--primary); cursor: pointer;" onclick="alert('Ver historial completo')">Ver todo →</button>
    </div>
    <div class="medicine-list">
      ${vitals.slice(-5).reverse().map((vital, idx) => `
        <div class="medicine-card">
          <div class="med-icon ${vital.type === 'weight' ? 'otc' : vital.type === 'bloodPressure' ? 'prescription' : 'vitamins'}">
            ${vital.type === 'weight' ? '⚖️' : vital.type === 'bloodPressure' ? '🫀' : vital.type === 'glucose' ? '🩸' : vital.type === 'heartRate' ? '💓' : vital.type === 'temperature' ? '🌡️' : '💨'}
          </div>
          <div class="med-info">
            <div class="med-brand">${formatVitalName(vital.type)}</div>
            <div class="med-name">${vital.value} ${getVitalUnit(vital.type)} • ${formatDate(vital.date)}</div>
          </div>
          <button class="icon-btn" style="width: 28px; height: 28px;" onclick="deleteVital(${vitals.length - 5 + idx})">🗑️</button>
        </div>
      `).join('') || '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No hay registros aún.<br>Toca "+ Registrar Signo Vital" para comenzar.</div>'}
    </div>

    <!-- Wellness Reminders -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin: 1.5rem 0 0.5rem;">
      <h3 class="section-title" style="margin: 0;">🩺 Recordatorios</h3>
      <button style="font-size: 0.75rem; background: transparent; border: none; color: var(--primary); cursor: pointer;" onclick="showWellnessReminders()">Gestionar →</button>
    </div>
    <div class="medicine-list" style="margin-bottom: 1rem;">
      ${(() => {
        const reminders = Store.getWellnessReminders();
        const upcoming = reminders.filter(r => r.nextDate && new Date(r.nextDate) > new Date()).slice(0, 3);
        return upcoming.length === 0 
          ? '<div style="padding: 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">Configura recordatorios para tus checkups y revisiones</div>'
          : upcoming.map(r => {
              const daysUntil = Math.ceil((new Date(r.nextDate) - new Date()) / (1000 * 60 * 60 * 24));
              return `
                <div class="medicine-card" style="cursor: pointer;" onclick="showWellnessReminders()">
                  <div class="med-icon otc" style="font-size: 1.5rem;">${r.icon}</div>
                  <div class="med-info">
                    <div class="med-brand">${r.name}</div>
                    <div class="med-name">${daysUntil <= 0 ? '¡Hoy!' : daysUntil === 1 ? 'Mañana' : `En ${daysUntil} días`}</div>
                  </div>
                  <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: ${daysUntil <= 7 ? '#fef3c7' : '#f3f4f6'}; color: ${daysUntil <= 7 ? '#92400e' : '#6b7280'};">${r.condition || 'Preventivo'}</span>
                </div>
              `;
            }).join('');
      })()}
    </div>

    <!-- Quick Add Buttons -->
    <h3 class="section-title">⚡ Registro Rápido</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
      <button class="btn btn-white" style="background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary); padding: 0.5rem; font-size: 0.85rem;" onclick="showHealthModal('weight')">⚖️ Peso</button>
      <button class="btn btn-white" style="background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary); padding: 0.5rem; font-size: 0.85rem;" onclick="showHealthModal('bloodPressure')">🫀 Presión</button>
      <button class="btn btn-white" style="background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary); padding: 0.5rem; font-size: 0.85rem;" onclick="showHealthModal('glucose')">🩸 Glucosa</button>
      <button class="btn btn-white" style="background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary); padding: 0.5rem; font-size: 0.85rem;" onclick="showHealthModal('heartRate')">💓 Cardíaca</button>
      <button class="btn btn-white" style="background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary); padding: 0.5rem; font-size: 0.85rem;" onclick="showHealthModal('temperature')">🌡️ Temp</button>
      <button class="btn btn-white" style="background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary); padding: 0.5rem; font-size: 0.85rem;" onclick="showHealthModal('oxygen')">💨 SpO2</button>
    </div>
  `;
}

function formatVitalName(type) {
  const names = {
    weight: 'Peso Corporal',
    bloodPressure: 'Presión Arterial',
    glucose: 'Glucosa en Sangre',
    heartRate: 'Frecuencia Cardíaca',
    temperature: 'Temperatura',
    oxygen: 'Oxígeno (SpO2)'
  };
  return names[type] || type;
}

function getVitalUnit(type) {
  const units = {
    weight: 'kg',
    bloodPressure: 'mmHg',
    glucose: 'mg/dL',
    heartRate: 'bpm',
    temperature: '°C',
    oxygen: '%'
  };
  return units[type] || '';
}

function formatDate(dateStr) {
  if (!dateStr) return 'Hoy';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// Render Goals - Enhanced Dashboard with Edit
function renderGoals() {
  const points = Store.getPointsBalance() || 350;
  const level = Store.getUserLevel() || { name: 'Bronce', color: '#b45309', bgColor: 'linear-gradient(135deg, #b45309, #92400e)', next: 500, benefits: ['Descuento 5%'] };
  const tierProgress = Store.getTierProgress() || { percent: 0, pointsToNext: 500 };
  const goals = Store.getHealthGoals() || [
    { id: 1, name: 'Pérdida de Peso', current: 68.2, target: 63.5, unit: 'kg', progress: 45, type: 'weight', status: 'active' },
    { id: 2, name: 'Actividad Diaria', current: 45, target: 60, unit: 'min', progress: 75, type: 'activity', status: 'active' },
    { id: 3, name: 'Hidratación', current: 6, target: 8, unit: 'vasos', progress: 75, type: 'water', status: 'active' }
  ];
  const goalHistory = Store.getGoalHistory() || [];
  const achievements = Store.getAchievements() || [];
  
  mainContent.innerHTML = `
    <div class="hero" style="background: ${level.bgColor || 'linear-gradient(135deg, #00A86B, #003366)'};">
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin-bottom: 0.5rem;">
        <div style="font-size: 2.5rem;">🏆</div>
        <div>
          <h1 style="margin: 0; font-size: 1.5rem;">Nivel ${level.name}</h1>
          <p style="margin: 0; opacity: 0.9; font-size: 0.9rem;">${points} puntos</p>
        </div>
      </div>
      ${level.next ? `
      <div style="margin: 1rem 0; max-width: 280px; margin-left: auto; margin-right: auto;">
        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-bottom: 0.25rem; color: white;">
          <span>${level.name}</span>
          <span>${tierProgress.pointsToNext} pts para ${level.next >= 3000 ? 'Platino' : level.next >= 1500 ? 'Oro' : 'Plata'}</span>
        </div>
        <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.3); border-radius: 4px; overflow: hidden;">
          <div style="width: ${tierProgress.percent}%; height: 100%; background: white; border-radius: 4px; transition: width 0.5s ease;"></div>
        </div>
      </div>
      ` : '<div style="margin-top: 0.5rem; font-size: 0.8rem; opacity: 0.9;">🌟 ¡Nivel máximo alcanzado!</div>'}
      <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap; justify-content: center;">
        ${level.benefits.map(benefit => `<span style="background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.7rem;">${benefit}</span>`).join('')}
      </div>
    </div>

    <!-- Daily Progress -->
    <h3 class="section-title">📊 Progreso de Hoy</h3>
    <div class="medicine-card" style="flex-direction: column; padding: 1rem; margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
        <span>Completitud Diaria</span>
        <span style="font-weight: 600; color: #00A86B;">68%</span>
      </div>
      <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
        <div style="width: 68%; height: 100%; background: linear-gradient(90deg, #00A86B, #003366); border-radius: 4px;"></div>
      </div>
    </div>

    <!-- Active Goals with Edit -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <h3 class="section-title" style="margin: 0;">🎯 Tus Metas Activas</h3>
      <button class="btn btn-white" style="padding: 6px 12px; font-size: 0.8rem; background: var(--primary); color: white;" onclick="showGoalModal()">+ Nueva Meta</button>
    </div>
    <div class="medicine-list" style="margin-bottom: 1rem;">
      ${goals.length === 0 ? '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No tienes metas activas.<br>Toca "+ Nueva Meta" para comenzar.</div>' : goals.map((goal, index) => `
        <div class="medicine-card" style="flex-direction: column; align-items: flex-start; padding: 1rem;">
          <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 0.5rem;">
            <span style="font-weight: 600;">${goal.name}</span>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <span style="font-size: 0.8rem; color: var(--text-secondary);">${goal.current} / ${goal.target} ${goal.unit}</span>
              <button class="icon-btn" style="width: 28px; height: 28px;" onclick="showGoalModal(${index})">✏️</button>
              <button class="icon-btn" style="width: 28px; height: 28px; color: #ef4444;" onclick="deleteGoal(${index})">🗑️</button>
            </div>
          </div>
          <div style="width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
            <div style="width: ${goal.progress}%; height: 100%; background: ${goal.progress >= 100 ? '#00A86B' : '#003366'}; border-radius: 3px;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; width: 100%; margin-top: 0.5rem;">
            <span style="font-size: 0.7rem; color: ${goal.progress >= 100 ? '#00A86B' : '#003366'};">${goal.progress}% completado</span>
            <div style="display: flex; gap: 0.5rem;">
              <button style="font-size: 0.7rem; background: var(--primary-light); color: var(--primary); border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer;" onclick="updateGoalProgress(${index})">Actualizar</button>
              ${goal.progress >= 100 ? `<button style="font-size: 0.7rem; background: #dcfce7; color: #166534; border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer;" onclick="completeGoal(${index})">✓ Completar</button>` : ''}
              <button style="font-size: 0.7rem; background: #f3f4f6; color: #6b7280; border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer;" onclick="expireGoal(${index})">Archivar</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Achievements -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
      <h3 class="section-title" style="margin: 0;">🏅 Logros (${achievements.length})</h3>
      <span style="font-size: 0.75rem; color: var(--text-muted);">${achievements.length} desbloqueados</span>
    </div>
    <div class="medicine-list" style="margin-bottom: 1rem;">
      ${achievements.length === 0 ? '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No tienes logros aún.<br>¡Comienza a registrar tu actividad para desbloquearlos!</div>' : achievements.slice(0, 5).map(achievement => `
        <div class="medicine-card" style="background: linear-gradient(135deg, #fef3c7, #fde68a);">
          <div class="med-icon vitamins" style="font-size: 1.5rem; background: white;">${achievement.icon || '🏅'}</div>
          <div class="med-info">
            <div class="med-brand">${achievement.name}</div>
            <div class="med-name">${achievement.desc || 'Logro desbloqueado'}</div>
          </div>
          <span style="font-size: 0.75rem; color: #00A86B; font-weight: 600;">${new Date(achievement.date).toLocaleDateString('es-MX', {month:'short', day:'numeric'})}</span>
        </div>
      `).join('')}
    </div>

    <!-- Available Rewards -->
    <h3 class="section-title">🎁 Recompensas Disponibles</h3>
    <div class="medicine-list">
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Canjear cupón')">
        <div class="med-icon prescription">💊</div>
        <div class="med-info">
          <div class="med-brand">Descuento Medicamentos</div>
          <div class="med-name">15% off - 200 pts</div>
        </div>
        <button class="add-btn">Canjear</button>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Canjear consulta')">
        <div class="med-icon otc">👨‍⚕️</div>
        <div class="med-info">
          <div class="med-brand">Consulta Nutricionista</div>
          <div class="med-name">Gratis - 500 pts</div>
        </div>
        <button class="add-btn" style="opacity: 0.5;" disabled>Canjear</button>
      </div>
    </div>

    <!-- Goal History -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin: 1.5rem 0 0.5rem;">
      <h3 class="section-title" style="margin: 0;">📚 Historial de Metas</h3>
      <span style="font-size: 0.75rem; color: var(--text-muted);">${goalHistory.length} completadas</span>
    </div>
    <div class="medicine-list">
      ${goalHistory.length === 0 ? '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No hay metas completadas aún.<br>¡Completa tus metas activas para verlas aquí!</div>' : goalHistory.slice(0, 5).map((goal) => `
        <div class="medicine-card" style="flex-direction: column; align-items: flex-start; padding: 1rem; opacity: 0.85;">
          <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 0.5rem;">
            <span style="font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
              ${goal.status === 'completed' ? '✅' : '⏹️'} ${goal.name}
            </span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(goal.completedAt).toLocaleDateString('es-MX')}</span>
          </div>
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
            <span style="font-size: 0.8rem; color: var(--text-secondary);">
              ${goal.current} / ${goal.target} ${goal.unit}
            </span>
            <span style="font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; background: ${goal.status === 'completed' ? '#dcfce7' : '#f3f4f6'}; color: ${goal.status === 'completed' ? '#166534' : '#6b7280'};">
              ${goal.status === 'completed' ? 'Completada' : 'Expirada'}
            </span>
          </div>
          <div style="width: 100%; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; margin-top: 0.5rem;">
            <div style="width: ${goal.finalProgress}%; height: 100%; background: ${goal.status === 'completed' ? '#00A86B' : '#94a3b8'}; border-radius: 2px;"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Render Family
function renderFamily() {
  mainContent.innerHTML = `
    <h2 class="section-title">Familiares</h2>
    <div class="medicine-list">
      <div class="medicine-card">
        <div class="med-icon prescription">👶</div>
        <div class="med-info">
          <div class="med-brand">Hija</div>
          <div class="med-name">Sofía García</div>
        </div>
      </div>
      <div class="medicine-card">
        <div class="med-icon vitamins">👴</div>
        <div class="med-info">
          <div class="med-brand">Padre</div>
          <div class="med-name">Roberto García</div>
        </div>
      </div>
    </div>
  `;
}

// Global function for add to cart
window.addToCart = function(id) {
  Store.addToCart(id, 1);
  showToast('Agregado al carrito', 'success');
};

// Global functions for fitness tracking
window.showLogModal = function(type) {
  const titles = {
    exercise: '🏋️ Registrar Ejercicio',
    food: '🍎 Registrar Comida',
    water: '💧 Agregar Agua',
    steps: '👣 Actualizar Pasos',
    weight: '⚖️ Registrar Peso'
  };
  
  const content = {
    exercise: `
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Tipo de actividad</label>
        <select id="log-value" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
          <option value="caminar">🚶 Caminar</option>
          <option value="correr">🏃 Correr</option>
          <option value="ciclismo">🚴 Ciclismo</option>
          <option value="natacion">🏊 Natación</option>
          <option value="pesas">🏋️ Pesas</option>
          <option value="yoga">🧘 Yoga</option>
        </select>
      </div>
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Duración (minutos)</label>
        <input type="number" id="log-duration" placeholder="30" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
      </div>
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Calorías quemadas (opcional)</label>
        <input type="number" id="log-calories" placeholder="150" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
      </div>
    `,
    food: `
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Comida</label>
        <select id="log-meal-type" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
          <option value="desayuno">🍳 Desayuno</option>
          <option value="almuerzo">🥗 Almuerzo</option>
          <option value="cena">🍽️ Cena</option>
          <option value="snack">🍎 Snack</option>
        </select>
      </div>
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Descripción</label>
        <input type="text" id="log-food-name" placeholder="Ej: Ensalada de pollo" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
      </div>
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Calorías</label>
        <input type="number" id="log-calories" placeholder="350" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
      </div>
    `,
    water: `
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Vasos de agua (250ml c/u)</label>
        <input type="number" id="log-value" value="1" min="1" max="10" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
      </div>
    `,
    steps: `
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Pasos de hoy</label>
        <input type="number" id="log-value" placeholder="10000" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
      </div>
    `,
    weight: `
      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Peso actual (kg)</label>
        <input type="number" id="log-value" step="0.1" placeholder="68.5" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem;">
      </div>
    `
  };
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: var(--radius-lg); width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1rem; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; font-size: 1.1rem;">${titles[type]}</h3>
      </div>
      <div style="padding: 1rem;">
        ${content[type]}
      </div>
      <div class="modal-actions-sticky">
        <button onclick="this.closest('.modal-overlay').remove()" class="btn-modal-secondary">Cancelar</button>
        <button onclick="saveLog('${type}', this.closest('.modal-overlay'))" class="btn-modal-primary">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveLog = function(type, modal) {
  const value = modal.querySelector('#log-value')?.value;
  const calories = modal.querySelector('#log-calories')?.value;
  
  // Save to store
  switch(type) {
    case 'water':
      Store.addWater(parseInt(value) || 1);
      break;
    case 'steps':
      Store.setDailySteps(parseInt(value) || 0);
      break;
    case 'weight':
      Store.addVital('weight', parseFloat(value) || 0);
      break;
    case 'exercise':
      Store.addExercise({
        type: modal.querySelector('#log-value')?.value || 'caminar',
        duration: parseInt(modal.querySelector('#log-duration')?.value) || 0,
        calories: parseInt(calories) || 0
      });
      break;
    case 'food':
      Store.addMeal({
        type: modal.querySelector('#log-meal-type')?.value || 'snack',
        name: modal.querySelector('#log-food-name')?.value || '',
        calories: parseInt(calories) || 0
      });
      break;
  }
  
  modal.remove();
  renderPage(currentPage); // Refresh view
  showToast('Registro guardado', 'success');
};


// Render Store (Medicine Catalog) - Glassmorphism UI
function renderStore() {
  const medicines = Store.getMedicines() || [];
  const categories = [
    { id: 'all', name: 'Todos', icon: '📦' },
    { id: 'prescription', name: 'Con Receta', icon: '📋' },
    { id: 'otc', name: 'Sin Receta', icon: '💊' },
    { id: 'vitamins', name: 'Vitaminas', icon: '💪' }
  ];
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1.5rem 1rem; background: linear-gradient(135deg, #0f766e, #134e4a); color: white;">
      <h1 style="margin: 0; font-size: 1.4rem; font-weight: 700;">🛒 Catálogo Completo</h1>
      <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Medicamentos, suplementos y más</p>
      <button onclick="alert('Subir receta')" style="margin-top: 1rem; padding: 0.625rem 1.25rem; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem;">
        <span>📤</span> Subir Receta
      </button>
    </div>

    <!-- Categories -->
    <div style="padding: 1rem;">
      <div style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.25rem;">
        ${categories.map(cat => `
          <button onclick="filterStoreCategory('${cat.id}')" class="store-cat-btn ${cat.id === 'all' ? 'active' : ''}" data-cat="${cat.id}" style="flex-shrink: 0; padding: 0.625rem 1rem; background: ${cat.id === 'all' ? 'rgba(0,212,170,0.3)' : 'rgba(255,255,255,0.08)'}; color: white; border: 1px solid ${cat.id === 'all' ? 'rgba(0,212,170,0.5)' : 'rgba(255,255,255,0.15)'}; border-radius: 20px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 0.35rem; backdrop-filter: blur(10px);">
            <span>${cat.icon}</span>
            <span>${cat.name}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Products Grid -->
    <div style="padding: 0 1rem 2rem;">
      <div style="font-weight: 600; color: white; margin-bottom: 0.75rem; font-size: 1rem;">📋 Catálogo de Medicamentos (${medicines.length})</div>
      
      ${medicines.length === 0 ? `
        <div class="glass-card" style="text-align: center; padding: 3rem 1rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">📦</div>
          <div style="color: white; font-size: 1rem;">No hay medicamentos disponibles</div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-top: 0.5rem;">Intenta más tarde</div>
        </div>
      ` : `
        <div id="store-products-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
          ${medicines.map(med => `
            <div class="glass-card store-product" data-category="${med.category}" style="padding: 1rem; display: flex; flex-direction: column;">
              <div style="background: ${med.category === 'prescription' ? 'rgba(139,92,246,0.2)' : med.category === 'vitamins' ? 'rgba(0,212,170,0.2)' : 'rgba(255,255,255,0.08)'}; border-radius: 12px; padding: 1rem; text-align: center; margin-bottom: 0.75rem;">
                <div style="font-size: 2.5rem;">${med.category === 'prescription' ? '💊' : med.category === 'vitamins' ? '💪' : '💊'}</div>
              </div>
              <div style="flex: 1;">
                <div style="font-size: 0.65rem; color: ${med.category === 'prescription' ? '#a78bfa' : med.category === 'vitamins' ? '#00d4aa' : 'rgba(255,255,255,0.6)'}; margin-bottom: 0.25rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.03em;">${med.category === 'prescription' ? 'Con receta' : med.category === 'vitamins' ? 'Vitamina' : 'Sin receta'}</div>
                <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.25rem; line-height: 1.3; color: white;">${med.name}</div>
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); margin-bottom: 0.5rem;">${med.brand}</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: #c0c0c0;">$${med.price.toFixed(2)}</div>
              </div>
              <button onclick="addToCart('${med.id}')" style="margin-top: 0.75rem; padding: 0.625rem; background: linear-gradient(135deg, #00d4aa, #00a8e8); color: white; border: none; border-radius: 10px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">Agregar</button>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

// Filter store by category
window.filterStoreCategory = function(category) {
  // Update active button
  document.querySelectorAll('.store-cat-btn').forEach(btn => {
    const isActive = btn.dataset.cat === category;
    btn.style.background = isActive ? 'rgba(0,212,170,0.3)' : 'rgba(255,255,255,0.08)';
    btn.style.borderColor = isActive ? 'rgba(0,212,170,0.5)' : 'rgba(255,255,255,0.15)';
  });
  
  // Filter products
  const cards = document.querySelectorAll('.store-product');
  cards.forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
};

// Render Store with Search
function renderStoreSearch(query = '') {
  const medicines = Store.getMedicines();
  const filtered = query 
    ? medicines.filter(m => m.name.toLowerCase().includes(query.toLowerCase()) || 
                           m.brand.toLowerCase().includes(query.toLowerCase()))
    : medicines;
  
  // Re-render just the list if already on store page
  if (currentPage !== 'store') {
    renderStore();
    return;
  }
  
  // Update the medicine list
  const listContainer = document.querySelector('.medicine-list');
  if (listContainer) {
    listContainer.innerHTML = filtered.map(med => `
      <div class="medicine-card">
        <div class="med-icon ${med.category}">
          ${med.category === 'prescription' ? '💊' : med.category === 'vitamins' ? '🌿' : '💊'}
        </div>
        <div class="med-info">
          <div class="med-brand">${med.brand}</div>
          <div class="med-name">${med.name}</div>
        </div>
        <div class="med-price">${formatPrice(med.price)}</div>
        <button class="add-btn" onclick="addToCart('${med.id}')">+</button>
      </div>
    `).join('');
  }
}

// Render Education Module
function renderEducation() {
  mainContent.innerHTML = `
    <div class="hero" style="background: linear-gradient(135deg, #003366, #1a4d7a);">
      <h1>📚 Educación en Salud</h1>
      <p>Aprende sobre medicamentos, enfermedades y hábitos saludables.</p>
    </div>

    <div class="tabs">
      <button class="tab active">Todos</button>
      <button class="tab">Videos</button>
      <button class="tab">Artículos</button>
      <button class="tab">Infografías</button>
    </div>

    <h3 class="section-title">📖 Contenido Destacado</h3>
    <div class="medicine-list" style="margin-bottom: 1rem;">
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Abrir video')">
        <div class="med-icon vitamins">🎬</div>
        <div class="med-info">
          <div class="med-brand">Video • 5 min</div>
          <div class="med-name">Cómo tomar medicamentos correctamente</div>
        </div>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Abrir artículo')">
        <div class="med-icon otc">📄</div>
        <div class="med-info">
          <div class="med-brand">Artículo • 3 min lectura</div>
          <div class="med-name">Diabetes: Control y prevención</div>
        </div>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Abrir infografía')">
        <div class="med-icon prescription">📊</div>
        <div class="med-info">
          <div class="med-brand">Infografía</div>
          <div class="med-name">Señales de alerta: Presión alta</div>
        </div>
      </div>
    </div>

    <h3 class="section-title">💊 Guías de Medicamentos</h3>
    <div class="medicine-list">
      <div class="medicine-card">
        <div class="med-icon vitamins">💊</div>
        <div class="med-info">
          <div class="med-brand">Antibióticos</div>
          <div class="med-name">Uso responsable y resistencia</div>
        </div>
      </div>
      <div class="medicine-card">
        <div class="med-icon vitamins">💉</div>
        <div class="med-info">
          <div class="med-brand">Vacunas</div>
          <div class="med-name">Calendario de vacunación adultos</div>
        </div>
      </div>
      <div class="medicine-card">
        <div class="med-icon vitamins">🌿</div>
        <div class="med-info">
          <div class="med-brand">Suplementos</div>
          <div class="med-name">Cuándo y cómo tomarlos</div>
        </div>
      </div>
    </div>
  `;
}

// Render Preventive Care Module
function renderPreventive() {
  mainContent.innerHTML = `
    <div class="hero" style="background: linear-gradient(135deg, #003366, #00A86B);">
      <h1>🛡️ Cuidado Preventivo</h1>
      <p>Previene enfermedades con chequeos, vacunas y hábitos saludables.</p>
    </div>

    <h3 class="section-title">📅 Próximos Chequeos</h3>
    <div class="medicine-list" style="margin-bottom: 1rem;">
      <div class="medicine-card" style="border-left: 3px solid #00A86B;">
        <div class="med-icon otc">🩺</div>
        <div class="med-info">
          <div class="med-brand">Check-up Anual</div>
          <div class="med-name">15 de Julio, 2026 • Dr. López</div>
        </div>
        <span style="font-size: 0.7rem; color: #00A86B;">En 17 días</span>
      </div>
      <div class="medicine-card" style="border-left: 3px solid #ef4444;">
        <div class="med-icon prescription">🩸</div>
        <div class="med-info">
          <div class="med-brand">Examen de Glucosa</div>
          <div class="med-name">Vencido • Programar ya</div>
        </div>
        <span style="font-size: 0.7rem; color: #ef4444;">Urgente</span>
      </div>
    </div>

    <h3 class="section-title">💉 Estado de Vacunación</h3>
    <div class="medicine-list" style="margin-bottom: 1rem;">
      <div class="medicine-card">
        <div class="med-icon vitamins">✅</div>
        <div class="med-info">
          <div class="med-brand">Influenza 2025-2026</div>
          <div class="med-name">Aplicada: 15 Oct 2025</div>
        </div>
      </div>
      <div class="medicine-card">
        <div class="med-icon prescription">⏳</div>
        <div class="med-info">
          <div class="med-brand">Tetanos (Td)</div>
          <div class="med-name">Refuerzo pendiente</div>
        </div>
      </div>
      <div class="medicine-card">
        <div class="med-icon prescription">📅</div>
        <div class="med-info">
          <div class="med-brand">Neumococo</div>
          <div class="med-name">Programada: 10 Ago 2026</div>
        </div>
      </div>
    </div>

    <h3 class="section-title">🎯 Recomendaciones</h3>
    <div class="medicine-list">
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Ver detalle')">
        <div class="med-icon vitamins">🥗</div>
        <div class="med-info">
          <div class="med-brand">Nutrición</div>
          <div class="med-name">5 alimentos para tu corazón</div>
        </div>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Ver detalle')">
        <div class="med-icon vitamins">🏃</div>
        <div class="med-info">
          <div class="med-brand">Ejercicio</div>
          <div class="med-name">Rutina 15 min - Sedentarios</div>
        </div>
      </div>
    </div>
  `;
}

// Render Settings
function renderSettings() {
  const profile = Store.getProfile();
  mainContent.innerHTML = `
    <!-- Header -->
    <div class="date-header">
      <div class="day">configuración</div>
      <div class="title">⚙️ Ajustes</div>
      <div class="subtitle">Personaliza tu experiencia</div>
    </div>
    
    <!-- Profile Section -->
    <div style="padding: 0 16px 12px;">
      <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); margin-bottom: 8px; padding-left: 4px;">Perfil</div>
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; overflow: hidden;">
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1);" onclick="showProfileModal()">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #00d4aa, #00a884); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">👤</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">${profile.name || 'María García'}</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Editar información personal</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1);" onclick="showHeightModal()">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">📏</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Altura</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">${profile.height ? profile.height + ' cm' : 'No configurada - Toca para agregar'}</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="alert('Cambiar foto')">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">📷</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Foto de perfil</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Cambiar imagen</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    </div>

    <!-- Health Goals Section -->
    <div style="padding: 0 16px 12px;">
      <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); margin-bottom: 8px; padding-left: 4px;">Metas de Salud</div>
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; overflow: hidden;">
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1);" onclick="showActivityLevelModal()">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🏃</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Nivel de Actividad</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);" id="activity-level-display">${Store.getActivityLevel() === 'sedentary' ? 'Sedentario' : Store.getActivityLevel() === 'light' ? 'Ligero' : Store.getActivityLevel() === 'moderate' ? 'Moderado' : Store.getActivityLevel() === 'active' ? 'Activo' : 'Muy Activo'}</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="showHealthGoalModal()">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #ec4899, #db2777); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🎯</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Objetivo</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);" id="health-goal-display">${Store.getHealthGoal() === 'lose' ? 'Perder Peso' : Store.getHealthGoal() === 'gain' ? 'Ganar Masa' : 'Mantener Peso'}${Store.getGoalWeight() ? ` → ${Store.getGoalWeight()}kg` : ''}</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        ${Store.getGoalWeight() && Store.getGoalTimeline() ? `
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; background: rgba(0,212,170,0.1);">
          <div style="width: 40px; height: 40px; background: rgba(0,212,170,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">📊</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Plazo</div>
            <div style="font-size: 0.8rem; color: #00d4aa;">${Store.getGoalTimeline()} semanas</div>
          </div>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- Preferences Section -->
    <div style="padding: 0 16px 12px;">
      <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); margin-bottom: 8px; padding-left: 4px;">Preferencias</div>
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; overflow: hidden;">
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1);" onclick="showNotificationSettings()">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #f97316, #ea580c); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🔔</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Notificaciones</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);" id="notification-status">${NotificationManager.getStatus().permission === 'granted' ? '✅ Activadas' : NotificationManager.getStatus().permission === 'denied' ? '❌ Bloqueadas' : '⚠️ No configuradas'}</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1);" onclick="navigateTo('emergency-id')">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🆔</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #fca5a5; font-size: 0.95rem;">ID Médico de Emergencia</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Información crítica para emergencias</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1);" onclick="alert('Privacidad')">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #4f46e5); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🔒</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Privacidad y Seguridad</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Contraseña, datos biométricos</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="alert('Tema')">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #14b8a6, #0d9488); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🎨</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Apariencia</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Modo claro / oscuro</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    </div>

    <!-- Support Section -->
    <div style="padding: 0 16px 100px;">
      <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); margin-bottom: 8px; padding-left: 4px;">Soporte</div>
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; overflow: hidden;">
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.1);" onclick="alert('Acerca de')">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #64748b, #475569); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">ℹ️</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: white; font-size: 0.95rem;">Acerca de</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Versión 1.0.0</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
        <div style="padding: 14px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="alert('Cerrar sesión')">
          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🚪</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #fca5a5; font-size: 0.95rem;">Cerrar Sesión</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Salir de la cuenta</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    </div>
  `;
}

// Render Help
function renderHelp() {
  mainContent.innerHTML = `
    <h2 class="section-title">❓ Ayuda y Soporte</h2>
    
    <div class="hero" style="background: linear-gradient(135deg, #64748b, #475569); margin-bottom: 1rem;">
      <h1>¿Necesitas ayuda?</h1>
      <p>Estamos aquí para asistirte. Contáctanos por cualquier canal.</p>
      <button class="btn btn-white" onclick="alert('Iniciar chat')">
        💬 Chat en Vivo
      </button>
    </div>

    <h3 class="section-title">📞 Canales de Contacto</h3>
    <div class="medicine-list" style="margin-bottom: 1rem;">
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Llamando...')">
        <div class="med-icon otc">📞</div>
        <div class="med-info">
          <div class="med-brand">Teléfono</div>
          <div class="med-name">800-FARMACIA (24/7)</div>
        </div>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Enviando email...')">
        <div class="med-icon vitamins">✉️</div>
        <div class="med-info">
          <div class="med-brand">Email</div>
          <div class="med-name">soporte@farmacia.com</div>
        </div>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Abriendo WhatsApp...')">
        <div class="med-icon prescription">💬</div>
        <div class="med-info">
          <div class="med-brand">WhatsApp</div>
          <div class="med-name">+52 55 1234 5678</div>
        </div>
      </div>
    </div>

    <h3 class="section-title">📚 Preguntas Frecuentes</h3>
    <div class="medicine-list">
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Ver respuesta')">
        <div class="med-icon vitamins">❓</div>
        <div class="med-info">
          <div class="med-brand">¿Cómo ordeno medicamentos?</div>
          <div class="med-name">Toca para ver respuesta</div>
        </div>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Ver respuesta')">
        <div class="med-icon vitamins">❓</div>
        <div class="med-info">
          <div class="med-brand">¿Necesito receta?</div>
          <div class="med-name">Toca para ver respuesta</div>
        </div>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Ver respuesta')">
        <div class="med-icon vitamins">❓</div>
        <div class="med-info">
          <div class="med-brand">¿Cuánto tarda el envío?</div>
          <div class="med-name">Toca para ver respuesta</div>
        </div>
      </div>
      <div class="medicine-card" style="cursor: pointer;" onclick="alert('Ver respuesta')">
        <div class="med-icon vitamins">❓</div>
        <div class="med-info">
          <div class="med-brand">¿Cómo uso mis puntos?</div>
          <div class="med-name">Toca para ver respuesta</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// EMERGENCY MEDICAL ID
// ============================================

function renderEmergencyID() {
  const profile = Store.getProfile();
  const emergencyInfo = Store.getEmergencyInfo();
  const emergencyContacts = Store.getEmergencyContacts();
  
  // Get current medications from prescriptions
  const prescriptions = Store.getPrescriptions();
  const activeMedications = prescriptions.filter(p => !p.status || p.status === 'active').map(p => p.medicine).join(', ');
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #dc2626, #b91c1c); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem;">🆔 ID Médico de Emergencia</h2>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">Información crítica para emergencias</p>
        </div>
        <div style="font-size: 2rem;">🚨</div>
      </div>
    </div>
    
    <!-- Emergency Banner -->
    <div style="padding: 1rem; background: #fef2f2; border-bottom: 2px solid #fecaca;">
      <div style="display: flex; align-items: center; gap: 0.75rem; color: #991b1b;">
        <div style="font-size: 1.5rem;">⚠️</div>
        <div style="font-size: 0.9rem;">
          <strong>En caso de emergencia,</strong> muestra esta pantalla al personal médico
        </div>
      </div>
    </div>
    
    <!-- Patient Info Card -->
    <div style="padding: 1rem;">
      <div style="background: white; border-radius: 16px; padding: 1.5rem; border: 2px solid #dc2626; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1);">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
          <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #dc2626, #b91c1c); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; color: white; font-weight: 700;">
            ${profile.name ? profile.name.charAt(0).toUpperCase() : '?'}
          </div>
          <div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #1f2937;">${profile.name || 'Sin nombre'}</div>
            <div style="font-size: 0.85rem; color: #6b7280;">
              ${profile.birthdate ? calculateAge(profile.birthdate) + ' años' : ''} 
              ${profile.gender ? '• ' + (profile.gender === 'female' ? 'Femenino' : profile.gender === 'male' ? 'Masculino' : 'Otro') : ''}
            </div>
          </div>
        </div>
        
        <!-- Blood Type - Most Important -->
        <div style="background: #fef2f2; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; text-align: center;">
          <div style="font-size: 0.8rem; color: #991b1b; margin-bottom: 0.25rem;">TIPO DE SANGRE</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #dc2626;">${emergencyInfo.bloodType || 'Desconocido'}</div>
          ${emergencyInfo.organDonor ? '<div style="font-size: 0.75rem; color: #059669; margin-top: 0.25rem;">🫀 Donante de órganos</div>' : ''}
        </div>
        
        <!-- Critical Info Grid -->
        <div style="display: grid; gap: 1rem;">
          ${emergencyInfo.allergies ? `
            <div style="background: #fef3c7; border-radius: 10px; padding: 1rem; border-left: 4px solid #f59e0b;">
              <div style="font-size: 0.75rem; color: #92400e; font-weight: 600; margin-bottom: 0.25rem;">⚠️ ALERGIAS</div>
              <div style="font-size: 0.95rem; color: #78350f; font-weight: 500;">${emergencyInfo.allergies}</div>
            </div>
          ` : ''}
          
          ${emergencyInfo.conditions ? `
            <div style="background: #dbeafe; border-radius: 10px; padding: 1rem; border-left: 4px solid #3b82f6;">
              <div style="font-size: 0.75rem; color: #1e40af; font-weight: 600; margin-bottom: 0.25rem;">🩺 CONDICIONES MÉDICAS</div>
              <div style="font-size: 0.95rem; color: #1e3a8a; font-weight: 500;">${emergencyInfo.conditions}</div>
            </div>
          ` : ''}
          
          ${(emergencyInfo.medications || activeMedications) ? `
            <div style="background: #f3e8ff; border-radius: 10px; padding: 1rem; border-left: 4px solid #a855f7;">
              <div style="font-size: 0.75rem; color: #6b21a8; font-weight: 600; margin-bottom: 0.25rem;">💊 MEDICAMENTOS ACTUALES</div>
              <div style="font-size: 0.95rem; color: #581c87; font-weight: 500;">${emergencyInfo.medications || activeMedications}</div>
            </div>
          ` : ''}
          
          ${emergencyInfo.notes ? `
            <div style="background: #f3f4f6; border-radius: 10px; padding: 1rem; border-left: 4px solid #6b7280;">
              <div style="font-size: 0.75rem; color: #374151; font-weight: 600; margin-bottom: 0.25rem;">📝 NOTAS ADICIONALES</div>
              <div style="font-size: 0.95rem; color: #1f2937;">${emergencyInfo.notes}</div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
    
    <!-- Emergency Contacts -->
    <div style="padding: 0 1rem 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--text-muted);">📞 Contactos de Emergencia</div>
      
      ${emergencyContacts.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${emergencyContacts.map(contact => `
            <a href="tel:${contact.phone}" style="background: white; border-radius: 12px; padding: 1rem; border: 2px solid #dc2626; text-decoration: none; color: inherit; display: flex; align-items: center; gap: 1rem;">
              <div style="width: 48px; height: 48px; background: #fef2f2; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">📞</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: #1f2937;">${contact.name}</div>
                <div style="font-size: 0.85rem; color: #6b7280;">${contact.relation} • ${contact.phone}</div>
              </div>
              <div style="color: #dc2626; font-weight: 600;">Llamar →</div>
            </a>
          `).join('')}
        </div>
      ` : `
        <div style="background: #f3f4f6; border-radius: 12px; padding: 1.5rem; text-align: center; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📞</div>
          <div>No hay contactos de emergencia configurados</div>
        </div>
      `}
    </div>
    
    <!-- Action Buttons -->
    <div style="padding: 0 1rem 2rem;">
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <button onclick="showEditEmergencyInfoModal()" style="padding: 1rem; background: #003366; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          ✏️ Editar Información
        </button>
        
        <button onclick="printEmergencyID()" style="padding: 1rem; background: white; color: #003366; border: 2px solid #003366; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          🖨️ Imprimir / Guardar PDF
        </button>
        
        <button onclick="shareEmergencyID()" style="padding: 1rem; background: #f0fdf4; color: #15803d; border: 2px solid #15803d; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          📤 Compartir
        </button>
      </div>
    </div>
    
    <!-- Disclaimer -->
    <div style="padding: 0 1rem 2rem;">
      <div style="background: #f3f4f6; border-radius: 10px; padding: 1rem; font-size: 0.75rem; color: #6b7280; text-align: center;">
        Esta información es proporcionada por el paciente. Siempre verifique la identidad y la información médica con el paciente cuando sea posible.
      </div>
    </div>
  `;
}

function calculateAge(birthdate) {
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

window.showEditEmergencyInfoModal = function() {
  const profile = Store.getProfile();
  const emergencyInfo = Store.getEmergencyInfo();
  const contacts = Store.getEmergencyContacts();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: #1a1a2e; border-radius: 20px; width: 100%; max-width: 400px; max-height: 90vh; overflow-y: auto; color: white;">
      <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); background: linear-gradient(135deg, #dc2626, #b91c1c); color: white;">
        <h3 style="margin: 0; font-size: 1.2rem;">🆔 Editar ID Médico</h3>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.9rem;">Información para emergencias</p>
      </div>
      
      <div style="padding: 1.5rem;">
        <!-- Personal Info Section -->
        <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <div style="font-size: 0.8rem; color: #00d4aa; margin-bottom: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">👤 Información Personal</div>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">Nombre completo</label>
            <input type="text" id="emergency-name" value="${profile.name || ''}" placeholder="Tu nombre" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1rem; background: rgba(255,255,255,0.08); color: white;">
          </div>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">Fecha de nacimiento</label>
            <input type="date" id="emergency-birthdate" value="${profile.birthdate || ''}" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1rem; background: rgba(255,255,255,0.08); color: white;">
          </div>
          
          <div style="margin-bottom: 0.5rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">Género</label>
            <select id="emergency-gender" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1rem; background: rgba(255,255,255,0.08); color: white;">
              <option value="" style="background: #1a1a2e;">Seleccionar...</option>
              <option value="female" ${profile.gender === 'female' ? 'selected' : ''} style="background: #1a1a2e;">👩 Mujer</option>
              <option value="male" ${profile.gender === 'male' ? 'selected' : ''} style="background: #1a1a2e;">👨 Hombre</option>
              <option value="other" ${profile.gender === 'other' ? 'selected' : ''} style="background: #1a1a2e;">⚧ Otro</option>
            </select>
          </div>
        </div>
        
        <!-- Medical Info Section -->
        <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <div style="font-size: 0.8rem; color: #dc2626; margin-bottom: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">🏥 Información Médica</div>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">Tipo de Sangre</label>
            <select id="emergency-blood-type" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1rem; background: rgba(255,255,255,0.08); color: white;">
              <option value="" style="background: #1a1a2e;">Desconocido</option>
              <option value="A+" ${emergencyInfo.bloodType === 'A+' ? 'selected' : ''} style="background: #1a1a2e;">A+</option>
              <option value="A-" ${emergencyInfo.bloodType === 'A-' ? 'selected' : ''} style="background: #1a1a2e;">A-</option>
              <option value="B+" ${emergencyInfo.bloodType === 'B+' ? 'selected' : ''} style="background: #1a1a2e;">B+</option>
              <option value="B-" ${emergencyInfo.bloodType === 'B-' ? 'selected' : ''} style="background: #1a1a2e;">B-</option>
              <option value="AB+" ${emergencyInfo.bloodType === 'AB+' ? 'selected' : ''} style="background: #1a1a2e;">AB+</option>
              <option value="AB-" ${emergencyInfo.bloodType === 'AB-' ? 'selected' : ''} style="background: #1a1a2e;">AB-</option>
              <option value="O+" ${emergencyInfo.bloodType === 'O+' ? 'selected' : ''} style="background: #1a1a2e;">O+</option>
              <option value="O-" ${emergencyInfo.bloodType === 'O-' ? 'selected' : ''} style="background: #1a1a2e;">O-</option>
            </select>
          </div>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">Alergias</label>
            <textarea id="emergency-allergies" placeholder="Ej: Penicilina, mariscos, etc." style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 0.95rem; min-height: 60px; background: rgba(255,255,255,0.08); color: white; resize: vertical;">${emergencyInfo.allergies || ''}</textarea>
          </div>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">Condiciones Médicas</label>
            <textarea id="emergency-conditions" placeholder="Ej: Diabetes, Hipertensión, Asma, etc." style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 0.95rem; min-height: 60px; background: rgba(255,255,255,0.08); color: white; resize: vertical;">${emergencyInfo.conditions || ''}</textarea>
          </div>
          
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">Medicamentos Actuales</label>
            <textarea id="emergency-medications" placeholder="Ej: Metformina 500mg, Losartán 50mg, etc." style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 0.95rem; min-height: 60px; background: rgba(255,255,255,0.08); color: white; resize: vertical;">${emergencyInfo.medications || ''}</textarea>
          </div>
          
          <div style="margin-bottom: 0.5rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: rgba(255,255,255,0.9);">
              <input type="checkbox" id="emergency-organ-donor" ${emergencyInfo.organDonor ? 'checked' : ''} style="width: 20px; height: 20px; accent-color: #dc2626;">
              <span>Soy donante de órganos</span>
            </label>
          </div>
          
          <div style="margin-top: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: rgba(255,255,255,0.9);">Notas Adicionales</label>
            <textarea id="emergency-notes" placeholder="Información adicional importante..." style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 0.95rem; min-height: 60px; background: rgba(255,255,255,0.08); color: white; resize: vertical;">${emergencyInfo.notes || ''}</textarea>
          </div>
        </div>
        
        <!-- Emergency Contacts Section -->
        <div style="margin-bottom: 1.5rem;">
          <div style="font-size: 0.8rem; color: #f59e0b; margin-bottom: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">📞 Contactos de Emergencia</div>
          
          <div id="emergency-contacts-list" style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem;">
            ${contacts.map((contact, index) => `
              <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 1rem; position: relative;">
                <button onclick="this.closest('.emergency-contact-item').remove()" style="position: absolute; top: 8px; right: 8px; background: rgba(239,68,68,0.2); border: none; color: #fca5a5; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">✕</button>
                <input type="text" class="contact-name" value="${contact.name}" placeholder="Nombre" style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; font-size: 0.9rem; background: rgba(255,255,255,0.05); color: white;">
                <div style="display: flex; gap: 0.5rem;">
                  <input type="text" class="contact-relation" value="${contact.relation}" placeholder="Relación" style="flex: 1; padding: 0.5rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; font-size: 0.9rem; background: rgba(255,255,255,0.05); color: white;">
                  <input type="tel" class="contact-phone" value="${contact.phone}" placeholder="Teléfono" style="flex: 2; padding: 0.5rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; font-size: 0.9rem; background: rgba(255,255,255,0.05); color: white;">
                </div>
              </div>
            `).join('')}
          </div>
          
          <button onclick="addEmergencyContactField()" style="width: 100%; padding: 0.75rem; background: rgba(245,158,11,0.15); border: 1px dashed rgba(245,158,11,0.5); border-radius: 12px; color: #fbbf24; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            + Agregar Contacto
          </button>
        </div>
        
        <div style="display: flex; gap: 0.75rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
          <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.875rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; cursor: pointer; color: white; font-weight: 500;">Cancelar</button>
          <button onclick="saveEmergencyInfo()" style="flex: 1; padding: 0.875rem; background: linear-gradient(135deg, #dc2626, #b91c1c); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Guardar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveEmergencyInfo = function() {
  // Save profile info
  Store.updateProfile({
    name: document.getElementById('emergency-name').value,
    birthdate: document.getElementById('emergency-birthdate').value,
    gender: document.getElementById('emergency-gender').value
  });
  
  // Save emergency medical info
  Store.updateEmergencyInfo({
    bloodType: document.getElementById('emergency-blood-type').value,
    allergies: document.getElementById('emergency-allergies').value,
    conditions: document.getElementById('emergency-conditions').value,
    medications: document.getElementById('emergency-medications').value,
    organDonor: document.getElementById('emergency-organ-donor').checked,
    notes: document.getElementById('emergency-notes').value
  });
  
  // Save emergency contacts
  const contactItems = document.querySelectorAll('#emergency-contacts-list > div');
  const contacts = [];
  contactItems.forEach(item => {
    const name = item.querySelector('.contact-name')?.value?.trim();
    const relation = item.querySelector('.contact-relation')?.value?.trim();
    const phone = item.querySelector('.contact-phone')?.value?.trim();
    if (name && phone) {
      contacts.push({ name, relation: relation || 'Contacto', phone });
    }
  });
  Store.saveEmergencyContacts(contacts);
  
  document.querySelector('.modal-overlay').remove();
  renderEmergencyID();
  showToast('Información de emergencia actualizada', 'success');
};

window.addEmergencyContactField = function() {
  const container = document.getElementById('emergency-contacts-list');
  const div = document.createElement('div');
  div.className = 'emergency-contact-item';
  div.style.cssText = 'background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 1rem; position: relative;';
  div.innerHTML = `
    <button onclick="this.closest('.emergency-contact-item').remove()" style="position: absolute; top: 8px; right: 8px; background: rgba(239,68,68,0.2); border: none; color: #fca5a5; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 0.8rem;">✕</button>
    <input type="text" class="contact-name" placeholder="Nombre" style="width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; font-size: 0.9rem; background: rgba(255,255,255,0.05); color: white;">
    <div style="display: flex; gap: 0.5rem;">
      <input type="text" class="contact-relation" placeholder="Relación" style="flex: 1; padding: 0.5rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; font-size: 0.9rem; background: rgba(255,255,255,0.05); color: white;">
      <input type="tel" class="contact-phone" placeholder="Teléfono" style="flex: 2; padding: 0.5rem; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; font-size: 0.9rem; background: rgba(255,255,255,0.05); color: white;">
    </div>
  `;
  container.appendChild(div);
};

window.printEmergencyID = function() {
  const profile = Store.getProfile();
  const emergencyInfo = Store.getEmergencyInfo();
  const prescriptions = Store.getPrescriptions();
  const activeMedications = prescriptions.filter(p => !p.status || p.status === 'active').map(p => p.medicine).join(', ');
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
    <head>
      <title>ID Médico de Emergencia - ${profile.name || 'Paciente'}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { border: 3px solid #dc2626; padding: 20px; border-radius: 0 0 10px 10px; }
        .blood-type { font-size: 48px; font-weight: bold; color: #dc2626; text-align: center; margin: 20px 0; }
        .section { margin-bottom: 15px; padding: 10px; background: #f9fafb; border-radius: 5px; }
        .label { font-weight: bold; color: #374151; font-size: 12px; text-transform: uppercase; }
        .value { font-size: 16px; color: #1f2937; margin-top: 5px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🆔 ID MÉDICO DE EMERGENCIA</h1>
        <p>${profile.name || 'Paciente'}</p>
      </div>
      <div class="content">
        <div class="blood-type">${emergencyInfo.bloodType || 'Tipo de sangre desconocido'}</div>
        
        ${emergencyInfo.allergies ? `
          <div class="section" style="background: #fef3c7;">
            <div class="label">⚠️ ALERGIAS</div>
            <div class="value">${emergencyInfo.allergies}</div>
          </div>
        ` : ''}
        
        ${emergencyInfo.conditions ? `
          <div class="section" style="background: #dbeafe;">
            <div class="label">🩺 CONDICIONES MÉDICAS</div>
            <div class="value">${emergencyInfo.conditions}</div>
          </div>
        ` : ''}
        
        ${(emergencyInfo.medications || activeMedications) ? `
          <div class="section" style="background: #f3e8ff;">
            <div class="label">💊 MEDICAMENTOS</div>
            <div class="value">${emergencyInfo.medications || activeMedications}</div>
          </div>
        ` : ''}
        
        ${emergencyInfo.notes ? `
          <div class="section">
            <div class="label">📝 NOTAS</div>
            <div class="value">${emergencyInfo.notes}</div>
          </div>
        ` : ''}
        
        ${emergencyInfo.organDonor ? `
          <div class="section" style="background: #d1fae5;">
            <div class="label">🫀 DONANTE DE ÓRGANOS</div>
          </div>
        ` : ''}
      </div>
      <div class="footer">
        Generado por Farmacia Apollo • ${new Date().toLocaleDateString('es-MX')}
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
};

window.printAdherenceReport = function() {
  const profile = Store.getProfile();
  const schedules = Store.getMedicineSchedules();
  const now = new Date();
  
  // Calculate adherence stats
  let totalDoses = 0;
  let takenDoses = 0;
  let skippedDoses = 0;
  let streakDays = 0;
  
  schedules.forEach(schedule => {
    schedule.doses.forEach(dose => {
      if (dose.takenAt) {
        totalDoses++;
        takenDoses++;
      } else if (dose.skippedAt) {
        totalDoses++;
        skippedDoses++;
      }
    });
  });
  
  const adherenceRate = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
    <head>
      <title>Reporte de Adherencia - ${profile.name || 'Paciente'}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 30px; line-height: 1.5; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #00A86B; }
        .header h1 { color: #003366; margin: 0 0 10px; }
        .header p { color: #6b7280; margin: 0; }
        .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
        .stat-box { background: #f0fdf4; padding: 20px; border-radius: 10px; text-align: center; border: 2px solid #00A86B; }
        .stat-value { font-size: 36px; font-weight: bold; color: #00A86B; }
        .stat-label { font-size: 12px; color: #166534; text-transform: uppercase; margin-top: 5px; }
        .medications { margin-top: 30px; }
        .medications h2 { color: #003366; margin-bottom: 15px; }
        .med-item { padding: 15px; background: #f9fafb; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .med-name { font-weight: 600; color: #1f2937; }
        .med-stats { font-size: 14px; color: #6b7280; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
        .grade { font-size: 48px; font-weight: bold; text-align: center; margin: 20px 0; }
        .grade-a { color: #00A86B; }
        .grade-b { color: #3b82f6; }
        .grade-c { color: #f59e0b; }
        .grade-d { color: #ef4444; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 Reporte de Adherencia al Tratamiento</h1>
        <p>${profile.name || 'Paciente'} • Generado: ${now.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      
      <div class="grade grade-${adherenceRate >= 90 ? 'a' : adherenceRate >= 75 ? 'b' : adherenceRate >= 60 ? 'c' : 'd'}">
        ${adherenceRate}%
      </div>
      <p style="text-align: center; color: #6b7280; margin-bottom: 30px;">
        ${adherenceRate >= 90 ? '¡Excelente adherencia!' : adherenceRate >= 75 ? 'Buena adherencia' : adherenceRate >= 60 ? 'Adherencia regular' : 'Necesita mejorar'}
      </p>
      
      <div class="summary">
        <div class="stat-box">
          <div class="stat-value">${takenDoses}</div>
          <div class="stat-label">Dosis Tomadas</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${skippedDoses}</div>
          <div class="stat-label">Dosis Saltadas</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${totalDoses}</div>
          <div class="stat-label">Total Programadas</div>
        </div>
      </div>
      
      <div class="medications">
        <h2>💊 Medicamentos Activos</h2>
        ${schedules.filter(s => s.active).map(schedule => {
          const doses = schedule.doses || [];
          const taken = doses.filter(d => d.taken).length;
          const total = doses.length;
          const rate = total > 0 ? Math.round((taken / total) * 100) : 0;
          return `
            <div class="med-item">
              <div>
                <div class="med-name">${schedule.medicine}</div>
                <div class="med-stats">${schedule.dose} • ${taken}/${total} dosis tomadas</div>
              </div>
              <div style="font-weight: bold; color: ${rate >= 90 ? '#00A86B' : rate >= 75 ? '#3b82f6' : '#f59e0b'};">${rate}%</div>
            </div>
          `;
        }).join('') || '<p style="color: #6b7280;">No hay medicamentos activos registrados.</p>'}
      </div>
      
      <div class="footer">
        <p>Este reporte fue generado automáticamente por Farmacia Apollo.</p>
        <p>Consulte con su médico para interpretar estos resultados.</p>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
};

window.shareEmergencyID = async function() {
  const profile = Store.getProfile();
  const emergencyInfo = Store.getEmergencyInfo();
  
  const shareText = `🆔 ID MÉDICO - ${profile.name || 'Paciente'}

🩸 Tipo de Sangre: ${emergencyInfo.bloodType || 'Desconocido'}
${emergencyInfo.allergies ? '⚠️ Alergias: ' + emergencyInfo.allergies : ''}
${emergencyInfo.conditions ? '🩺 Condiciones: ' + emergencyInfo.conditions : ''}
${emergencyInfo.medications ? '💊 Medicamentos: ' + emergencyInfo.medications : ''}

_Enviado desde Farmacia Apollo_`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'ID Médico de Emergencia',
        text: shareText
      });
    } catch (err) {
      console.log('Share cancelled');
    }
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(shareText).then(() => {
      showToast('Información copiada al portapapeles', 'success');
    }).catch(() => {
      showToast('No se pudo copiar. Por favor copia manualmente.', 'error');
    });
  }
};

// ============================================
// GOAL MODALS - Create/Edit/Delete Goals
// ============================================

window.showGoalModal = function(goalIndex = null) {
  const goals = Store.getHealthGoals() || [];
  const goal = goalIndex !== null ? goals[goalIndex] : null;
  const isEdit = goal !== null;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: var(--radius-lg); width: 100%; max-width: 360px; overflow: hidden; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1rem; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; font-size: 1.1rem;">${isEdit ? '✏️ Editar Meta' : '🎯 Nueva Meta'}</h3>
      </div>
      <div style="padding: 1rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Nombre de la meta</label>
          <input type="text" id="goal-name" value="${goal?.name || ''}" placeholder="Ej: Perder peso, Caminar más..." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Tipo de meta</label>
          <select id="goal-type" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;" onchange="updateGoalUnit()">
            <option value="weight" ${goal?.type === 'weight' ? 'selected' : ''}>⚖️ Peso (kg)</option>
            <option value="activity" ${goal?.type === 'activity' ? 'selected' : ''}>🏃 Actividad (min)</option>
            <option value="water" ${goal?.type === 'water' ? 'selected' : ''}>💧 Agua (vasos)</option>
            <option value="steps" ${goal?.type === 'steps' ? 'selected' : ''}>👣 Pasos</option>
            <option value="sleep" ${goal?.type === 'sleep' ? 'selected' : ''}>😴 Sueño (horas)</option>
            <option value="custom" ${goal?.type === 'custom' ? 'selected' : ''}>✨ Personalizado</option>
          </select>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
          <div>
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Valor actual</label>
            <input type="number" id="goal-current" value="${goal?.current || ''}" step="0.1" placeholder="0" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Meta objetivo</label>
            <input type="number" id="goal-target" value="${goal?.target || ''}" step="0.1" placeholder="100" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
          </div>
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Unidad <span id="goal-unit-hint" style="color: var(--text-muted); font-weight: normal;">(auto)</span></label>
          <input type="text" id="goal-unit" value="${goal?.unit || 'kg'}" placeholder="kg, min, vasos..." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
        </div>
      </div>
      <div style="padding: 1rem; display: flex; gap: 0.5rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.75rem; border: 1px solid var(--border-color); background: white; border-radius: var(--radius-md); font-weight: 500; cursor: pointer;">Cancelar</button>
        <button onclick="saveGoal(${goalIndex}, this.closest('.modal-overlay'))" style="flex: 1; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: var(--radius-md); font-weight: 500; cursor: pointer;">${isEdit ? 'Guardar' : 'Crear Meta'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.updateGoalUnit = function() {
  const type = document.getElementById('goal-type')?.value;
  const unitInput = document.getElementById('goal-unit');
  const units = {
    weight: 'kg',
    activity: 'min',
    water: 'vasos',
    steps: 'pasos',
    sleep: 'horas',
    custom: ''
  };
  if (unitInput && units[type]) {
    unitInput.value = units[type];
  }
};

window.saveGoal = function(goalIndex, modal) {
  const name = modal.querySelector('#goal-name')?.value;
  const type = modal.querySelector('#goal-type')?.value;
  const current = parseFloat(modal.querySelector('#goal-current')?.value) || 0;
  const target = parseFloat(modal.querySelector('#goal-target')?.value) || 0;
  const unit = modal.querySelector('#goal-unit')?.value || 'unidades';
  
  if (!name || !target) {
    alert('Por favor completa el nombre y la meta objetivo');
    return;
  }
  
  const progress = Math.min(100, Math.round((current / target) * 100));
  
  const goal = {
    id: goalIndex !== null ? undefined : Date.now(),
    name,
    type,
    current,
    target,
    unit,
    progress
  };
  
  if (goalIndex !== null) {
    Store.updateGoal(goalIndex, goal);
  } else {
    Store.addGoal(goal);
  }
  
  modal.remove();
  renderGoals();
  showToast(goalIndex !== null ? 'Meta actualizada' : 'Meta creada', 'success');
};

window.deleteGoal = function(index) {
  if (confirm('¿Eliminar esta meta?')) {
    Store.deleteGoal(index);
    renderGoals();
    showToast('Meta eliminada', 'info');
  }
};

window.updateGoalProgress = function(index) {
  const goals = Store.getHealthGoals() || [];
  const goal = goals[index];
  if (!goal) return;
  
  const newValue = prompt(`Actualizar progreso de "${goal.name}"\n\nValor actual: ${goal.current} ${goal.unit}\nMeta: ${goal.target} ${goal.unit}\n\nNuevo valor:`, goal.current);
  
  if (newValue !== null && !isNaN(parseFloat(newValue))) {
    goal.current = parseFloat(newValue);
    goal.progress = Math.min(100, Math.round((goal.current / goal.target) * 100));
    Store.updateGoal(index, goal);
    renderGoals();
    
    if (goal.progress >= 100) {
      showToast('¡Meta alcanzada! Toca Completar para archivar', 'success');
    }
  }
};

window.completeGoal = function(index) {
  Store.completeGoal(index, 'completed');
  renderGoals();
  showToast('¡Meta completada! +100 puntos', 'success');
};

window.expireGoal = function(index) {
  Store.completeGoal(index, 'expired');
  renderGoals();
  showToast('Meta archivada', 'info');
};

// ============================================
// HEALTH MODALS - Create/Edit/Delete Vitals
// ============================================

window.showHealthModal = function(vitalType = null) {
  const types = [
    { id: 'weight', name: '⚖️ Peso Corporal', unit: 'kg', placeholder: '70.5' },
    { id: 'bloodPressure', name: '🫀 Presión Arterial', unit: 'mmHg', placeholder: '120/80' },
    { id: 'glucose', name: '🩸 Glucosa', unit: 'mg/dL', placeholder: '95' },
    { id: 'heartRate', name: '💓 Frecuencia Cardíaca', unit: 'bpm', placeholder: '72' },
    { id: 'temperature', name: '🌡️ Temperatura', unit: '°C', placeholder: '36.5' },
    { id: 'oxygen', name: '💨 Oxígeno (SpO2)', unit: '%', placeholder: '98' }
  ];
  
  const selectedType = types.find(t => t.id === vitalType) || types[0];
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: var(--radius-lg); width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1rem; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; font-size: 1.1rem;">+ Registrar Signo Vital</h3>
      </div>
      <div style="padding: 1rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Tipo de medición</label>
          <select id="vital-type" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;" onchange="updateVitalPlaceholder()">
            ${types.map(t => `<option value="${t.id}" ${t.id === selectedType.id ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">
            Valor <span id="vital-unit" style="color: var(--text-muted); font-weight: normal;">(${selectedType.unit})</span>
          </label>
          <input type="text" id="vital-value" placeholder="${selectedType.placeholder}" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Fecha y hora</label>
          <input type="datetime-local" id="vital-date" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
        </div>
        
        <div style="margin-bottom: 0.5rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Notas (opcional)</label>
          <textarea id="vital-notes" placeholder="Ej: Antes de desayunar, después de ejercicio..." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem; min-height: 80px; resize: vertical;"></textarea>
        </div>
      </div>
      <div class="modal-actions-sticky">
        <button onclick="this.closest('.modal-overlay').remove()" class="btn-modal-secondary">Cancelar</button>
        <button onclick="saveVital(this.closest('.modal-overlay'))" class="btn-modal-primary">Guardar</button>
      </div>
    </div>
  `;
  
  // Set default date to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  modal.querySelector('#vital-date').value = now.toISOString().slice(0, 16);
  
  document.body.appendChild(modal);
  modal.querySelector('#vital-value').focus();
};

window.updateVitalPlaceholder = function() {
  const typeSelect = document.getElementById('vital-type');
  const valueInput = document.getElementById('vital-value');
  const unitSpan = document.getElementById('vital-unit');
  
  const types = {
    weight: { unit: 'kg', placeholder: '70.5' },
    bloodPressure: { unit: 'mmHg', placeholder: '120/80' },
    glucose: { unit: 'mg/dL', placeholder: '95' },
    heartRate: { unit: 'bpm', placeholder: '72' },
    temperature: { unit: '°C', placeholder: '36.5' },
    oxygen: { unit: '%', placeholder: '98' }
  };
  
  const type = typeSelect?.value;
  if (types[type]) {
    valueInput.placeholder = types[type].placeholder;
    unitSpan.textContent = `(${types[type].unit})`;
  }
};

window.saveVital = function(modal) {
  const type = modal.querySelector('#vital-type')?.value;
  const value = modal.querySelector('#vital-value')?.value;
  const date = modal.querySelector('#vital-date')?.value;
  const notes = modal.querySelector('#vital-notes')?.value;
  
  if (!value) {
    alert('Por favor ingresa un valor');
    return;
  }
  
  // Validate based on type
  if (type === 'bloodPressure' && !/^\d{2,3}\/\d{2,3}$/.test(value)) {
    alert('Formato de presión arterial inválido. Usa: 120/80');
    return;
  }
  
  if (type !== 'bloodPressure' && isNaN(parseFloat(value))) {
    alert('Por favor ingresa un número válido');
    return;
  }
  
  const vital = {
    type,
    value,
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    notes
  };
  
  Store.addVitalEntry(vital);
  
  modal.remove();
  renderHealth();
  showToast('Signo vital registrado', 'success');
};

window.deleteVital = function(index) {
  if (confirm('¿Eliminar este registro?')) {
    Store.deleteVital(index);
    renderHealth();
    showToast('Registro eliminado', 'info');
  }
};


// ============================================
// PROFILE & HEIGHT MODALS
// ============================================

window.showProfileModal = function() {
  const profile = Store.getProfile();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: #1a1a2e; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden; color: white;">
      <div style="padding: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); background: linear-gradient(135deg, #00d4aa, #00a884);">
        <h3 style="margin: 0; font-size: 1.2rem;">👤 Editar Perfil</h3>
      </div>
      <div style="padding: 1.25rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem; color: rgba(255,255,255,0.9);">Nombre completo</label>
          <input type="text" id="profile-name" value="${profile.name || ''}" placeholder="Tu nombre" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1rem; background: rgba(255,255,255,0.08); color: white;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem; color: rgba(255,255,255,0.9);">Fecha de nacimiento</label>
          <input type="date" id="profile-birthdate" value="${profile.birthdate || ''}" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1rem; background: rgba(255,255,255,0.08); color: white;">
        </div>
        
        <div style="margin-bottom: 0.5rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem; color: rgba(255,255,255,0.9);">Género</label>
          <select id="profile-gender" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1rem; background: rgba(255,255,255,0.08); color: white;">
            <option value="" style="background: #1a1a2e;">Seleccionar...</option>
            <option value="female" ${profile.gender === 'female' ? 'selected' : ''} style="background: #1a1a2e;">👩 Mujer</option>
            <option value="male" ${profile.gender === 'male' ? 'selected' : ''} style="background: #1a1a2e;">👨 Hombre</option>
            <option value="other" ${profile.gender === 'other' ? 'selected' : ''} style="background: #1a1a2e;">⚧ Otro</option>
          </select>
        </div>
      </div>
      <div style="padding: 1rem 1.25rem 1.25rem; display: flex; gap: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1);">
        <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); border-radius: 12px; font-weight: 500; cursor: pointer; color: white;">Cancelar</button>
        <button onclick="saveProfile(this.closest('.modal-overlay'))" style="flex: 1; padding: 0.875rem; background: linear-gradient(135deg, #00d4aa, #00a884); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveProfile = function(modal) {
  const name = modal.querySelector('#profile-name')?.value;
  const birthdate = modal.querySelector('#profile-birthdate')?.value;
  const gender = modal.querySelector('#profile-gender')?.value;
  
  Store.updateProfile({ name, birthdate, gender });
  
  modal.remove();
  if (currentPage === 'settings') renderSettings();
  showToast('Perfil actualizado', 'success');
};

window.showHeightModal = function(callback = null) {
  const profile = Store.getProfile();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: #1a1a2e; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden; color: white;">
      <div style="padding: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); background: linear-gradient(135deg, #f59e0b, #d97706);">
        <h3 style="margin: 0; font-size: 1.2rem;">📏 Configurar Altura</h3>
      </div>
      <div style="padding: 1.25rem;">
        <p style="margin: 0 0 1rem; color: rgba(255,255,255,0.7); font-size: 0.9rem;">Tu altura se usa para calcular el IMC (Índice de Masa Corporal).</p>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem; color: rgba(255,255,255,0.9);">Altura (cm)</label>
          <input type="number" id="profile-height" value="${profile.height || ''}" placeholder="Ej: 165" min="50" max="250" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1.5rem; text-align: center; background: rgba(255,255,255,0.08); color: white;">
        </div>
        
        <div style="background: rgba(255,255,255,0.08); padding: 1rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
          <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-bottom: 0.25rem;">Vista previa IMC</div>
          <div style="font-size: 1.1rem; color: white;">
            Con tu peso actual: <strong style="color: #00d4aa;">${calculateBMIPreview(profile.height) || '---'}</strong>
          </div>
        </div>
      </div>
      <div style="padding: 1rem 1.25rem 1.25rem; display: flex; gap: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1);">
        <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); border-radius: 12px; font-weight: 500; cursor: pointer; color: white;">Cancelar</button>
        <button onclick="saveHeight(this.closest('.modal-overlay'), ${callback ? 'true' : 'false'})" style="flex: 1; padding: 0.875rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Update preview on input
  const heightInput = modal.querySelector('#profile-height');
  heightInput?.addEventListener('input', (e) => {
    const preview = modal.querySelector('strong');
    preview.textContent = calculateBMIPreview(e.target.value) || '---';
  });
  
  heightInput?.focus();
};

window.calculateBMIPreview = function(height) {
  if (!height || height < 50) return null;
  const vitals = Store.getVitalsLog() || [];
  const weight = vitals.filter(v => v.type === 'weight').pop()?.value || 68.2;
  const heightM = height / 100;
  const bmi = (weight / (heightM * heightM)).toFixed(1);
  
  let category = '';
  if (bmi < 18.5) category = '(Bajo peso)';
  else if (bmi < 25) category = '(Normal)';
  else if (bmi < 30) category = '(Sobrepeso)';
  else category = '(Obeso)';
  
  return `IMC: ${bmi} ${category}`;
};

window.saveHeight = function(modal, hasCallback) {
  const height = parseInt(modal.querySelector('#profile-height')?.value);
  
  if (!height || height < 50 || height > 250) {
    alert('Por favor ingresa una altura válida entre 50 y 250 cm');
    return;
  }
  
  Store.updateProfile({ height });
  
  modal.remove();
  
  if (hasCallback && typeof renderHealth === 'function') {
    renderHealth();
  } else if (currentPage === 'settings') {
    renderSettings();
  }
  
  showToast('Altura guardada', 'success');
};


// ============================================
// ONBOARDING MODAL
// ============================================

window.showOnboardingModal = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 2000; padding: 1rem;';
  modal.id = 'onboarding-modal';
  modal.innerHTML = `
    <div style="background: white; border-radius: var(--radius-lg); width: 100%; max-width: 380px; overflow: hidden; max-height: 90vh; overflow-y: auto;">
      <!-- Header with illustration -->
      <div style="background: linear-gradient(135deg, var(--primary), var(--accent)); padding: 2rem; text-align: center; color: white;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">👋</div>
        <h2 style="margin: 0 0 0.5rem; font-size: 1.5rem;">¡Bienvenida a Farmacia App!</h2>
        <p style="margin: 0; opacity: 0.9; font-size: 0.95rem;">Configura tu perfil para comenzar tu viaje de salud</p>
      </div>
      
      <div style="padding: 1.5rem;">
        <!-- Name -->
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.85rem;">¿Cómo te llamas?</label>
          <input type="text" id="onboard-name" value="María García" placeholder="Tu nombre" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
        </div>
        
        <!-- Height (Required for BMI) -->
        <div style="margin-bottom: 1rem; padding: 1rem; background: var(--primary-light); border-radius: var(--radius-md); border: 1px solid var(--primary);">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.85rem; color: var(--primary);">
            📏 ¿Cuál es tu altura? *
          </label>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="number" id="onboard-height" placeholder="165" min="50" max="250" style="flex: 1; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1.25rem; text-align: center;">
            <span style="font-weight: 600; color: var(--text-secondary);">cm</span>
          </div>
          <p style="margin: 0.5rem 0 0; font-size: 0.75rem; color: var(--text-muted);">* Requerido para calcular tu IMC</p>
        </div>
        
        <!-- Optional fields -->
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Fecha de nacimiento (opcional)</label>
          <input type="date" id="onboard-birthdate" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Género (opcional)</label>
          <select id="onboard-gender" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
            <option value="">Seleccionar...</option>
            <option value="female">👩 Mujer</option>
            <option value="male">👨 Hombre</option>
            <option value="other">⚧ Otro</option>
          </select>
        </div>
        
        <!-- Submit button -->
        <button onclick="completeOnboarding(this.closest('#onboarding-modal'))" style="width: 100%; padding: 1rem; background: var(--primary); color: white; border: none; border-radius: var(--radius-md); font-weight: 700; font-size: 1rem; cursor: pointer;">
          Comenzar mi viaje de salud 🚀
        </button>
        
        <button onclick="skipOnboarding(this.closest('#onboarding-modal'))" style="width: 100%; padding: 0.75rem; background: transparent; border: none; color: var(--text-muted); font-size: 0.85rem; cursor: pointer; margin-top: 0.5rem;">
          Omitir por ahora
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Focus height input
  setTimeout(() => {
    modal.querySelector('#onboard-height')?.focus();
  }, 100);
};

window.completeOnboarding = function(modal) {
  const name = modal.querySelector('#onboard-name')?.value || 'María García';
  const height = parseInt(modal.querySelector('#onboard-height')?.value);
  const birthdate = modal.querySelector('#onboard-birthdate')?.value;
  const gender = modal.querySelector('#onboard-gender')?.value;
  
  if (!height || height < 50 || height > 250) {
    alert('Por favor ingresa una altura válida (entre 50 y 250 cm)');
    return;
  }
  
  Store.updateProfile({ name, height, birthdate, gender });
  
  modal.remove();
  renderGoals(); // Refresh to show any BMI-related content
  alert(`🎉 ¡Bienvenida, ${name.split(' ')[0]}! Tu perfil está listo.`);
};

window.skipOnboarding = function(modal) {
  const name = modal.querySelector('#onboard-name')?.value || 'María García';
  Store.updateProfile({ name });
  modal.remove();
};


// ============================================
// ACTIVITY LEVEL MODAL
// ============================================

function getActivityLabel(level) {
  const labels = {
    sedentary: 'Sedentario',
    light: 'Ligero',
    moderate: 'Moderado',
    active: 'Activo',
    veryActive: 'Muy Activo'
  };
  return labels[level] || 'Moderado';
}

window.showActivityModal = function() {
  const currentLevel = Store.getActivityLevel();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: var(--radius-lg); width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1rem; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; font-size: 1.1rem;">🏃 Nivel de Actividad</h3>
        <p style="margin: 0.5rem 0 0; font-size: 0.8rem; color: var(--text-muted);">Selecciona tu nivel de actividad diaria</p>
      </div>
      <div style="padding: 1rem;">
        ${[
          { id: 'sedentary', label: 'Sedentario', desc: 'Poco o ningún ejercicio', mult: '×1.2' },
          { id: 'light', label: 'Ligero', desc: 'Ejercicio ligero 1-3 días/semana', mult: '×1.375' },
          { id: 'moderate', label: 'Moderado', desc: 'Ejercicio moderado 3-5 días/semana', mult: '×1.55' },
          { id: 'active', label: 'Activo', desc: 'Ejercicio intenso 6-7 días/semana', mult: '×1.725' },
          { id: 'veryActive', label: 'Muy Activo', desc: 'Ejercicio muy intenso + trabajo físico', mult: '×1.9' }
        ].map(opt => `
          <div onclick="selectActivityLevel('${opt.id}')" 
               style="padding: 0.75rem; border: 2px solid ${currentLevel === opt.id ? 'var(--primary)' : 'var(--border-color)'}; 
                      border-radius: var(--radius-md); margin-bottom: 0.5rem; cursor: pointer;
                      background: ${currentLevel === opt.id ? 'var(--primary-light)' : 'white'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600;">${opt.label}</span>
              <span style="font-size: 0.8rem; color: var(--primary); font-weight: 700;">${opt.mult}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${opt.desc}</div>
          </div>
        `).join('')}
      </div>
      <div style="padding: 1rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.75rem; background: var(--primary); color: white; border: none; border-radius: var(--radius-md); font-weight: 500; cursor: pointer;">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.selectActivityLevel = function(level) {
  Store.setActivityLevel(level);
  document.querySelector('.modal-overlay')?.remove();
  renderHealth();
  showToast('Nivel de actividad actualizado', 'success');
};


// ============================================
// INTEGRATIONS PAGE
// ============================================

function renderIntegrations() {
  currentPage = 'integrations';
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div class="date-header">
      <div class="day">dispositivos</div>
      <div class="title">⌚ Integraciones</div>
      <div class="subtitle">Conecta tus dispositivos de salud</div>
    </div>

    <!-- Disabled Notice -->
    <div style="padding: 0 16px 16px;">
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 32px 24px; text-align: center; color: white;">
        <div style="font-size: 3rem; margin-bottom: 16px;">🔒</div>
        <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 8px;">Integraciones próximamente</div>
        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6); line-height: 1.5; margin-bottom: 20px;">
          Fitbit/Garmin support is not enabled yet.<br>
          Estamos trabajando para traerte esta función pronto.
        </div>
        <button onclick="showToast('Fitbit/Garmin support is not enabled yet.', 'info')" class="btn-modal-primary" style="max-width: 240px; margin: 0 auto;">
          ℹ️ Más información
        </button>
      </div>
    </div>

    <!-- Info Card -->
    <div style="margin: 0 16px 100px;">
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <span style="font-size: 1.5rem;">ℹ️</span>
          <span style="font-weight: 700; color: white; font-size: 1.05rem;">¿Cómo funcionará?</span>
        </div>
        <p style="font-size: 0.85rem; color: rgba(255,255,255,0.7); margin: 0; line-height: 1.6;">
          Pronto podrás conectar tus dispositivos Fitbit o Garmin para sincronizar automáticamente 
          tus datos de actividad física, frecuencia cardíaca, sueño y peso. Los datos se actualizarán 
          cada vez que abras la app.
        </p>
      </div>
    </div>
  `;
}

// Global functions for integration buttons — DISABLED
window.connectFitbit = function() {
  showToast('Fitbit integration is not enabled yet.', 'info');
};

window.connectGarmin = function() {
  showToast('Garmin integration is not enabled yet.', 'info');
};

window.syncFitbitData = async function() {
  showToast('Fitbit sync is not enabled yet.', 'info');
};

window.disconnectFitbit = function() {
  showToast('Fitbit integration is not enabled yet.', 'info');
};

window.disconnectGarmin = function() {
  showToast('Garmin integration is not enabled yet.', 'info');
};


// ============================================
// VOICE INPUT FEATURE
// ============================================

window.toggleVoiceInput = function() {
  const modal = document.getElementById('voice-modal');
  modal.style.display = 'flex';
  resetVoiceUI();
};

window.closeVoiceModal = function() {
  VoiceAI.stopListening();
  document.getElementById('voice-modal').style.display = 'none';
};

function resetVoiceUI() {
  document.getElementById('voice-status').textContent = '🎤';
  document.getElementById('voice-text').textContent = 'Toca el micrófono y habla...';
  document.getElementById('voice-hint').style.display = 'block';
  document.getElementById('voice-result').style.display = 'none';
  document.getElementById('voice-action-btn').textContent = 'Escuchar';
  document.getElementById('voice-action-btn').onclick = startVoiceListening;
}

window.startVoiceListening = function() {
  const statusEl = document.getElementById('voice-status');
  const textEl = document.getElementById('voice-text');
  const hintEl = document.getElementById('voice-hint');
  const actionBtn = document.getElementById('voice-action-btn');
  
  statusEl.textContent = '👂';
  textEl.textContent = 'Escuchando...';
  hintEl.style.display = 'none';
  actionBtn.textContent = 'Detener';
  actionBtn.onclick = stopVoiceListening;
  
  const success = VoiceAI.startListening(
    (transcript, parsed) => {
      // Got result
      handleVoiceResult(transcript, parsed);
    },
    (error) => {
      // Error
      statusEl.textContent = '❌';
      textEl.textContent = 'Error: ' + error;
      actionBtn.textContent = 'Intentar de nuevo';
      actionBtn.onclick = startVoiceListening;
    }
  );
  
  if (!success) {
    statusEl.textContent = '❌';
    textEl.textContent = 'Tu navegador no soporta reconocimiento de voz';
    actionBtn.textContent = 'Cerrar';
    actionBtn.onclick = closeVoiceModal;
  }
};

window.stopVoiceListening = function() {
  VoiceAI.stopListening();
  document.getElementById('voice-action-btn').textContent = 'Escuchar';
  document.getElementById('voice-action-btn').onclick = startVoiceListening;
};

function handleVoiceResult(transcript, parsed) {
  const statusEl = document.getElementById('voice-status');
  const textEl = document.getElementById('voice-text');
  const resultEl = document.getElementById('voice-result');
  const resultTextEl = document.getElementById('voice-result-text');
  const actionBtn = document.getElementById('voice-action-btn');
  
  statusEl.textContent = parsed.success ? '✅' : '🤔';
  textEl.textContent = `"${transcript}"`;
  
  if (parsed.success) {
    // Execute the command
    const result = VoiceAI.executeCommand(parsed, Store);
    
    resultEl.style.display = 'block';
    resultTextEl.textContent = result.message;
    
    actionBtn.textContent = 'Cerrar';
    actionBtn.onclick = () => {
      closeVoiceModal();
      // Refresh current page to show updated data
      renderPage(currentPage);
    };
    
    // Auto-close after 2 seconds on success
    setTimeout(() => {
      if (document.getElementById('voice-modal').style.display === 'flex') {
        closeVoiceModal();
        renderPage(currentPage);
      }
    }, 2000);
  } else {
    // Check if it's a FAQ question
    const faqResponse = HealthFAQ.getResponse(transcript);
    
    resultEl.style.display = 'block';
    resultEl.style.background = '#eff6ff';
    resultTextEl.style.color = '#1e40af';
    resultTextEl.textContent = faqResponse;
    
    actionBtn.textContent = 'Cerrar';
    actionBtn.onclick = closeVoiceModal;
  }
}

// Add pulse animation to voice button when listening
const voiceBtnStyles = document.createElement('style');
voiceBtnStyles.textContent = `
  @keyframes pulse {
    0% { transform: scale(1); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4); }
    50% { transform: scale(1.05); box-shadow: 0 6px 20px rgba(139, 92, 246, 0.6); }
    100% { transform: scale(1); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4); }
  }
  #voice-btn:hover {
    transform: scale(1.05);
  }
  #voice-btn.listening {
    animation: pulse 1s infinite;
    background: linear-gradient(135deg, #ef4444, #dc2626) !important;
  }
`;
document.head.appendChild(voiceBtnStyles);


// ============================================
// FASTING TRACKER PAGE
// ============================================

function renderFasting() {
  const currentFast = FastingTracker.getCurrentFast();
  const stats = FastingTracker.getStats();
  const progress = currentFast ? FastingTracker.getProgress() : null;
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div class="date-header">
      <div class="day">intermitente</div>
      <div class="title">⏰ Ayuno</div>
      <div class="subtitle">Controla tus períodos de ayuno</div>
    </div>

    ${currentFast ? `
    <!-- Active Fast Card -->
    <div style="margin: 0 16px 16px;">
      <div style="background: linear-gradient(135deg, rgba(0,212,170,0.25), rgba(0,168,132,0.15)); backdrop-filter: blur(20px); border: 1px solid rgba(0,212,170,0.4); border-radius: 24px; padding: 24px; text-align: center;">
        <div style="font-size: 0.9rem; color: #00d4aa; margin-bottom: 8px; font-weight: 600;">🔥 Ayuno en progreso</div>
        <div style="font-size: 3.5rem; font-weight: 800; color: white; margin-bottom: 8px; font-family: 'SF Mono', monospace; text-shadow: 0 2px 10px rgba(0,0,0,0.3);" id="fast-timer">
          ${progress.remaining}
        </div>
        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); margin-bottom: 20px;">
          ${progress.elapsed} transcurridos • Meta: ${currentFast.fastHours}h
        </div>
        
        <!-- Progress bar -->
        <div style="width: 100%; height: 10px; background: rgba(255,255,255,0.1); border-radius: 5px; overflow: hidden; margin-bottom: 20px;">
          <div style="width: ${progress.progress}%; height: 100%; background: linear-gradient(90deg, #00d4aa, #00a884); border-radius: 5px; transition: width 1s; box-shadow: 0 0 10px rgba(0,212,170,0.5);"></div>
        </div>
        
        <div style="display: flex; gap: 12px;">
          <button onclick="endFast()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #00d4aa, #00a884); color: white; border: none; border-radius: 16px; font-weight: 700; font-size: 1rem; cursor: pointer; box-shadow: 0 4px 15px rgba(0,212,170,0.4);">
            ✅ Terminar Ayuno
          </button>
          <button onclick="cancelFast()" style="padding: 14px 20px; background: rgba(239,68,68,0.2); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); border-radius: 16px; font-weight: 600; cursor: pointer;">
            Cancelar
          </button>
        </div>
      </div>
    </div>
    ` : `
    <!-- Start Fast Card -->
    <div style="margin: 0 16px 16px;">
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 24px; padding: 20px;">
        <div style="font-weight: 600; color: white; margin-bottom: 16px; font-size: 1.05rem;">Selecciona tu protocolo:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          ${Object.entries(FastingTracker.presets).map(([key, preset]) => `
            <button onclick="startFast('${key}')" style="padding: 16px 12px; background: ${key === '16:8' ? 'linear-gradient(135deg, #00d4aa, #00a884)' : 'rgba(255,255,255,0.08)'}; color: ${key === '16:8' ? 'white' : 'rgba(255,255,255,0.9)'}; border: 2px solid ${key === '16:8' ? '#00d4aa' : 'rgba(255,255,255,0.2)'}; border-radius: 16px; cursor: pointer; text-align: center; transition: all 0.2s;">
              <div style="font-weight: 700; font-size: 1.1rem; margin-bottom: 4px;">${preset.name}</div>
              <div style="font-size: 0.7rem; opacity: 0.8; line-height: 1.3;">${preset.description}</div>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
    `}

    <!-- Stats Card -->
    ${stats ? `
    <div style="margin: 0 16px 16px;">
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 24px; padding: 20px;">
        <div style="font-weight: 600; color: white; margin-bottom: 16px; font-size: 1.05rem;">📊 Estadísticas</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="text-align: center; padding: 16px; background: rgba(255,255,255,0.08); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="font-size: 1.75rem; font-weight: 800; color: #00d4aa;">${stats.totalFasts}</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Ayunos completados</div>
          </div>
          <div style="text-align: center; padding: 16px; background: rgba(255,255,255,0.08); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="font-size: 1.75rem; font-weight: 800; color: #00d4aa;">${stats.totalHours}h</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Total en ayuno</div>
          </div>
          <div style="text-align: center; padding: 16px; background: rgba(255,255,255,0.08); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="font-size: 1.75rem; font-weight: 800; color: #f59e0b;">${stats.currentStreak} 🔥</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Racha actual</div>
          </div>
          <div style="text-align: center; padding: 16px; background: rgba(255,255,255,0.08); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="font-size: 1.75rem; font-weight: 800; color: #3b82f6;">${stats.averageDuration}h</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Promedio</div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Benefits Card -->
    <div style="margin: 0 16px 100px;">
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 24px; padding: 20px;">
        <div style="font-weight: 600; color: white; margin-bottom: 16px; font-size: 1.05rem;">💡 Beneficios del Ayuno</div>
        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); line-height: 1.8;">
          <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
            <span style="color: #00d4aa; font-size: 1.1rem;">✓</span>
            <span>Mejora la sensibilidad a la insulina</span>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
            <span style="color: #00d4aa; font-size: 1.1rem;">✓</span>
            <span>Promueve la autófagia (limpieza celular)</span>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
            <span style="color: #00d4aa; font-size: 1.1rem;">✓</span>
            <span>Puede ayudar a la pérdida de peso</span>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
            <span style="color: #00d4aa; font-size: 1.1rem;">✓</span>
            <span>Mejora la función cognitiva</span>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <span style="color: #00d4aa; font-size: 1.1rem;">✓</span>
            <span>Reduce la inflamación</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Start timer update interval if fasting
  if (currentFast) {
    window.fastTimerInterval = setInterval(() => {
      const timerEl = document.getElementById('fast-timer');
      if (timerEl) {
        const progress = FastingTracker.getProgress();
        timerEl.textContent = progress.remaining;
        if (progress.isComplete) {
          timerEl.style.color = '#00d4aa';
        }
      }
    }, 1000);
  }
}

window.startFast = function(preset) {
  FastingTracker.startFast(preset);
  if (window.fastTimerInterval) clearInterval(window.fastTimerInterval);
  renderFasting();
};

window.endFast = function() {
  if (confirm('¿Terminar tu ayuno?')) {
    if (window.fastTimerInterval) clearInterval(window.fastTimerInterval);
    FastingTracker.endFast();
    renderFasting();
    showToast('¡Ayuno completado!', 'success');
  }
};

window.cancelFast = function() {
  if (confirm('¿Cancelar tu ayuno actual?')) {
    if (window.fastTimerInterval) clearInterval(window.fastTimerInterval);
    FastingTracker.cancelFast();
    renderFasting();
  }
};

// Expose to window for onclick handlers
window.renderFasting = renderFasting;

// ============================================
// SLEEP TRACKER PAGE
// ============================================

function renderSleep() {
  const lastSleep = SleepTracker.getLastSleep();
  const stats = SleepTracker.getSleepStats(7);
  const tips = SleepTracker.getSleepTips();
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div class="date-header">
      <div class="day">descanso</div>
      <div class="title">😴 Sueño</div>
      <div class="subtitle">Registra y mejora tu descanso</div>
    </div>

    <!-- Log Sleep Button -->
    <div style="margin: 0 16px 16px;">
      <button onclick="showSleepModal()" style="width: 100%; padding: 24px; background: linear-gradient(135deg, rgba(99,102,241,0.25), rgba(79,70,229,0.15)); backdrop-filter: blur(20px); border: 2px dashed rgba(99,102,241,0.5); border-radius: 24px; cursor: pointer; text-align: center; transition: all 0.2s;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">🌙</div>
        <div style="font-weight: 700; color: white; font-size: 1.1rem;">Registrar sueño de anoche</div>
        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Toca para agregar registro</div>
      </button>
    </div>

    ${lastSleep ? `
    <!-- Last Night Card -->
    <div style="margin: 0 16px 16px;">
      <div style="background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(124,58,237,0.15)); backdrop-filter: blur(20px); border: 1px solid rgba(139,92,246,0.4); border-radius: 24px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <span style="font-weight: 700; color: white; font-size: 1.05rem;">🌙 Última noche</span>
          <span style="font-size: 0.75rem; background: ${SleepTracker.getQualityColor(lastSleep.quality)}30; color: white; padding: 6px 14px; border-radius: 20px; font-weight: 600; border: 1px solid ${SleepTracker.getQualityColor(lastSleep.quality)}50;">
            ${SleepTracker.getQualityLabel(lastSleep.quality)}
          </span>
        </div>
        <div style="display: flex; justify-content: space-around;">
          <div style="text-align: center;">
            <div style="font-size: 2rem; font-weight: 800; color: #a78bfa;">${lastSleep.duration.toFixed(1)}h</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Duración</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: white;">${new Date(lastSleep.bedTime).toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'})}</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">A dormir</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; color: white;">${new Date(lastSleep.wakeTime).toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'})}</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Despertar</div>
          </div>
        </div>
        ${lastSleep.notes ? `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(139,92,246,0.3); font-size: 0.85rem; color: rgba(255,255,255,0.8); font-style: italic;">"${lastSleep.notes}"</div>` : ''}
      </div>
    </div>
    ` : ''}

    ${stats ? `
    <!-- Stats Card -->
    <div style="margin: 0 16px 16px;">
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 24px; padding: 20px;">
        <div style="font-weight: 600; color: white; margin-bottom: 16px; font-size: 1.05rem;">📊 Últimos 7 días</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="text-align: center; padding: 16px; background: rgba(255,255,255,0.08); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="font-size: 1.75rem; font-weight: 800; color: #8b5cf6;">${stats.averageDuration}h</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Promedio</div>
          </div>
          <div style="text-align: center; padding: 16px; background: rgba(255,255,255,0.08); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="font-size: 1.75rem; font-weight: 800; color: #f59e0b;">${stats.averageQuality}/5 ⭐</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Calidad</div>
          </div>
        </div>
        <div style="margin-top: 16px; text-align: center; padding: 12px; background: rgba(0,212,170,0.1); border-radius: 12px; border: 1px solid rgba(0,212,170,0.2);">
          <span style="font-size: 0.85rem; color: rgba(255,255,255,0.8);">
            Meta de 7h cumplida: <strong style="color: #00d4aa; font-size: 1.1rem;">${stats.goalMet}/${stats.totalNights}</strong> noches
          </span>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Sleep Tips -->
    <div style="padding: 0 16px 100px;">
      <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); margin-bottom: 12px; padding-left: 4px;">💡 Consejos para Dormir Mejor</div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${tips.map(tip => `
          <div style="background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03)); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 16px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
              <span style="font-size: 1.5rem;">${tip.icon}</span>
              <span style="font-weight: 700; color: white; font-size: 0.95rem;">${tip.title}</span>
            </div>
            <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); padding-left: 36px; line-height: 1.5;">${tip.text}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

window.showSleepModal = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: var(--radius-lg); width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1rem; border-bottom: 1px solid var(--border);">
        <h3 style="margin: 0; font-size: 1.1rem;">🌙 Registrar Sueño</h3>
      </div>
      <div style="padding: 1rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Hora de dormir</label>
          <input type="datetime-local" id="sleep-bed" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
        </div>
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Hora de despertar</label>
          <input type="datetime-local" id="sleep-wake" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 1rem;">
        </div>
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Calidad del sueño</label>
          <div style="display: flex; gap: 0.5rem; justify-content: center;">
            ${[1, 2, 3, 4, 5].map(n => `
              <button onclick="selectSleepQuality(this, ${n})" class="sleep-quality-btn" data-quality="${n}" style="width: 40px; height: 40px; border-radius: 50%; border: 2px solid var(--border-color); background: white; cursor: pointer; font-size: 1.2rem;">${n === 1 ? '😴' : n === 2 ? '😕' : n === 3 ? '😐' : n === 4 ? '😊' : '😍'}</button>
            `).join('')}
          </div>
          <input type="hidden" id="sleep-quality" value="3">
        </div>
        <div style="margin-bottom: 0.5rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem;">Notas (opcional)</label>
          <textarea id="sleep-notes" placeholder="¿Despertaste durante la noche? ¿Soñaste?" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 0.9rem; min-height: 80px;"></textarea>
        </div>
      </div>
      <div style="padding: 1rem; display: flex; gap: 0.5rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.75rem; border: 1px solid var(--border-color); background: white; border-radius: var(--radius-md); font-weight: 500; cursor: pointer;">Cancelar</button>
        <button onclick="saveSleepLog(this.closest('.modal-overlay'))" style="flex: 1; padding: 0.75rem; background: #6366f1; color: white; border: none; border-radius: var(--radius-md); font-weight: 500; cursor: pointer;">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Set default values (last night)
  const now = new Date();
  const lastNight = new Date(now - 86400000);
  lastNight.setHours(22, 0, 0, 0);
  const thisMorning = new Date(now);
  thisMorning.setHours(6, 0, 0, 0);
  
  modal.querySelector('#sleep-bed').value = lastNight.toISOString().slice(0, 16);
  modal.querySelector('#sleep-wake').value = thisMorning.toISOString().slice(0, 16);
};

window.selectSleepQuality = function(btn, quality) {
  document.querySelectorAll('.sleep-quality-btn').forEach(b => {
    b.style.background = 'white';
    b.style.borderColor = 'var(--border-color)';
  });
  btn.style.background = '#6366f1';
  btn.style.borderColor = '#6366f1';
  btn.style.color = 'white';
  document.getElementById('sleep-quality').value = quality;
};

window.saveSleepLog = function(modal) {
  const bedTime = modal.querySelector('#sleep-bed').value;
  const wakeTime = modal.querySelector('#sleep-wake').value;
  const quality = parseInt(modal.querySelector('#sleep-quality').value);
  const notes = modal.querySelector('#sleep-notes').value;
  
  if (!bedTime || !wakeTime) {
    alert('Por favor ingresa las horas');
    return;
  }
  
  SleepTracker.logSleep(bedTime, wakeTime, quality, notes);
  modal.remove();
  renderSleep();
  showToast('Sueño registrado', 'success');
};


// ============================================
// CHECK-IN SYSTEM PAGE
// ============================================

function renderCheckIn() {
  const history = CheckInSystem.getCheckInHistory();
  const comparison = CheckInSystem.getComparisonPhotos();
  const progress = CheckInSystem.getMeasurementProgress();
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div class="date-header">
      <div class="day">semanal</div>
      <div class="title">📸 Check-in</div>
      <div class="subtitle">Documenta tu progreso</div>
    </div>

    <!-- New Check-in Button -->
    <div style="margin: 0 16px 16px;">
      <button onclick="showCheckInModal()" style="width: 100%; padding: 24px; background: linear-gradient(135deg, rgba(236,72,153,0.25), rgba(219,39,119,0.15)); backdrop-filter: blur(20px); border: 2px dashed rgba(236,72,153,0.5); border-radius: 24px; cursor: pointer; text-align: center; transition: all 0.2s;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">📸</div>
        <div style="font-weight: 700; color: white; font-size: 1.1rem;">Nuevo Check-in</div>
        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-top: 4px;">Semana ${CheckInSystem.getWeekNumber()}</div>
      </button>
    </div>

    <!-- Progress Comparison -->
    ${comparison ? `
    <div style="margin: 0 16px 16px;">
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 24px; padding: 20px;">
        <div style="font-weight: 600; color: white; margin-bottom: 16px; font-size: 1.05rem;">📊 Comparación de Progreso</div>
        <div style="display: flex; gap: 12px;">
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-bottom: 8px;">Inicio • Semana ${comparison.first.weekNumber}</div>
            ${comparison.first.photo ? 
              `<div style="width: 100%; aspect-ratio: 3/4; background: rgba(255,255,255,0.1); border-radius: 16px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);"><img src="${comparison.first.photo}" style="width: 100%; height: 100%; object-fit: cover;"></div>` :
              `<div style="width: 100%; aspect-ratio: 3/4; background: rgba(255,255,255,0.1); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 2rem; border: 1px solid rgba(255,255,255,0.2);">📷</div>`
            }
            <div style="font-size: 1rem; font-weight: 700; color: white; margin-top: 8px;">${comparison.first.weight} kg</div>
          </div>
          <div style="flex: 1; text-align: center;">
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); margin-bottom: 8px;">Actual • Semana ${comparison.latest.weekNumber}</div>
            ${comparison.latest.photo ? 
              `<div style="width: 100%; aspect-ratio: 3/4; background: rgba(255,255,255,0.1); border-radius: 16px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);"><img src="${comparison.latest.photo}" style="width: 100%; height: 100%; object-fit: cover;"></div>` :
              `<div style="width: 100%; aspect-ratio: 3/4; background: rgba(255,255,255,0.1); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 2rem; border: 1px solid rgba(255,255,255,0.2);">📷</div>`
            }
            <div style="font-size: 1rem; font-weight: 700; margin-top: 8px; color: ${comparison.latest.weight < comparison.first.weight ? '#00d4aa' : 'white'}">
              ${comparison.latest.weight} kg
              ${comparison.latest.weight !== comparison.first.weight ? 
                `<span style="font-size: 0.7rem; display: block; color: ${comparison.latest.weight < comparison.first.weight ? '#00d4aa' : '#fca5a5'};">${comparison.latest.weight < comparison.first.weight ? '↓' : '↑'} ${Math.abs(comparison.latest.weight - comparison.first.weight).toFixed(1)} kg</span>` : ''
              }
            </div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- Measurement Progress -->
    ${progress ? `
    <div style="margin: 0 16px 16px;">
      <div style="background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04)); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.15); border-radius: 24px; padding: 20px;">
        <div style="font-weight: 600; color: white; margin-bottom: 12px; font-size: 1.05rem;">📏 Cambios en Medidas</div>
        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-bottom: 12px;">Últimos ${progress.timeSpan} check-ins</div>
        
        <div style="display: flex; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.08); border-radius: 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1);">
          <span style="color: rgba(255,255,255,0.9);">Peso</span>
          <span style="font-weight: 700; color: ${progress.weightChange <= 0 ? '#00d4aa' : '#fca5a5'}">
            ${progress.weightChange > 0 ? '+' : ''}${progress.weightChange} kg
          </span>
        </div>
        
        ${Object.entries(progress.measurementChanges).map(([key, data]) => `
          <div style="display: flex; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.08); border-radius: 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1);">
            <span style="color: rgba(255,255,255,0.9);">${translateMeasurement(key)}</span>
            <span style="font-weight: 700; color: ${data.change <= 0 ? '#00d4aa' : '#fca5a5'}">
              ${data.change > 0 ? '+' : ''}${data.change} cm
            </span>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- History -->
    <div style="padding: 0 16px 100px;">
      <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); margin-bottom: 12px; padding-left: 4px;">📋 Historial de Check-ins</div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${history.length === 0 ? '<div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.6);">No hay check-ins aún.<br>¡Toma tu primera foto de progreso!</div>' : history.slice(0, 5).map(check => `
          <div style="background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03)); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <span style="font-weight: 700; color: white;">Semana ${check.weekNumber}</span>
              <span style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">${new Date(check.date).toLocaleDateString('es-MX')}</span>
            </div>
            <div style="display: flex; gap: 12px;">
              ${check.photo ? `<div style="width: 80px; height: 100px; border-radius: 12px; overflow: hidden; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.2);"><img src="${check.photo}" style="width: 100%; height: 100%; object-fit: cover;"></div>` : ''}
              <div style="flex: 1;">
                <div style="font-size: 1.2rem; font-weight: 800; color: #ec4899; margin-bottom: 4px;">${check.weight} kg</div>
                ${Object.entries(check.measurements).filter(([k, v]) => v).map(([k, v]) => `
                  <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">${translateMeasurement(k)}: ${v} cm</div>
                `).join('')}
                ${check.notes ? `<div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-top: 8px; font-style: italic;">"${check.notes}"</div>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function translateMeasurement(key) {
  const translations = {
    chest: 'Pecho',
    waist: 'Cintura',
    hips: 'Caderas',
    arms: 'Brazos',
    thighs: 'Muslos',
    neck: 'Cuello'
  };
  return translations[key] || key;
}

window.showCheckInModal = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: #1a1a2e; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden; max-height: 90vh; overflow-y: auto; color: white;">
      <div style="padding: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); background: linear-gradient(135deg, #ec4899, #db2777);">
        <h3 style="margin: 0; font-size: 1.2rem;">📸 Check-in Semana ${CheckInSystem.getWeekNumber()}</h3>
      </div>
      <div style="padding: 1.25rem;">
        <!-- Weight -->
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem; color: rgba(255,255,255,0.9);">⚖️ Peso actual (kg)</label>
          <input type="number" id="checkin-weight" step="0.1" placeholder="70.5" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 1rem; background: rgba(255,255,255,0.08); color: white;">
        </div>
        
        <!-- Measurements -->
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem; color: rgba(255,255,255,0.9);">📏 Medidas (cm) - Opcional</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <input type="number" id="checkin-waist" placeholder="Cintura" style="padding: 0.625rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; background: rgba(255,255,255,0.08); color: white; font-size: 0.9rem;">
            <input type="number" id="checkin-hips" placeholder="Caderas" style="padding: 0.625rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; background: rgba(255,255,255,0.08); color: white; font-size: 0.9rem;">
            <input type="number" id="checkin-chest" placeholder="Pecho" style="padding: 0.625rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; background: rgba(255,255,255,0.08); color: white; font-size: 0.9rem;">
            <input type="number" id="checkin-arms" placeholder="Brazos" style="padding: 0.625rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; background: rgba(255,255,255,0.08); color: white; font-size: 0.9rem;">
          </div>
        </div>
        
        <!-- Photo -->
        <div style="margin-bottom: 1rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem; color: rgba(255,255,255,0.9);">📸 Foto de progreso</label>
          <input type="file" id="checkin-photo" accept="image/*" style="display: none;">
          <button onclick="document.getElementById('checkin-photo').click()" style="width: 100%; padding: 0.875rem; background: rgba(255,255,255,0.08); border: 2px dashed rgba(236,72,153,0.5); border-radius: 12px; cursor: pointer; color: white;">
            <span id="photo-label">Seleccionar foto...</span>
          </button>
          <div id="photo-preview" style="display: none; margin-top: 0.75rem; width: 100%; aspect-ratio: 3/4; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.2);">
            <img style="width: 100%; height: 100%; object-fit: cover;">
          </div>
        </div>
        
        <!-- Notes -->
        <div style="margin-bottom: 0.5rem;">
          <label style="display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.85rem; color: rgba(255,255,255,0.9);">📝 Notas</label>
          <textarea id="checkin-notes" placeholder="¿Cómo te sentiste esta semana? ¿Algún logro?" style="width: 100%; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; font-size: 0.9rem; min-height: 80px; background: rgba(255,255,255,0.08); color: white; resize: vertical;"></textarea>
        </div>
      </div>
      <div style="padding: 1rem 1.25rem 1.25rem; display: flex; gap: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1);">
        <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.875rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); border-radius: 12px; font-weight: 500; cursor: pointer; color: white;">Cancelar</button>
        <button onclick="saveCheckIn(this.closest('.modal-overlay'))" style="flex: 1; padding: 0.875rem; background: linear-gradient(135deg, #ec4899, #db2777); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Guardar Check-in</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Photo preview
  modal.querySelector('#checkin-photo').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        modal.querySelector('#photo-preview img').src = e.target.result;
        modal.querySelector('#photo-preview').style.display = 'block';
        modal.querySelector('#photo-label').textContent = 'Cambiar foto';
      };
      reader.readAsDataURL(file);
    }
  });
};

window.saveCheckIn = function(modal) {
  const weight = parseFloat(modal.querySelector('#checkin-weight').value);
  if (!weight) {
    alert('Por favor ingresa tu peso');
    return;
  }
  
  const measurements = {
    waist: modal.querySelector('#checkin-waist').value || null,
    hips: modal.querySelector('#checkin-hips').value || null,
    chest: modal.querySelector('#checkin-chest').value || null,
    arms: modal.querySelector('#checkin-arms').value || null
  };
  
  const photoPreview = modal.querySelector('#photo-preview img');
  const photo = photoPreview.src && photoPreview.src.startsWith('data:') ? photoPreview.src : null;
  
  const notes = modal.querySelector('#checkin-notes').value;
  
  CheckInSystem.createCheckIn(weight, measurements, photo, notes);
  modal.remove();
  renderCheckIn();
  showToast('Check-in guardado. ¡Sigue así! 💪', 'success');
};


// ============================================
// BODY PAGE - All body metrics in one view
// ============================================

function renderBody() {
  const vitals = Store.getVitalsLog() || [];
  const profile = Store.getProfile();
  const height = profile.height;
  const latestWeight = vitals.filter(v => v.type === 'weight').pop()?.value || 68.2;
  
  // Calculate metrics if height available
  let bmi = null, bmr = null, tdee = null, bodyFat = null;
  if (height && latestWeight) {
    const heightM = height / 100;
    bmi = (latestWeight / (heightM * heightM)).toFixed(1);
    const age = profile.birthdate ? Math.floor((new Date() - new Date(profile.birthdate)) / (365.25 * 24 * 60 * 60 * 1000)) : 35;
    bmr = calculateBMR(latestWeight, height, age, profile.gender || 'female');
    tdee = calculateTDEE(bmr, Store.getActivityLevel());
    bodyFat = calculateBodyFatFromBMI(parseFloat(bmi), age, profile.gender || 'female');
  }
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
      <div style="font-size: 1.3rem; font-weight: 700;">⚖️ Tu Cuerpo</div>
      <div style="font-size: 0.85rem; opacity: 0.9;">Métricas y salud</div>
    </div>

    <!-- Weight Card - Silver Text, No White Background -->
    <div style="padding: 1rem;">
      <div style="text-align: center; padding: 1.5rem; cursor: pointer;" onclick="showHealthModal('weight')">
        <div style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Peso Actual</div>
        <div style="font-size: 3.5rem; font-weight: 800; color: #c0c0c0; text-shadow: 0 2px 8px rgba(192,192,192,0.3);">${latestWeight} <span style="font-size: 1.2rem; font-weight: 600;">kg</span></div>
        <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.75rem;">Toca para actualizar ⚖️</div>
      </div>
    </div>

    <!-- Key Metrics - Glass Tiles -->
    ${height ? `
    <div style="padding: 0 1rem 1rem;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div class="glass-card" style="flex-direction: column; padding: 1rem; text-align: center;">
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.05em;">IMC</div>
          <div style="font-size: 1.6rem; font-weight: 700; color: #c0c0c0; margin: 0.25rem 0;">${bmi}</div>
          <div style="font-size: 0.65rem; color: #00d4aa;">Normal</div>
        </div>
        <div class="glass-card" style="flex-direction: column; padding: 1rem; text-align: center;">
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.05em;">Grasa</div>
          <div style="font-size: 1.6rem; font-weight: 700; color: #c0c0c0; margin: 0.25rem 0;">${bodyFat?.toFixed(1) || '--'}<span style="font-size: 0.9rem;">%</span></div>
          <div style="font-size: 0.65rem; color: rgba(255,255,255,0.6);">Estimado</div>
        </div>
        <div class="glass-card" style="flex-direction: column; padding: 1rem; text-align: center;">
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.05em;">Calorías/día</div>
          <div style="font-size: 1.6rem; font-weight: 700; color: #c0c0c0; margin: 0.25rem 0;">${tdee || '--'}</div>
          <div style="font-size: 0.65rem; color: rgba(255,255,255,0.6);">TDEE</div>
        </div>
        <div class="glass-card" style="flex-direction: column; padding: 1rem; text-align: center; cursor: pointer;" onclick="showActivityModal()">
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.05em;">Actividad</div>
          <div style="font-size: 1.8rem; margin: 0.1rem 0;">${getActivityEmoji(Store.getActivityLevel())}</div>
          <div style="font-size: 0.65rem; color: rgba(255,255,255,0.6);">Cambiar</div>
        </div>
      </div>
    </div>
    ` : `
    <div style="padding: 0 1rem 1rem;">
      <div class="medicine-card" style="padding: 1.5rem; background: var(--primary-light); border: 2px dashed var(--primary); text-align: center; cursor: pointer;" onclick="showHeightModal(() => renderBody())">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📏</div>
        <div style="font-weight: 600; color: var(--primary);">Agregar altura</div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">Para ver IMC y más métricas</div>
      </div>
    </div>
    `}

    <!-- Vitals Section - Glass Design -->
    <div style="padding: 0 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: white; font-size: 1rem;">❤️ Signos Vitales</div>
      <div style="display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1rem;">
        <div class="glass-card" onclick="showHealthModal('bloodPressure')" style="cursor: pointer; display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem;">
          <div style="font-size: 1.5rem;">🫀</div>
          <div style="flex: 1;">
            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.03em;">Presión Arterial</div>
            <div style="font-size: 1.1rem; font-weight: 600; color: #c0c0c0;">${vitals.filter(v => v.type === 'bloodPressure').pop()?.value || 'No registrado'}</div>
          </div>
        </div>
        <div class="glass-card" onclick="showHealthModal('heartRate')" style="cursor: pointer; display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem;">
          <div style="font-size: 1.5rem;">💓</div>
          <div style="flex: 1;">
            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.03em;">Frecuencia Cardíaca</div>
            <div style="font-size: 1.1rem; font-weight: 600; color: #c0c0c0;">${vitals.filter(v => v.type === 'heartRate').pop()?.value || '--'} <span style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">bpm</span></div>
          </div>
        </div>
        <div class="glass-card" onclick="showHealthModal('glucose')" style="cursor: pointer; display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem;">
          <div style="font-size: 1.5rem;">🩸</div>
          <div style="flex: 1;">
            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.03em;">Glucosa</div>
            <div style="font-size: 1.1rem; font-weight: 600; color: #c0c0c0;">${vitals.filter(v => v.type === 'glucose').pop()?.value || '--'} <span style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">mg/dL</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- More Actions - Glass Tiles -->
    <div style="padding: 0 1rem 1.5rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: white; font-size: 1rem;">+ Más</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <button class="glass-card" onclick="renderFasting()" style="padding: 1.25rem; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
          <div style="font-size: 1.75rem;">⏰</div>
          <div style="font-size: 0.85rem; font-weight: 600; color: white;">Ayuno</div>
        </button>
        <button class="glass-card" onclick="renderSleep()" style="padding: 1.25rem; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
          <div style="font-size: 1.75rem;">😴</div>
          <div style="font-size: 0.85rem; font-weight: 600; color: white;">Sueño</div>
        </button>
      </div>
    </div>
  `;
}

function getActivityEmoji(level) {
  const emojis = { sedentary: '🛋️', light: '🚶', moderate: '🏃', active: '💪', veryActive: '🔥' };
  return emojis[level] || '🏃';
}

// ============================================
// PROGRESS PAGE - Goals & Achievements
// ============================================

function renderProgress() {
  const points = Store.getPointsBalance() || 350;
  const level = Store.getUserLevel() || { name: 'Plata' };
  const goals = Store.getHealthGoals() || [];
  const history = CheckInSystem.getCheckInHistory();
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #00A86B, #008855); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 1.3rem; font-weight: 700;">🏆 ${level.name}</div>
          <div style="font-size: 0.85rem; opacity: 0.9;">${points} puntos</div>
        </div>
        <div style="font-size: 2.5rem;">🔥</div>
      </div>
    </div>

    <!-- Streak Card -->
    <div style="padding: 1rem;">
      <div class="medicine-card" style="flex-direction: column; padding: 1.5rem; background: linear-gradient(135deg, #fef3c7, #fde68a); text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🔥</div>
        <div style="font-size: 2.5rem; font-weight: 700; color: #92400e;">12</div>
        <div style="font-size: 0.9rem; color: #a16207;">días de racha</div>
        <div style="font-size: 0.75rem; color: #b45309; margin-top: 0.5rem;">¡Sigue así! Registra tu peso mañana</div>
      </div>
    </div>

    <!-- Goals Section -->
    <div style="padding: 0 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600;">🎯 Tus Metas</span>
        <button onclick="showGoalModal()" style="background: var(--primary); color: white; border: none; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.75rem; cursor: pointer;">+ Nueva</button>
      </div>
      
      ${goals.length === 0 ? `
        <div class="medicine-card" style="padding: 1.5rem; text-align: center; background: var(--bg-app);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎯</div>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">No tienes metas aún.<br>Crea tu primera meta</div>
        </div>
      ` : `
        <div class="medicine-list" style="margin-bottom: 1rem;">
          ${goals.map((goal, idx) => `
            <div class="medicine-card" style="flex-direction: column; padding: 1rem;" onclick="updateGoalProgress(${idx})">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span style="font-weight: 600;">${goal.name}</span>
                <span style="font-size: 0.8rem; color: var(--text-secondary);">${goal.progress}%</span>
              </div>
              <div style="width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                <div style="width: ${goal.progress}%; height: 100%; background: ${goal.progress >= 100 ? '#00A86B' : '#00A86B'}; border-radius: 4px;"></div>
              </div>
              <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
                ${goal.current} / ${goal.target} ${goal.unit}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Check-in CTA -->
    <div style="padding: 0 1rem 1rem;">
      <div class="medicine-card" style="padding: 1rem; background: linear-gradient(135deg, #fce7f3, #fbcfe8); cursor: pointer;" onclick="renderCheckIn()">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 2.5rem;">📸</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #9d174d;">Check-in Semanal</div>
            <div style="font-size: 0.8rem; color: #db2777;">${history.length > 0 ? 'Último: ' + new Date(history[0].date).toLocaleDateString('es-MX') : 'Toma tu primera foto de progreso'}</div>
          </div>
          <div style="font-size: 1.5rem;">→</div>
        </div>
      </div>
    </div>

    <!-- Recent Achievements -->
    <div style="padding: 0 1rem 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem;">🏅 Logros Recientes</div>
      <div style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem;">
        <div style="flex-shrink: 0; padding: 1rem; background: #f0fdf4; border-radius: 12px; text-align: center; min-width: 100px;">
          <div style="font-size: 2rem;">🏃</div>
          <div style="font-size: 0.7rem; color: #166534; margin-top: 0.25rem;">10k Pasos</div>
        </div>
        <div style="flex-shrink: 0; padding: 1rem; background: #eff6ff; border-radius: 12px; text-align: center; min-width: 100px;">
          <div style="font-size: 2rem;">💧</div>
          <div style="font-size: 0.7rem; color: #1e40af; margin-top: 0.25rem;">Hidratado</div>
        </div>
        <div style="flex-shrink: 0; padding: 1rem; background: #fef3c7; border-radius: 12px; text-align: center; min-width: 100px;">
          <div style="font-size: 2rem;">🔥</div>
          <div style="font-size: 0.7rem; color: #92400e; margin-top: 0.25rem;">7 Días</div>
        </div>
      </div>
    </div>
  `;
}


// ============================================
// QUICK LOG FUNCTIONS
// ============================================

window.showQuickExerciseLog = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 320px; overflow: hidden; text-align: center; padding: 1.5rem;">
      <div style="font-size: 3rem; margin-bottom: 0.5rem;">🏃</div>
      <h3 style="margin: 0 0 0.5rem; font-size: 1.2rem;">¿Cuántos minutos?</h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">Ejercicio de hoy</p>
      
      <div style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
        <button onclick="logMinutes(15)" style="padding: 1rem 1.5rem; background: #f3f4f6; border: none; border-radius: 12px; font-size: 1.1rem; font-weight: 600; cursor: pointer;">15</button>
        <button onclick="logMinutes(30)" style="padding: 1rem 1.5rem; background: #f3f4f6; border: none; border-radius: 12px; font-size: 1.1rem; font-weight: 600; cursor: pointer;">30</button>
        <button onclick="logMinutes(45)" style="padding: 1rem 1.5rem; background: #f3f4f6; border: none; border-radius: 12px; font-size: 1.1rem; font-weight: 600; cursor: pointer;">45</button>
        <button onclick="logMinutes(60)" style="padding: 1rem 1.5rem; background: #f3f4f6; border: none; border-radius: 12px; font-size: 1.1rem; font-weight: 600; cursor: pointer;">60</button>
      </div>
      
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
        <input type="number" id="custom-minutes" placeholder="Otro..." style="flex: 1; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 12px; font-size: 1rem; text-align: center;">
        <button onclick="logMinutes(document.getElementById('custom-minutes').value)" style="padding: 0.75rem 1.5rem; background: #00A86B; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">OK</button>
      </div>
      
      <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.75rem; background: transparent; border: none; color: var(--text-muted); cursor: pointer;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);
};

window.logMinutes = function(minutes) {
  minutes = parseInt(minutes);
  if (!minutes || minutes <= 0) return;
  
  Store.addActiveMinutes(minutes);
  Store.addCaloriesBurned(Math.round(minutes * 5)); // ~5 cal/min average
  
  document.querySelector('.modal-overlay')?.remove();
  renderHome();
  showToast(`+${minutes} minutos registrados`, 'success');
};

// ============================================
// ENHANCED FOOD LOGGING WITH DATABASE
// ============================================

window.showFoodLogModal = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden; max-height: 90vh; display: flex; flex-direction: column;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); text-align: center; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <div style="font-size: 2.5rem; margin-bottom: 0.25rem;">🍽️</div>
        <h3 style="margin: 0; font-size: 1.2rem;">¿Qué comiste?</h3>
        <p style="font-size: 0.8rem; opacity: 0.9; margin: 0.25rem 0 0;">Escribe y te ayudamos a calcular</p>
      </div>
      
      <div style="padding: 1rem; overflow-y: auto;">
        <!-- Food Input -->
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-secondary);">Describe tu comida</label>
          <input type="text" id="food-input" placeholder="Ej: 2 huevos con tortilla" 
            style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;"
            onkeyup="searchFoodDatabase(this.value)">
        </div>
        
        <!-- Search Results -->
        <div id="food-suggestions" style="margin-bottom: 1rem;"></div>
        
        <!-- Manual Entry -->
        <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.75rem; text-transform: uppercase;">Detalles manuales</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div>
              <label style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.25rem;">Calorías (kcal)</label>
              <input type="number" id="food-calories" placeholder="0" 
                style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.9rem;">
            </div>
            <div>
              <label style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 0.25rem;">Proteína (g)</label>
              <input type="number" id="food-protein" placeholder="0" 
                style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.9rem;">
            </div>
          </div>
        </div>
        
        <!-- Common Quick Adds -->
        <div style="margin-bottom: 1rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem;">Comunes:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            <button onclick="quickAddFood('huevo', 2)" style="padding: 0.5rem 0.75rem; background: #fef3c7; border: none; border-radius: 20px; font-size: 0.75rem; cursor: pointer;">🥚 2 huevos</button>
            <button onclick="quickAddFood('pollo', 1)" style="padding: 0.5rem 0.75rem; background: #dcfce7; border: none; border-radius: 20px; font-size: 0.75rem; cursor: pointer;">🍗 Pollo 100g</button>
            <button onclick="quickAddFood('arroz', 1)" style="padding: 0.5rem 0.75rem; background: #fef3c7; border: none; border-radius: 20px; font-size: 0.75rem; cursor: pointer;">🍚 Arroz</button>
            <button onclick="quickAddFood('tortilla', 2)" style="padding: 0.5rem 0.75rem; background: #f3f4f6; border: none; border-radius: 20px; font-size: 0.75rem; cursor: pointer;">🌮 2 tortillas</button>
            <button onclick="quickAddFood('frijoles', 1)" style="padding: 0.5rem 0.75rem; background: #fef3c7; border: none; border-radius: 20px; font-size: 0.75rem; cursor: pointer;">🫘 Frijoles</button>
            <button onclick="quickAddFood('yogurt', 1)" style="padding: 0.5rem 0.75rem; background: #fce7f3; border: none; border-radius: 20px; font-size: 0.75rem; cursor: pointer;">🥛 Yogurt</button>
          </div>
        </div>
      </div>
      
      <div class="modal-actions-sticky">
        <button onclick="this.closest('.modal-overlay').remove()" class="btn-modal-secondary">Cancelar</button>
        <button onclick="saveFoodEntry()" class="btn-modal-primary">Agregar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Focus the input
  setTimeout(() => document.getElementById('food-input')?.focus(), 100);
};

window.searchFoodDatabase = function(query) {
  const suggestionsDiv = document.getElementById('food-suggestions');
  if (!suggestionsDiv) return;
  
  if (query.length < 2) {
    suggestionsDiv.innerHTML = '';
    return;
  }
  
  const results = searchFoods(query);
  
  if (results.length === 0) {
    suggestionsDiv.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 0.5rem;">No encontrado - ingresa manualmente</div>';
    return;
  }
  
  suggestionsDiv.innerHTML = `
    <div style="background: #f0f9ff; border-radius: 12px; overflow: hidden;">
      ${results.map(food => `
        <button onclick="selectFoodSuggestion('${food.name}', ${food.calories}, ${food.protein})" 
          style="width: 100%; padding: 0.75rem; text-align: left; background: none; border: none; border-bottom: 1px solid #e0f2fe; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${food.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${food.serving}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--primary);">${food.calories} kcal</div>
            <div style="font-size: 0.7rem; color: var(--apollo-teal);">${food.protein}g prot</div>
          </div>
        </button>
      `).join('')}
    </div>
  `;
};

window.selectFoodSuggestion = function(name, calories, protein) {
  document.getElementById('food-input').value = name;
  document.getElementById('food-calories').value = calories;
  document.getElementById('food-protein').value = protein;
  document.getElementById('food-suggestions').innerHTML = '';
};

window.quickAddFood = function(foodKey, quantity) {
  const food = COMMON_FOODS[foodKey];
  if (!food) return;
  
  const calories = Math.round(food.calories * quantity);
  const protein = Math.round(food.protein * quantity);
  const name = quantity > 1 ? `${quantity}x ${food.name}` : food.name;
  
  Store.addFoodEntry({
    name: name,
    calories: calories,
    protein: protein,
    serving: quantity > 1 ? `${quantity} porciones` : food.serving
  });
  
  document.querySelector('.modal-overlay')?.remove();
  renderHome();
  showToast(`${name} agregado: ${calories} kcal, ${protein}g proteína`, 'success');
};

window.saveFoodEntry = function() {
  const name = document.getElementById('food-input')?.value?.trim();
  const calories = parseInt(document.getElementById('food-calories')?.value) || 0;
  const protein = parseInt(document.getElementById('food-protein')?.value) || 0;
  
  if (!name) {
    alert('Por favor describe tu comida');
    return;
  }
  
  if (calories <= 0 && protein <= 0) {
    alert('Por favor ingresa al menos calorías o proteína');
    return;
  }
  
  Store.addFoodEntry({
    name: name,
    calories: calories,
    protein: protein
  });
  
  document.querySelector('.modal-overlay')?.remove();
  renderHome();
  showToast(`"${name}" agregado — ${calories > 0 ? calories + ' kcal' : ''} ${protein > 0 ? protein + 'g proteína' : ''}`, 'success');
};

window.deleteFoodItem = function(id) {
  if (confirm('¿Eliminar este alimento?')) {
    Store.deleteFoodEntry(id);
    renderHome();
  }
};

// Keep old functions for compatibility
window.showQuickCalorieLog = window.showFoodLogModal;
window.quickAddCalories = function(calories, mealType) {
  Store.addFoodEntry({
    name: mealType,
    calories: calories,
    protein: 0
  });
  document.querySelector('.modal-overlay')?.remove();
  renderHome();
  showToast(`${mealType} registrado: ${calories} kcal`, 'success');
};
window.addCustomCalories = window.saveFoodEntry;


// Activity Level and Health Goal Modals
window.showActivityLevelModal = function() {
  const currentLevel = Store.getActivityLevel();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 320px; overflow: hidden; text-align: center;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border);">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🏃</div>
        <h3 style="margin: 0; font-size: 1.2rem;">Nivel de Actividad</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.5rem 0 0;">¿Cuán activo eres diariamente?</p>
      </div>
      <div style="padding: 1rem;">
        <button onclick="setActivityLevel('sedentary')" style="width: 100%; padding: 1rem; margin-bottom: 0.5rem; background: ${currentLevel === 'sedentary' ? '#e8f4f8' : '#f8fafc'}; border: 2px solid ${currentLevel === 'sedentary' ? '#003366' : 'transparent'}; border-radius: 12px; cursor: pointer; text-align: left;">
          <div style="font-weight: 600;">🪑 Sedentario</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Poco o ningún ejercicio</div>
        </button>
        <button onclick="setActivityLevel('light')" style="width: 100%; padding: 1rem; margin-bottom: 0.5rem; background: ${currentLevel === 'light' ? '#e8f4f8' : '#f8fafc'}; border: 2px solid ${currentLevel === 'light' ? '#003366' : 'transparent'}; border-radius: 12px; cursor: pointer; text-align: left;">
          <div style="font-weight: 600;">🚶 Ligero</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Ejercicio 1-3 días/semana</div>
        </button>
        <button onclick="setActivityLevel('moderate')" style="width: 100%; padding: 1rem; margin-bottom: 0.5rem; background: ${currentLevel === 'moderate' ? '#e8f4f8' : '#f8fafc'}; border: 2px solid ${currentLevel === 'moderate' ? '#003366' : 'transparent'}; border-radius: 12px; cursor: pointer; text-align: left;">
          <div style="font-weight: 600;">🏃 Moderado</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Ejercicio 3-5 días/semana</div>
        </button>
        <button onclick="setActivityLevel('active')" style="width: 100%; padding: 1rem; margin-bottom: 0.5rem; background: ${currentLevel === 'active' ? '#e8f4f8' : '#f8fafc'}; border: 2px solid ${currentLevel === 'active' ? '#003366' : 'transparent'}; border-radius: 12px; cursor: pointer; text-align: left;">
          <div style="font-weight: 600;">💪 Activo</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Ejercicio 6-7 días/semana</div>
        </button>
        <button onclick="setActivityLevel('veryActive')" style="width: 100%; padding: 1rem; background: ${currentLevel === 'veryActive' ? '#e8f4f8' : '#f8fafc'}; border: 2px solid ${currentLevel === 'veryActive' ? '#003366' : 'transparent'}; border-radius: 12px; cursor: pointer; text-align: left;">
          <div style="font-weight: 600;">🔥 Muy Activo</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Ejercicio intenso + trabajo físico</div>
        </button>
      </div>
      <div style="padding: 1rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.75rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer;">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.setActivityLevel = function(level) {
  Store.setActivityLevel(level);
  document.querySelector('.modal-overlay')?.remove();
  if (currentPage === 'settings') renderSettings();
  showToast('Nivel de actividad actualizado', 'success');
};

window.showHealthGoalModal = function() {
  const currentGoal = Store.getHealthGoal();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden; text-align: center;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎯</div>
        <h3 style="margin: 0; font-size: 1.2rem;">Objetivo Principal</h3>
        <p style="font-size: 0.85rem; opacity: 0.9; margin: 0.5rem 0 0;">¿Qué quieres lograr?</p>
      </div>
      <div style="padding: 1rem;">
        <button onclick="selectGoalWithPlan('lose')" style="width: 100%; padding: 1.5rem; margin-bottom: 0.5rem; background: ${currentGoal === 'lose' ? '#e8f4f8' : '#f8fafc'}; border: 2px solid ${currentGoal === 'lose' ? '#003366' : 'transparent'}; border-radius: 12px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 2.5rem;">📉</div>
          <div>
            <div style="font-weight: 600; font-size: 1.1rem;">Perder Peso</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Déficit calórico controlado</div>
          </div>
        </button>
        <button onclick="setHealthGoalSimple('maintain')" style="width: 100%; padding: 1.5rem; margin-bottom: 0.5rem; background: ${currentGoal === 'maintain' ? '#e8f4f8' : '#f8fafc'}; border: 2px solid ${currentGoal === 'maintain' ? '#003366' : 'transparent'}; border-radius: 12px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 2.5rem;">⚖️</div>
          <div>
            <div style="font-weight: 600; font-size: 1.1rem;">Mantener Peso</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Balance calórico neutro</div>
          </div>
        </button>
        <button onclick="selectGoalWithPlan('gain')" style="width: 100%; padding: 1.5rem; background: ${currentGoal === 'gain' ? '#e8f4f8' : '#f8fafc'}; border: 2px solid ${currentGoal === 'gain' ? '#003366' : 'transparent'}; border-radius: 12px; cursor: pointer; text-align: left; display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 2.5rem;">💪</div>
          <div>
            <div style="font-weight: 600; font-size: 1.1rem;">Ganar Masa</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Superávit calórico + proteína</div>
          </div>
        </button>
      </div>
      <div style="padding: 1rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.75rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer;">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// For maintain - no extra info needed
window.setHealthGoalSimple = function(goal) {
  Store.setHealthGoal(goal);
  Store.setGoalWeight(null);
  Store.setGoalTimeline(null);
  document.querySelector('.modal-overlay')?.remove();
  if (currentPage === 'settings') renderSettings();
  showToast('Objetivo actualizado: Mantener peso', 'success');
};

// For lose/gain - need goal weight and timeline
window.selectGoalWithPlan = function(goal) {
  const vitals = Store.getVitalsLog() || [];
  const currentWeight = vitals.filter(v => v.type === 'weight').pop()?.value;
  const existingGoalWeight = Store.getGoalWeight();
  const existingTimeline = Store.getGoalTimeline();
  
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, ${goal === 'lose' ? '#00A86B' : '#003366'}, ${goal === 'lose' ? '#008855' : '#1a4d7a'}); color: white;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">${goal === 'lose' ? '📉' : '💪'}</div>
        <h3 style="margin: 0; font-size: 1.2rem;">${goal === 'lose' ? 'Perder Peso' : 'Ganar Masa'}</h3>
        <p style="font-size: 0.8rem; opacity: 0.9; margin: 0.25rem 0 0;">Define tu meta</p>
      </div>
      
      <div style="padding: 1.5rem;">
        ${currentWeight ? `
          <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Peso actual</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">${currentWeight} kg</div>
          </div>
        ` : ''}
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-secondary);">
            ${goal === 'lose' ? '¿Cuánto quieres pesar?' : '¿A cuánto quieres llegar?'}
          </label>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="number" id="goal-weight" value="${existingGoalWeight || ''}" placeholder="${goal === 'lose' ? (currentWeight ? currentWeight - 5 : '65') : (currentWeight ? currentWeight + 3 : '70')}" 
              style="flex: 1; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem; text-align: center;">
            <span style="font-weight: 600; color: var(--text-muted);">kg</span>
          </div>
          ${currentWeight ? `
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              ${goal === 'lose' ? `Meta saludable: ${(currentWeight * 0.9).toFixed(1)} - ${(currentWeight * 0.95).toFixed(1)} kg` : `Meta realista: ${(currentWeight + 2).toFixed(1)} - ${(currentWeight + 5).toFixed(1)} kg`}
            </div>
          ` : ''}
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-secondary);">¿En cuánto tiempo?</label>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
            <button onclick="selectTimeline(4, this)" class="timeline-btn ${existingTimeline === 4 ? 'selected' : ''}" style="padding: 0.75rem; border: 2px solid ${existingTimeline === 4 ? '#003366' : 'var(--border-color)'}; border-radius: 10px; background: ${existingTimeline === 4 ? '#e8f4f8' : 'white'}; cursor: pointer; font-size: 0.85rem;">
              <div style="font-weight: 700;">4</div>
              <div style="font-size: 0.7rem;">semanas</div>
            </button>
            <button onclick="selectTimeline(8, this)" class="timeline-btn ${existingTimeline === 8 ? 'selected' : ''}" style="padding: 0.75rem; border: 2px solid ${existingTimeline === 8 ? '#003366' : 'var(--border-color)'}; border-radius: 10px; background: ${existingTimeline === 8 ? '#e8f4f8' : 'white'}; cursor: pointer; font-size: 0.85rem;">
              <div style="font-weight: 700;">8</div>
              <div style="font-size: 0.7rem;">semanas</div>
            </button>
            <button onclick="selectTimeline(12, this)" class="timeline-btn ${existingTimeline === 12 ? 'selected' : ''}" style="padding: 0.75rem; border: 2px solid ${existingTimeline === 12 ? '#003366' : 'var(--border-color)'}; border-radius: 10px; background: ${existingTimeline === 12 ? '#e8f4f8' : 'white'}; cursor: pointer; font-size: 0.85rem;">
              <div style="font-weight: 700;">12</div>
              <div style="font-size: 0.7rem;">semanas</div>
            </button>
            <button onclick="selectTimeline(16, this)" class="timeline-btn ${existingTimeline === 16 ? 'selected' : ''}" style="padding: 0.75rem; border: 2px solid ${existingTimeline === 16 ? '#003366' : 'var(--border-color)'}; border-radius: 10px; background: ${existingTimeline === 16 ? '#e8f4f8' : 'white'}; cursor: pointer; font-size: 0.85rem;">
              <div style="font-weight: 700;">16</div>
              <div style="font-size: 0.7rem;">semanas</div>
            </button>
            <button onclick="selectTimeline(24, this)" class="timeline-btn ${existingTimeline === 24 ? 'selected' : ''}" style="padding: 0.75rem; border: 2px solid ${existingTimeline === 24 ? '#003366' : 'var(--border-color)'}; border-radius: 10px; background: ${existingTimeline === 24 ? '#e8f4f8' : 'white'}; cursor: pointer; font-size: 0.85rem;">
              <div style="font-weight: 700;">24</div>
              <div style="font-size: 0.7rem;">semanas</div>
            </button>
            <button onclick="selectTimeline(52, this)" class="timeline-btn ${existingTimeline === 52 ? 'selected' : ''}" style="padding: 0.75rem; border: 2px solid ${existingTimeline === 52 ? '#003366' : 'var(--border-color)'}; border-radius: 10px; background: ${existingTimeline === 52 ? '#e8f4f8' : 'white'}; cursor: pointer; font-size: 0.85rem;">
              <div style="font-weight: 700;">52</div>
              <div style="font-size: 0.7rem;">semanas (1 año)</div>
            </button>
          </div>
        </div>
        
        <input type="hidden" id="selected-timeline" value="${existingTimeline || ''}">
        
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="showHealthGoalModal()" style="flex: 1; padding: 0.875rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer; font-weight: 500;">← Volver</button>
          <button onclick="saveGoalWithPlan('${goal}')" style="flex: 1; padding: 0.875rem; background: ${goal === 'lose' ? '#00A86B' : '#003366'}; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Continuar →</button>
        </div>
      </div>
    </div>
  `;
};

window.selectTimeline = function(weeks, btn) {
  document.getElementById('selected-timeline').value = weeks;
  document.querySelectorAll('.timeline-btn').forEach(b => {
    b.style.borderColor = 'var(--border-color)';
    b.style.background = 'white';
  });
  btn.style.borderColor = '#003366';
  btn.style.background = '#e8f4f8';
};

window.saveGoalWithPlan = function(goal) {
  const goalWeight = parseFloat(document.getElementById('goal-weight')?.value);
  const timeline = parseInt(document.getElementById('selected-timeline')?.value);
  
  if (!goalWeight || goalWeight <= 0) {
    alert('Por favor ingresa tu peso meta');
    return;
  }
  if (!timeline) {
    alert('Por favor selecciona un plazo');
    return;
  }
  
  Store.setHealthGoal(goal);
  Store.setGoalWeight(goalWeight);
  Store.setGoalTimeline(timeline);
  Store.setGoalStartDate(new Date().toISOString());
  
  // Show recommendations
  showGoalRecommendations(goal, goalWeight, timeline);
};

// Show calculated recommendations based on goal, weight, and timeline
window.showGoalRecommendations = function(goal, goalWeight, timeline) {
  const vitals = Store.getVitalsLog() || [];
  const currentWeight = vitals.filter(v => v.type === 'weight').pop()?.value || goalWeight;
  const activityLevel = Store.getActivityLevel() || 'moderate';
  const profile = Store.getProfile();
  
  // Calculate the plan
  const plan = calculateWeightGoalPlan(currentWeight, goalWeight, timeline);
  const exerciseRec = calculateRecommendedExercise(goal, activityLevel);
  
  // Calculate TDEE and adjusted calories
  let adjustedCalories = null;
  if (profile && profile.height && profile.birthdate && profile.gender) {
    const age = Math.floor((new Date() - new Date(profile.birthdate)) / (365.25 * 24 * 60 * 60 * 1000));
    const bmr = calculateBMR(currentWeight, profile.height, age, profile.gender);
    const tdee = calculateTDEE(bmr, activityLevel);
    adjustedCalories = tdee + plan.dailyCalorieAdjustment;
  }
  
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #003366, #00A86B); color: white; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📊</div>
        <h3 style="margin: 0; font-size: 1.2rem;">Tu Plan Personalizado</h3>
      </div>
      
      <div style="padding: 1.5rem;">
        <!-- Weight Summary -->
        <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">Actual</span>
            <span style="font-weight: 700;">${currentWeight} kg</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">Meta</span>
            <span style="font-weight: 700; color: var(--primary);">${goalWeight} kg</span>
          </div>
          <div style="height: 2px; background: var(--border-color); margin: 0.5rem 0;"></div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">${goal === 'lose' ? 'A perder' : 'A ganar'}</span>
            <span style="font-weight: 700; ${goal === 'lose' ? 'color: #00A86B;' : 'color: #003366;'}">${Math.abs(plan.weightDiff).toFixed(1)} kg</span>
          </div>
        </div>
        
        <!-- Timeline & Rate -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.5rem;">
          <div style="background: ${plan.isSafe ? '#f0fdf4' : '#fef3c7'}; border-radius: 12px; padding: 1rem; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; ${plan.isSafe ? 'color: #00A86B;' : 'color: #b45309;'}">${timeline}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">semanas</div>
          </div>
          <div style="background: ${plan.isSafe ? '#f0fdf4' : '#fef3c7'}; border-radius: 12px; padding: 1rem; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: 700; ${plan.isSafe ? 'color: #00A86B;' : 'color: #b45309;'}">${Math.abs(plan.requiredWeeklyChange).toFixed(1)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">kg/semana</div>
          </div>
        </div>
        
        ${!plan.isSafe ? `
          <div style="background: #fef3c7; border-left: 4px solid #b45309; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
            <div style="font-weight: 600; color: #92400e; margin-bottom: 0.25rem;">⚠️ Meta muy agresiva</div>
            <div style="font-size: 0.85rem; color: #a16207;">${plan.recommendation}</div>
          </div>
        ` : `
          <div style="background: #f0fdf4; border-left: 4px solid #00A86B; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
            <div style="font-weight: 600; color: #065f46; margin-bottom: 0.25rem;">✅ Ritmo adecuado</div>
            <div style="font-size: 0.85rem; color: #047857;">${plan.recommendation}</div>
          </div>
        `}
        
        <!-- Calorie Recommendation -->
        ${adjustedCalories ? `
          <div style="background: linear-gradient(135deg, #003366, #1a4d7a); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem; color: white;">
            <div style="font-size: 0.85rem; opacity: 0.9; margin-bottom: 0.25rem;">Calorías diarias recomendadas</div>
            <div style="font-size: 2rem; font-weight: 700;">${Math.round(adjustedCalories)} kcal</div>
            <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 0.5rem;">
              ${plan.dailyCalorieAdjustment > 0 ? '+' : ''}${plan.dailyCalorieAdjustment} kcal ${plan.dailyCalorieAdjustment < 0 ? 'déficit' : 'superávit'}
            </div>
          </div>
        ` : ''}
        
        <!-- Exercise Recommendation -->
        <div style="background: #f8fafc; border-radius: 12px; padding: 1.25rem; margin-bottom: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
            <div style="font-size: 1.5rem;">🏃</div>
            <div>
              <div style="font-weight: 600;">${exerciseRec.min}-${exerciseRec.max} min/día</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${exerciseRec.type}</div>
            </div>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); padding: 0.75rem; background: white; border-radius: 8px;">
            ${exerciseRec.message}
          </div>
        </div>
        
        <!-- Protein Goal -->
        ${profile ? `
          <div style="background: #f0fdf4; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: #065f46;">🥩 Proteína diaria</span>
              <span style="font-size: 1.25rem; font-weight: 700; color: #00A86B;">${calculateProteinGoal(currentWeight, activityLevel, goal)}g</span>
            </div>
            <div style="font-size: 0.75rem; color: #047857; margin-top: 0.25rem;">${goal === 'gain' ? 'Alta proteína para construir músculo' : 'Proteína adecuada para preservar músculo'}</div>
          </div>
        ` : ''}
        
        <button onclick="finishGoalSetup()" class="btn-modal-primary" style="width: 100%;">
          ¡Entendido! Comenzar
        </button>
      </div>
    </div>
  `;
};

window.finishGoalSetup = function() {
  document.querySelector('.modal-overlay')?.remove();
  if (currentPage === 'settings') renderSettings();
  showToast('¡Plan configurado! Tus metas de calorías y ejercicio han sido actualizadas.', 'success');
};


// ============================================
// SALUD PAGE - Medical Records, Prescriptions, Vaccines, Exams
// ============================================

function renderSalud() {
  const prescriptions = Store.getPrescriptions() || [];
  const reminders = Store.getMedicineReminders() || [];
  const schedules = Store.getMedicineSchedules() || [];
  const upcomingDoses = Store.getUpcomingDoses() || [];
  const vaccines = Store.getVaccines();
  const userExams = Store.getUserExams() || [];
  const profile = Store.getProfile();
  
  // Get upcoming vaccines
  const upcomingVaccines = vaccines.filter(v => {
    if (!v.nextDose) return true;
    const nextDate = new Date(v.nextDose);
    const today = new Date();
    const diffDays = Math.floor((nextDate - today) / (1000 * 60 * 60 * 24));
    return diffDays <= 30 || !v.lastDose;
  });
  
  // Get upcoming exams
  const examTemplates = Store.getExamTemplates();
  const now = new Date();
  const upcomingExams = examTemplates.filter(template => {
    const userExam = userExams.find(e => e.examId === template.id);
    if (!userExam) return true; // Never done
    const lastDate = new Date(userExam.date);
    const monthsSince = (now - lastDate) / (1000 * 60 * 60 * 24 * 30);
    const freqMonths = template.frequency === 'annual' ? 12 : 
                      template.frequency === '2years' ? 24 :
                      template.frequency === '3years' ? 36 :
                      template.frequency === '5years' ? 60 :
                      template.frequency === '6months' ? 6 :
                      template.frequency === '10years' ? 120 : 12;
    return monthsSince >= freqMonths - 1; // Due within a month
  });
  
  // Health guides based on user profile
  const healthGuides = getHealthGuides(profile);
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1.5rem 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white; text-align: center;">
      <div style="font-size: 1.3rem; font-weight: 700;">🏥 Tu Salud</div>
      <div style="font-size: 0.85rem; opacity: 0.9; margin-top: 0.25rem;">Historial, recetas y vacunas</div>
    </div>

    <!-- Prescription Scanner Section -->
    <div style="padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600;">📷 Recetas Médicas</span>
        <button onclick="showManualPrescriptionModal()" style="background: none; border: none; color: var(--primary); font-size: 0.8rem; cursor: pointer;">+ Manual</button>
      </div>
      
      <!-- Scanner Card -->
      <div class="glass-card" style="flex-direction: column; padding: 1.5rem; cursor: pointer; border: 2px dashed rgba(255,255,255,0.3);" onclick="showPrescriptionScanner()">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">📸</div>
        <div style="font-weight: 600; color: var(--teal-primary); margin-bottom: 0.25rem;">Escanear Receta</div>
        <div style="font-size: 0.8rem; color: var(--text-muted); text-align: center;">Toma una foto y detectaremos el medicamento automáticamente</div>
      </div>
      
      <!-- Active Prescriptions -->
      ${prescriptions.length > 0 ? `
        <div style="margin-top: 1rem;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">Recetas activas:</div>
          ${prescriptions.map(p => {
            const refills = Store.getRefillRequestsByPrescription(p.id);
            const activeRefill = refills.find(r => r.status === 'pending' || r.status === 'confirmed');
            return `
            <div class="glass-card" style="margin-bottom: 0.5rem; padding: 1rem; display: flex; align-items: center; gap: 0.75rem;">
              <div style="width: 48px; height: 48px; background: rgba(0,212,170,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">💊</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--text-primary);">${p.medicine}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${p.dose} • ${p.frequency}</div>
                ${p.instructions ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${p.instructions}</div>` : ''}
                ${activeRefill ? `
                  <div style="font-size: 0.75rem; margin-top: 0.25rem;">
                    <span style="background: ${activeRefill.status === 'confirmed' ? 'rgba(0,212,170,0.2)' : 'rgba(245,158,11,0.2)'}; color: ${activeRefill.status === 'confirmed' ? '#00d4aa' : '#f59e0b'}; padding: 0.125rem 0.5rem; border-radius: 10px;">
                      🔄 ${activeRefill.statusText}
                    </span>
                  </div>
                ` : ''}
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                <button onclick="showReminderModal(${p.id})" style="background: rgba(0,212,170,0.2); color: var(--teal-primary); border: 1px solid rgba(0,212,170,0.3); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.7rem; cursor: pointer;">⏰</button>
                ${!activeRefill ? `
                  <button onclick="showRefillRequestModal(${p.id})" style="background: rgba(0,212,170,0.2); color: var(--teal-primary); border: 1px solid rgba(0,212,170,0.3); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.7rem; cursor: pointer;">🔄</button>
                ` : `
                  <button onclick="showRefillStatus('${activeRefill.id}')" style="background: rgba(0,168,232,0.2); color: #00a8e8; border: 1px solid rgba(0,168,232,0.3); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.7rem; cursor: pointer;">📋</button>
                `}
                <button onclick="deletePrescription(${p.id})" style="background: rgba(255,107,107,0.2); color: #ff6b6b; border: 1px solid rgba(255,107,107,0.3); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.7rem; cursor: pointer;">×</button>
              </div>
            </div>
          `}).join('')}
        </div>
      ` : ''}
      
      <!-- Upcoming Doses (Smart Schedule) - Glass Cards -->
      ${upcomingDoses.length > 0 ? `
        <div style="margin-top: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <span style="font-weight: 600; color: white;">⏰ Próximas tomas</span>
            <span style="font-size: 0.75rem; color: #00d4aa; font-weight: 600; background: rgba(0,212,170,0.15); padding: 0.25rem 0.5rem; border-radius: 12px;">${upcomingDoses.length} pendientes</span>
          </div>
          ${upcomingDoses.slice(0, 5).map(d => `
            <div class="glass-card" style="margin-bottom: 0.6rem; padding: 1rem; display: flex; align-items: center; gap: 0.75rem;">
              <div style="width: 44px; height: 44px; background: rgba(0,212,170,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">💊</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; color: white; font-size: 0.95rem;">${d.medicine}</div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7);">${d.dose || 'Dosis normal'}</div>
                <div style="font-size: 0.75rem; color: #00d4aa; font-weight: 500; margin-top: 0.15rem;">🕐 ${d.time} • Día ${d.day + 1} de ${d.totalDays}</div>
              </div>
              <div style="display: flex; gap: 0.35rem;">
                <button onclick="markDoseTaken('${d.scheduleId}', ${d.doseId})" style="background: #00d4aa; color: white; border: none; width: 32px; height: 32px; border-radius: 8px; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">✓</button>
                <button onclick="markDoseSkipped('${d.scheduleId}', ${d.doseId})" style="background: rgba(255,107,107,0.3); color: #ff6b6b; border: none; width: 32px; height: 32px; border-radius: 8px; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
              </div>
            </div>
          `).join('')}
          ${upcomingDoses.length > 5 ? `
            <div style="text-align: center; padding: 0.5rem; color: var(--text-muted); font-size: 0.8rem;">+${upcomingDoses.length - 5} más tomas programadas</div>
          ` : ''}
        </div>
      ` : ''}
      
      <!-- Active Schedules Summary - Glass Cards -->
      ${schedules.filter(s => s.active).length > 0 ? `
        <div style="margin-top: 1.5rem;">
          <div style="font-weight: 600; color: white; margin-bottom: 0.75rem;">💊 Tratamientos activos</div>
          ${schedules.filter(s => s.active).map(s => {
            const takenCount = s.doses.filter(d => d.taken).length;
            const totalDoses = s.doses.length;
            const progress = Math.round((takenCount / totalDoses) * 100);
            return `
              <div class="glass-card" style="padding: 1rem; margin-bottom: 0.6rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 600; font-size: 0.95rem; color: white;">${s.medicine}</div>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">${takenCount} de ${totalDoses} dosis tomadas</div>
                  </div>
                  <div style="background: rgba(0,212,170,0.2); color: #00d4aa; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8rem; font-weight: 600;">${progress}%</div>
                </div>
                <div style="margin-top: 0.6rem; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                  <div style="width: ${progress}%; height: 100%; background: linear-gradient(90deg, #00d4aa, #00a8e8); border-radius: 3px;"></div>
                </div>
                <div style="margin-top: 0.6rem; display: flex; justify-content: flex-end;">
                  <button onclick="deleteSchedule('${s.id}')" style="background: none; border: none; color: #ff6b6b; font-size: 0.75rem; cursor: pointer; padding: 0.25rem;">🗑️ Eliminar</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Vaccines Section - Glass Cards -->
    <div style="padding: 0 1rem 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600; color: white;">💉 Vacunas</span>
        <span style="font-size: 0.75rem; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.1); padding: 0.25rem 0.5rem; border-radius: 12px;">${upcomingVaccines.length} pendientes</span>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
        ${upcomingVaccines.slice(0, 3).map(v => {
          const isOverdue = v.nextDose && new Date(v.nextDose) < new Date();
          return `
            <div class="glass-card" style="padding: 1rem; display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="width: 40px; height: 40px; background: ${isOverdue ? 'rgba(255,107,107,0.2)' : 'rgba(139,92,246,0.2)'}; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">💉</div>
                <div>
                  <div style="font-weight: 600; font-size: 0.95rem; color: white;">${v.name}</div>
                  <div style="font-size: 0.75rem; color: ${isOverdue ? '#ff6b6b' : 'rgba(255,255,255,0.6)'};">
                    ${v.lastDose ? `Última: ${new Date(v.lastDose).toLocaleDateString('es-MX')}` : 'Nunca aplicada'}
                  </div>
                </div>
              </div>
              <button onclick="showVaccineModal('${v.id}')" style="background: ${isOverdue ? 'rgba(255,107,107,0.3)' : 'rgba(139,92,246,0.3)'}; color: ${isOverdue ? '#ff6b6b' : '#a78bfa'}; border: 1px solid ${isOverdue ? 'rgba(255,107,107,0.4)' : 'rgba(139,92,246,0.4)'}; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.8rem; font-weight: 500; cursor: pointer;">
                ${isOverdue ? '¡Vencida!' : v.nextDose ? 'Registrar' : 'Aplicar'}
              </button>
            </div>
          `;
        }).join('')}
        ${vaccines.length > 3 ? `
          <button onclick="showAllVaccines()" style="padding: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: rgba(255,255,255,0.8); font-size: 0.85rem; cursor: pointer;">Ver todas las vacunas →</button>
        ` : ''}
      </div>
    </div>

    <!-- Medical Exams Section - Glass Cards -->
    <div style="padding: 0 1rem 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600; color: white;">🔬 Estudios Médicos</span>
        <button onclick="showExamModal()" style="background: rgba(0,168,232,0.3); color: #00a8e8; border: 1px solid rgba(0,168,232,0.4); padding: 0.4rem 0.75rem; border-radius: 20px; font-size: 0.75rem; cursor: pointer;">+ Agregar</button>
      </div>
      
      ${upcomingExams.length > 0 ? `
        <div class="glass-card" style="padding: 1rem; margin-bottom: 1rem; border-left: 3px solid #f59e0b;">
          <div style="font-weight: 600; color: #fbbf24; margin-bottom: 0.5rem;">📅 Próximos estudios recomendados:</div>
          ${upcomingExams.slice(0, 3).map(e => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <div>
                <div style="font-size: 0.9rem; color: white;">${e.name}</div>
                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">${e.description.substring(0, 50)}...</div>
              </div>
              <button onclick="showExamModal('${e.id}')" style="background: rgba(245,158,11,0.2); color: #fbbf24; border: none; padding: 0.4rem 0.75rem; border-radius: 8px; font-size: 0.75rem; cursor: pointer;">Programar</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <!-- Recent Exam Results - Glass Cards -->
      ${userExams.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 0.6rem;">
          <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); font-weight: 500;">Resultados recientes:</div>
          ${userExams.slice(-3).reverse().map(e => `
            <div class="glass-card" style="padding: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                  <div style="font-weight: 600; font-size: 0.95rem; color: white;">${e.examName}</div>
                  <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">${new Date(e.date).toLocaleDateString('es-MX')}</div>
                  ${e.results ? `<div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-top: 0.25rem;">${e.results.substring(0, 60)}${e.results.length > 60 ? '...' : ''}</div>` : ''}
                </div>
                ${e.file ? `<span style="font-size: 1.2rem; margin-left: 0.5rem;">📄</span>` : ''}
              </div>
            </div>
          `).join('')}
          <button onclick="showAllExams()" style="padding: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: rgba(255,255,255,0.8); font-size: 0.85rem; cursor: pointer;">Ver historial completo →</button>
        </div>
      ` : `
        <div class="glass-card" style="text-align: center; padding: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">📁</div>
          <div style="font-size: 0.9rem; color: white;">No tienes estudios registrados</div>
          <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); margin-top: 0.5rem;">Agrega tus resultados para llevar un historial</div>
        </div>
      `}
    </div>

    <!-- Health Guides - Horizontal Scroll -->
    <div style="padding: 0 0 1rem;">
      <div style="padding: 0 1rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600;">📚 Guías de Salud</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">Desliza →</span>
      </div>
      
      <div style="display: flex; gap: 0.75rem; overflow-x: auto; padding: 0 1rem; scrollbar-width: none; -webkit-overflow-scrolling: touch;">
        <style>
          .health-guides::-webkit-scrollbar { display: none; }
        </style>
        ${healthGuides.map(guide => `
          <div onclick="showHealthGuide('${guide.id}')" style="flex: 0 0 280px; background: linear-gradient(135deg, ${guide.color}, ${guide.colorDark}); border-radius: 16px; padding: 1.25rem; color: white; cursor: pointer;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">${guide.icon}</div>
            <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem;">${guide.title}</div>
            <div style="font-size: 0.85rem; opacity: 0.9; line-height: 1.4;">${guide.description}</div>
            <div style="margin-top: 0.75rem; font-size: 0.75rem; opacity: 0.8; background: rgba(255,255,255,0.2); padding: 0.25rem 0.5rem; border-radius: 20px; display: inline-block;">${guide.tag}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Medical History Summary - Glass Card -->
    <div style="padding: 0 1rem 2rem;">
      <div class="glass-card" style="flex-direction: column; padding: 1.25rem; background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
          <div style="font-size: 2rem;">📂</div>
          <div>
            <div style="font-weight: 600; color: white;">Expediente Médico Digital</div>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Tu historial completo en un solo lugar</div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; text-align: center;">
          <div style="background: rgba(255,255,255,0.08); padding: 0.75rem; border-radius: 12px;">
            <div style="font-size: 1.25rem; font-weight: 700; color: #c0c0c0;">${prescriptions.length}</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6);">Recetas</div>
          </div>
          <div style="background: rgba(255,255,255,0.08); padding: 0.75rem; border-radius: 12px;">
            <div style="font-size: 1.25rem; font-weight: 700; color: #c0c0c0;">${vaccines.filter(v => v.lastDose).length}</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6);">Vacunas</div>
          </div>
          <div style="background: rgba(255,255,255,0.08); padding: 0.75rem; border-radius: 12px;">
            <div style="font-size: 1.25rem; font-weight: 700; color: #c0c0c0;">${userExams.length}</div>
            <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6);">Estudios</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Get personalized health guides based on profile
function getHealthGuides(profile) {
  const guides = [
    {
      id: 'nutrition',
      icon: '🥗',
      title: 'Nutrición Balanceada',
      description: 'Aprende a crear comidas equilibradas con los macros correctos para tus objetivos.',
      tag: 'General',
      color: '#00A86B',
      colorDark: '#008855'
    },
    {
      id: 'sleep',
      icon: '😴',
      title: 'Higiene del Sueño',
      description: 'Mejora la calidad de tu descanso con estos hábitos nocturnos.',
      tag: 'Bienestar',
      color: '#6366f1',
      colorDark: '#4f46e5'
    },
    {
      id: 'hydration',
      icon: '💧',
      title: 'Hidratación',
      description: 'Descubre por qué el agua es crucial y cómo mantenerte hidratado.',
      tag: 'General',
      color: '#0ea5e9',
      colorDark: '#0284c7'
    },
    {
      id: 'stress',
      icon: '🧘',
      title: 'Manejo del Estrés',
      description: 'Técnicas de respiración y mindfulness para reducir la ansiedad.',
      tag: 'Mental',
      color: '#8b5cf6',
      colorDark: '#7c3aed'
    }
  ];
  
  // Add age-specific guides
  if (profile && profile.birthdate) {
    const age = Math.floor((new Date() - new Date(profile.birthdate)) / (365.25 * 24 * 60 * 60 * 1000));
    
    if (age >= 50) {
      guides.push({
        id: 'bone_health',
        icon: '🦴',
        title: 'Salud Ósea',
        description: 'Previene la osteoporosis con ejercicio, calcio y vitamina D.',
        tag: '50+ años',
        color: '#f59e0b',
        colorDark: '#d97706'
      });
      guides.push({
        id: 'heart_health',
        icon: '❤️',
        title: 'Salud Cardiovascular',
        description: 'Monitorea tu presión arterial y colesterol regularmente.',
        tag: '50+ años',
        color: '#ef4444',
        colorDark: '#dc2626'
      });
    }
    
    if (profile.gender === 'female' && age >= 40) {
      guides.push({
        id: 'breast_health',
        icon: '🎀',
        title: 'Salud Mamaria',
        description: 'Importancia de la autoexploración y mastografías regulares.',
        tag: 'Mujeres 40+',
        color: '#ec4899',
        colorDark: '#db2777'
      });
    }
    
    if (profile.gender === 'male' && age >= 50) {
      guides.push({
        id: 'prostate',
        icon: '🏥',
        title: 'Salud Prostática',
        description: 'Detección temprana y prevención del cáncer de próstata.',
        tag: 'Hombres 50+',
        color: '#14b8a6',
        colorDark: '#0d9488'
      });
    }
  }
  
  // Add guides for active people
  guides.push({
    id: 'exercise_recovery',
    icon: '💪',
    title: 'Recuperación Muscular',
    description: 'Descansa adecuadamente y evita lesiones con estos consejos.',
    tag: 'Actividad',
    color: '#22c55e',
    colorDark: '#16a34a'
  });
  
  return guides;
}

// ============================================
// PRESCRIPTION & MEDICINE FUNCTIONS
// ============================================

window.showPrescriptionScanner = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.9); display: flex; flex-direction: column; z-index: 1000;';
  modal.innerHTML = `
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; color: white;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">📸</div>
      <h2 style="margin: 0 0 0.5rem; font-size: 1.5rem;">Escanear Receta</h2>
      <p style="margin: 0 0 2rem; opacity: 0.8; text-align: center;">Enfoca la receta dentro del cuadro</p>
      
      <!-- Camera Frame -->
      <div style="width: 280px; height: 380px; border: 3px solid #00A86B; border-radius: 20px; position: relative; margin-bottom: 2rem;">
        <div style="position: absolute; top: 20px; left: 20px; width: 30px; height: 30px; border-top: 4px solid #00A86B; border-left: 4px solid #00A86B;"></div>
        <div style="position: absolute; top: 20px; right: 20px; width: 30px; height: 30px; border-top: 4px solid #00A86B; border-right: 4px solid #00A86B;"></div>
        <div style="position: absolute; bottom: 20px; left: 20px; width: 30px; height: 30px; border-bottom: 4px solid #00A86B; border-left: 4px solid #00A86B;"></div>
        <div style="position: absolute; bottom: 20px; right: 20px; width: 30px; height: 30px; border-bottom: 4px solid #00A86B; border-right: 4px solid #00A86B;"></div>
        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0.3;">
          <div style="font-size: 6rem;">📝</div>
        </div>
      </div>
      
      <div style="display: flex; gap: 1rem;">
        <button onclick="this.closest('.modal-overlay').remove()" style="padding: 1rem 2rem; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 12px; font-size: 1rem; cursor: pointer;">Cancelar</button>
        <button onclick="simulatePrescriptionScan()" style="padding: 1rem 2rem; background: #00A86B; color: white; border: none; border-radius: 50%; width: 70px; height: 70px; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">📷</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// Simulated prescription scanning (would use OCR in real app)
window.simulatePrescriptionScan = function() {
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; color: white;">
      <div style="font-size: 3rem; margin-bottom: 1rem; animation: pulse 1s infinite;">🔍</div>
      <h2 style="margin: 0;">Analizando receta...</h2>
      <p style="opacity: 0.8;">Detectando medicamentos</p>
    </div>
  `;
  
  setTimeout(() => {
    // Simulate detected prescription
    const detectedMeds = [
      { medicine: 'Paracetamol', dose: '500mg', frequency: 'Cada 8 horas', confidence: 95 },
      { medicine: 'Amoxicilina', dose: '500mg', frequency: 'Cada 12 horas', confidence: 88 }
    ];
    
    showDetectedPrescriptions(detectedMeds);
  }, 2000);
};

window.showDetectedPrescriptions = function(medicines) {
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px 20px 0 0; width: 100%; max-width: 400px; margin-top: auto; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #003366, #00A86B); color: white;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">✅</div>
        <h3 style="margin: 0;">Medicamentos Detectados</h3>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.85rem;">Revisa y confirma la información</p>
      </div>
      
      <div style="padding: 1rem;">
        ${medicines.map((med, idx) => `
          <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; border: 2px solid #e2e8f0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <div style="font-weight: 600; font-size: 1.1rem; color: #003366;">${med.medicine}</div>
              <div style="background: #00A86B; color: white; padding: 0.25rem 0.5rem; border-radius: 20px; font-size: 0.7rem;">${med.confidence}% confianza</div>
            </div>
            
            <div style="display: grid; gap: 0.75rem;">
              <div>
                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Dosis</label>
                <input type="text" id="med-dose-${idx}" value="${med.dose}" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px;">
              </div>
              <div>
                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Frecuencia</label>
                <select id="med-freq-${idx}" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px;">
                  <option ${med.frequency.includes('8') ? 'selected' : ''}>Cada 8 horas</option>
                  <option ${med.frequency.includes('12') ? 'selected' : ''}>Cada 12 horas</option>
                  <option ${med.frequency.includes('24') ? 'selected' : ''}>Una vez al día</option>
                  <option ${med.frequency.includes('comida') ? 'selected' : ''}>Con las comidas</option>
                  <option>Otra</option>
                </select>
              </div>
              <div>
                <label style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Instrucciones</label>
                <input type="text" id="med-instr-${idx}" placeholder="Tomar con comida, etc." style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px;">
              </div>
            </div>
          </div>
        `).join('')}
        
        <div class="modal-actions-sticky" style="margin-top: 1rem;">
          <button onclick="showPrescriptionScanner()" class="btn-modal-secondary">↻ Reescanear</button>
          <button onclick="saveDetectedPrescriptions(${medicines.length})" class="btn-modal-primary">Guardar</button>
        </div>
      </div>
    </div>
  `;
};

window.saveDetectedPrescriptions = function(count) {
  for (let i = 0; i < count; i++) {
    const medicine = document.querySelector(`[id^="med-dose-${i}"]`)?.closest('div').querySelector('.font-weight\\:600')?.textContent || `Medicamento ${i + 1}`;
    const dose = document.getElementById(`med-dose-${i}`)?.value;
    const frequency = document.getElementById(`med-freq-${i}`)?.value;
    const instructions = document.getElementById(`med-instr-${i}`)?.value;
    
    Store.addPrescription({
      medicine,
      dose,
      frequency,
      instructions,
      source: 'scan'
    });
  }
  
  document.querySelector('.modal-overlay')?.remove();
  renderSalud();
  showToast(`${count} medicamento(s) guardado(s)`, 'success');
};

window.showManualPrescriptionModal = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">💊</div>
        <h3 style="margin: 0;">Agregar Medicamento</h3>
      </div>
      
      <div style="padding: 1.5rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Nombre del medicamento</label>
          <input type="text" id="manual-med-name" placeholder="Ej: Paracetamol" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
          <div>
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Dosis</label>
            <input type="text" id="manual-med-dose" placeholder="500mg" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px;">
          </div>
          <div>
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Frecuencia</label>
            <select id="manual-med-freq" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px;">
              <option>Cada 8 horas</option>
              <option>Cada 12 horas</option>
              <option>Una vez al día</option>
              <option>Con las comidas</option>
              <option>Solo cuando sea necesario</option>
            </select>
          </div>
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Instrucciones (opcional)</label>
          <input type="text" id="manual-med-instr" placeholder="Tomar con comida, etc." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px;">
        </div>
        
        <div class="modal-actions-sticky">
          <button onclick="this.closest('.modal-overlay').remove()" class="btn-modal-secondary">Cancelar</button>
          <button onclick="saveManualPrescription()" class="btn-modal-primary">Guardar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveManualPrescription = async function() {
  const name = document.getElementById('manual-med-name')?.value?.trim();
  const dose = document.getElementById('manual-med-dose')?.value?.trim();
  const frequency = document.getElementById('manual-med-freq')?.value;
  const instructions = document.getElementById('manual-med-instr')?.value?.trim();
  
  if (!name) {
    alert('Por favor ingresa el nombre del medicamento');
    return;
  }
  
  let useSupabase = false;
  
  if (FarmaciaAPI.isSupabaseAvailable() && currentAuthUser) {
    try {
      const { data, error } = await FarmaciaAPI.uploadPrescription({
        medicine: name,
        dose: dose || 'No especificada',
        notes: `${name} ${dose || ''} - ${frequency || ''} - ${instructions || ''}`
      });
      if (!error && data) {
        useSupabase = true;
        console.log('[uploadPrescription] Supabase document uploaded');
      } else {
        throw error || new Error('Unknown error');
      }
    } catch (e) {
      console.warn('[uploadPrescription] Supabase failed, falling back:', e.message);
    }
  }
  
  if (!useSupabase) {
    Store.addPrescription({
      medicine: name,
      dose: dose || 'No especificada',
      frequency: frequency,
      instructions: instructions || '',
      source: 'manual'
    });
    console.log('[uploadPrescription] Fallback localStorage prescription created');
  }
  
  document.querySelector('.modal-overlay')?.remove();
  renderSalud();
  showToast(useSupabase ? 'Medicamento guardado en el sistema' : 'Medicamento guardado', 'success');
};

window.deletePrescription = function(id) {
  if (confirm('¿Eliminar esta receta?')) {
    Store.deletePrescription(id);
    renderSalud();
  }
};

window.showReminderModal = function(prescriptionId) {
  const prescription = Store.getPrescriptions().find(p => p.id === prescriptionId);
  if (!prescription) return;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 340px; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">⏰</div>
        <h3 style="margin: 0;">Configurar Recordatorios</h3>
        <p style="color: var(--text-muted); margin: 0.5rem 0 0; font-size: 0.9rem;">${prescription.medicine}</p>
        <p style="color: #003366; font-size: 0.8rem; margin-top: 0.25rem;">${prescription.frequency}</p>
      </div>
      
      <div style="padding: 1.5rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Primera toma</label>
          <input type="time" id="reminder-start-time" value="08:00" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1.2rem; text-align: center;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">¿Por cuántos días?</label>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${[3, 5, 7, 10, 14].map(days => `
              <button class="duration-btn" data-days="${days}" style="flex: 1; min-width: 50px; padding: 0.5rem; border: 2px solid var(--border-color); background: white; border-radius: 10px; cursor: pointer; font-size: 0.85rem;">${days}</button>
            `).join('')}
            <button class="duration-btn" data-days="30" style="flex: 1; min-width: 50px; padding: 0.5rem; border: 2px solid var(--border-color); background: white; border-radius: 10px; cursor: pointer; font-size: 0.85rem;">30</button>
          </div>
          <input type="number" id="custom-duration" placeholder="Otro..." style="width: 100%; margin-top: 0.5rem; padding: 0.625rem; border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.9rem;">
        </div>
        
        <div id="schedule-preview" style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; display: none;">
          <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem;">Horarios calculados:</div>
          <div id="schedule-times" style="display: flex; flex-wrap: wrap; gap: 0.5rem;"></div>
        </div>
        
        <button onclick="saveSmartReminder(${prescriptionId})" class="btn-modal-primary" style="width: 100%;">Crear Recordatorios</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Duration selection
  modal.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      modal.querySelectorAll('.duration-btn').forEach(b => {
        b.style.background = 'white';
        b.style.borderColor = 'var(--border-color)';
        b.style.color = 'inherit';
      });
      this.style.background = '#003366';
      this.style.borderColor = '#003366';
      this.style.color = 'white';
      document.getElementById('custom-duration').value = '';
      updateSchedulePreview();
    });
  });
  
  // Custom duration
  document.getElementById('custom-duration').addEventListener('input', function() {
    modal.querySelectorAll('.duration-btn').forEach(b => {
      b.style.background = 'white';
      b.style.borderColor = 'var(--border-color)';
      b.style.color = 'inherit';
    });
    updateSchedulePreview();
  });
  
  // Start time change
  document.getElementById('reminder-start-time').addEventListener('change', updateSchedulePreview);
  
  function updateSchedulePreview() {
    const startTime = document.getElementById('reminder-start-time').value;
    const selectedBtn = modal.querySelector('.duration-btn[style*="background: rgb(0, 51, 102)"]');
    const customDuration = document.getElementById('custom-duration').value;
    const duration = customDuration || (selectedBtn ? selectedBtn.dataset.days : 7);
    
    const times = calculateDoseTimes(startTime, prescription.frequency, duration);
    
    const previewDiv = document.getElementById('schedule-preview');
    const timesDiv = document.getElementById('schedule-times');
    
    if (times.length > 0) {
      previewDiv.style.display = 'block';
      timesDiv.innerHTML = times.slice(0, 8).map(t => `
        <span style="background: #003366; color: white; padding: 0.375rem 0.75rem; border-radius: 20px; font-size: 0.8rem;">${t}</span>
      `).join('') + (times.length > 8 ? `<span style="color: var(--text-muted); font-size: 0.8rem;">+${times.length - 8} más</span>` : '');
    }
  }
};

// Calculate all dose times based on frequency
function calculateDoseTimes(startTime, frequency, durationDays) {
  const times = [];
  const [hours, minutes] = startTime.split(':').map(Number);
  
  // Parse frequency to get interval in hours
  let intervalHours = 8; // default
  
  const freqLower = frequency.toLowerCase();
  if (freqLower.includes('8') || freqLower.includes('8 horas')) {
    intervalHours = 8;
  } else if (freqLower.includes('12') || freqLower.includes('12 horas')) {
    intervalHours = 12;
  } else if (freqLower.includes('24') || freqLower.includes('24 horas') || freqLower.includes('día') || freqLower.includes('dia')) {
    intervalHours = 24;
  } else if (freqLower.includes('6') || freqLower.includes('6 horas')) {
    intervalHours = 6;
  } else if (freqLower.includes('4') || freqLower.includes('4 horas')) {
    intervalHours = 4;
  } else if (freqLower.includes('2 veces') || freqLower.includes('dos veces') || freqLower.includes('2x') || freqLower.includes('2 x')) {
    intervalHours = 12;
  } else if (freqLower.includes('3 veces') || freqLower.includes('tres veces') || freqLower.includes('3x') || freqLower.includes('3 x')) {
    intervalHours = 8;
  } else if (freqLower.includes('4 veces') || freqLower.includes('cuatro veces') || freqLower.includes('4x') || freqLower.includes('4 x')) {
    intervalHours = 6;
  }
  
  // Generate times for each day
  const dosesPerDay = Math.ceil(24 / intervalHours);
  const totalDoses = dosesPerDay * parseInt(durationDays);
  
  let currentHour = hours;
  let currentMinute = minutes;
  
  for (let i = 0; i < totalDoses; i++) {
    const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    times.push(timeStr);
    
    // Add interval
    currentHour += intervalHours;
    if (currentHour >= 24) {
      currentHour -= 24;
    }
  }
  
  return times;
}

window.saveSmartReminder = function(prescriptionId) {
  const prescription = Store.getPrescriptions().find(p => p.id === prescriptionId);
  const startTime = document.getElementById('reminder-start-time')?.value;
  
  const selectedBtn = document.querySelector('.duration-btn[style*="background: rgb(0, 51, 102)"]');
  const customDuration = document.getElementById('custom-duration')?.value;
  const durationDays = parseInt(customDuration) || (selectedBtn ? parseInt(selectedBtn.dataset.days) : 7);
  
  if (!startTime) {
    alert('Por favor selecciona la hora de la primera toma');
    return;
  }
  
  // Calculate all dose times
  const doseTimes = calculateDoseTimes(startTime, prescription.frequency, durationDays);
  
  // Create a schedule with all doses
  const schedule = {
    prescriptionId,
    medicine: prescription.medicine,
    dose: prescription.dose,
    startTime,
    durationDays,
    frequency: prescription.frequency,
    doses: doseTimes.map((time, index) => ({
      id: Date.now() + index,
      time,
      day: Math.floor(index * (24 / doseTimes.length * parseInt(prescription.frequency.match(/\d+/) || 8)) / 24),
      taken: false,
      skipped: false
    }))
  };
  
  Store.addMedicineSchedule(schedule);
  
  // Schedule notifications for this medication
  NotificationManager.scheduleAllDoses(schedule).then(() => {
    console.log('Notifications scheduled for', schedule.medicine);
  });
  
  document.querySelector('.modal-overlay')?.remove();
  renderSalud();
  showToast(`${doseTimes.length} recordatorios creados`, 'success');
};

window.toggleReminder = function(id) {
  Store.toggleMedicineReminder(id);
  renderSalud();
};

window.markDoseTaken = function(scheduleId, doseId) {
  Store.markDoseTaken(scheduleId, doseId);
  renderSalud();
};

window.markDoseSkipped = function(scheduleId, doseId) {
  Store.markDoseSkipped(scheduleId, doseId);
  renderSalud();
};

window.deleteSchedule = function(scheduleId) {
  if (confirm('¿Eliminar este tratamiento y todos sus recordatorios?')) {
    Store.deleteSchedule(scheduleId);
    // Cancel any pending notifications for this schedule
    NotificationManager.cancelScheduleNotifications(scheduleId);
    renderSalud();
  }
};

// Notification Settings Modal
window.showNotificationSettings = function() {
  const status = NotificationManager.getStatus();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); text-align: center;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🔔</div>
        <h3 style="margin: 0;">Notificaciones</h3>
        <p style="color: var(--text-muted); margin: 0.5rem 0 0; font-size: 0.9rem;">
          ${status.supported 
            ? status.permission === 'granted' 
              ? 'Las notificaciones están activadas' 
              : status.permission === 'denied'
                ? 'Las notificaciones están bloqueadas'
                : 'Activa las notificaciones para recibir recordatorios'
            : 'Tu navegador no soporta notificaciones'
          }
        </p>
      </div>
      
      <div style="padding: 1.5rem;">
        ${!status.supported ? `
          <div style="background: #fee2e2; color: #dc2626; padding: 1rem; border-radius: 12px; text-align: center;">
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⚠️</div>
            <div>Tu navegador no soporta notificaciones</div>
          </div>
        ` : status.permission === 'denied' ? `
          <div style="background: #fef3c7; color: #92400e; padding: 1rem; border-radius: 12px; text-align: center;">
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">⚠️</div>
            <div>Has bloqueado las notificaciones. Para activarlas, ve a la configuración de tu navegador.</div>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <button onclick="${status.permission === 'granted' ? 'disableNotifications()' : 'enableNotificationsFromSettings()'}" 
              style="width: 100%; padding: 1rem; background: ${status.permission === 'granted' ? '#fee2e2' : '#003366'}; color: ${status.permission === 'granted' ? '#dc2626' : 'white'}; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">
              ${status.permission === 'granted' ? '🔕 Desactivar notificaciones' : '🔔 Activar notificaciones'}
            </button>
            
            ${status.permission === 'granted' ? `
              <button onclick="testNotification()" style="width: 100%; padding: 1rem; background: #f0fdf4; color: #00A86B; border: 2px solid #00A86B; border-radius: 12px; font-weight: 600; cursor: pointer;">
                🔔 Probar notificación
              </button>
            ` : ''}
          </div>
        `}
        
        <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
          <div style="font-size: 0.8rem; color: var(--text-muted); text-align: center;">
            <div style="font-weight: 600; margin-bottom: 0.5rem;">¿Qué notificaciones recibirás?</div>
            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
              <div>💊 Recordatorios de medicamentos</div>
              <div>📦 Estado de pedidos</div>
              <div>🩺 Citas médicas programadas</div>
            </div>
          </div>
        </div>
      </div>
      
      <div style="padding: 1rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.875rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer;">Cerrar</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

window.enableNotificationsFromSettings = async function() {
  const granted = await NotificationManager.requestPermission();
  if (granted) {
    // Schedule notifications for existing schedules
    const schedules = Store.getMedicineSchedules();
    for (const schedule of schedules) {
      if (schedule.active) {
        await NotificationManager.scheduleAllDoses(schedule);
      }
    }
    document.querySelector('.modal-overlay').remove();
    renderSettings();
    showToast('Notificaciones activadas', 'success');
  } else {
    showToast('No se pudieron activar las notificaciones. Verifica los permisos de tu navegador.', 'error');
  }
};

window.disableNotifications = function() {
  // Note: We can't actually disable notifications programmatically
  // User has to do it in browser settings
  showToast('Para desactivar notificaciones, ve a Configuración de tu navegador > Privacidad > Notificaciones.', 'info');
};

window.testNotification = function() {
  NotificationManager.showTestNotification();
};

// ============================================
// REFILL REQUEST FUNCTIONS
// ============================================

window.showRefillRequestModal = function(prescriptionId) {
  const prescription = Store.getPrescriptions().find(p => p.id === prescriptionId);
  if (!prescription) return;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔄</div>
        <h3 style="margin: 0;">Solicitar Recarga</h3>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.9rem;">${prescription.medicine}</p>
      </div>
      
      <div style="padding: 1.5rem;">
        <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.25rem;">Medicamento</div>
          <div style="font-weight: 600;">${prescription.medicine}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">${prescription.dose}</div>
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Cantidad solicitada</label>
          <select id="refill-quantity" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
            <option value="1">1 caja/unidad</option>
            <option value="2" selected>2 cajas/unidades</option>
            <option value="3">3 cajas/unidades</option>
            <option value="custom">Otra cantidad...</option>
          </select>
        </div>
        
        <div id="custom-quantity-container" style="margin-bottom: 1rem; display: none;">
          <input type="number" id="refill-custom-quantity" placeholder="Especifica la cantidad" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px;">
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Farmacia para recoger</label>
          <select id="refill-pharmacy" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
            <option value="polanco">Farmacia Apollo - Polanco (Masaryk 456)</option>
            <option value="condesa">Farmacia Apollo - Condesa (Av. México 123)</option>
            <option value="santafe">Farmacia Apollo - Santa Fe (Centro Comercial)</option>
            <option value="delivery">Entrega a domicilio</option>
          </select>
        </div>
        
        <div style="background: #fef3c7; border-radius: 10px; padding: 0.875rem; margin-bottom: 1.5rem;">
          <div style="font-size: 0.8rem; color: #92400e;">
            <strong>Nota:</strong> La farmacia revisará tu solicitud. Recibirás una notificación cuando esté lista para recoger.
          </div>
        </div>
        
        <div class="modal-actions-sticky">
          <button onclick="this.closest('.modal-overlay').remove()" class="btn-modal-secondary">Cancelar</button>
          <button onclick="submitRefillRequest(${prescriptionId})" class="btn-modal-primary">Solicitar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Show/hide custom quantity input
  document.getElementById('refill-quantity').addEventListener('change', function() {
    const customContainer = document.getElementById('custom-quantity-container');
    customContainer.style.display = this.value === 'custom' ? 'block' : 'none';
  });
};

window.submitRefillRequest = async function(prescriptionId) {
  const prescription = Store.getPrescriptions().find(p => p.id === prescriptionId);
  const quantitySelect = document.getElementById('refill-quantity').value;
  const customQuantity = document.getElementById('refill-custom-quantity')?.value;
  const pharmacy = document.getElementById('refill-pharmacy').value;
  
  const quantity = quantitySelect === 'custom' ? customQuantity : quantitySelect;
  
  if (!quantity || quantity < 1) {
    alert('Por favor ingresa una cantidad válida');
    return;
  }
  
  const pharmacyNames = {
    polanco: 'Farmacia Apollo - Polanco',
    condesa: 'Farmacia Apollo - Condesa',
    santafe: 'Farmacia Apollo - Santa Fe',
    delivery: 'Entrega a domicilio'
  };
  
  let request = null;
  let useSupabase = false;
  
  // Try Supabase if authenticated
  if (FarmaciaAPI.isSupabaseAvailable() && currentAuthUser) {
    try {
      const { data, error } = await FarmaciaAPI.requestRefill({
        medicine: prescription.medicine,
        quantity: parseInt(quantity),
        notes: `${prescription.medicine} ${prescription.dose || ''} - ${pharmacyNames[pharmacy]}`,
        inventoryId: null
      });
      if (!error && data) {
        request = data;
        useSupabase = true;
        console.log('[requestRefill] Supabase preorder created');
      } else {
        throw error || new Error('Unknown error');
      }
    } catch (e) {
      console.warn('[requestRefill] Supabase failed, falling back:', e.message);
    }
  }
  
  if (!request) {
    request = Store.requestRefill({
      prescriptionId,
      medicine: prescription.medicine,
      dose: prescription.dose,
      quantity: parseInt(quantity),
      pharmacyLocation: pharmacy,
      pharmacyName: pharmacyNames[pharmacy],
      requestedAt: new Date().toISOString()
    });
    console.log('[requestRefill] Fallback localStorage refill created');
  }
  
  document.querySelector('.modal-overlay').remove();
  renderSalud();
  showToast(useSupabase
    ? `Solicitud enviada al sistema — Número: ${request.id}`
    : `Solicitud enviada — Número: ${request.id}`,
    'success'
  );
};

window.showRefillStatus = function(requestId) {
  const request = Store.getRefillRequests().find(r => r.id === requestId);
  if (!request) return;
  
  const statusColors = {
    pending: { bg: '#fef3c7', color: '#92400e', text: 'Pendiente' },
    confirmed: { bg: '#dbeafe', color: '#1e40af', text: 'Confirmada' },
    ready: { bg: '#d1fae5', color: '#15803d', text: 'Lista para recoger' },
    completed: { bg: '#f3f4f6', color: '#6b7280', text: 'Completada' },
    cancelled: { bg: '#fee2e2', color: '#dc2626', text: 'Cancelada' }
  };
  
  const status = statusColors[request.status] || statusColors.pending;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📋</div>
        <h3 style="margin: 0;">Estado de Solicitud</h3>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.9rem;">${request.id}</p>
      </div>
      
      <div style="padding: 1.5rem;">
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="display: inline-block; background: ${status.bg}; color: ${status.color}; padding: 0.5rem 1.5rem; border-radius: 20px; font-weight: 600; font-size: 1rem;">
            ${request.statusText || status.text}
          </div>
        </div>
        
        <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
          <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Medicamento</div>
            <div style="font-weight: 600;">${request.medicine}</div>
          </div>
          <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Dosis</div>
            <div>${request.dose}</div>
          </div>
          <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.75rem; color: var(--text-muted);">Cantidad solicitada</div>
            <div>${request.quantity} caja(s)</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Farmacia</div>
            <div>${request.pharmacyName}</div>
          </div>
        </div>
        
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.5rem;">
          <div>Solicitado: ${new Date(request.createdAt).toLocaleDateString('es-MX')}</div>
          ${request.status === 'ready' ? '<div style="color: #00A86B; font-weight: 600; margin-top: 0.5rem;">✓ Tu pedido está listo para recoger</div>' : ''}
        </div>
        
        ${request.status === 'pending' ? `
          <button onclick="cancelRefillRequest('${request.id}')" style="width: 100%; padding: 0.875rem; background: #fee2e2; color: #dc2626; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">
            Cancelar solicitud
          </button>
        ` : ''}
        
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.875rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer; margin-top: 0.5rem;">
          Cerrar
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.cancelRefillRequest = function(requestId) {
  if (confirm('¿Cancelar esta solicitud de recarga?')) {
    Store.cancelRefillRequest(requestId);
    document.querySelector('.modal-overlay').remove();
    renderSalud();
    showToast('Solicitud cancelada', 'info');
  }
};

// ============================================
// VACCINES FUNCTIONS
// ============================================

window.showVaccineModal = function(vaccineId) {
  const vaccines = Store.getVaccines();
  const vaccine = vaccines.find(v => v.id === vaccineId);
  if (!vaccine) return;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #00A86B, #008855); color: white;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">💉</div>
        <h3 style="margin: 0;">${vaccine.name}</h3>
      </div>
      
      <div style="padding: 1.5rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Fecha de aplicación</label>
          <input type="date" id="vaccine-date" value="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px;">
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Lugar (opcional)</label>
          <input type="text" id="vaccine-location" placeholder="Ej: Hospital General" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px;">
        </div>
        
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.875rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer;">Cancelar</button>
          <button onclick="saveVaccine('${vaccineId}')" style="flex: 1; padding: 0.875rem; background: #00A86B; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Guardar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveVaccine = function(vaccineId) {
  const date = document.getElementById('vaccine-date')?.value;
  const location = document.getElementById('vaccine-location')?.value;
  
  if (!date) {
    alert('Por favor selecciona la fecha');
    return;
  }
  
  // Calculate next dose based on frequency
  const vaccines = Store.getVaccines();
  const vaccine = vaccines.find(v => v.id === vaccineId);
  let nextDose = null;
  
  if (vaccine.frequency === 'annual') {
    nextDose = new Date(date);
    nextDose.setFullYear(nextDose.getFullYear() + 1);
  } else if (vaccine.frequency === '10years') {
    nextDose = new Date(date);
    nextDose.setFullYear(nextDose.getFullYear() + 10);
  } else if (vaccine.frequency === '5years') {
    nextDose = new Date(date);
    nextDose.setFullYear(nextDose.getFullYear() + 5);
  }
  
  Store.updateVaccine(vaccineId, {
    lastDose: date,
    nextDose: nextDose?.toISOString().split('T')[0],
    location
  });
  
  Store.addVaccineRecord({
    vaccineId,
    vaccineName: vaccine.name,
    date,
    location,
    nextDose: nextDose?.toISOString().split('T')[0]
  });
  
  document.querySelector('.modal-overlay')?.remove();
  renderSalud();
  showToast(`${vaccine.name} registrada`, 'success');
};

window.showAllVaccines = function() {
  const vaccines = Store.getVaccines();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 400px; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #00A86B, #008855); color: white;">
        <h3 style="margin: 0;">💉 Todas las Vacunas</h3>
      </div>
      
      <div style="padding: 1rem;">
        ${vaccines.map(v => {
          const isDone = !!v.lastDose;
          const isOverdue = v.nextDose && new Date(v.nextDose) < new Date();
          return `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600;">${v.name}</div>
                <div style="font-size: 0.75rem; color: ${isOverdue ? '#dc2626' : 'var(--text-muted)'};">
                  ${isDone ? `Última: ${new Date(v.lastDose).toLocaleDateString('es-MX')}` : 'No aplicada'}
                </div>
                ${v.nextDose ? `<div style="font-size: 0.75rem; color: var(--text-muted);">Próxima: ${new Date(v.nextDose).toLocaleDateString('es-MX')}</div>` : ''}
              </div>
              <div style="width: 12px; height: 12px; border-radius: 50%; background: ${isDone ? (isOverdue ? '#f59e0b' : '#00A86B') : '#e5e7eb'};"></div>
            </div>
          `;
        }).join('')}
      </div>
      
      <div style="padding: 1rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.875rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer;">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// ============================================
// EXAMS FUNCTIONS
// ============================================

window.showExamModal = function(examId) {
  const templates = Store.getExamTemplates();
  const template = examId ? templates.find(t => t.id === examId) : null;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔬</div>
        <h3 style="margin: 0;">${template ? template.name : 'Agregar Estudio'}</h3>
        ${template ? `<p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">${template.description}</p>` : ''}
      </div>
      
      <div style="padding: 1.5rem;">
        ${!template ? `
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Tipo de estudio</label>
            <select id="exam-type" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px;">
              ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
          </div>
        ` : `<input type="hidden" id="exam-type" value="${examId}">`}
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Fecha del estudio</label>
          <input type="date" id="exam-date" value="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Resultados / Notas</label>
          <textarea id="exam-results" placeholder="Escribe los resultados principales..." style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 8px; min-height: 80px; resize: vertical;"></textarea>
        </div>
        
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Adjuntar archivo (opcional)</label>
          <input type="file" id="exam-file" accept="image/*,.pdf" style="width: 100%; padding: 0.5rem; border: 1px dashed var(--border-color); border-radius: 8px;">
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Imagen o PDF del resultado</div>
        </div>
        
        <div class="modal-actions-sticky">
          <button onclick="this.closest('.modal-overlay').remove()" class="btn-modal-secondary">Cancelar</button>
          <button onclick="saveExamResult()" class="btn-modal-primary">Guardar</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveExamResult = function() {
  const examType = document.getElementById('exam-type')?.value;
  const date = document.getElementById('exam-date')?.value;
  const results = document.getElementById('exam-results')?.value?.trim();
  const fileInput = document.getElementById('exam-file');
  
  if (!examType || !date) {
    alert('Por favor completa los campos requeridos');
    return;
  }
  
  const templates = Store.getExamTemplates();
  const template = templates.find(t => t.id === examType);
  
  // Handle file upload (simplified - in real app would upload to server)
  let fileName = null;
  if (fileInput?.files?.length > 0) {
    fileName = fileInput.files[0].name;
    // In real app: upload file to server and get URL
  }
  
  Store.addExamResult({
    examId: examType,
    examName: template?.name || 'Estudio médico',
    date,
    results,
    file: fileName,
    frequency: template?.frequency
  });
  
  document.querySelector('.modal-overlay')?.remove();
  renderSalud();
  showToast('Estudio guardado', 'success');
};

window.showAllExams = function() {
  const userExams = Store.getUserExams();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 400px; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <h3 style="margin: 0;">🔬 Historial de Estudios</h3>
      </div>
      
      <div style="padding: 1rem;">
        ${userExams.length === 0 ? '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No hay estudios registrados</div>' : ''}
        ${userExams.slice().reverse().map(e => `
          <div style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
              <div style="font-weight: 600;">${e.examName}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${new Date(e.date).toLocaleDateString('es-MX')}</div>
            </div>
            ${e.results ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${e.results}</div>` : ''}
            ${e.file ? `<div style="font-size: 0.75rem; color: var(--primary);">📎 ${e.file}</div>` : ''}
          </div>
        `).join('')}
      </div>
      
      <div style="padding: 1rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.875rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer;">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// ============================================
// HEALTH GUIDES
// ============================================

window.showHealthGuide = function(guideId) {
  const guides = getHealthGuides(Store.getProfile());
  const guide = guides.find(g => g.id === guideId);
  if (!guide) return;
  
  const guideContent = getGuideContent(guideId);
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 400px; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 2rem; background: linear-gradient(135deg, ${guide.color}, ${guide.colorDark}); color: white; text-align: center;">
        <div style="font-size: 4rem; margin-bottom: 0.5rem;">${guide.icon}</div>
        <h2 style="margin: 0; font-size: 1.5rem;">${guide.title}</h2>
        <div style="margin-top: 0.5rem; font-size: 0.8rem; opacity: 0.9; background: rgba(255,255,255,0.2); padding: 0.25rem 0.75rem; border-radius: 20px; display: inline-block;">${guide.tag}</div>
      </div>
      
      <div style="padding: 1.5rem;">
        ${guideContent}
      </div>
      
      <div style="padding: 1rem; border-top: 1px solid var(--border);">
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 1rem; background: ${guide.color}; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Entendido</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

function getGuideContent(guideId) {
  const contents = {
    nutrition: `
      <h3 style="color: #00A86B; margin-bottom: 1rem;">🥗 Nutrición Balanceada</h3>
      <p>Una alimentación equilibrada es fundamental para mantener tu salud y alcanzar tus objetivos de fitness.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Consejos clave:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li>Incluye proteína en cada comida (pollo, pescado, huevos, legumbres)</li>
        <li>Consume 5 porciones de frutas y verduras al día</li>
        <li>Prioriza carbohidratos complejos (avena, arroz integral, quinoa)</li>
        <li>No elimines grasas - elige grasas saludables (aguacate, nueces, aceite de oliva)</li>
        <li>Hidrátate: 8 vasos de agua al día mínimo</li>
      </ul>
      
      <div style="background: #f0fdf4; padding: 1rem; border-radius: 12px; margin-top: 1rem;">
        <strong>💡 Tip:</strong> Usa el 80/20 - come saludable 80% del tiempo y disfruta moderadamente el 20%.
      </div>
    `,
    sleep: `
      <h3 style="color: #6366f1; margin-bottom: 1rem;">😴 Higiene del Sueño</h3>
      <p>Dormir bien es tan importante como comer bien y hacer ejercicio.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Hábitos para mejorar tu sueño:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li>Mantén un horario regular, incluso los fines de semana</li>
        <li>Evita pantallas 1 hora antes de dormir</li>
        <li>Mantén tu habitación fresca, oscura y silenciosa</li>
        <li>Evita cafeína después de las 2 pm</li>
        <li>Establece una rutina de relajación antes de dormir</li>
      </ul>
      
      <div style="background: #eef2ff; padding: 1rem; border-radius: 12px; margin-top: 1rem;">
        <strong>💡 Meta:</strong> Intenta dormir 7-9 horas cada noche para una recuperación óptima.
      </div>
    `,
    hydration: `
      <h3 style="color: #0ea5e9; margin-bottom: 1rem;">💧 Hidratación</h3>
      <p>El agua es esencial para casi todas las funciones de tu cuerpo.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Beneficios de estar hidratado:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li>Mejor concentración y claridad mental</li>
        <li>Piel más saludable</li>
        <li>Mejor digestión</li>
        <li>Menos dolores de cabeza</li>
        <li>Mejor rendimiento físico</li>
      </ul>
      
      <div style="background: #f0f9ff; padding: 1rem; border-radius: 12px; margin-top: 1rem;">
        <strong>💡 Truco:</strong> Lleva una botella de agua contigo siempre. Si sientes hambre, bebe agua primero - a veces confundimos sed con hambre.
      </div>
    `,
    stress: `
      <h3 style="color: #8b5cf6; margin-bottom: 1rem;">🧘 Manejo del Estrés</h3>
      <p>El estrés crónico puede afectar tu salud física y mental.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Técnicas para reducir el estrés:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li><strong>Respiración 4-7-8:</strong> Inhala 4s, mantén 7s, exhala 8s</li>
        <li><strong>Meditación mindfulness:</strong> 5-10 minutos al día</li>
        <li><strong>Ejercicio regular:</strong> Libera endorfinas naturales</li>
        <li><strong>Conexión social:</strong> Habla con amigos o familiares</li>
        <li><strong>Tiempo en naturaleza:</strong> Camina al aire libre</li>
      </ul>
      
      <div style="background: #f5f3ff; padding: 1rem; border-radius: 12px; margin-top: 1rem;">
        <strong>💡 Recuerda:</strong> Está bien pedir ayuda profesional si el estrés se vuelve abrumador.
      </div>
    `,
    bone_health: `
      <h3 style="color: #f59e0b; margin-bottom: 1rem;">🦴 Salud Ósea</h3>
      <p>La osteoporosis es prevenible con los hábitos correctos.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Para huesos fuertes:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li>Consume suficiente calcio (lácteos, vegetales de hoja verde)</li>
        <li>Toma vitamina D (sol moderado o suplementos)</li>
        <li>Haz ejercicio de carga (caminar, pesas)</li>
        <li>Evita el tabaco y limita el alcohol</li>
        <li>Hazte una densitometría ósea después de los 65</li>
      </ul>
    `,
    heart_health: `
      <h3 style="color: #ef4444; margin-bottom: 1rem;">❤️ Salud Cardiovascular</h3>
      <p>El corazón es tu músculo más importante.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Cuida tu corazón:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li>Controla tu presión arterial regularmente</li>
        <li>Monitorea tu colesterol</li>
        <li>Mantén un peso saludable</li>
        <li>Haz ejercicio cardio 150 min/semana</li>
        <li>Reduce el consumo de sodio</li>
      </ul>
    `,
    exercise_recovery: `
      <h3 style="color: #22c55e; margin-bottom: 1rem;">💪 Recuperación Muscular</h3>
      <p>Los músculos crecen durante el descanso, no durante el ejercicio.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Para una buena recuperación:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li>Duerme 7-9 horas cada noche</li>
        <li>Descansa cada grupo muscular 48 horas</li>
        <li>Estira después de entrenar</li>
        <li>Consume proteína post-entreno</li>
        <li>Escucha a tu cuerpo - el dolor agudo no es normal</li>
      </ul>
      
      <div style="background: #f0fdf4; padding: 1rem; border-radius: 12px; margin-top: 1rem;">
        <strong>💡 Importante:</strong> El dolor persistente puede indicar lesión. Consulta a un profesional si necesitas.
      </div>
    `,
    breast_health: `
      <h3 style="color: #ec4899; margin-bottom: 1rem;">🎀 Salud Mamaria</h3>
      <p>La detección temprana salva vidas.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Recomendaciones:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li>Autoexploración mensual después del periodo</li>
        <li>Mastografía anual desde los 40 años</li>
        <li>Conoce tu historial familiar</li>
        <li>Mantén un peso saludable</li>
        <li>Limita el consumo de alcohol</li>
      </ul>
    `,
    prostate: `
      <h3 style="color: #14b8a6; margin-bottom: 1rem;">🏥 Salud Prostática</h3>
      <p>La detección temprana es fundamental.</p>
      
      <h4 style="margin: 1.5rem 0 0.5rem;">Recomendaciones para hombres 50+:</h4>
      <ul style="padding-left: 1.2rem; line-height: 1.8;">
        <li>Examen de próstata anual</li>
        <li>Buena hidratación</li>
        <li>Dieta rica en antioxidantes</li>
        <li>Ejercicio regular</li>
        <li>No ignores síntomas urinarios</li>
      </ul>
    `
  };
  
  return contents[guideId] || '<p>Contenido no disponible</p>';
}


// ============================================
// CONSULTA PAGE - Chat, Video, In-Person
// ============================================

function renderConsulta() {
  const chatHistory = Store.getChatHistory();
  const hasActiveChat = chatHistory.length > 0;
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #00A86B); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem;">👨‍⚕️ Consulta Médica</h2>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">Atención cuando la necesites</p>
        </div>
        <div style="font-size: 2.5rem;">🏥</div>
      </div>
    </div>

    <!-- Main Options - Large Cards -->
    <div style="padding: 1rem;">
      <div style="font-weight: 600; margin-bottom: 1rem; color: var(--text-secondary);">Elige cómo quieres consultar:</div>
      
      <!-- Chat Option -->
      <div onclick="showChatConsulta()" style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-radius: 20px; padding: 1.5rem; margin-bottom: 1rem; cursor: pointer; border: 2px solid #bae6fd; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(14, 165, 233, 0.2)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 3rem;">💬</div>
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 1.2rem; color: #0369a1; margin-bottom: 0.25rem;">Chat Médico</div>
            <div style="font-size: 0.85rem; color: #0ea5e9; line-height: 1.4;">Describe tus síntomas y recibe recomendaciones de medicamentos disponibles</div>
            ${hasActiveChat ? `<div style="margin-top: 0.5rem; font-size: 0.75rem; color: #00A86B; font-weight: 600;">✓ Tienes una consulta activa</div>` : ''}
          </div>
          <div style="font-size: 1.5rem; color: #0ea5e9;">→</div>
        </div>
      </div>
      
      <!-- Video Consultation Option -->
      <div onclick="showVideoConsulta()" style="background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-radius: 20px; padding: 1.5rem; margin-bottom: 1rem; cursor: pointer; border: 2px solid #ddd6fe; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(139, 92, 246, 0.2)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 3rem;">📹</div>
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 1.2rem; color: #5b21b6; margin-bottom: 0.25rem;">Video Consulta</div>
            <div style="font-size: 0.85rem; color: #8b5cf6; line-height: 1.4;">Consulta con un médico por videollamada desde tu casa</div>
            <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-muted);">Disponible 24/7 • Médicos certificados</div>
          </div>
          <div style="font-size: 1.5rem; color: #8b5cf6;">→</div>
        </div>
      </div>
      
      <!-- In-Person Option -->
      <div onclick="showInPersonConsulta()" style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 20px; padding: 1.5rem; margin-bottom: 1rem; cursor: pointer; border: 2px solid #bbf7d0; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(34, 197, 94, 0.2)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 3rem;">🏥</div>
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 1.2rem; color: #15803d; margin-bottom: 0.25rem;">Agendar Cita en Persona</div>
            <div style="font-size: 0.85rem; color: #22c55e; line-height: 1.4;">Visita nuestras sucursales y consulta con un médico</div>
            <div style="margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 0.75rem; background: #00A86B; color: white; padding: 0.25rem 0.5rem; border-radius: 20px;">Tiempo real</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">Ver tiempos de espera</span>
            </div>
          </div>
          <div style="font-size: 1.5rem; color: #22c55e;">→</div>
        </div>
      </div>
    </div>

    <!-- Quick Info -->
    <div style="padding: 0 1rem 2rem;">
      <div class="medicine-card" style="flex-direction: column; padding: 1.25rem; background: #f8fafc;">
        <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">📞 ¿Necesitas ayuda urgente?</div>
        <div style="display: flex; gap: 0.75rem;">
          <a href="tel:555-APOLLO" style="flex: 1; padding: 0.75rem; background: #003366; color: white; text-decoration: none; border-radius: 12px; text-align: center; font-size: 0.9rem;">
            <div style="font-size: 1.25rem; margin-bottom: 0.25rem;">📞</div>
            <div style="font-weight: 600;">Llamar</div>
          </a>
          <button onclick="showEmergencyInfo()" style="flex: 1; padding: 0.75rem; background: #dc2626; color: white; border: none; border-radius: 12px; font-size: 0.9rem; cursor: pointer;">
            <div style="font-size: 1.25rem; margin-bottom: 0.25rem;">🚨</div>
            <div style="font-weight: 600;">Emergencia</div>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// CHAT CONSULTA - Symptom Checker
// ============================================

// Common symptoms to medicine mapping
const SYMPTOM_MEDICINES = {
  dolor_cabeza: {
    name: 'Dolor de cabeza',
    medicines: [
      { name: 'Paracetamol', dose: '500mg', frequency: 'Cada 8 horas', price: 45, type: 'Analgésico' },
      { name: 'Ibuprofeno', dose: '400mg', frequency: 'Cada 8 horas', price: 65, type: 'Antiinflamatorio' },
      { name: 'Aspirina', dose: '500mg', frequency: 'Cada 6-8 horas', price: 35, type: 'Analgésico' }
    ],
    recommendations: ['Descansa en un lugar oscuro', 'Hidrátate bien', 'Aplica compresas frías']
  },
  dolor_estomago: {
    name: 'Dolor de estómago / Malestar',
    medicines: [
      { name: 'Pepto-Bismol', dose: '1 tableta', frequency: 'Cada 4-6 horas', price: 85, type: 'Protector gástrico' },
      { name: 'Omeprazol', dose: '20mg', frequency: 'Una vez al día', price: 55, type: 'Inhibidor de ácido' },
      { name: 'Simeticona', dose: '125mg', frequency: 'Después de comidas', price: 40, type: 'Antigases' }
    ],
    recommendations: ['Evita alimentos picantes', 'Come ligero', 'Toma té de manzanilla']
  },
  congestion: {
    name: 'Congestión nasal / Gripe',
    medicines: [
      { name: 'Descongestionante', dose: '10mg', frequency: 'Cada 12 horas', price: 75, type: 'Descongestionante' },
      { name: 'Loratadina', dose: '10mg', frequency: 'Una vez al día', price: 50, type: 'Antihistamínico' },
      { name: 'Vaporub', dose: 'Aplicar', frequency: '3-4 veces al día', price: 60, type: 'Tópico' }
    ],
    recommendations: ['Inhala vapor', 'Bebe líquidos calientes', 'Descansa']
  },
  tos: {
    name: 'Tos',
    medicines: [
      { name: 'Dextrometorfano', dose: '15mg', frequency: 'Cada 6-8 horas', price: 70, type: 'Antitusivo' },
      { name: 'Ambroxol', dose: '30mg', frequency: '3 veces al día', price: 55, type: 'Expectorante' },
      { name: 'Miel con limón', dose: '1 cucharada', frequency: 'Cada 4 horas', price: 45, type: 'Natural' }
    ],
    recommendations: ['Bebe mucha agua', 'Evita ambientes fríos', 'Usa humidificador']
  },
  fiebre: {
    name: 'Fiebre',
    medicines: [
      { name: 'Paracetamol', dose: '500mg', frequency: 'Cada 6-8 horas', price: 45, type: 'Antipirético' },
      { name: 'Ibuprofeno', dose: '400mg', frequency: 'Cada 8 horas', price: 65, type: 'Antipirético' }
    ],
    recommendations: ['Descansa', 'Hidrátate', 'Baño tibio si es necesario']
  },
  dolor_muscular: {
    name: 'Dolor muscular / Articular',
    medicines: [
      { name: 'Ibuprofeno', dose: '400mg', frequency: 'Cada 8 horas', price: 65, type: 'Antiinflamatorio' },
      { name: 'Diclofenaco', dose: '50mg', frequency: 'Cada 12 horas', price: 55, type: 'Antiinflamatorio' },
      { name: 'Pomada Calmante', dose: 'Aplicar', frequency: '3 veces al día', price: 85, type: 'Tópico' }
    ],
    recommendations: ['Aplica calor/frío alternado', 'Reposa la zona', 'Evita esfuerzos']
  },
  alergia: {
    name: 'Alergias',
    medicines: [
      { name: 'Cetirizina', dose: '10mg', frequency: 'Una vez al día', price: 60, type: 'Antihistamínico' },
      { name: 'Loratadina', dose: '10mg', frequency: 'Una vez al día', price: 50, type: 'Antihistamínico' }
    ],
    recommendations: ['Evita el alérgeno', 'Mantén ventilado', 'Lava ropa de cama frecuentemente']
  },
  mareo: {
    name: 'Mareo / Náuseas',
    medicines: [
      { name: 'Meclizina', dose: '25mg', frequency: 'Una vez al día', price: 75, type: 'Antiemético' },
      { name: 'Dimenhidrinato', dose: '50mg', frequency: 'Cada 4-6 horas', price: 65, type: 'Antiemético' }
    ],
    recommendations: ['Respira profundo', 'Mira al horizonte', 'Evita lectura']
  },
  insomnio: {
    name: 'Insomnio',
    medicines: [
      { name: 'Melatonina', dose: '3mg', frequency: '30 min antes de dormir', price: 95, type: 'Suplemento' },
      { name: 'Valeriana', dose: 'Extracto', frequency: 'Antes de dormir', price: 70, type: 'Natural' }
    ],
    recommendations: ['Evita pantallas', 'Mantén horario regular', 'Habitación oscura y fresca']
  },
  quemadura: {
    name: 'Quemadura leve',
    medicines: [
      { name: 'Crema hidratante', dose: 'Aplicar', frequency: 'Varias veces al día', price: 80, type: 'Tópico' },
      { name: 'Aloe Vera', dose: 'Aplicar', frequency: '3-4 veces al día', price: 55, type: 'Natural' }
    ],
    recommendations: ['Agua fría inmediata', 'No rompas ampollas', 'Protege del sol']
  },
  herida: {
    name: 'Herida / Cortada leve',
    medicines: [
      { name: 'Antiséptico', dose: 'Aplicar', frequency: '2 veces al día', price: 40, type: 'Antiséptico' },
      { name: 'Curitas', dose: 'Cambiar', frequency: 'Diario', price: 35, type: 'Primeros auxilios' }
    ],
    recommendations: ['Lava con agua y jabón', 'Aplica presión si sangra', 'Mantén limpio']
  }
};

// Keywords to match symptoms
const SYMPTOM_KEYWORDS = {
  dolor_cabeza: ['cabeza', 'migraña', 'cefalea', 'dolor de cabeza', 'cabeza me duele', 'dolor craneo'],
  dolor_estomago: ['estómago', 'panza', 'barriga', 'náusea', 'vomito', 'agruras', 'ácido', 'diarrea', 'estreñimiento', 'dolor de panza'],
  congestion: ['congestionado', 'gripe', 'resfriado', 'nariz tapada', 'mocos', 'estornudos', 'secreción'],
  tos: ['tos', 'toser', 'carraspera', 'garganta', 'expectoración'],
  fiebre: ['fiebre', 'calentura', 'temperatura', ' escalofríos', 'calentura'],
  dolor_muscular: ['músculo', 'muscular', 'espalda', 'cuello', 'rodilla', 'articular', 'cuerpo', 'dolor de espalda'],
  alergia: ['alergia', 'estornudos', 'ojos llorosos', 'picazón', 'ronchas', 'urticaria'],
  mareo: ['mareo', 'náusea', 'vertigo', 'vomito', 'gripa'],
  insomnio: ['insomnio', 'no puedo dormir', 'desvelado', 'sueño', 'dormir'],
  quemadura: ['quemadura', 'quemé', 'sol', 'calor'],
  herida: ['cortada', 'herida', 'raspon', 'sangre', 'corte']
};

const MEDICAL_DISCLAIMER = '⚠️ Este asistente no sustituye la opinión de un médico profesional. Si tienes una emergencia, llama al 911.';

window.showChatConsulta = function() {
  const chatHistory = Store.getChatHistory();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; height: 100%; background: #f8fafc; display: flex; flex-direction: column; z-index: 1000;';
  modal.innerHTML = `
    <!-- Chat Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
      <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">←</button>
      <div>
        <div style="font-weight: 600;">Asistente Médico</div>
        <div style="font-size: 0.75rem; opacity: 0.9;">En línea • Responde en segundos</div>
      </div>
      <div style="margin-left: auto; font-size: 2rem;">🤖</div>
    </div>
    
    <!-- Disclaimer Banner -->
    <div style="background: #fef3c7; padding: 0.5rem 1rem; font-size: 0.7rem; color: #92400e; text-align: center; border-bottom: 1px solid #fde68a; flex-shrink: 0;">
      ${MEDICAL_DISCLAIMER}
    </div>
    
    <!-- Chat Messages -->
    <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; min-height: 0;">
      ${chatHistory.length === 0 ? `
        <div style="align-self: flex-start; max-width: 85%; background: white; padding: 1rem; border-radius: 16px 16px 16px 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <div style="font-weight: 600; color: #0ea5e9; margin-bottom: 0.5rem;">👋 ¡Hola!</div>
          <div style="color: var(--text-secondary); line-height: 1.5; font-size: 0.95rem;">Soy tu asistente médico. Describe tus síntomas y te ayudaré a encontrar los medicamentos adecuados disponibles en Farmacia Apollo.</div>
          <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color); font-size: 0.7rem; color: #f59e0b;">${MEDICAL_DISCLAIMER}</div>
          <div style="margin-top: 0.75rem; font-size: 0.8rem; color: var(--text-muted);">Ejemplos: "Me duele la cabeza", "Tengo tos", "Dolor de estómago"</div>
        </div>
        
        <!-- Quick Symptom Buttons -->
        <div style="align-self: flex-start; display: flex; flex-wrap: wrap; gap: 0.5rem; max-width: 100%;">
          ${Object.values(SYMPTOM_MEDICINES).slice(0, 6).map(s => `
            <button onclick="sendSymptomMessage('${s.name}')" style="padding: 0.5rem 0.75rem; background: white; border: 1px solid #bae6fd; border-radius: 20px; font-size: 0.8rem; color: #0369a1; cursor: pointer;">${s.name}</button>
          `).join('')}
        </div>
      ` : chatHistory.map(msg => `
        <div style="align-self: ${msg.sender === 'user' ? 'flex-end' : 'flex-start'}; max-width: 90%; background: ${msg.sender === 'user' ? '#0ea5e9' : 'white'}; color: ${msg.sender === 'user' ? 'white' : 'inherit'}; padding: 0.875rem; border-radius: ${msg.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px'}; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          ${msg.type === 'medicine_recommendation' ? `
            <div style="font-weight: 600; margin-bottom: 0.5rem; font-size: 0.95rem;">💊 Medicamentos recomendados:</div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${msg.medicines.map((med, idx) => `
                <div style="background: ${msg.sender === 'user' ? 'rgba(255,255,255,0.2)' : '#f8fafc'}; padding: 0.625rem; border-radius: 10px;">
                  <div style="font-weight: 600; font-size: 0.9rem;">${med.name} ${med.dose}</div>
                  <div style="font-size: 0.75rem; opacity: 0.9;">${med.type} • ${med.frequency}</div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.375rem;">
                    <div style="font-size: 0.9rem; font-weight: 600;">$${med.price}</div>
                    <button onclick="addToCartFromChat('${med.name}', ${med.price})" style="padding: 0.375rem 0.75rem; background: ${msg.sender === 'user' ? 'white' : '#0ea5e9'}; color: ${msg.sender === 'user' ? '#0ea5e9' : 'white'}; border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">🛒 Agregar</button>
                  </div>
                </div>
              `).join('')}
            </div>
            ${msg.recommendations ? `
              <div style="margin-top: 0.625rem; padding-top: 0.625rem; border-top: 1px solid ${msg.sender === 'user' ? 'rgba(255,255,255,0.3)' : 'var(--border-color)'};">
                <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 0.25rem;">💡 Recomendaciones:</div>
                <ul style="margin: 0; padding-left: 1rem; font-size: 0.8rem; opacity: 0.9;">
                  ${msg.recommendations.map(r => `<li>${r}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid ${msg.sender === 'user' ? 'rgba(255,255,255,0.2)' : 'var(--border-color)'}; font-size: 0.65rem; opacity: 0.8; color: ${msg.sender === 'user' ? '#fef3c7' : '#92400e'};">
              ${MEDICAL_DISCLAIMER}
            </div>
          ` : `<div style="line-height: 1.5; font-size: 0.95rem;">${msg.text}</div><div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid ${msg.sender === 'user' ? 'rgba(255,255,255,0.2)' : 'var(--border-color)'}; font-size: 0.65rem; opacity: 0.8; color: ${msg.sender === 'user' ? '#fef3c7' : '#92400e'};">${MEDICAL_DISCLAIMER}</div>`}
        </div>
      `).join('')}
    </div>
    
    <!-- Chat Input -->
    <div style="padding: 0.75rem 1rem; background: white; border-top: 1px solid var(--border-color); display: flex; gap: 0.5rem; flex-shrink: 0;">
      <input type="text" id="chat-input" placeholder="Describe tus síntomas..." style="flex: 1; padding: 0.75rem 1rem; border: 2px solid var(--border-color); border-radius: 24px; font-size: 0.95rem;" onkeypress="if(event.key==='Enter') sendChatMessage()">
      <button onclick="sendChatMessage()" style="width: 44px; height: 44px; background: #0ea5e9; color: white; border: none; border-radius: 50%; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">➤</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Scroll to bottom
  const messagesDiv = document.getElementById('chat-messages');
  if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  // Focus input
  setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
};

window.sendSymptomMessage = function(symptom) {
  const input = document.getElementById('chat-input');
  if (input) input.value = symptom;
  sendChatMessage();
};

window.sendChatMessage = function() {
  const input = document.getElementById('chat-input');
  const text = input?.value?.trim();
  if (!text) return;
  
  // Add user message
  Store.addChatMessage({ sender: 'user', text, type: 'text' });
  
  // Clear input
  input.value = '';
  
  // Refresh chat
  refreshChatMessages();
  
  // Analyze symptoms and respond
  setTimeout(() => {
    const response = analyzeSymptoms(text);
    Store.addChatMessage(response);
    refreshChatMessages();
  }, 800);
};

window.refreshChatMessages = function() {
  const chatHistory = Store.getChatHistory();
  const container = document.getElementById('chat-messages');
  if (!container) return;
  
  container.innerHTML = chatHistory.map(msg => `
    <div style="align-self: ${msg.sender === 'user' ? 'flex-end' : 'flex-start'}; max-width: 90%; background: ${msg.sender === 'user' ? '#0ea5e9' : 'white'}; color: ${msg.sender === 'user' ? 'white' : 'inherit'}; padding: 0.875rem; border-radius: ${msg.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px'}; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
      ${msg.type === 'medicine_recommendation' ? `
        <div style="font-weight: 600; margin-bottom: 0.5rem; font-size: 0.95rem;">💊 Medicamentos recomendados:</div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${msg.medicines.map((med, idx) => `
            <div style="background: ${msg.sender === 'user' ? 'rgba(255,255,255,0.2)' : '#f8fafc'}; padding: 0.625rem; border-radius: 10px;">
              <div style="font-weight: 600; font-size: 0.9rem;">${med.name} ${med.dose}</div>
              <div style="font-size: 0.75rem; opacity: 0.9;">${med.type} • ${med.frequency}</div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.375rem;">
                <div style="font-size: 0.9rem; font-weight: 600;">$${med.price}</div>
                <button onclick="addToCartFromChat('${med.name}', ${med.price})" style="padding: 0.375rem 0.75rem; background: ${msg.sender === 'user' ? 'white' : '#0ea5e9'}; color: ${msg.sender === 'user' ? '#0ea5e9' : 'white'}; border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">🛒 Agregar</button>
              </div>
            </div>
          `).join('')}
        </div>
        ${msg.recommendations ? `
          <div style="margin-top: 0.625rem; padding-top: 0.625rem; border-top: 1px solid ${msg.sender === 'user' ? 'rgba(255,255,255,0.3)' : 'var(--border-color)'};">
            <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 0.25rem;">💡 Recomendaciones:</div>
            <ul style="margin: 0; padding-left: 1rem; font-size: 0.8rem; opacity: 0.9;">
              ${msg.recommendations.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid ${msg.sender === 'user' ? 'rgba(255,255,255,0.2)' : 'var(--border-color)'}; font-size: 0.65rem; opacity: 0.8; color: ${msg.sender === 'user' ? '#fef3c7' : '#92400e'};">
          ${MEDICAL_DISCLAIMER}
        </div>
      ` : `<div style="line-height: 1.5; font-size: 0.95rem;">${msg.text}</div><div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid ${msg.sender === 'user' ? 'rgba(255,255,255,0.2)' : 'var(--border-color)'}; font-size: 0.65rem; opacity: 0.8; color: ${msg.sender === 'user' ? '#fef3c7' : '#92400e'};">${MEDICAL_DISCLAIMER}</div>`}
    </div>
  `).join('');
  
  container.scrollTop = container.scrollHeight;
};

function analyzeSymptoms(text) {
  const lowerText = text.toLowerCase();
  
  // Check for symptom matches
  for (const [symptomKey, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      const symptomData = SYMPTOM_MEDICINES[symptomKey];
      return {
        sender: 'bot',
        type: 'medicine_recommendation',
        text: `Basado en tus síntomas de "${symptomData.name}", estos medicamentos pueden ayudarte. Recuerda consultar a un médico si los síntomas persisten.`,
        medicines: symptomData.medicines,
        recommendations: symptomData.recommendations
      };
    }
  }
  
  // No match found
  return {
    sender: 'bot',
    type: 'text',
    text: 'No reconozco esos síntomas. Puedes describirlos de otra forma o elegir uno de los botones de síntomas comunes. Si es una emergencia, por favor llama al 911 o visita tu médico.'
  };
}

window.addToCartFromChat = function(medicineName, price) {
  // Find or create medicine in store
  const medicines = Store.getMedicines();
  let medicine = medicines.find(m => m.name.toLowerCase().includes(medicineName.toLowerCase()));
  
  if (!medicine) {
    // Create temporary medicine entry
    medicine = {
      id: 'temp_' + Date.now(),
      name: medicineName,
      price: price,
      brand: 'Genérico',
      category: 'otc'
    };
  }
  
  Store.addToCart(medicine.id, 1);
  updateCartBadge();
  showToast(`${medicineName} agregado al carrito`, 'success');
};

window.showEmergencyInfo = function() {
  alert('🚨 EMERGENCIAS\n\nSi tienes una emergencia médica:\n\n• Llama al 911 inmediatamente\n• O acude a la sala de emergencias más cercana\n\nFarmacia Apollo no sustituye la atención médica profesional en casos de emergencia.');
};


// ============================================
// VIDEO CONSULTA - Telehealth Scheduling
// ============================================

const VIDEO_DOCTORS = [
  { id: 'dr1', name: 'Dra. María González', specialty: 'Medicina General', rating: 4.9, reviews: 127, available: true, image: '👩‍⚕️' },
  { id: 'dr2', name: 'Dr. Carlos Hernández', specialty: 'Medicina General', rating: 4.8, reviews: 89, available: true, image: '👨‍⚕️' },
  { id: 'dr3', name: 'Dra. Ana Martínez', specialty: 'Pediatría', rating: 4.9, reviews: 156, available: false, image: '👩‍⚕️' },
  { id: 'dr4', name: 'Dr. Roberto Sánchez', specialty: 'Dermatología', rating: 4.7, reviews: 78, available: true, image: '👨‍⚕️' },
  { id: 'dr5', name: 'Dra. Laura Torres', specialty: 'Nutrición', rating: 4.8, reviews: 112, available: true, image: '👩‍⚕️' }
];

window.showVideoConsulta = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; height: 100%; background: #f8fafc; display: flex; flex-direction: column; z-index: 1000;';
  modal.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
      <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">←</button>
      <div>
        <div style="font-weight: 600;">Video Consulta</div>
        <div style="font-size: 0.75rem; opacity: 0.9;">Médicos disponibles 24/7</div>
      </div>
    </div>
    
    <div style="flex: 1; overflow-y: auto; padding: 1rem; min-height: 0;">
      <!-- Info Card -->
      <div style="background: linear-gradient(135deg, #ede9fe, #f5f3ff); border-radius: 16px; padding: 1.25rem; margin-bottom: 1.5rem;">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
          <div style="font-size: 2.5rem;">📹</div>
          <div>
            <div style="font-weight: 600; color: #5b21b6;">Consulta desde casa</div>
            <div style="font-size: 0.85rem; color: #7c3aed;">Sin filas, sin esperas</div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; text-align: center; font-size: 0.75rem; color: var(--text-secondary);">
          <div>✓ Receta digital</div>
          <div>✓ 15-30 min</div>
          <div>✓ Chat seguro</div>
        </div>
      </div>
      
      <!-- Doctors List -->
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">Médicos disponibles ahora:</div>
      
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${VIDEO_DOCTORS.map(doc => `
          <div style="background: white; border-radius: 16px; padding: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); display: flex; align-items: center; gap: 1rem;">
            <div style="font-size: 3rem;">${doc.image}</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 1.05rem;">${doc.name}</div>
              <div style="font-size: 0.85rem; color: var(--text-muted);">${doc.specialty}</div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
                <span style="color: #f59e0b;">★</span>
                <span style="font-size: 0.85rem; font-weight: 600;">${doc.rating}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">(${doc.reviews} reseñas)</span>
              </div>
            </div>
            ${doc.available ? `
              <button onclick="showVideoBooking('${doc.id}')" style="background: #8b5cf6; color: white; border: none; padding: 0.6rem 1.25rem; border-radius: 20px; font-weight: 600; font-size: 0.85rem; cursor: pointer;">Agendar</button>
            ` : `
              <span style="background: #f3f4f6; color: var(--text-muted); padding: 0.6rem 1.25rem; border-radius: 20px; font-size: 0.85rem;">Ocupado</span>
            `}
          </div>
        `).join('')}
      </div>
      
      <!-- Quick Schedule -->
      <div style="margin-top: 1.5rem; padding: 1rem; background: #fef3c7; border-radius: 12px;">
        <div style="font-weight: 600; color: #92400e; margin-bottom: 0.5rem;">⏱️ ¿Necesitas atención inmediata?</div>
        <div style="font-size: 0.85rem; color: #a16207; margin-bottom: 0.75rem;">Te conectaremos con el primer médico disponible</div>
        <button onclick="showVideoBooking('next')" style="width: 100%; padding: 0.875rem; background: #f59e0b; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Conectar ahora →</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.showVideoBooking = function(doctorId) {
  const doctor = doctorId === 'next' ? VIDEO_DOCTORS.find(d => d.available) : VIDEO_DOCTORS.find(d => d.id === doctorId);
  
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: white; height: 100%; display: flex; flex-direction: column;">
      <!-- Header -->
      <div style="padding: 1rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
        <button onclick="showVideoConsulta()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">←</button>
        <div>
          <div style="font-weight: 600;">Agendar Video Consulta</div>
        </div>
      </div>
      
      <div style="flex: 1; overflow-y: auto; padding: 1.5rem; min-height: 0;">
        ${doctor ? `
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="font-size: 4rem; margin-bottom: 0.5rem;">${doctor.image}</div>
            <div style="font-weight: 600; font-size: 1.2rem;">${doctor.name}</div>
            <div style="color: var(--text-muted);">${doctor.specialty}</div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.25rem;">
              <span style="color: #f59e0b;">★</span>
              <span style="font-weight: 600;">${doctor.rating}</span>
              <span style="font-size: 0.85rem; color: var(--text-muted);">(${doctor.reviews} reseñas)</span>
            </div>
          </div>
        ` : ''}
        
        <!-- Date Selection -->
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Fecha</label>
          <input type="date" id="video-date" value="${new Date().toISOString().split('T')[0]}" min="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
        </div>
        
        <!-- Time Selection -->
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Hora</label>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
            ${['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'].map(time => `
              <button onclick="selectVideoTime(this, '${time}')" class="video-time-btn" style="padding: 0.75rem; border: 1px solid var(--border-color); background: white; border-radius: 10px; cursor: pointer; font-size: 0.9rem;">${time}</button>
            `).join('')}
          </div>
        </div>
        
        <!-- Reason -->
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Motivo de consulta (opcional)</label>
          <textarea id="video-reason" placeholder="Describe brevemente tus síntomas..." style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem; min-height: 80px; resize: vertical;"></textarea>
        </div>
        
        <!-- Price -->
        <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="color: var(--text-muted);">Consulta video</span>
            <span style="font-weight: 600;">$350</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-muted);">Receta digital incluida</span>
            <span style="color: #00A86B; font-size: 0.85rem;">✓</span>
          </div>
        </div>
        
        <input type="hidden" id="selected-video-time">
        
        <button onclick="confirmVideoBooking('${doctorId}')" style="width: 100%; padding: 1rem; background: #8b5cf6; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer;">Confirmar cita</button>
      </div>
    </div>
  `;
};

window.selectVideoTime = function(btn, time) {
  document.getElementById('selected-video-time').value = time;
  document.querySelectorAll('.video-time-btn').forEach(b => {
    b.style.background = 'white';
    b.style.borderColor = 'var(--border-color)';
    b.style.color = 'inherit';
  });
  btn.style.background = '#8b5cf6';
  btn.style.borderColor = '#8b5cf6';
  btn.style.color = 'white';
};

window.confirmVideoBooking = async function(doctorId) {
  const date = document.getElementById('video-date')?.value;
  const time = document.getElementById('selected-video-time')?.value;
  const reason = document.getElementById('video-reason')?.value;
  
  if (!date || !time) {
    alert('Por favor selecciona fecha y hora');
    return;
  }
  
  const doctor = doctorId === 'next' ? VIDEO_DOCTORS.find(d => d.available) : VIDEO_DOCTORS.find(d => d.id === doctorId);
  let useSupabase = false;
  
  // Try Supabase if authenticated
  if (FarmaciaAPI.isSupabaseAvailable() && currentAuthUser) {
    try {
      const { data, error } = await FarmaciaAPI.createAppointment({
        type: 'video',
        appointmentDate: date + 'T' + time + ':00',
        doctorId: doctor?.id || null,
        notes: reason,
        meetingUrl: null,
        meetingId: null
      });
      if (!error && data) {
        useSupabase = true;
        console.log('[createAppointment] Supabase appointment created');
      } else {
        throw error || new Error('Unknown error');
      }
    } catch (e) {
      console.warn('[createAppointment] Supabase failed, falling back:', e.message);
    }
  }
  
  // Fallback to localStorage
  if (!useSupabase) {
    Store.addVideoConsultation({
      doctorId: doctor?.id || 'next',
      doctorName: doctor?.name || 'Primer disponible',
      specialty: doctor?.specialty || 'Medicina General',
      date,
      time,
      reason,
      price: 350
    });
    console.log('[createAppointment] Fallback localStorage appointment created');
  }
  
  document.querySelector('.modal-overlay').innerHTML = `
    <div style="background: white; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; text-align: center;">
      <div style="font-size: 5rem; margin-bottom: 1rem;">✅</div>
      <h2 style="color: #8b5cf6; margin: 0 0 0.5rem;">¡Cita Confirmada!</h2>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem;">${doctor?.name || 'Médico disponible'}<br>${date} a las ${time}</p>
      ${useSupabase ? `<p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Guardada en el sistema</p>` : ''}
      <div style="background: #f5f3ff; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; font-size: 0.85rem;">
        <div>📧 Recibirás un email con el link</div>
        <div>⏰ 15 minutos antes de tu cita</div>
      </div>
      <button onclick="this.closest('.modal-overlay').remove()" style="padding: 1rem 2rem; background: #8b5cf6; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Entendido</button>
    </div>
  `;
};


// ============================================
// IN-PERSON CONSULTA - Appointment with Wait Times
// ============================================

window.showInPersonConsulta = function() {
  const locations = Store.getLocations();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; height: 100%; background: #f8fafc; display: flex; flex-direction: column; z-index: 1000;';
  modal.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #00A86B, #008855); color: white; display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
      <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">←</button>
      <div>
        <div style="font-weight: 600;">Cita en Persona</div>
        <div style="font-size: 0.75rem; opacity: 0.9;">Selecciona tu sucursal</div>
      </div>
    </div>
    
    <div style="flex: 1; overflow-y: auto; padding: 1rem; min-height: 0;">
      <!-- Info Card -->
      <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 16px; padding: 1.25rem; margin-bottom: 1.5rem;">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
          <div style="font-size: 2.5rem;">⏱️</div>
          <div>
            <div style="font-weight: 600; color: #15803d;">Tiempos de espera en tiempo real</div>
            <div style="font-size: 0.85rem; color: #22c55e;">Como Great Clips - únete a la lista</div>
          </div>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-secondary);">
          Agrega tu nombre, elige sucursal y te indicamos cuándo llegar
        </div>
      </div>
      
      <!-- Locations List -->
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">Sucursales cercanas:</div>
      
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${locations.map(loc => {
          const isShortWait = loc.currentWait <= 10;
          const isMediumWait = loc.currentWait > 10 && loc.currentWait <= 20;
          const waitColor = isShortWait ? '#00A86B' : isMediumWait ? '#f59e0b' : '#dc2626';
          const waitBg = isShortWait ? '#f0fdf4' : isMediumWait ? '#fef3c7' : '#fee2e2';
          
          return `
            <div style="background: white; border-radius: 16px; padding: 1rem; box-shadow: 0 2px 8px rgba(0,0,0,0.08); ${!loc.isOpen ? 'opacity: 0.6;' : ''}">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                <div style="flex: 1;">
                  <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 0.25rem;">${loc.name}</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">📍 ${loc.address}</div>
                  <div style="font-size: 0.8rem; color: var(--text-muted);">📞 ${loc.phone} • 🕐 ${loc.hours}</div>
                </div>
                ${loc.isOpen ? `
                  <div style="text-align: center; background: ${waitBg}; padding: 0.5rem 0.75rem; border-radius: 12px; min-width: 70px;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: ${waitColor};">${loc.currentWait}</div>
                    <div style="font-size: 0.65rem; color: ${waitColor};">min</div>
                  </div>
                ` : `
                  <div style="text-align: center; background: #f3f4f6; padding: 0.5rem 0.75rem; border-radius: 12px;">
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Cerrado</div>
                  </div>
                `}
              </div>
              
              <!-- Services -->
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
                ${loc.services.map(s => `<span style="font-size: 0.7rem; background: #f8fafc; padding: 0.25rem 0.5rem; border-radius: 12px; color: var(--text-muted);">${s}</span>`).join('')}
              </div>
              
              ${loc.isOpen ? `
                <button onclick="showLocationBooking('${loc.id}')" style="width: 100%; padding: 0.875rem; background: #00A86B; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                  <span>Agendar cita</span>
                  ${isShortWait ? '<span style="font-size: 0.75rem; background: rgba(255,255,255,0.3); padding: 0.125rem 0.5rem; border-radius: 10px;">¡Rápido!</span>' : ''}
                </button>
              ` : `
                <button disabled style="width: 100%; padding: 0.875rem; background: #e5e7eb; color: #9ca3af; border: none; border-radius: 12px; font-weight: 600;">
                  Abre mañana a las 8:00
                </button>
              `}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.showLocationBooking = function(locationId) {
  const locations = Store.getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return;
  
  // Calculate estimated time
  const now = new Date();
  const estimatedTime = new Date(now.getTime() + location.currentWait * 60000);
  const estimatedTimeStr = estimatedTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: white; height: 100%; display: flex; flex-direction: column;">
      <!-- Header -->
      <div style="padding: 1rem; background: linear-gradient(135deg, #00A86B, #008855); color: white; display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
        <button onclick="showInPersonConsulta()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">←</button>
        <div>
          <div style="font-weight: 600;">Agendar Cita</div>
        </div>
      </div>
      
      <div style="flex: 1; overflow-y: auto; padding: 1.5rem;">
        <!-- Location Info -->
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">🏥</div>
          <div style="font-weight: 600; font-size: 1.1rem;">${location.name}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">${location.address}</div>
        </div>
        
        <!-- Wait Time Display -->
        <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 16px; padding: 1.25rem; margin-bottom: 1.5rem; text-align: center;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Tiempo de espera</div>
              <div style="font-size: 2.5rem; font-weight: 700; color: #00A86B;">${location.currentWait}</div>
              <div style="font-size: 0.85rem; color: #22c55e;">minutos</div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Te toca aprox.</div>
              <div style="font-size: 2rem; font-weight: 700; color: #003366;">${estimatedTimeStr}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">llega 5 min antes</div>
            </div>
          </div>
        </div>
        
        <!-- Your Info -->
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Tu nombre</label>
          <input type="text" id="patient-name" placeholder="Ej: Juan Pérez" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
        </div>
        
        <!-- Reason -->
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Motivo de consulta</label>
          <select id="consult-reason" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
            <option value="general">Consulta general</option>
            <option value="urgent">Urgencia leve</option>
            <option value="followup">Seguimiento</option>
            <option value="vaccine">Vacunación</option>
            <option value="lab">Toma de laboratorio</option>
            <option value="prescription">Recetar medicamentos</option>
          </select>
        </div>
        
        <!-- Notes -->
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-weight: 600; margin-bottom: 0.5rem;">Notas adicionales (opcional)</label>
          <textarea id="consult-notes" placeholder="Síntomas, alergias, medicamentos actuales..." style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem; min-height: 80px; resize: vertical;"></textarea>
        </div>
        
        <!-- How it Works -->
        <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem;">
          <div style="font-weight: 600; margin-bottom: 0.75rem; font-size: 0.9rem;">¿Cómo funciona?</div>
          <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.85rem; color: var(--text-secondary);">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="background: #00A86B; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600;">1</span>
              <span>Te agregamos a la lista virtual</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="background: #00A86B; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600;">2</span>
              <span>Recibes notificaciones del progreso</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="background: #00A86B; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600;">3</span>
              <span>Llega 5 min antes de tu turno</span>
            </div>
          </div>
        </div>
        
        <!-- Price -->
        <div style="background: #f0fdf4; border-radius: 12px; padding: 1rem; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-secondary);">Consulta general</span>
            <span style="font-size: 1.25rem; font-weight: 700; color: #00A86B;">$200</span>
          </div>
          <div style="font-size: 0.8rem; color: #22c55e; margin-top: 0.25rem;">Pago en sucursal</div>
        </div>
        
        <button onclick="confirmInPersonBooking('${locationId}')" style="width: 100%; padding: 1rem; background: #00A86B; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer;">Unirme a la lista</button>
      </div>
    </div>
  `;
};

window.confirmInPersonBooking = async function(locationId) {
  const name = document.getElementById('patient-name')?.value?.trim();
  const reason = document.getElementById('consult-reason')?.value;
  const notes = document.getElementById('consult-notes')?.value;
  
  if (!name) {
    alert('Por favor ingresa tu nombre');
    return;
  }
  
  const locations = Store.getLocations();
  const location = locations.find(l => l.id === locationId);
  
  // Calculate wait times
  const now = new Date();
  const estimatedTime = new Date(now.getTime() + location.currentWait * 60000);
  const queuePosition = Math.ceil(location.currentWait / 10); // Approx 10 min per patient
  
  let useSupabase = false;
  
  // Try Supabase if authenticated
  if (FarmaciaAPI.isSupabaseAvailable() && currentAuthUser) {
    try {
      const { data, error } = await FarmaciaAPI.createAppointment({
        type: 'in_person',
        appointmentDate: estimatedTime.toISOString(),
        notes: reason || notes || null
      });
      if (!error && data) {
        useSupabase = true;
        console.log('[createAppointment] Supabase appointment created');
      } else {
        throw error || new Error('Unknown error');
      }
    } catch (e) {
      console.warn('[createAppointment] Supabase failed, falling back:', e.message);
    }
  }
  
  // Fallback to localStorage
  if (!useSupabase) {
    Store.addAppointment({
      locationId,
      locationName: location.name,
      patientName: name,
      reason,
      notes,
      currentWait: location.currentWait,
      estimatedTime: estimatedTime.toISOString(),
      queuePosition
    });
    console.log('[createAppointment] Fallback localStorage appointment created');
  }
  
  // Update location wait time (simulate adding to queue)
  Store.updateLocationWaitTime(locationId, location.currentWait + 15);
  
  document.querySelector('.modal-overlay').innerHTML = `
    <div style="background: white; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; text-align: center;">
      <div style="font-size: 5rem; margin-bottom: 1rem;">✅</div>
      <h2 style="color: #00A86B; margin: 0 0 0.5rem;">¡Estás en la lista!</h2>
      
      <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 16px; padding: 1.5rem; margin: 1.5rem 0; width: 100%; max-width: 300px;">
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">Tu posición en la fila:</div>
        <div style="font-size: 4rem; font-weight: 700; color: #00A86B;">#${queuePosition}</div>
        <div style="font-size: 0.9rem; color: #22c55e; margin-top: 0.5rem;">
          Tiempo estimado: ${location.currentWait} min
        </div>
      </div>
      
      <div style="background: #f8fafc; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; font-size: 0.9rem; width: 100%; max-width: 300px;">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">${location.name}</div>
        <div style="color: var(--text-muted); margin-bottom: 0.5rem;">${location.address}</div>
        <div style="color: #003366; font-weight: 600;">Llega aprox: ${estimatedTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      
      <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem;">
        📱 Te enviaremos actualizaciones por WhatsApp
      </div>
      
      <button onclick="this.closest('.modal-overlay').remove()" style="padding: 1rem 2rem; background: #00A86B; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Entendido</button>
    </div>
  `;
};


// ============================================
// APPOINTMENTS PAGE - Track all appointments
// ============================================

async function renderAppointments() {
  // Show loading state
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #00A86B); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem;">📋 Mis Citas</h2>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">Gestiona tus consultas</p>
        </div>
        <button onclick="renderConsulta()" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.8rem; cursor: pointer;">+ Nueva</button>
      </div>
    </div>
    <div style="padding: 3rem 1rem; text-align: center;">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
      <div style="color: white; font-size: 1rem;">Cargando citas...</div>
    </div>
  `;
  
  // Fetch from API
  let apiAppointments = [];
  try {
    apiAppointments = await FarmaciaAPI.getAppointments();
  } catch (e) {
    console.warn('[renderAppointments] Error fetching appointments:', e);
  }
  
  // Cache
  window.__appointmentsCache = apiAppointments;
  
  // Log data source
  if (apiAppointments.length > 0 && apiAppointments[0]?.source === 'supabase') {
    console.log('[renderAppointments] Appointments loaded from Supabase');
  } else {
    console.log('[renderAppointments] Appointments loaded from fallback');
  }
  
  // Map Supabase appointments to UI format
  const mappedSupabase = apiAppointments.map(appt => {
    const dateStr = appt.date || '';
    const timeStr = appt.time || '09:00';
    const isoDate = dateStr + 'T' + timeStr + ':00';
    const status = appt.status === 'pending' || appt.status === 'confirmed' ? 'scheduled' : appt.status;
    
    if (appt.type === 'video') {
      return {
        id: appt.id,
        doctorName: 'Médico',
        specialty: appt.notes || 'Consulta médica',
        date: dateStr,
        time: timeStr,
        price: 0,
        reason: appt.notes || '',
        status: status,
        source: 'supabase',
        meetingUrl: appt.meetingUrl || null,
        type: 'video',
        createdAt: isoDate
      };
    } else {
      return {
        id: appt.id,
        locationName: 'Farmacia Apollo',
        patientName: 'Paciente',
        estimatedTime: isoDate,
        queuePosition: '-',
        notes: appt.notes || '',
        status: status,
        source: 'supabase',
        type: 'in_person',
        createdAt: isoDate
      };
    }
  });
  
  // Split into video and in-person
  const sbVideos = mappedSupabase.filter(a => a.type === 'video');
  const sbInPerson = mappedSupabase.filter(a => a.type === 'in_person');
  
  // Get localStorage data
  const localAppointments = Store.getAppointments() || [];
  const localVideos = Store.getVideoConsultations() || [];
  
  // Merge: Supabase + localStorage
  const allAppointments = [...sbInPerson, ...localAppointments];
  const allVideos = [...sbVideos, ...localVideos];
  
  // Filter active and past
  const activeAppointments = allAppointments.filter(a => a.status === 'scheduled' || a.status === 'checked-in');
  const pastAppointments = allAppointments.filter(a => a.status === 'completed' || a.status === 'cancelled');
  const upcomingVideos = allVideos.filter(v => v.status === 'scheduled');
  const pastVideos = allVideos.filter(v => v.status === 'completed' || v.status === 'cancelled');
  const hasUpcoming = activeAppointments.length > 0 || upcomingVideos.length > 0;
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #00A86B); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem;">📋 Mis Citas</h2>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">Gestiona tus consultas</p>
        </div>
        <button onclick="renderConsulta()" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.8rem; cursor: pointer;">+ Nueva</button>
      </div>
    </div>

    <!-- Upcoming Appointments -->
    <div style="padding: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">Próximas citas:</div>
      
      ${!hasUpcoming ? `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <div style="font-size: 4rem; margin-bottom: 0.5rem;">📅</div>
          <div style="font-size: 1rem; margin-bottom: 0.5rem;">No tienes citas programadas</div>
          <div style="font-size: 0.85rem; margin-bottom: 1rem;">Agenda una consulta cuando la necesites</div>
          <button onclick="renderConsulta()" style="padding: 0.75rem 1.5rem; background: #003366; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Agendar ahora</button>
        </div>
      ` : ''}
      
      <!-- Video Consultations -->
      ${upcomingVideos.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <div style="font-size: 0.85rem; color: #8b5cf6; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>📹</span>
            <span>Video Consultas</span>
          </div>
          ${upcomingVideos.map(video => {
            const date = new Date(video.date);
            const isToday = date.toDateString() === new Date().toDateString();
            return `
              <div style="background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-radius: 16px; padding: 1.25rem; margin-bottom: 0.75rem; border: 2px solid #ddd6fe;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                  <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="font-size: 2.5rem;">👨‍⚕️</div>
                    <div>
                      <div style="font-weight: 600; font-size: 1.1rem; color: #5b21b6;">${video.doctorName}</div>
                      <div style="font-size: 0.85rem; color: #7c3aed;">${video.specialty}</div>
                    </div>
                  </div>
                  ${isToday ? `<span style="background: #8b5cf6; color: white; padding: 0.25rem 0.5rem; border-radius: 20px; font-size: 0.7rem; font-weight: 600;">HOY</span>` : ''}
                </div>
                
                <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
                  <div style="flex: 1; background: white; padding: 0.75rem; border-radius: 10px; text-align: center;">
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Fecha</div>
                    <div style="font-weight: 600; color: #5b21b6;">${date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                  </div>
                  <div style="flex: 1; background: white; padding: 0.75rem; border-radius: 10px; text-align: center;">
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Hora</div>
                    <div style="font-weight: 600; color: #5b21b6;">${video.time}</div>
                  </div>
                  <div style="flex: 1; background: white; padding: 0.75rem; border-radius: 10px; text-align: center;">
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Precio</div>
                    <div style="font-weight: 600; color: #5b21b6;">$${video.price}</div>
                  </div>
                </div>
                
                ${video.reason ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; background: white; padding: 0.75rem; border-radius: 8px;"><strong>Motivo:</strong> ${video.reason}</div>` : ''}
                
                <div style="display: flex; gap: 0.5rem;">
                  ${isToday ? `
                    <button onclick="joinVideoCall('${video.id}')" style="flex: 1; padding: 0.875rem; background: #8b5cf6; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">📹 Entrar a la llamada</button>
                  ` : `
                    <button onclick="rescheduleVideo('${video.id}')" style="flex: 1; padding: 0.875rem; background: white; color: #8b5cf6; border: 2px solid #8b5cf6; border-radius: 12px; font-weight: 600; cursor: pointer;">Reagendar</button>
                  `}
                  <button onclick="cancelVideo('${video.id}')" style="padding: 0.875rem; background: #fee2e2; color: #dc2626; border: none; border-radius: 12px; cursor: pointer;">Cancelar</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
      
      <!-- In-Person Appointments -->
      ${activeAppointments.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <div style="font-size: 0.85rem; color: #00A86B; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>🏥</span>
            <span>Citas en Sucursal</span>
          </div>
          ${activeAppointments.map(appt => {
            const estimatedTime = new Date(appt.estimatedTime);
            const isSoon = (estimatedTime - new Date()) < 30 * 60 * 1000; // Less than 30 min
            return `
              <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border-radius: 16px; padding: 1.25rem; margin-bottom: 0.75rem; border: 2px solid #bbf7d0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                  <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="font-size: 2.5rem;">🏥</div>
                    <div>
                      <div style="font-weight: 600; font-size: 1.1rem; color: #15803d;">${appt.locationName}</div>
                      <div style="font-size: 0.85rem; color: #22c55e;">${appt.patientName}</div>
                    </div>
                  </div>
                  ${isSoon ? `<span style="background: #00A86B; color: white; padding: 0.25rem 0.5rem; border-radius: 20px; font-size: 0.7rem; font-weight: 600;">¡PRONTO!</span>` : ''}
                </div>
                
                <div style="background: white; border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Tu turno estimado:</span>
                    <span style="font-weight: 700; font-size: 1.25rem; color: #00A86B;">${estimatedTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Posición en fila:</span>
                    <span style="font-weight: 600; color: #003366;">#${appt.queuePosition}</span>
                  </div>
                </div>
                
                ${appt.notes ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; background: white; padding: 0.75rem; border-radius: 8px;"><strong>Notas:</strong> ${appt.notes}</div>` : ''}
                
                <div style="display: flex; gap: 0.5rem;">
                  <button onclick="getDirections('${appt.locationId || 'loc1'}')" style="flex: 1; padding: 0.875rem; background: #00A86B; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">📍 Cómo llegar</button>
                  <button onclick="cancelAppointment('${appt.id}')" style="padding: 0.875rem; background: #fee2e2; color: #dc2626; border: none; border-radius: 12px; cursor: pointer;">Cancelar</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Past Appointments -->
    ${(pastAppointments.length > 0 || pastVideos.length > 0) ? `
      <div style="padding: 0 1rem 2rem;">
        <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">Historial:</div>
        
        <div style="background: white; border-radius: 16px; border: 1px solid var(--border-color); overflow: hidden;">
          ${[...pastVideos, ...pastAppointments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5).map(item => {
            const isVideo = item.doctorName !== undefined;
            const date = new Date(item.createdAt || item.date);
            return `
              <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="font-size: 1.5rem;">${isVideo ? '📹' : '🏥'}</div>
                  <div>
                    <div style="font-weight: 600; font-size: 0.95rem;">${isVideo ? item.doctorName : item.locationName}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${date.toLocaleDateString('es-MX')} • ${isVideo ? 'Video consulta' : 'En persona'}</div>
                  </div>
                </div>
                <span style="font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 12px; background: ${item.status === 'completed' ? '#f0fdf4' : '#fee2e2'}; color: ${item.status === 'completed' ? '#00A86B' : '#dc2626'};">${item.status === 'completed' ? 'Completada' : 'Cancelada'}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Quick Actions -->
    <div style="padding: 0 1rem 2rem;">
      <div class="medicine-card" style="flex-direction: column; padding: 1.25rem; background: #f8fafc;">
        <div style="font-weight: 600; margin-bottom: 1rem; color: var(--text-secondary);">¿Necesitas ayuda?</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <a href="tel:555-APOLLO" style="padding: 0.75rem; background: #003366; color: white; text-decoration: none; border-radius: 12px; text-align: center; font-size: 0.9rem;">
            <div style="font-size: 1.25rem; margin-bottom: 0.25rem;">📞</div>
            <div>Llamar</div>
          </a>
          <button onclick="renderConsulta()" style="padding: 0.75rem; background: #00A86B; color: white; border: none; border-radius: 12px; font-size: 0.9rem; cursor: pointer;">
            <div style="font-size: 1.25rem; margin-bottom: 0.25rem;">📅</div>
            <div>Agendar</div>
          </button>
        </div>
      </div>
    </div>
  `;
}

// Appointment action functions
window.joinVideoCall = function(videoId) {
  const consultation = (window.__appointmentsCache || []).find(a => a.id === videoId && a.type === 'video') || Store.getVideoConsultations().find(v => v.id === videoId);
  if (!consultation) return;
  
  if (consultation.source === 'supabase') {
    if (consultation.meetingUrl) {
      window.open(consultation.meetingUrl, '_blank');
    } else {
      showToast('La videollamada aún no tiene enlace. Contacta a la farmacia.', 'info');
    }
    return;
  }
  
  showToast(`Conectando con ${consultation.doctorName}...`, 'info');
};

window.rescheduleVideo = function(videoId) {
  const allVideos = (window.__appointmentsCache || []).filter(a => a.type === 'video');
  const video = allVideos.find(v => v.id === videoId) || Store.getVideoConsultations().find(v => v.id === videoId);
  
  if (video && video.source === 'supabase') {
    showToast('Las citas del sistema no se pueden reagendar desde la app aún. Contacta a la farmacia.', 'info');
    return;
  }
  
  const consultations = Store.getVideoConsultations().filter(v => v.id !== videoId);
  localStorage.setItem('videoConsultations', JSON.stringify(consultations));
  showVideoBooking('next');
};

window.cancelVideo = function(videoId) {
  const allVideos = (window.__appointmentsCache || []).filter(a => a.type === 'video');
  const video = allVideos.find(v => v.id === videoId) || Store.getVideoConsultations().find(v => v.id === videoId);
  
  if (video && video.source === 'supabase') {
    showToast('Las citas del sistema no se pueden cancelar desde la app aún. Contacta a la farmacia.', 'info');
    return;
  }
  
  if (confirm('¿Estás seguro de cancelar esta video consulta?')) {
    const consultations = Store.getVideoConsultations().map(v => 
      v.id === videoId ? { ...v, status: 'cancelled' } : v
    );
    localStorage.setItem('videoConsultations', JSON.stringify(consultations));
    renderAppointments();
    showToast('Video consulta cancelada', 'info');
  }
};

window.getDirections = function(locationId) {
  const locations = Store.getLocations();
  const location = locations.find(l => l.id === locationId);
  if (!location) return;
  
  const address = encodeURIComponent(location.address);
  window.open(`https://www.google.com/maps/search/?api=1&query=${address}`, '_blank');
};

window.cancelAppointment = function(appointmentId) {
  const allAppts = (window.__appointmentsCache || []).filter(a => a.type === 'in_person');
  const appt = allAppts.find(a => a.id === appointmentId);
  
  if (appt && appt.source === 'supabase') {
    showToast('Las citas del sistema no se pueden cancelar desde la app aún. Contacta a la farmacia.', 'info');
    return;
  }
  
  if (confirm('¿Estás seguro de cancelar esta cita?\n\nTu posición en la fila será liberada.')) {
    Store.cancelAppointment(appointmentId);
    renderAppointments();
    showToast('Cita cancelada', 'info');
  }
};

async function renderRecetas() {
  const allProfiles = Store.getAllProfiles();
  const activeProfileId = Store.getActiveProfileId();
  const activeProfile = allProfiles.find(p => p.id === activeProfileId);
  
  // Show loading state
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem;">📄 Mis Recetas</h2>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">
            ${activeProfile?.isMain ? 'Todas tus recetas médicas' : `Recetas de ${activeProfile?.name}`}
          </p>
        </div>
        <button onclick="showUploadPrescriptionModal()" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.8rem; cursor: pointer;">+ Subir</button>
      </div>
    </div>
    <div style="padding: 3rem 1rem; text-align: center;">
      <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
      <div style="color: white; font-size: 1rem;">Cargando recetas...</div>
    </div>
  `;
  
  // Fetch from API
  let systemPrescriptions = [];
  try {
    systemPrescriptions = await FarmaciaAPI.getPrescriptions();
  } catch (e) {
    console.warn('[renderRecetas] Error fetching prescriptions:', e);
  }
  
  // Cache
  window.__prescriptionsCache = systemPrescriptions;
  
  // Log data source
  if (systemPrescriptions.length > 0 && systemPrescriptions[0]?.source === 'supabase') {
    console.log('[renderRecetas] Prescriptions loaded from Supabase');
  } else {
    console.log('[renderRecetas] Prescriptions loaded from fallback');
  }
  
  // Get localStorage prescriptions
  const allPrescriptions = Store.getAllPrescriptions();
  
  // Group prescriptions by profile
  const prescriptionsByProfile = {};
  allProfiles.forEach(profile => {
    prescriptionsByProfile[profile.id] = allPrescriptions.filter(p => p.profileId === profile.id);
  });
  
  // Get active prescriptions for current profile
  const activePrescriptions = prescriptionsByProfile[activeProfileId] || [];
  const activeCount = activePrescriptions.filter(p => !p.status || p.status === 'active').length;
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem;">📄 Mis Recetas</h2>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">
            ${activeProfile?.isMain ? 'Todas tus recetas médicas' : `Recetas de ${activeProfile?.name}`}
            ${activeCount > 0 ? `• ${activeCount} activas` : ''}
          </p>
        </div>
        <button onclick="showUploadPrescriptionModal()" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.8rem; cursor: pointer;">+ Subir</button>
      </div>
    </div>

    <!-- System Prescriptions (from Supabase) -->
    ${systemPrescriptions.length > 0 ? `
      <div style="padding: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <span style="font-weight: 600; color: white;">🏥 Recetas del Sistema</span>
          <span style="font-size: 0.75rem; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.1); padding: 0.25rem 0.5rem; border-radius: 12px;">${systemPrescriptions.length} recetas</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${systemPrescriptions.map(p => `
            <div class="glass-card" style="padding: 1rem; border-left: 4px solid ${p.type === 'document' ? '#00d4aa' : '#60a5fa'};">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                <span style="font-size: 1.5rem;">${p.type === 'document' ? '📷' : '👨‍⚕️'}</span>
                <div>
                  <div style="font-weight: 600; color: white;">${p.type === 'document' ? 'Receta digital' : 'Nota médica'}</div>
                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">${new Date(p.createdAt).toLocaleDateString('es-MX')}</div>
                </div>
              </div>
              ${p.type === 'document' && p.fileUrl ? `
                <a href="${p.fileUrl}" target="_blank" style="display: block; margin-bottom: 0.5rem; padding: 0.5rem; background: rgba(0,212,170,0.1); border-radius: 8px; color: #00d4aa; font-size: 0.85rem; text-decoration: none;">🔗 Ver archivo</a>
              ` : ''}
              ${p.content || p.notes ? `
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.08); padding: 0.5rem; border-radius: 8px;">${p.content || p.notes}</div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Profile Switcher (if multiple profiles) -->
    ${allProfiles.length > 1 ? `
      <div style="padding: 1rem; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1);">
        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-bottom: 0.5rem;">Ver recetas de:</div>
        <div style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.25rem;">
          ${allProfiles.map(profile => `
            <button onclick="switchProfileForRecetas('${profile.id}')" style="flex-shrink: 0; padding: 0.5rem 1rem; background: ${profile.id === activeProfileId ? 'rgba(0,168,232,0.3)' : 'rgba(255,255,255,0.08)'}; color: white; border: 1px solid ${profile.id === activeProfileId ? 'rgba(0,168,232,0.5)' : 'rgba(255,255,255,0.15)'}; border-radius: 20px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;">
              <span>${profile.avatar || '👤'}</span>
              <span>${profile.name}</span>
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Add Prescription Button - Glass -->
    <div style="padding: 1rem;">
      <div onclick="showUploadPrescriptionModal()" class="glass-card" style="border: 2px dashed rgba(14,165,233,0.5); border-radius: 16px; padding: 1.5rem; text-align: center; cursor: pointer; background: linear-gradient(135deg, rgba(14,165,233,0.1), rgba(14,165,233,0.05));">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📷</div>
        <div style="font-weight: 600; color: #7dd3fc; margin-bottom: 0.25rem;">Subir Nueva Receta</div>
        <div style="font-size: 0.8rem; color: rgba(125,211,252,0.8);">Escanea o fotografía tu receta médica</div>
      </div>
    </div>

    <!-- Active Prescriptions - Glass Cards -->
    <div style="padding: 0 1rem 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600; color: white;">💊 Recetas Activas</span>
        <span style="font-size: 0.75rem; color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.1); padding: 0.25rem 0.5rem; border-radius: 12px;">${activePrescriptions.filter(p => !p.status || p.status === 'active').length} recetas</span>
      </div>
      
      ${activePrescriptions.filter(p => !p.status || p.status === 'active').length === 0 ? `
        <div class="glass-card" style="text-align: center; padding: 2rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">📋</div>
          <div style="color: white; font-size: 0.95rem; margin-bottom: 0.25rem;">No hay recetas activas</div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">Las recetas aparecerán aquí</div>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${activePrescriptions.filter(p => !p.status || p.status === 'active').map(p => `
            <div class="glass-card" style="flex-direction: column; align-items: flex-start; padding: 1rem; border-left: 4px solid #00a8e8;">
              <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="font-size: 1.5rem;">💊</span>
                  <div>
                    <div style="font-weight: 600; color: white;">${p.medicine}</div>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">${p.dose} • ${p.frequency}</div>
                  </div>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                  ${p.source === 'doctor' ? '<span style="background: rgba(59,130,246,0.2); color: #60a5fa; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.7rem;">👨‍⚕️ Dr.</span>' : ''}
                  ${p.source === 'scan' ? '<span style="background: rgba(0,212,170,0.2); color: #00d4aa; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.7rem;">📷 Scan</span>' : ''}
                </div>
              </div>
              
              ${p.instructions ? `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-bottom: 0.75rem; background: rgba(255,255,255,0.08); padding: 0.5rem; border-radius: 8px; width: 100%;">${p.instructions}</div>` : ''}
              
              ${p.doctorName ? `<div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-bottom: 0.75rem;">👨‍⚕️ Dr. ${p.doctorName} • ${new Date(p.createdAt).toLocaleDateString('es-MX')}</div>` : ''}
              
              <div style="display: flex; gap: 0.5rem; width: 100%;">
                <button onclick="orderPrescription(${p.id})" style="flex: 1; padding: 0.625rem; background: linear-gradient(135deg, #00a8e8, #0066cc); color: white; border: none; border-radius: 10px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">🛒 Ordenar</button>
                <button onclick="setReminderForPrescription(${p.id})" style="padding: 0.625rem; background: rgba(14,165,233,0.2); color: #7dd3fc; border: 1px solid rgba(14,165,233,0.3); border-radius: 10px; font-size: 0.85rem; cursor: pointer;">⏰</button>
                <button onclick="markPrescriptionUsed(${p.id})" style="padding: 0.625rem; background: rgba(0,212,170,0.2); color: #00d4aa; border: 1px solid rgba(0,212,170,0.3); border-radius: 10px; font-size: 0.85rem; cursor: pointer;">✓</button>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Adherence Report Button - Glass -->
    <div style="padding: 0 1rem 1rem;">
      <button onclick="printAdherenceReport()" class="glass-card" style="width: 100%; padding: 1rem; border: 1px solid rgba(0,212,170,0.3); border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: linear-gradient(135deg, rgba(0,212,170,0.1), rgba(0,212,170,0.05));">
        <span>📊</span>
        <span style="font-weight: 600; color: #00d4aa;">Generar Reporte de Adherencia</span>
      </button>
    </div>

    <!-- Past Prescriptions - Glass -->
    ${activePrescriptions.filter(p => p.status === 'used').length > 0 ? `
      <div style="padding: 0 1rem 2rem;">
        <div style="font-weight: 600; margin-bottom: 0.75rem; color: rgba(255,255,255,0.7);">📁 Historial de Recetas</div>
        <div class="glass-card" style="overflow: hidden; padding: 0;">
          ${activePrescriptions.filter(p => p.status === 'used').slice(0, 5).map(p => `
            <div style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-size: 0.95rem; color: white;">${p.medicine}</div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">Usada el ${new Date(p.usedAt).toLocaleDateString('es-MX')}</div>
              </div>
              <span style="font-size: 0.75rem; color: #00d4aa;">✓ Completada</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Refill Requests History - Glass -->
    ${(() => {
      const refillRequests = Store.getRefillRequests();
      if (refillRequests.length === 0) return '';
      
      return `
        <div style="padding: 0 1rem 2rem;">
          <div style="font-weight: 600; margin-bottom: 0.75rem; color: rgba(255,255,255,0.7);">🔄 Historial de Recargas</div>
          <div class="glass-card" style="overflow: hidden; padding: 0;">
            ${refillRequests.slice(0, 5).map(r => {
              const statusColors = {
                pending: { bg: 'rgba(245,158,11,0.2)', color: '#fbbf24', text: 'Pendiente' },
                confirmed: { bg: 'rgba(59,130,246,0.2)', color: '#60a5fa', text: 'Confirmada' },
                ready: { bg: 'rgba(0,212,170,0.2)', color: '#00d4aa', text: 'Lista' },
                completed: { bg: 'rgba(148,163,184,0.2)', color: '#94a3b8', text: 'Completada' },
                cancelled: { bg: 'rgba(255,107,107,0.2)', color: '#ff6b6b', text: 'Cancelada' }
              };
              const status = statusColors[r.status] || statusColors.pending;
              return `
                <div style="padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <div style="font-weight: 600; font-size: 0.95rem; color: white;">${r.medicine}</div>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">${r.quantity} caja(s) • ${new Date(r.createdAt).toLocaleDateString('es-MX')}</div>
                  </div>
                  <span style="background: ${status.bg}; color: ${status.color}; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${status.text}</span>
                </div>
              `;
            }).join('')}
          </div>
          ${refillRequests.length > 5 ? `
            <div style="text-align: center; padding: 0.75rem; color: rgba(255,255,255,0.5); font-size: 0.85rem;">Ver ${refillRequests.length - 5} más...</div>
          ` : ''}
        </div>
      `;
    })()}

    <!-- Info -->
    <div style="padding: 0 1rem 2rem;">
      <div style="background: #fef3c7; border-radius: 12px; padding: 1rem; font-size: 0.85rem; color: #92400e;">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">💡 Consejo</div>
        <div>Las recetas de consultas médicas (video o presencial) se agregan automáticamente aquí. También puedes escanear recetas físicas.</div>
      </div>
    </div>
  `;
}

window.switchProfileForRecetas = function(profileId) {
  Store.setActiveProfile(profileId);
  renderRecetas();
};

window.showUploadPrescriptionModal = function() {
  const activeProfile = Store.getProfileById(Store.getActiveProfileId());
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; height: 100%; background: #f8fafc; display: flex; flex-direction: column; z-index: 1000;';
  modal.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
      <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">←</button>
      <div>
        <div style="font-weight: 600;">Subir Receta</div>
      </div>
    </div>
    
    <div style="flex: 1; overflow-y: auto; padding: 1.5rem; min-height: 0;">
      <!-- Profile indicator -->
      <div style="background: #f0f9ff; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-size: 1.5rem;">${activeProfile?.avatar || '👤'}</span>
        <div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Receta para:</div>
          <div style="font-weight: 600; color: #0369a1;">${activeProfile?.name || 'Yo'}</div>
        </div>
      </div>
      
      <!-- Upload Options -->
      <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem;">
        <div onclick="showPrescriptionCamera()" style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border: 2px dashed #0ea5e9; border-radius: 16px; padding: 2rem; text-align: center; cursor: pointer;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">📷</div>
          <div style="font-weight: 600; color: #0369a1; margin-bottom: 0.25rem;">Tomar Foto</div>
          <div style="font-size: 0.8rem; color: #0ea5e9;">Usa la cámara de tu teléfono</div>
        </div>
        
        <div onclick="document.getElementById('prescription-file').click()" style="background: white; border: 2px solid var(--border-color); border-radius: 16px; padding: 1.5rem; text-align: center; cursor: pointer;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📁</div>
          <div style="font-weight: 600; margin-bottom: 0.25rem;">Seleccionar de Galería</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Elige una foto existente</div>
          <input type="file" id="prescription-file" accept="image/*" style="display: none;" onchange="handlePrescriptionUpload(this)">
        </div>
      </div>
      
      <!-- Manual Entry -->
      <div style="background: white; border-radius: 16px; padding: 1.25rem; border: 1px solid var(--border-color);">
        <div style="font-weight: 600; margin-bottom: 1rem;">O ingresar manualmente:</div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Medicamento</label>
          <input type="text" id="manual-med-name" placeholder="Ej: Paracetamol" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 10px;">
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
          <div>
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Dosis</label>
            <input type="text" id="manual-med-dose" placeholder="500mg" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 10px;">
          </div>
          <div>
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Frecuencia</label>
            <select id="manual-med-freq" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 10px;">
              <option>Cada 8 horas</option>
              <option>Cada 12 horas</option>
              <option>Una vez al día</option>
              <option>Con las comidas</option>
            </select>
          </div>
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Doctor (opcional)</label>
          <input type="text" id="manual-med-doctor" placeholder="Nombre del doctor" style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 10px;">
        </div>
        
        <button onclick="saveManualPrescriptionForRecetas()" style="width: 100%; padding: 0.875rem; background: #0ea5e9; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Guardar Receta</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.showPrescriptionCamera = function() {
  // Simulate camera - in real app would use device camera
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: black; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; color: white;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">📷</div>
      <div style="margin-bottom: 2rem;">Enfoca la receta en el cuadro</div>
      <div style="width: 280px; height: 380px; border: 3px solid #0ea5e9; border-radius: 20px; position: relative; margin-bottom: 2rem;">
        <div style="position: absolute; top: 20px; left: 20px; width: 30px; height: 30px; border-top: 4px solid #0ea5e9; border-left: 4px solid #0ea5e9;"></div>
        <div style="position: absolute; top: 20px; right: 20px; width: 30px; height: 30px; border-top: 4px solid #0ea5e9; border-right: 4px solid #0ea5e9;"></div>
        <div style="position: absolute; bottom: 20px; left: 20px; width: 30px; height: 30px; border-bottom: 4px solid #0ea5e9; border-left: 4px solid #0ea5e9;"></div>
        <div style="position: absolute; bottom: 20px; right: 20px; width: 30px; height: 30px; border-bottom: 4px solid #0ea5e9; border-right: 4px solid #0ea5e9;"></div>
      </div>
      <div style="display: flex; gap: 1rem;">
        <button onclick="showUploadPrescriptionModal()" style="padding: 1rem 2rem; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 12px; cursor: pointer;">Cancelar</button>
        <button onclick="simulatePrescriptionCapture()" style="width: 70px; height: 70px; background: #0ea5e9; border: 4px solid white; border-radius: 50%; cursor: pointer;"></button>
      </div>
    </div>
  `;
};

window.simulatePrescriptionCapture = async function() {
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: white; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; text-align: center;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">🔍</div>
      <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 0.5rem;">Analizando receta...</div>
      <div style="color: var(--text-muted);">Detectando medicamentos</div>
    </div>
  `;
  
  let useSupabase = false;
  
  // Try Supabase if authenticated
  if (FarmaciaAPI.isSupabaseAvailable() && currentAuthUser) {
    try {
      const { data, error } = await FarmaciaAPI.uploadPrescription({
        medicine: 'Amoxicilina',
        dose: '500mg',
        notes: 'Amoxicilina 500mg - Cada 8 horas - 7 días'
      });
      if (!error && data) {
        useSupabase = true;
        console.log('[uploadPrescription] Supabase document uploaded');
      } else {
        throw error || new Error('Unknown error');
      }
    } catch (e) {
      console.warn('[uploadPrescription] Supabase failed, falling back:', e.message);
    }
  }
  
  if (!useSupabase) {
    Store.addPrescription({
      medicine: 'Amoxicilina',
      dose: '500mg',
      frequency: 'Cada 8 horas',
      instructions: 'Tomar durante 7 días',
      source: 'scan',
      doctorName: 'Dr. García'
    });
    console.log('[uploadPrescription] Fallback localStorage prescription created');
  }
  
  modal.innerHTML = `
    <div style="background: white; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; text-align: center;">
      <div style="font-size: 4rem; margin-bottom: 1rem;">✅</div>
      <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 0.5rem;">¡Receta guardada!</div>
      <div style="color: var(--text-muted); margin-bottom: 2rem;">Amoxicilina 500mg detectada</div>
      ${useSupabase ? `<div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Guardada en el sistema</div>` : ''}
      <button onclick="this.closest('.modal-overlay').remove(); renderRecetas();" style="padding: 1rem 2rem; background: #0ea5e9; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Ver mis recetas</button>
    </div>
  `;
};

window.handlePrescriptionUpload = async function(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    let useSupabase = false;
    
    // Try Supabase if authenticated
    if (FarmaciaAPI.isSupabaseAvailable() && currentAuthUser) {
      try {
        const { data, error } = await FarmaciaAPI.uploadPrescription(file);
        if (!error && data) {
          useSupabase = true;
          console.log('[uploadPrescription] Supabase document uploaded');
        } else {
          throw error || new Error('Unknown error');
        }
      } catch (e) {
        console.warn('[uploadPrescription] Supabase failed, falling back:', e.message);
      }
    }
    
    if (!useSupabase) {
      Store.addPrescription({
        medicine: 'Medicamento Recetado',
        dose: 'Ver imagen',
        frequency: 'Según indicación',
        source: 'upload',
        image: file.name
      });
      console.log('[uploadPrescription] Fallback localStorage prescription created');
    }
    
    document.querySelector('.modal-overlay').remove();
    renderRecetas();
    showToast(useSupabase ? 'Receta subida al sistema' : 'Receta guardada localmente', 'success');
  }
};

window.saveManualPrescriptionForRecetas = async function() {
  const name = document.getElementById('manual-med-name')?.value?.trim();
  const dose = document.getElementById('manual-med-dose')?.value?.trim();
  const frequency = document.getElementById('manual-med-freq')?.value;
  const doctor = document.getElementById('manual-med-doctor')?.value?.trim();
  
  if (!name) {
    alert('Por favor ingresa el nombre del medicamento');
    return;
  }
  
  let useSupabase = false;
  
  // Try Supabase if authenticated
  if (FarmaciaAPI.isSupabaseAvailable() && currentAuthUser) {
    try {
      const { data, error } = await FarmaciaAPI.uploadPrescription({
        medicine: name,
        dose: dose || 'No especificada',
        notes: `${name} ${dose || ''} - ${frequency || ''} - Dr. ${doctor || 'No especificado'}`
      });
      if (!error && data) {
        useSupabase = true;
        console.log('[uploadPrescription] Supabase document uploaded');
      } else {
        throw error || new Error('Unknown error');
      }
    } catch (e) {
      console.warn('[uploadPrescription] Supabase failed, falling back:', e.message);
    }
  }
  
  if (!useSupabase) {
    Store.addPrescription({
      medicine: name,
      dose: dose || 'No especificada',
      frequency: frequency,
      doctorName: doctor,
      source: 'manual'
    });
    console.log('[uploadPrescription] Fallback localStorage prescription created');
  }
  
  document.querySelector('.modal-overlay').remove();
  renderRecetas();
  showToast(useSupabase ? 'Receta guardada en el sistema' : 'Receta guardada', 'success');
};

window.orderPrescription = function(prescriptionId) {
  const prescription = (window.__prescriptionsCache || []).find(p => p.id === prescriptionId) || Store.getAllPrescriptions().find(p => p.id === prescriptionId);
  if (!prescription) return;
  
  if (prescription.source === 'supabase') {
    showToast('Las recetas del sistema no se pueden ordenar directamente aún. Contacta a la farmacia.', 'info');
    return;
  }
  
  // Add to cart
  const medicine = {
    id: 'rx_' + prescriptionId,
    name: prescription.medicine,
    price: 0, // Would lookup actual price
    brand: 'Recetado',
    category: 'prescription'
  };
  
  Store.addToCart(medicine.id, 1);
  showToast(`"${prescription.medicine}" agregado al carrito`, 'success');
};

window.setReminderForPrescription = function(prescriptionId) {
  const prescription = (window.__prescriptionsCache || []).find(p => p.id === prescriptionId) || Store.getAllPrescriptions().find(p => p.id === prescriptionId);
  if (!prescription) return;
  
  if (prescription.source === 'supabase') {
    showToast('Los recordatorios solo están disponibles para recetas locales aún.', 'info');
    return;
  }
  
  Store.addMedicineReminder({
    prescriptionId,
    medicine: prescription.medicine,
    time: '08:00',
    days: [0, 1, 2, 3, 4, 5, 6],
    frequency: prescription.frequency
  });
  
  showToast(`Recordatorio configurado para ${prescription.medicine}`, 'success');
};

window.markPrescriptionUsed = function(prescriptionId) {
  const prescription = (window.__prescriptionsCache || []).find(p => p.id === prescriptionId) || Store.getAllPrescriptions().find(p => p.id === prescriptionId);
  
  if (prescription && prescription.source === 'supabase') {
    showToast('Las recetas del sistema no se pueden modificar desde la app aún.', 'info');
    return;
  }
  
  if (confirm('¿Marcar esta receta como utilizada?')) {
    Store.markPrescriptionUsed(prescriptionId);
    renderRecetas();
  }
};


// ============================================
// CAREGIVER PAGE - Family/Sub-accounts Management
// ============================================

function renderCaregiver() {
  const allProfiles = Store.getAllProfiles();
  const activeProfileId = Store.getActiveProfileId();
  const activeProfile = allProfiles.find(p => p.id === activeProfileId);
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem;">👨‍👩‍👧‍👦 Cuidado Familiar</h2>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">Gestiona perfiles de tu familia</p>
        </div>
        <div style="font-size: 2.5rem;">🏠</div>
      </div>
    </div>

    <!-- Active Profile Card -->
    <div style="padding: 1rem;">
      <div style="background: linear-gradient(135deg, #ede9fe, #f5f3ff); border-radius: 16px; padding: 1.25rem; margin-bottom: 1.5rem;">
        <div style="font-size: 0.8rem; color: #7c3aed; margin-bottom: 0.5rem;">Perfil activo:</div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 3rem;">${activeProfile?.avatar || '👤'}</div>
          <div>
            <div style="font-weight: 600; font-size: 1.2rem; color: #5b21b6;">${activeProfile?.name || 'Yo'}</div>
            <div style="font-size: 0.85rem; color: #8b5cf6;">${activeProfile?.isMain ? 'Cuenta principal' : 'Miembro de familia'}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Family Members List -->
    <div style="padding: 0 1rem 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="font-weight: 600;">Miembros de la familia</span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${allProfiles.length} perfiles</span>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${allProfiles.map(profile => `
          <div class="medicine-card" style="padding: 1rem; ${profile.id === activeProfileId ? 'background: #f5f3ff; border: 2px solid #8b5cf6;' : 'background: white;'} cursor: pointer;" onclick="switchToProfile('${profile.id}')">
            <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
              <div style="font-size: 2.5rem;">${profile.avatar || '👤'}</div>
              <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 1.05rem;">
                  ${profile.name}
                  ${profile.id === activeProfileId ? '<span style="font-size: 0.7rem; background: #8b5cf6; color: white; padding: 0.125rem 0.5rem; border-radius: 10px; margin-left: 0.5rem;">Activo</span>' : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                  ${profile.isMain ? 'Cuenta principal' : 'Miembro de familia'}
                  ${profile.relationship ? `• ${profile.relationship}` : ''}
                </div>
                ${profile.birthdate ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">📅 ${calculateAge(profile.birthdate)} años</div>` : ''}
              </div>
            </div>
            ${!profile.isMain ? `
              <button onclick="event.stopPropagation(); deleteFamilyMember('${profile.id}')" style="background: #fee2e2; color: #dc2626; border: none; padding: 0.5rem; border-radius: 8px; font-size: 1rem; cursor: pointer;">×</button>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Add Family Member -->
    <div style="padding: 0 1rem 1rem;">
      <button onclick="showAddFamilyMemberModal()" style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #ede9fe, #f5f3ff); border: 2px dashed #8b5cf6; border-radius: 16px; color: #5b21b6; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
        <span style="font-size: 1.5rem;">+</span>
        <span>Agregar familiar</span>
      </button>
    </div>

    <!-- Info Cards -->
    <div style="padding: 0 1rem 2rem;">
      <div style="background: #f8fafc; border-radius: 16px; padding: 1.25rem; margin-bottom: 1rem;">
        <div style="font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">💡 ¿Cómo funciona?</div>
        <ul style="margin: 0; padding-left: 1.2rem; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.8;">
          <li>Cada miembro tiene su propio perfil de salud</li>
          <li>Las recetas y citas se guardan por persona</li>
          <li>Puedes cambiar de perfil en cualquier momento</li>
          <li>Ideal para cuidar a niños o adultos mayores</li>
        </ul>
      </div>
      
      <div style="background: #fef3c7; border-radius: 12px; padding: 1rem; font-size: 0.85rem; color: #92400e;">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">🔒 Privacidad</div>
        <div>Toda la información de salud de cada miembro está separada y segura. Solo tú tienes acceso a los perfiles de tu familia.</div>
      </div>
    </div>
  `;
}

window.switchToProfile = function(profileId) {
  Store.setActiveProfile(profileId);
  const profile = Store.getProfileById(profileId);
  
  // Update main content based on active profile
  const message = profile?.isMain 
    ? `Has cambiado a tu perfil principal`
    : `Has cambiado al perfil de ${profile?.name}`;
  
  renderCaregiver();
  showToast(message, 'success');
};

window.deleteFamilyMember = function(profileId) {
  const profile = Store.getProfileById(profileId);
  if (!profile) return;
  
  if (confirm(`¿Eliminar el perfil de ${profile.name}?\n\nSe perderán todas sus recetas y datos de salud.`)) {
    Store.deleteSubProfile(profileId);
    renderCaregiver();
    showToast(`Perfil de ${profile.name} eliminado`, 'info');
  }
};

window.showAddFamilyMemberModal = function() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: flex-end; z-index: 1000;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px 20px 0 0; width: 100%; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">👨‍👩‍👧‍👦</div>
        <h3 style="margin: 0; font-size: 1.2rem;">Agregar Familiar</h3>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.85rem;">Crea un perfil para cuidar a alguien más</p>
      </div>
      
      <div style="padding: 1.5rem;">
        <!-- Avatar Selection -->
        <div style="margin-bottom: 1.25rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--text-secondary);">Selecciona un avatar:</label>
          <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
            ${['👶', '👦', '👧', '👨', '👩', '👴', '👵', '🐶', '🐱'].map(emoji => `
              <button onclick="selectAvatar(this, '${emoji}')" class="avatar-btn" style="width: 50px; height: 50px; font-size: 1.5rem; background: #f8fafc; border: 2px solid var(--border-color); border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;">${emoji}</button>
            `).join('')}
          </div>
          <input type="hidden" id="new-profile-avatar" value="👤">
        </div>
        
        <!-- Name -->
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-secondary);">Nombre</label>
          <input type="text" id="new-profile-name" placeholder="Ej: María, Papá, Junior..." style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
        </div>
        
        <!-- Relationship -->
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-secondary);">Parentesco / Relación</label>
          <select id="new-profile-relationship" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
            <option value="">Seleccionar...</option>
            <option value="Hijo/a">Hijo/a</option>
            <option value="Esposo/a">Esposo/a</option>
            <option value="Padre/Madre">Padre/Madre</option>
            <option value="Abuelo/a">Abuelo/a</option>
            <option value="Hermano/a">Hermano/a</option>
            <option value="Mascota">Mascota</option>
            <option value="Otro">Otro familiar</option>
          </select>
        </div>
        
        <!-- Birthdate (optional) -->
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-secondary);">Fecha de nacimiento (opcional)</label>
          <input type="date" id="new-profile-birthdate" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 12px; font-size: 1rem;">
        </div>
        
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.875rem; background: #f3f4f6; border: none; border-radius: 12px; cursor: pointer; font-weight: 500;">Cancelar</button>
          <button onclick="saveNewFamilyMember()" style="flex: 1; padding: 0.875rem; background: #8b5cf6; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Crear Perfil</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.selectAvatar = function(btn, emoji) {
  document.getElementById('new-profile-avatar').value = emoji;
  document.querySelectorAll('.avatar-btn').forEach(b => {
    b.style.background = '#f8fafc';
    b.style.borderColor = 'var(--border-color)';
  });
  btn.style.background = '#ede9fe';
  btn.style.borderColor = '#8b5cf6';
};

window.saveNewFamilyMember = function() {
  const name = document.getElementById('new-profile-name')?.value?.trim();
  const avatar = document.getElementById('new-profile-avatar')?.value || '👤';
  const relationship = document.getElementById('new-profile-relationship')?.value;
  const birthdate = document.getElementById('new-profile-birthdate')?.value;
  
  if (!name) {
    alert('Por favor ingresa un nombre');
    return;
  }
  
  const newProfile = Store.addSubProfile({
    name,
    avatar,
    relationship,
    birthdate
  });
  
  document.querySelector('.modal-overlay').remove();
  renderCaregiver();
  showToast(`Perfil de ${name} creado. Ahora puedes cambiar a este perfil.`, 'success');
};


// ============================================
// SHOPPING / COMPRAS - Full e-commerce flow
// ============================================

// Helper function to get cart count
function getCartCount() {
  return Store.getCartCount();
}

async function renderShop() {
  const cart = Store.getCart();
  const cartTotal = Store.getCartTotal();
  const cartCount = Store.getCartCount();
  
  // Categories
  const categories = [
    { id: 'all', name: 'Todos', icon: '📦' },
    { id: 'otc', name: 'Sin receta', icon: '💊' },
    { id: 'prescription', name: 'Con receta', icon: '📋' },
    { id: 'vitamins', name: 'Vitaminas', icon: '💪' }
  ];
  
  // Show loading state with shell layout
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 1.3rem;">🛒 Farmacia Apollo</h2>
          <p style="margin: 0.25rem 0 0; font-size: 0.85rem; opacity: 0.9;">Tu farmacia en línea</p>
        </div>
        <button onclick="showCart()" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;">
          <span>🛒</span>
          ${cartCount > 0 ? `<span style="background: white; color: #f59e0b; padding: 0.125rem 0.5rem; border-radius: 10px; font-size: 0.75rem; font-weight: 700;">${cartCount}</span>` : ''}
        </button>
      </div>
    </div>
    
    <!-- Search -->
    <div style="padding: 1rem; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1);">
      <div style="display: flex; gap: 0.5rem;">
        <input type="text" id="shop-search" placeholder="Buscar medicamentos..." style="flex: 1; padding: 0.75rem 1rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; font-size: 1rem; color: white;" onkeyup="filterShopProducts()">
        <button onclick="filterShopProducts()" style="padding: 0.75rem 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; cursor: pointer;">🔍</button>
      </div>
    </div>
    
    <!-- Categories -->
    <div style="padding: 1rem; background: rgba(255,255,255,0.03);">
      <div style="display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.25rem;">
        ${categories.map(cat => `
          <button onclick="filterByCategory('${cat.id}')" class="shop-cat-btn ${cat.id === 'all' ? 'active' : ''}" data-cat="${cat.id}" style="flex-shrink: 0; padding: 0.5rem 1rem; background: ${cat.id === 'all' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}; color: white; border: 1px solid ${cat.id === 'all' ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.15)'}; border-radius: 20px; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 0.25rem; backdrop-filter: blur(10px);">
            <span>${cat.icon}</span>
            <span>${cat.name}</span>
          </button>
        `).join('')}
      </div>
    </div>
    
    <!-- Products Grid - Loading -->
    <div style="padding: 1rem;">
      <div id="products-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
        <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
          <div style="color: white; font-size: 1rem;">Cargando productos...</div>
        </div>
      </div>
    </div>
    
    <!-- Empty State (hidden by default) -->
    <div id="no-products" style="display: none; text-align: center; padding: 3rem 1rem;">
      <div class="glass-card" style="padding: 2rem;">
        <div style="font-size: 4rem; margin-bottom: 0.5rem;">🔍</div>
        <div style="color: white;">No se encontraron productos</div>
      </div>
    </div>
    
    <!-- Cart Summary Bar (if items in cart) - Glass -->
    ${cartCount > 0 ? `
      <div style="position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); width: calc(100% - 2rem); max-width: 400px; background: linear-gradient(135deg, rgba(0,51,102,0.9), rgba(0,31,63,0.95)); backdrop-filter: blur(20px); color: white; border-radius: 16px; padding: 1rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.1); z-index: 90;">
        <div>
          <div style="font-size: 0.8rem; opacity: 0.9;">${cartCount} producto${cartCount > 1 ? 's' : ''}</div>
          <div style="font-weight: 700; font-size: 1.1rem; color: #c0c0c0;">$${cartTotal.toFixed(2)}</div>
        </div>
        <button onclick="showCart()" style="background: white; color: #003366; border: none; padding: 0.625rem 1.25rem; border-radius: 10px; font-weight: 600; cursor: pointer;">Ver carrito →</button>
      </div>
    ` : ''}
  `;
  
  // Fetch products from API
  let medicines = [];
  try {
    medicines = await FarmaciaAPI.getProducts();
  } catch (e) {
    console.warn('[renderShop] Error fetching products:', e);
    medicines = Store.getMedicines() || [];
  }
  
  // Cache for detail views
  window.__shopProducts = medicines;
  
  // Log data source
  if (medicines.length > 0 && medicines[0]?.source === 'supabase') {
    console.log('[renderShop] Products loaded from Supabase');
  } else {
    console.log('[renderShop] Products loaded from fallback');
  }
  
  // Update products grid
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  
  if (medicines.length === 0) {
    grid.innerHTML = `
      <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">📦</div>
        <div style="color: white; font-size: 1rem; margin-bottom: 0.25rem;">No hay productos disponibles</div>
        <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">Intenta más tarde o contacta a la farmacia</div>
      </div>
    `;
  } else {
    grid.innerHTML = medicines.map(med => `
      <div class="glass-card product-card" data-category="${med.category}" data-name="${med.name.toLowerCase()}" style="padding: 1rem; display: flex; flex-direction: column;">
        <div style="background: ${med.category === 'prescription' ? 'rgba(139,92,246,0.2)' : med.category === 'vitamins' ? 'rgba(0,212,170,0.2)' : 'rgba(255,255,255,0.08)'}; border-radius: 10px; padding: 1rem; text-align: center; margin-bottom: 0.75rem;">
          <div style="font-size: 2.5rem;">${med.category === 'prescription' ? '💊' : med.category === 'vitamins' ? '💪' : '💊'}</div>
        </div>
        <div style="flex: 1;">
          <div style="font-size: 0.65rem; color: ${med.category === 'prescription' ? '#a78bfa' : med.category === 'vitamins' ? '#00d4aa' : 'rgba(255,255,255,0.6)'}; margin-bottom: 0.25rem; text-transform: uppercase; font-weight: 600; letter-spacing: 0.03em;">${med.category === 'prescription' ? 'Con receta' : med.category === 'vitamins' ? 'Vitamina' : 'Sin receta'}</div>
          <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.25rem; line-height: 1.3; color: white;">${med.name}</div>
          <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); margin-bottom: 0.5rem;">${med.brand}</div>
          <div style="font-size: 1.1rem; font-weight: 700; color: #c0c0c0;">$${med.price.toFixed(2)}</div>
        </div>
        <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
          <button onclick="showProductDetail('${med.id}')" style="flex: 1; padding: 0.5rem; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-size: 0.8rem; cursor: pointer;">Ver</button>
          <button onclick="quickAddToCart('${med.id}')" style="padding: 0.5rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 8px; font-size: 0.9rem; cursor: pointer;">🛒</button>
        </div>
      </div>
    `).join('');
  }
}

// Shop filter functions
window.filterByCategory = function(category) {
  // Update active button
  document.querySelectorAll('.shop-cat-btn').forEach(btn => {
    const isActive = btn.dataset.cat === category;
    btn.style.background = isActive ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)';
    btn.style.borderColor = isActive ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.15)';
  });
  
  // Filter products
  const cards = document.querySelectorAll('.product-card');
  let visibleCount = 0;
  
  cards.forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = 'flex';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });
  
  document.getElementById('no-products').style.display = visibleCount === 0 ? 'block' : 'none';
};

window.filterShopProducts = function() {
  const searchTerm = document.getElementById('shop-search')?.value.toLowerCase() || '';
  const cards = document.querySelectorAll('.product-card');
  let visibleCount = 0;
  
  cards.forEach(card => {
    const name = card.dataset.name;
    if (name.includes(searchTerm)) {
      card.style.display = 'flex';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });
  
  document.getElementById('no-products').style.display = visibleCount === 0 ? 'block' : 'none';
};

window.showProductDetail = function(medicineId) {
  const medicines = window.__shopProducts || Store.getMedicines() || [];
  const med = medicines.find(m => m.id === medicineId);
  if (!med) return;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; height: 100%; background: rgba(0,0,0,0.5); display: flex; flex-direction: column; justify-content: flex-end; z-index: 1000;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px 20px 0 0; width: 100%; max-height: 85vh; overflow-y: auto;">
      <div style="padding: 1.5rem;">
        <button onclick="this.closest('.modal-overlay').remove()" style="position: absolute; top: 1rem; right: 1rem; background: #f3f4f6; border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 1.25rem; cursor: pointer;">×</button>
        
        <div style="background: ${med.category === 'prescription' ? '#dbeafe' : med.category === 'vitamins' ? '#f0fdf4' : '#f8fafc'}; border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.5rem;">
          <div style="font-size: 4rem;">${med.category === 'prescription' ? '💊' : med.category === 'vitamins' ? '💪' : '💊'}</div>
        </div>
        
        <div style="margin-bottom: 0.5rem;">
          <span style="background: ${med.category === 'prescription' ? '#dbeafe' : med.category === 'vitamins' ? '#d1fae5' : '#f3f4f6'}; color: ${med.category === 'prescription' ? '#1e40af' : med.category === 'vitamins' ? '#15803d' : 'var(--text-muted)'}; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">${med.category === 'prescription' ? 'Requiere receta' : med.category === 'vitamins' ? 'Suplemento' : 'Sin receta'}</span>
        </div>
        
        <h2 style="margin: 0 0 0.5rem; font-size: 1.4rem;">${med.name}</h2>
        <div style="color: var(--text-muted); margin-bottom: 1rem;">${med.brand}</div>
        
        <div style="font-size: 1.75rem; font-weight: 700; color: #003366; margin-bottom: 1.5rem;">$${med.price.toFixed(2)}</div>
        
        ${med.category === 'prescription' ? `
          <div style="background: #fef3c7; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;">
            <div style="font-size: 0.85rem; color: #92400e;">⚠️ Este medicamento requiere receta médica. Asegúrate de tener una receta válida antes de ordenar.</div>
          </div>
        ` : ''}
        
        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Cantidad</label>
          <div style="display: flex; align-items: center; gap: 1rem;">
            <button onclick="updateDetailQty(-1)" style="width: 40px; height: 40px; background: #f3f4f6; border: none; border-radius: 10px; font-size: 1.25rem; cursor: pointer;">−</button>
            <span id="detail-qty" style="font-size: 1.25rem; font-weight: 600; min-width: 40px; text-align: center;">1</span>
            <button onclick="updateDetailQty(1)" style="width: 40px; height: 40px; background: #f3f4f6; border: none; border-radius: 10px; font-size: 1.25rem; cursor: pointer;">+</button>
          </div>
        </div>
        
        <button onclick="addToCartFromDetail('${med.id}')" style="width: 100%; padding: 1rem; background: #f59e0b; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer;">
          🛒 Agregar $${med.price.toFixed(2)}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.updateDetailQty = function(change) {
  const qtyEl = document.getElementById('detail-qty');
  let qty = parseInt(qtyEl.textContent) + change;
  if (qty < 1) qty = 1;
  qtyEl.textContent = qty;
};

window.addToCartFromDetail = function(medicineId) {
  const qty = parseInt(document.getElementById('detail-qty')?.textContent || '1');
  Store.addToCart(medicineId, qty);
  document.querySelector('.modal-overlay')?.remove();
  renderShop();
  updateCartBadge();
  showToast('Producto agregado al carrito', 'success');
};

window.quickAddToCart = function(medicineId) {
  Store.addToCart(medicineId, 1);
  renderShop();
  updateCartBadge();
  
  // Show mini toast
  const toast = document.createElement('div');
  toast.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 1rem 2rem; border-radius: 12px; z-index: 2000; font-weight: 600;';
  toast.textContent = '✅ Agregado';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1000);
};

window.showCart = function() {
  const cart = Store.getCart();
  const total = Store.getCartTotal();
  
  if (cart.length === 0) {
    showToast('Tu carrito está vacío', 'info');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; top: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; height: 100%; background: #f8fafc; display: flex; flex-direction: column; z-index: 1000;';
  modal.innerHTML = `
    <!-- Header -->
    <div style="padding: 1rem; background: #003366; color: white; display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
      <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">←</button>
      <div style="font-weight: 600; font-size: 1.1rem;">🛒 Tu Carrito</div>
      <div style="margin-left: auto; font-size: 0.9rem;">${cart.length} item${cart.length > 1 ? 's' : ''}</div>
    </div>
    
    <!-- Cart Items -->
    <div style="flex: 1; overflow-y: auto; padding: 1rem; min-height: 0;">
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${cart.map(item => `
          <div style="background: white; border-radius: 12px; padding: 1rem; display: flex; gap: 1rem; align-items: center;">
            <div style="width: 60px; height: 60px; background: #f8fafc; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">💊</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem;">${item.name}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">$${item.price.toFixed(2)} c/u</div>
              <div style="display: flex; align-items: center; gap: 0.75rem; margin-top: 0.5rem;">
                <button onclick="updateCartItemQty('${item.medicineId}', -1)" style="width: 28px; height: 28px; background: #f3f4f6; border: none; border-radius: 6px; cursor: pointer;">−</button>
                <span style="font-weight: 600; min-width: 24px; text-align: center;">${item.quantity}</span>
                <button onclick="updateCartItemQty('${item.medicineId}', 1)" style="width: 28px; height: 28px; background: #f3f4f6; border: none; border-radius: 6px; cursor: pointer;">+</button>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 700; font-size: 1.1rem;">$${(item.price * item.quantity).toFixed(2)}</div>
              <button onclick="removeCartItem('${item.medicineId}')" style="background: none; border: none; color: #dc2626; font-size: 0.8rem; cursor: pointer; margin-top: 0.25rem;">Eliminar</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    <!-- Footer Summary -->
    <div style="background: white; border-top: 1px solid var(--border-color); padding: 1rem; flex-shrink: 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
        <span style="color: var(--text-muted);">Subtotal</span>
        <span>$${total.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; font-size: 1.1rem; font-weight: 700;">
        <span>Total</span>
        <span style="color: #003366;">$${total.toFixed(2)}</span>
      </div>
      <button onclick="showCheckout()" style="width: 100%; padding: 1rem; background: #003366; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer;">Proceder al pago →</button>
    </div>
  `;
  document.body.appendChild(modal);
};

window.updateCartItemQty = function(medicineId, change) {
  const cart = Store.getCart();
  const item = cart.find(i => i.medicineId === medicineId);
  if (!item) return;
  
  const newQty = item.quantity + change;
  if (newQty < 1) {
    removeCartItem(medicineId);
    return;
  }
  
  Store.updateCartQuantity(medicineId, newQty);
  showCart(); // Refresh modal
  renderShop(); // Update background page
  updateCartBadge(); // Update nav badge
};

window.removeCartItem = function(medicineId) {
  Store.removeFromCart(medicineId);
  showCart(); // Refresh modal
  renderShop(); // Update background page
  updateCartBadge(); // Update nav badge
};

window.showCheckout = function() {
  const cart = Store.getCart();
  const total = Store.getCartTotal();
  
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: white; height: 100%; display: flex; flex-direction: column;">
      <!-- Header -->
      <div style="padding: 1rem; background: #003366; color: white; display: flex; align-items: center; gap: 1rem; flex-shrink: 0;">
        <button onclick="showCart()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">←</button>
        <div style="font-weight: 600; font-size: 1.1rem;">💳 Pago</div>
      </div>
      
      <div style="flex: 1; overflow-y: auto; padding: 1.5rem; min-height: 0;">
        <!-- Delivery Info -->
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin: 0 0 1rem; font-size: 1rem;">📍 Entrega</h3>
          <div style="background: #f8fafc; border-radius: 12px; padding: 1rem;">
            <div style="font-weight: 600; margin-bottom: 0.25rem;">Farmacia Apollo - Polanco</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Masaryk 456, Polanco, CDMX</div>
            <div style="font-size: 0.85rem; color: #00A86B; margin-top: 0.5rem;">✓ Listo en 30 min</div>
          </div>
        </div>
        
        <!-- Order Summary -->
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin: 0 0 1rem; font-size: 1rem;">📦 Tu orden</h3>
          <div style="background: #f8fafc; border-radius: 12px; padding: 1rem;">
            ${cart.map(item => `
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem;">
                <span>${item.quantity}x ${item.name}</span>
                <span>$${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            `).join('')}
            <div style="border-top: 1px solid var(--border-color); margin-top: 0.75rem; padding-top: 0.75rem; display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem;">
              <span>Total</span>
              <span style="color: #003366;">$${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <!-- Payment Method -->
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin: 0 0 1rem; font-size: 1rem;">💳 Método de pago</h3>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <label style="display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: #f8fafc; border-radius: 12px; cursor: pointer; border: 2px solid #003366;">
              <input type="radio" name="payment" value="card" checked style="width: 20px; height: 20px;">
              <span style="font-size: 1.25rem;">💳</span>
              <div>
                <div style="font-weight: 600;">Tarjeta de crédito/débito</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Visa, Mastercard, AMEX</div>
              </div>
            </label>
            <label style="display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: #f8fafc; border-radius: 12px; cursor: pointer; border: 2px solid transparent;">
              <input type="radio" name="payment" value="cash" style="width: 20px; height: 20px;">
              <span style="font-size: 1.25rem;">💵</span>
              <div>
                <div style="font-weight: 600;">Pago en tienda</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Paga al recoger</div>
              </div>
            </label>
          </div>
        </div>
        
        <!-- Card Info (if card selected) -->
        <div id="card-fields">
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Número de tarjeta</label>
            <input type="text" placeholder="1234 5678 9012 3456" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 10px; font-size: 1rem;">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Vencimiento</label>
              <input type="text" placeholder="MM/AA" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 10px; font-size: 1rem;">
            </div>
            <div>
              <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">CVV</label>
              <input type="text" placeholder="123" style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 10px; font-size: 1rem;">
            </div>
          </div>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="background: white; border-top: 1px solid var(--border-color); padding: 1rem; flex-shrink: 0;">
        <button onclick="processOrder()" style="width: 100%; padding: 1rem; background: #00A86B; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 1rem; cursor: pointer;">Pagar $${total.toFixed(2)}</button>
      </div>
    </div>
  `;
};

window.processOrder = async function() {
  const cart = Store.getCart();
  const total = Store.getCartTotal();
  const paymentMethod = document.querySelector('input[name="payment"]:checked')?.value || 'cash';
  
  let order = null;
  let useSupabase = false;
  
  // Try Supabase if available and user is authenticated
  if (FarmaciaAPI.isSupabaseAvailable() && currentAuthUser) {
    try {
      const { order: supabaseOrder, error } = await FarmaciaAPI.placeOrder(cart, {
        total: total,
        patientName: currentCustomerProfile?.name || Store.getProfile()?.name || 'Paciente',
        paymentMethod: paymentMethod
      });
      
      if (!error && supabaseOrder) {
        order = supabaseOrder;
        useSupabase = true;
        Store.clearCart();
        console.log('[placeOrder] Supabase order created');
      } else {
        throw error || new Error('Unknown error');
      }
    } catch (e) {
      console.warn('[placeOrder] Supabase order failed, falling back:', e.message);
    }
  }
  
  // Fallback to localStorage
  if (!order) {
    order = Store.placeOrder({
      items: cart,
      total: total,
      patientName: Store.getProfile()?.name || 'Paciente',
      payment: paymentMethod === 'card' ? 'Tarjeta' : 'Efectivo',
      delivery: 'Recogida en tienda'
    });
    console.log('[placeOrder] Fallback localStorage order created');
  }
  
  updateCartBadge();
  
  const modal = document.querySelector('.modal-overlay');
  modal.innerHTML = `
    <div style="background: white; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; text-align: center;">
      <div style="font-size: 5rem; margin-bottom: 1rem;">✅</div>
      <h2 style="color: #00A86B; margin: 0 0 0.5rem;">¡Orden confirmada!</h2>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Pedido #${order.id}</p>
      ${useSupabase ? `<p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Guardado en tu historial</p>` : ''}
      
      <div style="background: #f0fdf4; border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; width: 100%; max-width: 300px;">
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">Estado</div>
        <div style="font-weight: 600; color: #00A86B;">Procesando</div>
        <div style="font-size: 0.8rem; color: #22c55e; margin-top: 0.5rem;">✓ Listo para recoger en ~30 min</div>
      </div>
      
      <button onclick="this.closest('.modal-overlay').remove(); renderShop();" class="btn-modal-primary">Seguir comprando</button>
    </div>
  `;
};

// ============================================
// ORDERS PAGE - Purchase History
// ============================================

async function renderOrders() {
  // Show loading state
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1.5rem 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
      <h1 style="margin: 0; font-size: 1.4rem; font-weight: 700;">📦 Mis Pedidos</h1>
      <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Historial de compras</p>
    </div>
    
    <div style="padding: 3rem 1rem; text-align: center;">
      <div class="glass-card" style="padding: 2rem;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">⏳</div>
        <div style="color: white; font-size: 1rem;">Cargando pedidos...</div>
      </div>
    </div>
  `;
  
  // Fetch orders from API
  let orders = [];
  try {
    orders = await FarmaciaAPI.getCustomerOrders();
  } catch (e) {
    console.warn('[renderOrders] Error fetching orders:', e);
    orders = Store.getOrders() || [];
  }
  
  // Cache for detail views
  window.__ordersCache = orders;
  
  // Log data source
  if (orders.length > 0 && orders[0]?.source === 'supabase') {
    console.log('[renderOrders] Orders loaded from Supabase');
  } else {
    console.log('[renderOrders] Orders loaded from fallback');
  }
  
  // Calculate stats
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter(o => o.status === 'Entregado').length;
  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  
  // Status colors
  const statusColors = {
    'Entregado': { bg: 'rgba(0,212,170,0.2)', color: '#00d4aa', icon: '✓' },
    'Procesando': { bg: 'rgba(59,130,246,0.2)', color: '#60a5fa', icon: '⏳' },
    'Enviado': { bg: 'rgba(139,92,246,0.2)', color: '#a78bfa', icon: '🚚' },
    'Cancelado': { bg: 'rgba(255,107,107,0.2)', color: '#ff6b6b', icon: '✕' }
  };
  
  mainContent.innerHTML = `
    <!-- Header -->
    <div style="padding: 1.5rem 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
      <h1 style="margin: 0; font-size: 1.4rem; font-weight: 700;">📦 Mis Pedidos</h1>
      <p style="margin: 0.5rem 0 0; font-size: 0.9rem; opacity: 0.9;">Historial de compras</p>
    </div>
    
    <!-- Stats Summary - Glass Cards -->
    <div style="padding: 1rem;">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
        <div class="glass-card" style="padding: 1rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #c0c0c0;">${totalOrders}</div>
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.03em;">Pedidos</div>
        </div>
        <div class="glass-card" style="padding: 1rem; text-align: center;">
          <div style="font-size: 1.5rem; font-weight: 700; color: #00d4aa;">${deliveredOrders}</div>
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.03em;">Entregados</div>
        </div>
        <div class="glass-card" style="padding: 1rem; text-align: center;">
          <div style="font-size: 1.25rem; font-weight: 700; color: #c0c0c0;">$${totalSpent.toFixed(0)}</div>
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.03em;">Total</div>
        </div>
      </div>
    </div>
    
    <!-- Orders List -->
    <div style="padding: 0 1rem 2rem;">
      <div style="font-weight: 600; color: white; margin-bottom: 0.75rem; font-size: 1rem;">📋 Historial de Compras</div>
      
      ${orders.length === 0 ? `
        <div class="glass-card" style="text-align: center; padding: 3rem 1rem;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">📦</div>
          <div style="color: white; font-size: 1rem; margin-bottom: 0.25rem;">No tienes pedidos aún</div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 1rem;">Tus compras aparecerán aquí</div>
          <button onclick="renderShop()" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Ir a la tienda</button>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${orders.map(order => {
            const status = statusColors[order.status] || statusColors['Procesando'];
            const itemCount = order.items ? order.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
            return `
              <div class="glass-card" style="padding: 1rem; cursor: pointer;" onclick="showOrderDetail('${order.id}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                  <div>
                    <div style="font-weight: 600; color: white; font-size: 1rem;">Pedido #${order.id}</div>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin-top: 0.15rem;">${new Date(order.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  </div>
                  <span style="background: ${status.bg}; color: ${status.color}; padding: 0.35rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 0.35rem;">
                    <span>${status.icon}</span>
                    <span>${order.status}</span>
                  </span>
                </div>
                
                <!-- Items Preview -->
                <div style="margin-bottom: 0.75rem;">
                  ${order.items ? order.items.slice(0, 2).map(item => `
                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-bottom: 0.15rem;">
                      ${item.quantity}x ${item.name}
                    </div>
                  `).join('') : ''}
                  ${order.items && order.items.length > 2 ? `
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5);">+${order.items.length - 2} productos más</div>
                  ` : ''}
                </div>
                
                <!-- Delivery & Total -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.1);">
                  <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">
                    🚚 ${order.delivery || 'Envío estándar'}
                  </div>
                  <div style="font-size: 1.1rem; font-weight: 700; color: #c0c0c0;">
                    $${order.total.toFixed(2)}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
    
    <!-- Quick Actions -->
    <div style="padding: 0 1rem 2rem;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <button onclick="renderShop()" class="glass-card" style="padding: 1rem; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
          <div style="font-size: 1.75rem;">🛒</div>
          <div style="font-size: 0.85rem; font-weight: 600; color: white;">Comprar</div>
        </button>
        <button onclick="renderRecetas()" class="glass-card" style="padding: 1rem; border: none; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
          <div style="font-size: 1.75rem;">📄</div>
          <div style="font-size: 0.85rem; font-weight: 600; color: white;">Mis Recetas</div>
        </button>
      </div>
    </div>
  `;
}

// Show order detail modal
window.showOrderDetail = function(orderId) {
  const orders = window.__ordersCache || Store.getOrders() || [];
  const order = orders.find(o => o.id === orderId);
  if (!order) return;
  
  const statusColors = {
    'Entregado': { bg: 'rgba(0,212,170,0.2)', color: '#00d4aa' },
    'Procesando': { bg: 'rgba(59,130,246,0.2)', color: '#60a5fa' },
    'Enviado': { bg: 'rgba(139,92,246,0.2)', color: '#a78bfa' },
    'Cancelado': { bg: 'rgba(255,107,107,0.2)', color: '#ff6b6b' }
  };
  const status = statusColors[order.status] || statusColors['Procesando'];
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: flex-end; z-index: 1000;';
  modal.innerHTML = `
    <div style="background: linear-gradient(135deg, #0f172a, #1e293b); width: 100%; max-width: 430px; max-height: 85vh; overflow-y: auto; border-radius: 24px 24px 0 0; animation: slideUp 0.3s ease;">
      <!-- Header -->
      <div style="padding: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #003366, #1a4d7a);">
        <div>
          <div style="font-weight: 700; color: white; font-size: 1.1rem;">Pedido #${order.id}</div>
          <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7);">${new Date(order.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <button onclick="this.closest('.modal-overlay').remove()" style="background: rgba(255,255,255,0.1); border: none; color: white; width: 36px; height: 36px; border-radius: 50%; font-size: 1.25rem; cursor: pointer; display: flex; align-items: center; justify-content: center;">×</button>
      </div>
      
      <div style="padding: 1.25rem;">
        <!-- Status -->
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <span style="background: ${status.bg}; color: ${status.color}; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; font-weight: 600;">
            ${order.status}
          </span>
        </div>
        
        <!-- Items -->
        <div style="margin-bottom: 1.5rem;">
          <div style="font-weight: 600; color: white; margin-bottom: 0.75rem; font-size: 0.95rem;">📦 Productos</div>
          <div class="glass-card" style="padding: 0; overflow: hidden;">
            ${order.items ? order.items.map((item, idx) => `
              <div style="padding: 1rem; ${idx !== order.items.length - 1 ? 'border-bottom: 1px solid rgba(255,255,255,0.1);' : ''} display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 40px; height: 40px; background: rgba(0,212,170,0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">💊</div>
                  <div>
                    <div style="font-weight: 500; color: white; font-size: 0.9rem;">${item.name}</div>
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6);">${item.quantity} x $${item.price.toFixed(2)}</div>
                  </div>
                </div>
                <div style="font-weight: 600; color: #c0c0c0;">$${(item.quantity * item.price).toFixed(2)}</div>
              </div>
            `).join('') : '<div style="padding: 1rem; color: rgba(255,255,255,0.6);">Sin productos</div>'}
          </div>
        </div>
        
        <!-- Delivery Info -->
        <div style="margin-bottom: 1.5rem;">
          <div style="font-weight: 600; color: white; margin-bottom: 0.75rem; font-size: 0.95rem;">🚚 Entrega</div>
          <div class="glass-card" style="padding: 1rem;">
            <div style="color: white; font-size: 0.9rem; margin-bottom: 0.25rem;">${order.delivery || 'Envío estándar'}</div>
            <div style="color: rgba(255,255,255,0.6); font-size: 0.8rem;">Dirección registrada en perfil</div>
          </div>
        </div>
        
        <!-- Payment Info -->
        <div style="margin-bottom: 1.5rem;">
          <div style="font-weight: 600; color: white; margin-bottom: 0.75rem; font-size: 0.95rem;">💳 Pago</div>
          <div class="glass-card" style="padding: 1rem;">
            <div style="color: white; font-size: 0.9rem;">${order.payment || 'Tarjeta'}</div>
          </div>
        </div>
        
        <!-- Total -->
        <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="color: rgba(255,255,255,0.8); font-size: 0.95rem;">Total</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: #c0c0c0;">$${order.total.toFixed(2)}</div>
          </div>
        </div>
        
        ${order.status !== 'Cancelado' ? `
          <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem;">
            <button onclick="reorder('${order.id}')" style="flex: 1; padding: 0.875rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">🔄 Reordenar</button>
            ${order.status === 'Procesando' ? `
              <button onclick="cancelOrder('${order.id}')" style="padding: 0.875rem 1.25rem; background: rgba(255,107,107,0.2); color: #ff6b6b; border: 1px solid rgba(255,107,107,0.3); border-radius: 12px; font-weight: 600; cursor: pointer;">Cancelar</button>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

// Reorder function
window.reorder = function(orderId) {
  const allOrders = window.__ordersCache || Store.getOrders() || [];
  const order = allOrders.find(o => o.id === orderId);
  if (!order || !order.items) return;
  
  // Add items to cart
  order.items.forEach(item => {
    const med = (window.__shopProducts || Store.getMedicines() || []).find(m => m.name === item.name);
    if (med) {
      Store.addToCart(med.id, item.quantity);
    }
  });
  
  document.querySelector('.modal-overlay')?.remove();
  renderShop();
  updateCartBadge();
  
  const toast = document.createElement('div');
  toast.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.8); color: white; padding: 1rem 2rem; border-radius: 12px; z-index: 2000; font-weight: 600;';
  toast.textContent = '🛒 Items agregados al carrito';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
};

// Cancel order function
window.cancelOrder = function(orderId) {
  if (!confirm('¿Cancelar este pedido?')) return;
  
  const allOrders = window.__ordersCache || Store.getOrders() || [];
  const order = allOrders.find(o => o.id === orderId);
  
  if (order && order.source === 'supabase') {
    showToast('Los pedidos del sistema no se pueden cancelar desde la app aún. Contacta a la farmacia.', 'info');
    return;
  }
  
  const localOrders = Store.getOrders() || [];
  const updatedOrders = localOrders.map(o => 
    o.id === orderId ? { ...o, status: 'Cancelado' } : o
  );
  localStorage.setItem('apollo_orders', JSON.stringify(updatedOrders));
  
  if (window.__ordersCache) {
    window.__ordersCache = window.__ordersCache.map(o => 
      o.id === orderId ? { ...o, status: 'Cancelado' } : o
    );
  }
  
  document.querySelector('.modal-overlay')?.remove();
  renderOrders();
  showToast('Pedido cancelado', 'info');
};

// ============================================
// WELLNESS REMINDERS
// ============================================

window.showWellnessReminders = function() {
  const reminders = Store.getWellnessReminders();
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 400px; max-height: 90vh; overflow-y: auto;">
      <div style="padding: 1.25rem; border-bottom: 1px solid #e5e7eb; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
        <h3 style="margin: 0; font-size: 1.2rem;">🩺 Recordatorios de Salud</h3>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.9rem;">Mantén al día tus revisiones</p>
      </div>
      
      <div style="padding: 1rem;">
        ${reminders.map(r => {
          const hasDate = r.lastDate || r.nextDate;
          const nextDate = r.nextDate ? new Date(r.nextDate).toLocaleDateString('es-MX') : 'No programado';
          return `
            <div style="padding: 1rem; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 0.75rem;">
              <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                <span style="font-size: 1.5rem;">${r.icon}</span>
                <div>
                  <div style="font-weight: 600;">${r.name}</div>
                  <div style="font-size: 0.75rem; color: #6b7280;">${r.condition || 'Preventivo'} • Cada ${r.intervalMonths} meses</div>
                </div>
              </div>
              ${hasDate ? `
                <div style="font-size: 0.85rem; color: #374151; margin-bottom: 0.5rem;">
                  ${r.lastDate ? `Última: ${new Date(r.lastDate).toLocaleDateString('es-MX')}` : 'Sin registro'}
                </div>
              ` : ''}
              <div style="display: flex; gap: 0.5rem;">
                <button onclick="markWellnessDone('${r.id}')" style="flex: 1; padding: 0.5rem; background: #dcfce7; color: #166534; border: none; border-radius: 8px; font-size: 0.8rem; cursor: pointer;">✓ Lo hice hoy</button>
                <button onclick="scheduleWellness('${r.id}')" style="flex: 1; padding: 0.5rem; background: #f3f4f6; color: #374151; border: none; border-radius: 8px; font-size: 0.8rem; cursor: pointer;">📅 Programar</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <div style="padding: 1rem; border-top: 1px solid #e5e7eb;">
        <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 0.75rem; background: #f3f4f6; border: none; border-radius: 12px; font-weight: 500; cursor: pointer;">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.markWellnessDone = function(reminderId) {
  const now = new Date().toISOString();
  const reminders = Store.getWellnessReminders();
  const reminder = reminders.find(r => r.id === reminderId);
  if (!reminder) return;
  
  // Calculate next date based on interval
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + reminder.intervalMonths);
  
  Store.updateWellnessReminder(reminderId, {
    lastDate: now,
    nextDate: nextDate.toISOString()
  });
  
  // Refresh modal
  document.querySelector('.modal-overlay')?.remove();
  showWellnessReminders();
  
  // Refresh health page if visible
  if (currentPage === 'health') renderHealth();
};

window.scheduleWellness = function(reminderId) {
  const date = prompt('Fecha del próximo recordatorio (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
  if (!date) return;
  
  Store.updateWellnessReminder(reminderId, {
    nextDate: new Date(date).toISOString()
  });
  
  document.querySelector('.modal-overlay')?.remove();
  showWellnessReminders();
  if (currentPage === 'health') renderHealth();
};

// ============================================
// MISSED DOSE ALERTS
// ============================================

window.checkMissedDoseAlerts = function() {
  const missedDoses = Store.checkMissedDoses();
  
  if (missedDoses.length > 0) {
    // Show alert for the first missed dose
    const missed = missedDoses[0];
    
    // Mark alert as sent
    Store.markMissedAlertSent(missed.scheduleId, missed.doseId);
    
    // Show notification
    if (NotificationManager.isSupported()) {
      NotificationManager.showTestNotification?.() || alert(
        `⏰ ¿Olvidaste tu medicamento?\n\n${missed.medicine} - ${missed.dose}\nProgramado: ${missed.scheduledTime}\n\nToma tu dosis o márcala como saltada.`
      );
    }
  }
};

// Check for missed doses every 5 minutes
setInterval(checkMissedDoseAlerts, 5 * 60 * 1000);

// Also check on app load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkMissedDoseAlerts, 2000);
});

// ============================================
// HEALTH GUIDES
// ============================================

window.renderHealthGuides = function(categoryId = null, articleId = null) {
  if (articleId && categoryId) {
    // Show single article
    const article = getArticle(categoryId, articleId);
    const category = getGuideCategories().find(c => c.id === categoryId);
    
    if (!article) {
      renderHealthGuides();
      return;
    }
    
    mainContent.innerHTML = `
      <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <button onclick="renderHealthGuides('${categoryId}')" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; margin-bottom: 0.5rem;">← Volver</button>
        <h1 style="margin: 0; font-size: 1.3rem;">${category.icon} ${article.title}</h1>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.85rem;">${category.title} • ${article.readTime} min de lectura</p>
      </div>
      
      <div style="padding: 1.5rem; line-height: 1.8; color: #374151;">
        ${article.content.split('\n\n').map(p => `<p style="margin-bottom: 1rem;">${p.replace(/\n/g, '<br>')}</p>`).join('')}
      </div>
      
      <div style="padding: 1rem; border-top: 1px solid #e5e7eb;">
        <button onclick="renderHealthGuides('${categoryId}')" style="width: 100%; padding: 1rem; background: #f3f4f6; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">← Volver a ${category.title}</button>
      </div>
    `;
    return;
  }
  
  if (categoryId) {
    // Show articles in category
    const category = getGuideCategories().find(c => c.id === categoryId);
    const articles = getGuideArticles(categoryId);
    
    mainContent.innerHTML = `
      <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
        <button onclick="renderHealthGuides()" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; margin-bottom: 0.5rem;">← Volver</button>
        <h1 style="margin: 0; font-size: 1.5rem;">${category.icon} ${category.title}</h1>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.9rem;">${articles.length} artículos</p>
      </div>
      
      <div style="padding: 1rem;">
        ${articles.map(article => `
          <div onclick="renderHealthGuides('${categoryId}', '${article.id}')" style="padding: 1rem; background: white; border-radius: 12px; margin-bottom: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer;">
            <div style="font-weight: 600; color: #1f2937; margin-bottom: 0.25rem;">${article.title}</div>
            <div style="font-size: 0.8rem; color: #6b7280;">⏱️ ${article.readTime} min de lectura</div>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }
  
  // Show all categories
  const categories = getGuideCategories();
  
  mainContent.innerHTML = `
    <div style="padding: 1rem; background: linear-gradient(135deg, #003366, #1a4d7a); color: white;">
      <h1 style="margin: 0; font-size: 1.5rem;">📚 Guías de Salud</h1>
      <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.9rem;">Información confiable para tu bienestar</p>
    </div>
    
    <!-- Search -->
    <div style="padding: 1rem;">
      <input type="text" id="guide-search" placeholder="Buscar temas..." 
        style="width: 100%; padding: 0.875rem; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem;"
        onkeyup="searchHealthGuides(this.value)">
    </div>
    
    <!-- Search Results -->
    <div id="guide-search-results" style="padding: 0 1rem;"></div>
    
    <!-- Categories -->
    <div id="guide-categories" style="padding: 0 1rem 1rem;">
      ${categories.map(cat => `
        <div onclick="renderHealthGuides('${cat.id}')" style="padding: 1.25rem; background: white; border-radius: 16px; margin-bottom: 0.75rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; gap: 1rem;">
          <div style="font-size: 2.5rem;">${cat.icon}</div>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #1f2937; font-size: 1.1rem;">${cat.title}</div>
            <div style="font-size: 0.85rem; color: #6b7280;">${cat.articleCount} artículos</div>
          </div>
          <div style="font-size: 1.5rem; color: #9ca3af;">→</div>
        </div>
      `).join('')}
    </div>
  `;
};

window.searchHealthGuides = function(query) {
  const resultsDiv = document.getElementById('guide-search-results');
  const categoriesDiv = document.getElementById('guide-categories');
  
  if (!resultsDiv || !categoriesDiv) return;
  
  if (query.length < 2) {
    resultsDiv.innerHTML = '';
    categoriesDiv.style.display = 'block';
    return;
  }
  
  const results = searchGuides(query);
  categoriesDiv.style.display = 'none';
  
  if (results.length === 0) {
    resultsDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6b7280;">No se encontraron resultados</div>';
    return;
  }
  
  resultsDiv.innerHTML = `
    <div style="margin-bottom: 0.5rem; color: #6b7280; font-size: 0.9rem;">${results.length} resultados</div>
    ${results.map(article => `
      <div onclick="renderHealthGuides('${article.categoryId}', '${article.id}')" style="padding: 1rem; background: white; border-radius: 12px; margin-bottom: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer;">
        <div style="font-size: 0.75rem; color: #003366; text-transform: uppercase; margin-bottom: 0.25rem;">${article.categoryTitle}</div>
        <div style="font-weight: 600; color: #1f2937;">${article.title}</div>
      </div>
    `).join('')}
  `;
};

// ============================================
// VACCINE SCHEDULE TRACKER
// ============================================

window.renderVaccineTracker = async function() {
  const profile = Store.getProfile();
  const allProfiles = Store.getAllProfiles();
  const activeProfileId = Store.getActiveProfileId();
  
  // Import vaccine data
  const { VACCINE_SCHEDULE, getAllVaccineCategories } = await import('./data.js?v=8');
  const categories = getAllVaccineCategories();
  
  // Get vaccine records
  const records = Store.getVaccineRecords().filter(r => r.profileId === activeProfileId);
  
  // Calculate age in months
  const birthdate = profile.birthdate;
  const ageMonths = birthdate ? Math.floor((new Date() - new Date(birthdate)) / (30.44 * 24 * 60 * 60 * 1000)) : null;
  const ageDisplay = ageMonths !== null 
    ? ageMonths < 12 ? `${ageMonths} meses` : `${Math.floor(ageMonths/12)} años ${ageMonths%12} meses`
    : 'Edad no configurada';
  
  mainContent.innerHTML = `
    <div style="padding: 1rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
      <h1 style="margin: 0; font-size: 1.3rem;">💉 Esquema de Vacunación</h1>
      <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.85rem;">
        ${profile.name || 'Paciente'} • ${ageDisplay}
      </p>
    </div>
    
    <!-- Progress Summary with Silver Ring -->
    <div style="padding: 1.5rem 1rem; background: linear-gradient(135deg, #1e293b, #0f172a);">
      ${(() => {
        const totalVaccines = categories.reduce((sum, cat) => sum + cat.vaccineCount, 0);
        const completedVaccines = records.filter(r => r.administeredDate).length;
        const progressPercent = totalVaccines > 0 ? Math.round((completedVaccines / totalVaccines) * 100) : 0;
        const circumference = 2 * Math.PI * 45;
        const strokeDashoffset = circumference - (progressPercent / 100) * circumference;
        
        return `
          <div style="display: flex; align-items: center; gap: 1.5rem;">
            <!-- Silver Ring Progress -->
            <div style="position: relative; width: 100px; height: 100px; flex-shrink: 0;">
              <svg width="100" height="100" style="transform: rotate(-90deg);">
                <!-- Background ring (silver) -->
                <circle cx="50" cy="50" r="45" fill="none" stroke="#94a3b8" stroke-width="8" opacity="0.3"/>
                <!-- Progress ring (bright silver) -->
                <circle cx="50" cy="50" r="45" fill="none" stroke="#c0c0c0" stroke-width="8" 
                  stroke-linecap="round" 
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${strokeDashoffset}"
                  style="transition: stroke-dashoffset 0.5s ease;"
                />
              </svg>
              <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                <span style="font-size: 1.5rem; font-weight: 700; color: #f8fafc;">${progressPercent}%</span>
              </div>
            </div>
            
            <div style="flex: 1;">
              <div style="font-weight: 600; font-size: 1.1rem; color: #f8fafc; margin-bottom: 0.25rem;">Progreso de Vacunación</div>
              <div style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 0.75rem;">${completedVaccines} de ${totalVaccines} vacunas</div>
              <button onclick="showRecordVaccineModal()" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; border-radius: 8px; font-size: 0.8rem; font-weight: 500; cursor: pointer; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);">+ Registrar Vacuna</button>
            </div>
          </div>
        `;
      })()}
    </div>
    
    <!-- Vaccine Schedule -->
    <div style="padding: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem;">📅 Calendario de Vacunas</div>
      
      ${categories.slice(0, 8).map(cat => {
        const group = VACCINE_SCHEDULE[cat.key];
        const groupRecords = records.filter(r => group.vaccines.some(v => v.id === r.vaccineId));
        const completedCount = groupRecords.filter(r => r.administeredDate).length;
        const totalCount = group.vaccines.length;
        const isOverdue = ageMonths && cat.ageMonths && ageMonths > cat.ageMonths + 2 && completedCount < totalCount;
        
        return `
          <div style="margin-bottom: 0.75rem; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
            <div style="padding: 0.75rem 1rem; background: ${isOverdue ? '#fef3c7' : '#f9fafb'}; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-size: 0.95rem;">${cat.ageLabel}</div>
                <div style="font-size: 0.75rem; color: ${isOverdue ? '#92400e' : '#6b7280'};">
                  ${completedCount}/${totalCount} vacunas • ${isOverdue ? '⚠️ Revisa pendientes' : ''}
                </div>
              </div>
              <button onclick="toggleVaccineGroup('${cat.key}')" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;" id="toggle-${cat.key}">▼</button>
            </div>
            <div id="group-${cat.key}" style="display: none;">
              ${group.vaccines.map(v => {
                const record = records.find(r => r.vaccineId === v.id);
                const isCompleted = record?.administeredDate;
                return `
                  <div style="padding: 0.75rem 1rem; border-top: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-size: 0.9rem; ${isCompleted ? 'text-decoration: line-through; color: #9ca3af;' : ''}">${v.name}</div>
                      <div style="font-size: 0.75rem; color: #6b7280;">${v.disease}</div>
                    </div>
                    ${isCompleted 
                      ? `<span style="font-size: 0.75rem; color: #00A86B;">✓ ${new Date(record.administeredDate).toLocaleDateString('es-MX')}</span>`
                      : `<button onclick="showRecordVaccineModal('${v.id}', '${v.name}')" style="padding: 0.25rem 0.5rem; background: #8b5cf6; color: white; border: none; border-radius: 6px; font-size: 0.7rem; cursor: pointer;">Registrar</button>`
                    }
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    
    <!-- Vaccination Card Upload -->
    <div style="padding: 0 1rem 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem;">📷 Tarjeta de Vacunación</div>
      <div onclick="alert('Función de subida de foto - en implementación')" style="padding: 1.5rem; background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border: 2px dashed #0ea5e9; border-radius: 12px; text-align: center; cursor: pointer;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📷</div>
        <div style="font-weight: 600; color: #0369a1;">Subir foto de tarjeta</div>
        <div style="font-size: 0.8rem; color: #0ea5e9;">Guarda tu cartilla de vacunación</div>
      </div>
    </div>
  `;
};

window.toggleVaccineGroup = function(groupKey) {
  const group = document.getElementById(`group-${groupKey}`);
  const toggle = document.getElementById(`toggle-${groupKey}`);
  if (group.style.display === 'none') {
    group.style.display = 'block';
    toggle.textContent = '▲';
  } else {
    group.style.display = 'none';
    toggle.textContent = '▼';
  }
};

window.showRecordVaccineModal = function(vaccineId = null, vaccineName = null) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem;';
  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; width: 100%; max-width: 360px; overflow: hidden;">
      <div style="padding: 1.25rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
        <h3 style="margin: 0; font-size: 1.2rem;">💉 Registrar Vacuna</h3>
        <p style="margin: 0.25rem 0 0; opacity: 0.9; font-size: 0.9rem;">${vaccineName || 'Nueva vacuna'}</p>
      </div>
      
      <div style="padding: 1rem;">
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Fecha de aplicación</label>
          <input type="date" id="vaccine-date" value="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 1rem;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Lote (opcional)</label>
          <input type="text" id="vaccine-batch" placeholder="Ej: A12345" style="width: 100%; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 1rem;">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Lugar (opcional)</label>
          <input type="text" id="vaccine-location" placeholder="Ej: IMSS, Hospital General" style="width: 100%; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 1rem;">
        </div>
        
        <div style="margin-bottom: 0.5rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Notas (opcional)</label>
          <textarea id="vaccine-notes" placeholder="Reacciones, observaciones..." style="width: 100%; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 1rem; min-height: 80px; resize: vertical;"></textarea>
        </div>
      </div>
      
      <div style="padding: 1rem; border-top: 1px solid #e5e7eb; display: flex; gap: 0.5rem;">
        <button onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.75rem; background: #f3f4f6; border: none; border-radius: 12px; font-weight: 500; cursor: pointer;">Cancelar</button>
        <button onclick="saveVaccineRecord('${vaccineId}')" style="flex: 1; padding: 0.75rem; background: #8b5cf6; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
};

window.saveVaccineRecord = function(vaccineId) {
  const date = document.getElementById('vaccine-date')?.value;
  const batch = document.getElementById('vaccine-batch')?.value;
  const location = document.getElementById('vaccine-location')?.value;
  const notes = document.getElementById('vaccine-notes')?.value;
  
  if (!date) {
    alert('Por favor ingresa la fecha de aplicación');
    return;
  }
  
  Store.recordVaccine(Store.getActiveProfileId(), vaccineId, {
    date,
    batchNumber: batch,
    location,
    notes
  });
  
  document.querySelector('.modal-overlay')?.remove();
  renderVaccineTracker();
  showToast('Vacuna registrada. ¡+25 puntos!', 'success');
};

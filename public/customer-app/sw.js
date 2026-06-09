// Service Worker for Farmacia Apollo
// Handles push notifications for medication reminders

const CACHE_NAME = 'farmacia-apollo-v1';

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  let data = {
    title: '💊 Recordatorio de Medicamento',
    body: 'Es hora de tomar tu medicamento',
    icon: './icon-192x192.png',
    badge: './badge-72x72.png',
    tag: 'medication-reminder',
    requireInteraction: true,
    actions: [
      { action: 'taken', title: '✓ Tomada' },
      { action: 'skip', title: '✕ Saltar' },
      { action: 'open', title: 'Abrir App' }
    ],
    data: {}
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag || 'medication-reminder',
      requireInteraction: data.requireInteraction !== false,
      actions: data.actions,
      data: data.data
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  notification.close();
  
  // Handle actions
  if (action === 'taken') {
    // Mark dose as taken
    event.waitUntil(
      markDoseTaken(data.scheduleId, data.doseId)
    );
  } else if (action === 'skip') {
    // Mark dose as skipped
    event.waitUntil(
      markDoseSkipped(data.scheduleId, data.doseId)
    );
  } else {
    // Open app
    event.waitUntil(
      self.clients.openWindow('/')
    );
  }
});

// Mark dose as taken (communicate with main app)
async function markDoseTaken(scheduleId, doseId) {
  if (!scheduleId || !doseId) return;
  
  // Get all clients and tell them to mark dose as taken
  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.length > 0) {
    clients[0].postMessage({
      type: 'MARK_DOSE_TAKEN',
      scheduleId,
      doseId
    });
  }
  
  // Also send a confirmation notification
  await self.registration.showNotification('✅ Dosis registrada', {
    body: 'Se marcó como tomada exitosamente',
    icon: './icon-192x192.png',
    badge: './badge-72x72.png',
    tag: 'dose-confirmation',
    requireInteraction: false
  });
}

// Mark dose as skipped
async function markDoseSkipped(scheduleId, doseId) {
  if (!scheduleId || !doseId) return;
  
  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.length > 0) {
    clients[0].postMessage({
      type: 'MARK_DOSE_SKIPPED',
      scheduleId,
      doseId
    });
  }
}

// Handle messages from main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SCHEDULE_NOTIFICATION') {
    // Store scheduled notification in IndexedDB or cache
    // This would be used for background notifications
  }
});

// Periodic sync for medication reminders (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'medication-check') {
    event.waitUntil(checkMedicationReminders());
  }
});

// Check for medication reminders
async function checkMedicationReminders() {
  // This would check scheduled medications and show notifications
  // In a real implementation, you'd use the Alarm API or background sync
  console.log('[SW] Checking medication reminders...');
}

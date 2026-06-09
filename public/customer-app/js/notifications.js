// Notification Manager for Farmacia Apollo
// Handles browser notifications for medication reminders

export const NotificationManager = {
  // Check if notifications are supported
  isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  },

  // Request notification permission
  async requestPermission() {
    if (!this.isSupported()) {
      console.log('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      await this.registerServiceWorker();
      return true;
    }

    if (Notification.permission === 'denied') {
      console.log('Notification permission denied');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await this.registerServiceWorker();
      return true;
    }
    return false;
  },

  // Register service worker
  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  },

  // Get service worker registration
  async getRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    return navigator.serviceWorker.ready;
  },

  // Schedule a notification for a medication dose
  async scheduleDoseNotification(scheduleId, doseId, medicine, dose, time, dayOffset = 0) {
    if (!this.isSupported()) return;

    const registration = await this.getRegistration();
    if (!registration) return;

    // Calculate when to show notification
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const notificationTime = new Date();
    notificationTime.setHours(hours, minutes, 0, 0);
    
    // Add day offset
    notificationTime.setDate(notificationTime.getDate() + dayOffset);
    
    // If time has passed for today, schedule for tomorrow
    if (notificationTime <= now && dayOffset === 0) {
      notificationTime.setDate(notificationTime.getDate() + 1);
    }

    const delayMs = notificationTime.getTime() - now.getTime();

    // Store scheduled notification
    const scheduledNotifications = JSON.parse(localStorage.getItem('scheduledNotifications') || '[]');
    scheduledNotifications.push({
      id: `${scheduleId}_${doseId}`,
      scheduleId,
      doseId,
      medicine,
      dose,
      time,
      scheduledFor: notificationTime.toISOString(),
      shown: false
    });
    localStorage.setItem('scheduledNotifications', JSON.stringify(scheduledNotifications));

    // Use setTimeout for immediate scheduling (in a real app, you'd use Alarm API)
    if (delayMs > 0 && delayMs < 86400000) { // Only schedule within 24 hours
      setTimeout(() => {
        this.showDoseNotification(scheduleId, doseId, medicine, dose);
      }, delayMs);
    }

    console.log(`Scheduled notification for ${medicine} at ${time} (in ${Math.round(delayMs / 60000)} minutes)`);
  },

  // Show a dose notification immediately
  async showDoseNotification(scheduleId, doseId, medicine, dose) {
    const registration = await this.getRegistration();
    if (!registration) return;

    await registration.showNotification('💊 Hora de tu medicamento', {
      body: `${medicine}${dose ? ` - ${dose}` : ''}`,
      icon: './icon-192x192.png',
      badge: './badge-72x72.png',
      tag: `dose_${scheduleId}_${doseId}`,
      requireInteraction: true,
      actions: [
        { action: 'taken', title: '✓ Tomada' },
        { action: 'skip', title: '✕ Saltar' }
      ],
      data: {
        scheduleId,
        doseId,
        medicine,
        dose
      }
    });

    // Mark as shown
    this.markNotificationShown(scheduleId, doseId);
  },

  // Mark notification as shown
  markNotificationShown(scheduleId, doseId) {
    const scheduledNotifications = JSON.parse(localStorage.getItem('scheduledNotifications') || '[]');
    const updated = scheduledNotifications.map(n => {
      if (n.scheduleId === scheduleId && n.doseId === doseId) {
        return { ...n, shown: true };
      }
      return n;
    });
    localStorage.setItem('scheduledNotifications', JSON.stringify(updated));
  },

  // Schedule all notifications for a medication schedule
  async scheduleAllDoses(schedule) {
    if (!this.isSupported()) return;

    // Schedule each dose
    for (const dose of schedule.doses) {
      if (!dose.taken && !dose.skipped) {
        await this.scheduleDoseNotification(
          schedule.id,
          dose.id,
          schedule.medicine,
          schedule.dose,
          dose.time,
          dose.day
        );
      }
    }
  },

  // Cancel all notifications for a schedule
  async cancelScheduleNotifications(scheduleId) {
    const scheduledNotifications = JSON.parse(localStorage.getItem('scheduledNotifications') || '[]');
    const updated = scheduledNotifications.filter(n => n.scheduleId !== scheduleId);
    localStorage.setItem('scheduledNotifications', JSON.stringify(updated));

    // Close any pending notifications
    const registration = await this.getRegistration();
    if (registration) {
      const notifications = await registration.getNotifications();
      for (const notification of notifications) {
        if (notification.tag && notification.tag.includes(scheduleId)) {
          notification.close();
        }
      }
    }
  },

  // Check and show any pending notifications (called on app load)
  async checkPendingNotifications() {
    if (!this.isSupported()) return;

    const scheduledNotifications = JSON.parse(localStorage.getItem('scheduledNotifications') || '[]');
    const now = new Date();

    for (const notification of scheduledNotifications) {
      if (notification.shown) continue;

      const scheduledTime = new Date(notification.scheduledFor);
      
      // If it's time to show
      if (scheduledTime <= now) {
        await this.showDoseNotification(
          notification.scheduleId,
          notification.doseId,
          notification.medicine,
          notification.dose
        );
      }
    }

    // Clean up old shown notifications
    const cleaned = scheduledNotifications.filter(n => {
      if (!n.shown) return true;
      const scheduledTime = new Date(n.scheduledFor);
      const oneDayAgo = new Date(now.getTime() - 86400000);
      return scheduledTime > oneDayAgo;
    });
    localStorage.setItem('scheduledNotifications', JSON.stringify(cleaned));
  },

  // Show a test notification
  async showTestNotification() {
    const registration = await this.getRegistration();
    if (!registration) {
      alert('Las notificaciones no están disponibles');
      return;
    }

    await registration.showNotification('💊 Notificación de prueba', {
      body: 'Así se verán tus recordatorios de medicamentos',
      icon: './icon-192x192.png',
      badge: './badge-72x72.png',
      tag: 'test-notification',
      requireInteraction: false,
      actions: [
        { action: 'taken', title: '✓ Tomada' },
        { action: 'skip', title: '✕ Saltar' }
      ]
    });
  },

  // Get notification status
  getStatus() {
    if (!this.isSupported()) {
      return { supported: false, permission: 'unsupported' };
    }
    return {
      supported: true,
      permission: Notification.permission
    };
  }
};

// Listen for messages from service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    console.log('Message from SW:', event.data);
    
    if (event.data.type === 'MARK_DOSE_TAKEN') {
      // Dispatch custom event for app.js to handle
      window.dispatchEvent(new CustomEvent('doseTaken', {
        detail: { scheduleId: event.data.scheduleId, doseId: event.data.doseId }
      }));
    } else if (event.data.type === 'MARK_DOSE_SKIPPED') {
      window.dispatchEvent(new CustomEvent('doseSkipped', {
        detail: { scheduleId: event.data.scheduleId, doseId: event.data.doseId }
      }));
    }
  });
}

// Check pending notifications on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    NotificationManager.checkPendingNotifications();
  });
} else {
  NotificationManager.checkPendingNotifications();
}

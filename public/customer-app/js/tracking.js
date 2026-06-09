// Advanced Tracking Features
// Fasting, Sleep, and Check-in System

// ============================================
// FASTING TRACKER
// ============================================

export const FastingTracker = {
  // Fasting schedule presets
  presets: {
    '16:8': { name: '16:8 Clásico', fastHours: 16, eatHours: 8, description: 'Ayuna 16h, come 8h' },
    '18:6': { name: '18:6 Intensivo', fastHours: 18, eatHours: 6, description: 'Ayuna 18h, come 6h' },
    '20:4': { name: '20:4 Guerrero', fastHours: 20, eatHours: 4, description: 'Ayuna 20h, come 4h' },
    '14:10': { name: '14:10 Suave', fastHours: 14, eatHours: 10, description: 'Ayuna 14h, come 10h' },
    'OMAD': { name: 'OMAD', fastHours: 23, eatHours: 1, description: 'Una comida al día' },
    'custom': { name: 'Personalizado', fastHours: 16, eatHours: 8, description: 'Tu propio horario' }
  },

  getCurrentFast() {
    return JSON.parse(localStorage.getItem('currentFast') || 'null');
  },

  startFast(presetKey = '16:8', customHours = null) {
    const preset = this.presets[presetKey];
    const fastHours = customHours || preset.fastHours;
    
    const fast = {
      id: Date.now(),
      preset: presetKey,
      fastHours,
      eatHours: preset.eatHours,
      startTime: new Date().toISOString(),
      targetEndTime: new Date(Date.now() + fastHours * 60 * 60 * 1000).toISOString(),
      status: 'fasting',
      actualEndTime: null
    };
    
    localStorage.setItem('currentFast', JSON.stringify(fast));
    return fast;
  },

  endFast() {
    const fast = this.getCurrentFast();
    if (!fast) return null;
    
    fast.status = 'completed';
    fast.actualEndTime = new Date().toISOString();
    
    // Save to history
    const history = this.getFastHistory();
    history.push(fast);
    localStorage.setItem('fastHistory', JSON.stringify(history.slice(-30))); // Keep last 30
    
    // Clear current
    localStorage.removeItem('currentFast');
    
    return fast;
  },

  cancelFast() {
    localStorage.removeItem('currentFast');
  },

  getFastHistory() {
    return JSON.parse(localStorage.getItem('fastHistory') || '[]');
  },

  getProgress() {
    const fast = this.getCurrentFast();
    if (!fast) return null;
    
    const now = new Date();
    const start = new Date(fast.startTime);
    const target = new Date(fast.targetEndTime);
    
    const totalDuration = target - start;
    const elapsed = now - start;
    const remaining = target - now;
    
    const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    
    return {
      progress: progress.toFixed(1),
      elapsed: this.formatDuration(elapsed),
      remaining: remaining > 0 ? this.formatDuration(remaining) : '00:00:00',
      isComplete: remaining <= 0,
      hoursFasted: (elapsed / (1000 * 60 * 60)).toFixed(1)
    };
  },

  formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  },

  getStats() {
    const history = this.getFastHistory();
    if (history.length === 0) return null;
    
    const completed = history.filter(f => f.status === 'completed');
    const totalHours = completed.reduce((sum, f) => {
      const start = new Date(f.startTime);
      const end = new Date(f.actualEndTime || f.targetEndTime);
      return sum + (end - start) / (1000 * 60 * 60);
    }, 0);
    
    return {
      totalFasts: completed.length,
      totalHours: Math.round(totalHours),
      currentStreak: this.calculateStreak(history),
      averageDuration: completed.length > 0 ? (totalHours / completed.length).toFixed(1) : 0
    };
  },

  calculateStreak(history) {
    // Simple streak calculation - consecutive days with completed fasts
    const dates = history
      .filter(f => f.status === 'completed')
      .map(f => new Date(f.startTime).toDateString())
      .filter((v, i, a) => a.indexOf(v) === i) // Unique dates
      .sort((a, b) => new Date(b) - new Date(a));
    
    if (dates.length === 0) return 0;
    
    let streak = 1;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    // Check if fasted today or yesterday
    if (dates[0] !== today && dates[0] !== yesterday) return 0;
    
    for (let i = 0; i < dates.length - 1; i++) {
      const curr = new Date(dates[i]);
      const next = new Date(dates[i + 1]);
      const diff = (curr - next) / (1000 * 60 * 60 * 24);
      
      if (diff === 1) streak++;
      else break;
    }
    
    return streak;
  }
};

// ============================================
// SLEEP TRACKER
// ============================================

export const SleepTracker = {
  getLastSleep() {
    const history = this.getSleepHistory();
    return history[0] || null;
  },

  getSleepHistory() {
    return JSON.parse(localStorage.getItem('sleepHistory') || '[]');
  },

  logSleep(bedTime, wakeTime, quality, notes = '') {
    const bed = new Date(bedTime);
    const wake = new Date(wakeTime);
    
    // Handle crossing midnight
    let duration = wake - bed;
    if (duration < 0) duration += 24 * 60 * 60 * 1000;
    
    const sleep = {
      id: Date.now(),
      bedTime: bed.toISOString(),
      wakeTime: wake.toISOString(),
      duration: duration / (1000 * 60 * 60), // hours
      quality, // 1-5
      notes,
      date: wake.toDateString()
    };
    
    const history = this.getSleepHistory();
    history.unshift(sleep);
    localStorage.setItem('sleepHistory', JSON.stringify(history.slice(-90))); // Keep 90 days
    
    return sleep;
  },

  getSleepStats(days = 7) {
    const history = this.getSleepHistory().slice(0, days);
    if (history.length === 0) return null;
    
    const avgDuration = history.reduce((sum, s) => sum + s.duration, 0) / history.length;
    const avgQuality = history.reduce((sum, s) => sum + s.quality, 0) / history.length;
    
    return {
      averageDuration: avgDuration.toFixed(1),
      averageQuality: avgQuality.toFixed(1),
      totalNights: history.length,
      goalMet: history.filter(s => s.duration >= 7).length
    };
  },

  getSleepTips() {
    return [
      { icon: '🌙', title: 'Horario regular', text: 'Duerme y despierta a la misma hora todos los días' },
      { icon: '📱', title: 'Sin pantallas', text: 'Evita pantallas 1 hora antes de dormir' },
      { icon: '🌡️', title: 'Temperatura', text: 'Mantén la habitación entre 18-20°C' },
      { icon: '☕', title: 'Sin cafeína', text: 'Evita cafeína después de las 2pm' },
      { icon: '🧘', title: 'Relajación', text: 'Prueba meditación o respiración profunda' },
      { icon: '🍽️', title: 'Cena ligera', text: 'Evita comidas pesadas 3 horas antes de dormir' }
    ];
  },

  getQualityLabel(score) {
    const labels = { 1: 'Muy mal', 2: 'Mal', 3: 'Regular', 4: 'Bien', 5: 'Excelente' };
    return labels[score] || 'Regular';
  },

  getQualityColor(score) {
    const colors = { 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#22c55e', 5: '#10b981' };
    return colors[score] || '#eab308';
  }
};

// ============================================
// CHECK-IN SYSTEM
// ============================================

export const CheckInSystem = {
  getCheckInHistory() {
    return JSON.parse(localStorage.getItem('checkInHistory') || '[]');
  },

  createCheckIn(weight, measurements = {}, photo = null, notes = '') {
    const checkIn = {
      id: Date.now(),
      date: new Date().toISOString(),
      weight,
      measurements: {
        chest: measurements.chest || null,
        waist: measurements.waist || null,
        hips: measurements.hips || null,
        arms: measurements.arms || null,
        thighs: measurements.thighs || null,
        neck: measurements.neck || null,
        ...measurements
      },
      photo,
      notes,
      weekNumber: this.getWeekNumber()
    };
    
    const history = this.getCheckInHistory();
    history.unshift(checkIn);
    localStorage.setItem('checkInHistory', JSON.stringify(history.slice(-52))); // Keep 1 year
    
    return checkIn;
  },

  getWeekNumber() {
    const history = this.getCheckInHistory();
    return history.length + 1;
  },

  getProgressPhotos() {
    return this.getCheckInHistory().filter(c => c.photo).map(c => ({
      id: c.id,
      date: c.date,
      photo: c.photo,
      weight: c.weight,
      weekNumber: c.weekNumber
    }));
  },

  getMeasurementProgress() {
    const history = this.getCheckInHistory().slice(0, 4); // Last 4 check-ins
    if (history.length < 2) return null;
    
    const latest = history[0];
    const first = history[history.length - 1];
    
    const changes = {};
    Object.keys(latest.measurements).forEach(key => {
      if (latest.measurements[key] && first.measurements[key]) {
        changes[key] = {
          current: latest.measurements[key],
          previous: first.measurements[key],
          change: (latest.measurements[key] - first.measurements[key]).toFixed(1)
        };
      }
    });
    
    return {
      weightChange: (latest.weight - first.weight).toFixed(1),
      measurementChanges: changes,
      timeSpan: history.length
    };
  },

  // Photo comparison slider
  getComparisonPhotos() {
    const photos = this.getProgressPhotos();
    if (photos.length < 2) return null;
    
    return {
      first: photos[photos.length - 1],
      latest: photos[0]
    };
  }
};

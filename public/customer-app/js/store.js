// Simple Store
import { STORAGE_KEYS, initializeStorage } from './data.js?v=8';

initializeStorage();

function get(key) {
  return JSON.parse(localStorage.getItem(key));
}

function set(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export const Store = {
  getMedicines() {
    return get(STORAGE_KEYS.MEDICINES);
  },
  
  getCart() {
    return get(STORAGE_KEYS.CART);
  },
  
  addToCart(medicineId, quantity) {
    const cart = this.getCart();
    const medicines = this.getMedicines();
    const med = medicines.find(m => m.id === medicineId) || (window.__shopProducts || []).find(m => m.id === medicineId);
    
    const existing = cart.find(item => item.medicineId === medicineId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        medicineId,
        name: med.name,
        brand: med.brand,
        price: med.price,
        quantity
      });
    }
    set(STORAGE_KEYS.CART, cart);
  },
  
  getOrders() {
    return get(STORAGE_KEYS.ORDERS);
  },
  
  // Enhanced cart methods
  removeFromCart(medicineId) {
    const cart = this.getCart().filter(item => item.medicineId !== medicineId);
    set(STORAGE_KEYS.CART, cart);
  },
  
  updateCartQuantity(medicineId, quantity) {
    const cart = this.getCart();
    const item = cart.find(i => i.medicineId === medicineId);
    if (item) {
      item.quantity = quantity;
      set(STORAGE_KEYS.CART, cart);
    }
  },
  
  clearCart() {
    set(STORAGE_KEYS.CART, []);
  },
  
  getCartTotal() {
    return this.getCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);
  },
  
  getCartCount() {
    return this.getCart().reduce((sum, item) => sum + item.quantity, 0);
  },
  
  // Place order
  placeOrder(orderData) {
    const orders = this.getOrders();
    const order = {
      id: 'PED-' + Math.floor(1000 + Math.random() * 9000),
      ...orderData,
      date: new Date().toISOString().split('T')[0],
      status: 'Procesando'
    };
    orders.unshift(order);
    set(STORAGE_KEYS.ORDERS, orders);
    this.clearCart();
    return order;
  },
  
  getVitalsLog() {
    return get(STORAGE_KEYS.VITALS_LOG) || [];
  },

  // Fitness Tracking Methods
  getDailySteps() {
    return get('dailySteps') || 8432;
  },
  
  setDailySteps(steps) {
    set('dailySteps', steps);
    // Add points for step milestones
    if (steps >= 10000) this.addPoints(10, 'step_goal');
  },
  
  getDailyCalories() {
    return get('dailyCalories') || 1250;
  },
  
  addCaloriesBurned(calories) {
    const current = this.getDailyCalories();
    set('dailyCalories', current + calories);
  },
  
  // Calories consumed (from food)
  getCaloriesConsumed() {
    return get('caloriesConsumed') || 0;
  },
  
  addCaloriesConsumed(calories) {
    const current = this.getCaloriesConsumed();
    set('caloriesConsumed', current + calories);
  },
  
  // Protein tracking
  getProteinConsumed() {
    return get('proteinConsumed') || 0;
  },
  
  addProteinConsumed(protein) {
    const current = this.getProteinConsumed();
    set('proteinConsumed', current + protein);
  },
  
  // Daily food log
  getFoodLog() {
    return get('foodLog') || [];
  },
  
  addFoodEntry(food) {
    const log = this.getFoodLog();
    log.push({
      ...food,
      id: Date.now(),
      timestamp: new Date().toISOString()
    });
    set('foodLog', log);
    // Also update totals
    if (food.calories) this.addCaloriesConsumed(food.calories);
    if (food.protein) this.addProteinConsumed(food.protein);
  },
  
  deleteFoodEntry(id) {
    const log = this.getFoodLog();
    const entry = log.find(f => f.id === id);
    if (entry) {
      // Subtract from totals
      if (entry.calories) {
        const currentCal = this.getCaloriesConsumed();
        set('caloriesConsumed', Math.max(0, currentCal - entry.calories));
      }
      if (entry.protein) {
        const currentProt = this.getProteinConsumed();
        set('proteinConsumed', Math.max(0, currentProt - entry.protein));
      }
      // Remove from log
      set('foodLog', log.filter(f => f.id !== id));
    }
  },
  
  getActiveMinutes() {
    return get('activeMinutes') || 45;
  },
  
  addActiveMinutes(minutes) {
    const current = this.getActiveMinutes();
    set('activeMinutes', current + minutes);
  },
  
  getWaterIntake() {
    return get('waterIntake') || 6;
  },
  
  addWater(glasses) {
    const current = this.getWaterIntake();
    const newTotal = current + glasses;
    set('waterIntake', newTotal);
    // Add points for hydration
    if (newTotal >= 8 && current < 8) this.addPoints(5, 'hydration_goal');
  },
  
  // Goals
  getStepsGoal() {
    return get('stepsGoal') || 10000;
  },
  
  setStepsGoal(goal) {
    set('stepsGoal', goal);
  },
  
  getCalorieGoal() {
    return get('calorieGoal') || 1825;
  },
  
  setCalorieGoal(goal) {
    set('calorieGoal', goal);
  },
  
  getProteinGoal() {
    return get('proteinGoal') || 120;
  },
  
  setProteinGoal(goal) {
    set('proteinGoal', goal);
  },
  
  addVital(type, value) {
    const vitals = this.getVitalsLog();
    vitals.push({
      type,
      value,
      date: new Date().toISOString()
    });
    set(STORAGE_KEYS.VITALS_LOG, vitals);
    this.addPoints(5, 'vital_logged');
  },
  
  addExercise(exercise) {
    const exercises = get('exercises') || [];
    exercises.push({
      ...exercise,
      date: new Date().toISOString()
    });
    set('exercises', exercises);
    this.addActiveMinutes(exercise.duration);
    if (exercise.calories) this.addCaloriesBurned(exercise.calories);
    this.addPoints(10, 'exercise_logged');
  },
  
  addMeal(meal) {
    const meals = get('meals') || [];
    meals.push({
      ...meal,
      date: new Date().toISOString()
    });
    set('meals', meals);
    this.addPoints(5, 'meal_logged');
  },
  
  // Gamification Methods
  getPointsBalance() {
    return get('pointsBalance') || 350;
  },
  
  addPoints(amount, reason) {
    const current = this.getPointsBalance();
    set('pointsBalance', current + amount);
    // Check for achievements
    this.checkAchievements();
  },
  
  getUserLevel() {
    const points = this.getPointsBalance();
    // Reward Tiers: Bronze (0-499), Silver (500-1499), Gold (1500-2999), Platinum (3000+)
    if (points >= 3000) return { 
      name: 'Platino', 
      color: '#00d4aa', 
      bgColor: 'linear-gradient(135deg, #00d4aa, #00a884)',
      min: 3000, 
      next: null,
      benefits: ['Descuento 20%', 'Envío gratis', 'Consulta mensual gratis']
    };
    if (points >= 1500) return { 
      name: 'Oro', 
      color: '#f59e0b', 
      bgColor: 'linear-gradient(135deg, #f59e0b, #d97706)',
      min: 1500, 
      next: 3000,
      benefits: ['Descuento 15%', 'Envío gratis']
    };
    if (points >= 500) return { 
      name: 'Plata', 
      color: '#94a3b8', 
      bgColor: 'linear-gradient(135deg, #94a3b8, #64748b)',
      min: 500, 
      next: 1500,
      benefits: ['Descuento 10%']
    };
    return { 
      name: 'Bronce', 
      color: '#b45309', 
      bgColor: 'linear-gradient(135deg, #b45309, #92400e)',
      min: 0, 
      next: 500,
      benefits: ['Descuento 5%']
    };
  },
  
  getTierProgress() {
    const points = this.getPointsBalance();
    const level = this.getUserLevel();
    if (!level.next) return { percent: 100, pointsToNext: 0 };
    const pointsInTier = points - level.min;
    const tierRange = level.next - level.min;
    const percent = Math.min(100, Math.round((pointsInTier / tierRange) * 100));
    const pointsToNext = level.next - points;
    return { percent, pointsToNext };
  },
  
  getHealthGoals() {
    return get('healthGoals') || [
      { id: 1, name: 'Pérdida de Peso', current: 68.2, target: 63.5, unit: 'kg', progress: 45, type: 'weight', status: 'active', createdAt: new Date().toISOString() },
      { id: 2, name: 'Actividad Diaria', current: 45, target: 60, unit: 'min', progress: 75, type: 'activity', status: 'active', createdAt: new Date().toISOString() },
      { id: 3, name: 'Hidratación', current: 6, target: 8, unit: 'vasos', progress: 75, type: 'water', status: 'active', createdAt: new Date().toISOString() }
    ];
  },
  
  getGoalHistory() {
    return get('goalHistory') || [];
  },
  
  completeGoal(index, outcome = 'completed') {
    const goals = this.getHealthGoals();
    const goal = goals[index];
    if (!goal) return false;
    
    // Move to history
    const history = this.getGoalHistory();
    history.unshift({
      ...goal,
      status: outcome, // 'completed' or 'expired'
      completedAt: new Date().toISOString(),
      finalProgress: goal.progress
    });
    set('goalHistory', history.slice(0, 50)); // Keep last 50
    
    // Remove from active goals
    goals.splice(index, 1);
    set('healthGoals', goals);
    
    // Award points for completion
    if (outcome === 'completed') {
      this.addPoints(100, 'goal_completed');
    }
    return true;
  },
  
  addGoal(goal) {
    const goals = this.getHealthGoals();
    goal.id = Date.now();
    goals.push(goal);
    set('healthGoals', goals);
    this.addPoints(10, 'goal_created');
  },
  
  updateGoal(index, updatedGoal) {
    const goals = this.getHealthGoals();
    goals[index] = { ...goals[index], ...updatedGoal };
    set('healthGoals', goals);
  },
  
  deleteGoal(index) {
    const goals = this.getHealthGoals();
    goals.splice(index, 1);
    set('healthGoals', goals);
  },
  
  // Vitals Management
  addVitalEntry(vital) {
    const vitals = this.getVitalsLog();
    vitals.push(vital);
    set(STORAGE_KEYS.VITALS_LOG, vitals);
    this.addPoints(5, 'vital_logged');
  },
  
  deleteVital(index) {
    const vitals = this.getVitalsLog();
    vitals.splice(index, 1);
    set(STORAGE_KEYS.VITALS_LOG, vitals);
  },
  
  // Profile Methods
  getProfile() {
    return get('userProfile') || {
      name: 'María García',
      height: null,
      birthdate: '',
      gender: ''
    };
  },
  
  updateProfile(updates) {
    const profile = this.getProfile();
    set('userProfile', { ...profile, ...updates });
  },
  
  // ============================================
  // EMERGENCY MEDICAL INFO
  // ============================================
  
  getEmergencyInfo() {
    return get('emergencyInfo') || {
      bloodType: '',
      allergies: '',
      conditions: '',
      medications: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelation: '',
      organDonor: false,
      notes: ''
    };
  },
  
  updateEmergencyInfo(updates) {
    const current = this.getEmergencyInfo();
    set('emergencyInfo', { ...current, ...updates });
  },
  
  getEmergencyContacts() {
    return get('emergencyContacts') || [];
  },
  
  addEmergencyContact(contact) {
    const contacts = this.getEmergencyContacts();
    contacts.push({
      ...contact,
      id: Date.now()
    });
    set('emergencyContacts', contacts);
  },
  
  deleteEmergencyContact(id) {
    const contacts = this.getEmergencyContacts().filter(c => c.id !== id);
    set('emergencyContacts', contacts);
  },
  
  saveEmergencyContacts(contacts) {
    set('emergencyContacts', contacts);
  },
  
  isOnboardingComplete() {
    // Dedicated flag takes precedence
    const flag = localStorage.getItem('customer_portal_onboarding_complete');
    if (flag === 'true') return true;
    // Backward compatibility: fall back to height check
    const profile = this.getProfile();
    return profile.height && profile.height > 0;
  },
  
  markOnboardingComplete() {
    localStorage.setItem('customer_portal_onboarding_complete', 'true');
  },
  
  // Activity Level for TDEE
  getActivityLevel() {
    return get('activityLevel') || 'moderate';
  },
  
  setActivityLevel(level) {
    set('activityLevel', level);
  },
  
  getHealthGoal() {
    return get('healthGoal') || 'maintain';
  },
  
  setHealthGoal(goal) {
    set('healthGoal', goal);
  },
  
  getGoalWeight() {
    return get('goalWeight') || null;
  },
  
  setGoalWeight(weight) {
    set('goalWeight', weight);
  },
  
  getGoalTimeline() {
    return get('goalTimeline') || null; // weeks
  },
  
  setGoalTimeline(weeks) {
    set('goalTimeline', weeks);
  },
  
  getGoalStartDate() {
    return get('goalStartDate') || new Date().toISOString();
  },
  
  setGoalStartDate(date) {
    set('goalStartDate', date);
  },
  
  // Body Measurements for Navy method
  getBodyMeasurements() {
    return get('bodyMeasurements') || {
      neck: null,
      waist: null,
      hip: null,
      lastUpdated: null
    };
  },
  
  updateBodyMeasurements(measurements) {
    const current = this.getBodyMeasurements();
    set('bodyMeasurements', { 
      ...current, 
      ...measurements, 
      lastUpdated: new Date().toISOString() 
    });
  },
  
  // Calculated Health Metrics History
  getHealthMetrics() {
    return get('healthMetrics') || {};
  },
  
  saveHealthMetrics(metrics) {
    set('healthMetrics', { ...this.getHealthMetrics(), ...metrics });
  },
  
  getAchievements() {
    return get('achievements') || [];
  },
  
  checkAchievements() {
    const achievements = this.getAchievements();
    const vitals = this.getVitalsLog();
    const goals = this.getHealthGoals();
    const goalHistory = this.getGoalHistory();
    const waterIntake = this.getWaterIntake();
    const steps = this.getDailySteps();
    const foodLog = this.getFoodLog();
    
    const newAchievements = [];
    
    // Badge definitions
    const badges = {
      // Step milestones
      'step_starter': { condition: () => steps >= 5000, name: 'Caminante', icon: '🚶', desc: '5,000 pasos en un día' },
      'step_pro': { condition: () => steps >= 10000, name: 'Maratonista', icon: '🏃', desc: '10,000 pasos en un día' },
      'step_master': { condition: () => steps >= 15000, name: 'Ultra Runner', icon: '👟', desc: '15,000 pasos en un día' },
      
      // Hydration
      'hydration_day': { condition: () => waterIntake >= 8, name: 'Hidratado', icon: '💧', desc: '8 vasos de agua en un día' },
      
      // First goal
      'first_goal': { condition: () => goals.length > 0 || goalHistory.length > 0, name: 'Primer Paso', icon: '🎯', desc: 'Crear tu primera meta' },
      
      // Goal completion
      'goal_complete': { condition: () => goalHistory.some(g => g.status === 'completed'), name: 'Logrador', icon: '🏆', desc: 'Completar una meta' },
      
      // Food logging
      'food_logger': { condition: () => foodLog.length >= 1, name: 'Nutricionista', icon: '🍎', desc: 'Registrar tu primera comida' },
      
      // Vitals logging
      'vitals_logger': { condition: () => vitals.length >= 5, name: 'Vigilante', icon: '📊', desc: '5 registros de signos vitales' },
      
      // Weight milestones (would need to track weight changes)
      'weight_1kg': { condition: () => false, name: 'Perdedor', icon: '⚖️', desc: 'Perder 1 kg' }, // Placeholder
    };
    
    // Check each badge
    for (const [id, badge] of Object.entries(badges)) {
      if (!achievements.find(a => a.id === id) && badge.condition()) {
        achievements.push({ 
          id, 
          name: badge.name, 
          icon: badge.icon,
          desc: badge.desc,
          date: new Date().toISOString() 
        });
        newAchievements.push(badge);
      }
    }
    
    if (newAchievements.length > 0) {
      set('achievements', achievements);
    }
    
    return newAchievements;
  },
  
  // ============================================
  // HEALTH RECORDS - Prescriptions, Vaccines, Exams
  // ============================================
  
  // Prescriptions - Unified with profile-aware system below
  // Note: These methods delegate to the profile-aware versions at line 720+
  getPrescriptions() {
    return this.getPrescriptionsByProfile(this.getActiveProfileId());
  },
  
  addPrescription(prescription) {
    // Delegate to profile-aware version
    const activeProfileId = this.getActiveProfileId();
    const prescriptions = this.getAllPrescriptions();
    const newPrescription = {
      ...prescription,
      id: Date.now(),
      profileId: prescription.profileId || activeProfileId,
      createdAt: new Date().toISOString()
    };
    prescriptions.push(newPrescription);
    set('allPrescriptions', prescriptions);
    
    // Also save as a medicine for reminders
    if (prescription.medicine) {
      this.addPrescriptionMedicine({
        name: prescription.medicine,
        dose: prescription.dose,
        frequency: prescription.frequency,
        instructions: prescription.instructions,
        prescriptionId: newPrescription.id
      });
    }
  },
  
  deletePrescription(id) {
    const prescriptions = this.getAllPrescriptions().filter(p => p.id !== id);
    set('allPrescriptions', prescriptions);
    // Also delete associated medicines
    const medicines = this.getPrescriptionMedicines().filter(m => m.prescriptionId !== id);
    set('prescriptionMedicines', medicines);
  },
  
  updatePrescription(id, updates) {
    const prescriptions = this.getAllPrescriptions().map(p => 
      p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    );
    set('allPrescriptions', prescriptions);
  },
  
  // Prescription Medicines - for reminders
  getPrescriptionMedicines() {
    return get('prescriptionMedicines') || [];
  },
  
  addPrescriptionMedicine(medicine) {
    const medicines = this.getPrescriptionMedicines();
    medicines.push({
      ...medicine,
      id: 'med_' + Date.now(),
      addedAt: new Date().toISOString()
    });
    set('prescriptionMedicines', medicines);
  },
  
  getMedicinesByPrescription(prescriptionId) {
    return this.getPrescriptionMedicines().filter(m => m.prescriptionId === prescriptionId);
  },
  
  // Medicine Schedules (Smart Reminders)
  getMedicineSchedules() {
    return get('medicineSchedules') || [];
  },
  
  addMedicineSchedule(schedule) {
    const schedules = this.getMedicineSchedules();
    schedules.push({
      ...schedule,
      id: 'sched_' + Date.now(),
      createdAt: new Date().toISOString(),
      active: true
    });
    set('medicineSchedules', schedules);
  },
  
  getUpcomingDoses() {
    const schedules = this.getMedicineSchedules();
    const upcoming = [];
    
    schedules.forEach(schedule => {
      if (!schedule.active) return;
      
      schedule.doses.forEach(dose => {
        if (!dose.taken && !dose.skipped) {
          upcoming.push({
            scheduleId: schedule.id,
            doseId: dose.id,
            medicine: schedule.medicine,
            dose: schedule.dose,
            time: dose.time,
            day: dose.day,
            totalDays: schedule.durationDays
          });
        }
      });
    });
    
    // Sort by time
    return upcoming.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 10);
  },
  
  markDoseTaken(scheduleId, doseId) {
    const schedules = this.getMedicineSchedules();
    const updated = schedules.map(schedule => {
      if (schedule.id === scheduleId) {
        return {
          ...schedule,
          doses: schedule.doses.map(dose => 
            dose.id === doseId ? { ...dose, taken: true, takenAt: new Date().toISOString() } : dose
          )
        };
      }
      return schedule;
    });
    set('medicineSchedules', updated);
  },
  
  markDoseSkipped(scheduleId, doseId) {
    const schedules = this.getMedicineSchedules();
    const updated = schedules.map(schedule => {
      if (schedule.id === scheduleId) {
        return {
          ...schedule,
          doses: schedule.doses.map(dose => 
            dose.id === doseId ? { ...dose, skipped: true, skippedAt: new Date().toISOString() } : dose
          )
        };
      }
      return schedule;
    });
    set('medicineSchedules', updated);
  },
  
  // Check for missed doses and return alerts
  checkMissedDoses() {
    const schedules = this.getMedicineSchedules();
    const missedDoses = [];
    const now = new Date();
    const oneHourMs = 60 * 60 * 1000;
    
    schedules.forEach(schedule => {
      schedule.doses.forEach(dose => {
        if (dose.notifiedAt && !dose.taken && !dose.skipped && !dose.missedAlertSent) {
          const notifiedTime = new Date(dose.notifiedAt).getTime();
          const timeSinceNotification = now.getTime() - notifiedTime;
          
          // If 1 hour has passed since notification and no response
          if (timeSinceNotification > oneHourMs) {
            missedDoses.push({
              scheduleId: schedule.id,
              doseId: dose.id,
              medicine: schedule.medicine,
              dose: schedule.dose,
              scheduledTime: dose.time,
              minutesAgo: Math.round(timeSinceNotification / 60000)
            });
          }
        }
      });
    });
    
    return missedDoses;
  },
  
  // Mark missed alert as sent to avoid duplicate alerts
  markMissedAlertSent(scheduleId, doseId) {
    const schedules = this.getMedicineSchedules();
    const updated = schedules.map(schedule => {
      if (schedule.id === scheduleId) {
        return {
          ...schedule,
          doses: schedule.doses.map(dose => 
            dose.id === doseId ? { ...dose, missedAlertSent: true } : dose
          )
        };
      }
      return schedule;
    });
    set('medicineSchedules', updated);
  },
  
  // Mark dose as notified when reminder is shown
  markDoseNotified(scheduleId, doseId) {
    const schedules = this.getMedicineSchedules();
    const updated = schedules.map(schedule => {
      if (schedule.id === scheduleId) {
        return {
          ...schedule,
          doses: schedule.doses.map(dose => 
            dose.id === doseId ? { ...dose, notifiedAt: new Date().toISOString() } : dose
          )
        };
      }
      return schedule;
    });
    set('medicineSchedules', updated);
  },
  
  // ============================================
  // WELLNESS REMINDERS
  // ============================================
  
  getWellnessReminders() {
    const profile = this.getProfile();
    const birthdate = profile.birthdate;
    const age = birthdate ? Math.floor((new Date() - new Date(birthdate)) / (365.25 * 24 * 60 * 60 * 1000)) : 35;
    const gender = profile.gender || 'female';
    
    // Default reminders
    const defaultReminders = [
      { id: 'annual', type: 'annual', name: 'Checkup Anual', lastDate: null, nextDate: null, intervalMonths: 12, icon: '🩺' },
      { id: 'dental', type: 'dental', name: 'Revisión Dental', lastDate: null, nextDate: null, intervalMonths: 6, icon: '🦷' },
      { id: 'vision', type: 'vision', name: 'Revisión de Vista', lastDate: null, nextDate: null, intervalMonths: 12, icon: '👁️' }
    ];
    
    // Age/sex-based screenings
    if (age >= 40) {
      defaultReminders.push({ id: 'mammogram', type: 'screening', name: 'Mamografía', lastDate: null, nextDate: null, intervalMonths: 12, icon: '🎀', condition: 'Mujeres 40+' });
    }
    if (age >= 45) {
      defaultReminders.push({ id: 'colonoscopy', type: 'screening', name: 'Colonoscopia', lastDate: null, nextDate: null, intervalMonths: 60, icon: '🔬', condition: '45+' });
    }
    if (age >= 50) {
      defaultReminders.push({ id: 'prostate', type: 'screening', name: 'Próstata (PSA)', lastDate: null, nextDate: null, intervalMonths: 12, icon: '🧪', condition: 'Hombres 50+' });
    }
    
    const saved = get('wellnessReminders') || [];
    
    // Merge saved data with defaults
    return defaultReminders.map(def => {
      const savedReminder = saved.find(s => s.id === def.id);
      return { ...def, ...savedReminder };
    });
  },
  
  updateWellnessReminder(reminderId, updates) {
    const reminders = this.getWellnessReminders();
    const index = reminders.findIndex(r => r.id === reminderId);
    if (index >= 0) {
      reminders[index] = { ...reminders[index], ...updates };
      set('wellnessReminders', reminders);
    }
  },
  
  // Check for upcoming wellness reminders
  checkWellnessReminders() {
    const reminders = this.getWellnessReminders();
    const now = new Date();
    const upcoming = [];
    
    reminders.forEach(reminder => {
      if (!reminder.nextDate) return;
      
      const nextDate = new Date(reminder.nextDate);
      const daysUntil = Math.ceil((nextDate - now) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= 7 && daysUntil >= 0) {
        upcoming.push({ ...reminder, daysUntil });
      }
    });
    
    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  },
  
  deleteSchedule(scheduleId) {
    const schedules = this.getMedicineSchedules().filter(s => s.id !== scheduleId);
    set('medicineSchedules', schedules);
  },
  
  // Legacy Medicine Reminders (kept for backwards compatibility)
  getMedicineReminders() {
    return get('medicineReminders') || [];
  },
  
  addMedicineReminder(reminder) {
    const reminders = this.getMedicineReminders();
    reminders.push({
      ...reminder,
      id: Date.now(),
      active: true
    });
    set('medicineReminders', reminders);
  },
  
  toggleMedicineReminder(id) {
    const reminders = this.getMedicineReminders().map(r => 
      r.id === id ? { ...r, active: !r.active } : r
    );
    set('medicineReminders', reminders);
  },
  
  deleteMedicineReminder(id) {
    const reminders = this.getMedicineReminders().filter(r => r.id !== id);
    set('medicineReminders', reminders);
  },
  
  // Vaccines
  getVaccines() {
    return get('vaccines') || [
      { id: 'flu', name: 'Influenza', lastDose: null, nextDose: null, frequency: 'annual' },
      { id: 'tetanus', name: 'Tétanos', lastDose: null, nextDose: null, frequency: '10years' },
      { id: 'covid', name: 'COVID-19', lastDose: null, nextDose: null, frequency: 'annual' },
      { id: 'hepb', name: 'Hepatitis B', lastDose: null, nextDose: null, frequency: 'onetime' },
      { id: 'pneumonia', name: 'Neumonía', lastDose: null, nextDose: null, frequency: '5years' }
    ];
  },
  
  updateVaccine(vaccineId, updates) {
    const vaccines = this.getVaccines().map(v => 
      v.id === vaccineId ? { ...v, ...updates, updatedAt: new Date().toISOString() } : v
    );
    set('vaccines', vaccines);
  },
  
  addVaccineRecord(record) {
    const records = get('vaccineRecords') || [];
    records.push({
      ...record,
      id: Date.now(),
      createdAt: new Date().toISOString()
    });
    set('vaccineRecords', records);
  },
  
  getVaccineRecords() {
    return get('vaccineRecords') || [];
  },
  
  // ============================================
  // VACCINE SCHEDULE TRACKING
  // ============================================
  
  async getVaccineSchedule(profileId = null) {
    const targetProfileId = profileId || this.getActiveProfileId();
    const profile = this.getAllProfiles().find(p => p.id === targetProfileId);
    if (!profile) return [];
    
    const birthdate = profile.birthdate;
    if (!birthdate) return [];
    
    const ageMonths = Math.floor((new Date() - new Date(birthdate)) / (30.44 * 24 * 60 * 60 * 1000));
    const gender = profile.gender;
    
    // Get applicable vaccines based on age
    const { getVaccinesForAge } = await import('./data.js');
    const applicableVaccines = getVaccinesForAge(ageMonths, gender);
    
    // Get recorded vaccines
    const records = this.getVaccineRecords().filter(r => r.profileId === targetProfileId);
    
    // Merge schedule with records
    return applicableVaccines.map(schedule => ({
      ...schedule,
      vaccines: schedule.vaccines.map(vaccine => {
        const record = records.find(r => r.vaccineId === vaccine.id);
        return {
          ...vaccine,
          status: record ? (record.administeredDate ? 'completed' : 'pending') : 'pending',
          administeredDate: record?.administeredDate || null,
          batchNumber: record?.batchNumber || null,
          location: record?.location || null
        };
      })
    }));
  },
  
  recordVaccine(profileId, vaccineId, data) {
    const records = this.getVaccineRecords();
    const existingIndex = records.findIndex(r => 
      r.profileId === profileId && r.vaccineId === vaccineId
    );
    
    const record = {
      profileId,
      vaccineId,
      administeredDate: data.date,
      batchNumber: data.batchNumber || null,
      location: data.location || null,
      notes: data.notes || null,
      cardImage: data.cardImage || null,
      updatedAt: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      records[existingIndex] = { ...records[existingIndex], ...record };
    } else {
      records.push({
        ...record,
        id: Date.now(),
        createdAt: new Date().toISOString()
      });
    }
    
    set('vaccineRecords', records);
    
    // Award points for vaccination
    this.addPoints(25, 'vaccine_recorded');
  },
  
  async getUpcomingVaccines(profileId = null) {
    const schedule = await this.getVaccineSchedule(profileId);
    const upcoming = [];
    
    schedule.forEach(group => {
      group.vaccines.forEach(vaccine => {
        if (vaccine.status === 'pending' && vaccine.required) {
          upcoming.push({
            vaccineId: vaccine.id,
            name: vaccine.name,
            disease: vaccine.disease,
            ageLabel: group.ageLabel,
            ageMonths: group.ageMonths
          });
        }
      });
    });
    
    return upcoming.slice(0, 5);
  },
  
  // Medical Exams
  getExamTemplates() {
    return [
      { id: 'blood', name: 'Examen de Sangre Completo', frequency: 'annual', description: 'Hemograma, glucosa, lípidos, función hepática y renal' },
      { id: 'cholesterol', name: 'Perfil de Lípidos', frequency: 'annual', description: 'Colesterol total, HDL, LDL, triglicéridos' },
      { id: 'glucose', name: 'Glucosa en Ayunas', frequency: 'annual', description: 'Nivel de azúcar en sangre' },
      { id: 'thyroid', name: 'Función Tiroidea', frequency: 'annual', description: 'TSH, T3, T4' },
      { id: 'vitamin_d', name: 'Vitamina D', frequency: 'annual', description: 'Nivel de vitamina D en sangre' },
      { id: 'b12', name: 'Vitamina B12', frequency: 'annual', description: 'Nivel de vitamina B12' },
      { id: 'psa', name: 'PSA (Hombres 50+)', frequency: 'annual', description: 'Antígeno prostático específico' },
      { id: 'mammogram', name: 'Mastografía (Mujeres 40+)', frequency: '2years', description: 'Estudio de detección de cáncer de mama' },
      { id: 'papsmear', name: 'Papanicolau (Mujeres 21+)', frequency: '3years', description: 'Detección de cáncer cervical' },
      { id: 'colonoscopy', name: 'Colonoscopía (50+)', frequency: '10years', description: 'Detección de cáncer de colon' },
      { id: 'bone_density', name: 'Densitometría Ósea (Mujeres 65+)', frequency: '2years', description: 'Detección de osteoporosis' },
      { id: 'eye_exam', name: 'Examen de la Vista', frequency: '2years', description: 'Revisión oftalmológica completa' },
      { id: 'dental', name: 'Revisión Dental', frequency: '6months', description: 'Limpieza y revisión dental' }
    ];
  },
  
  getUserExams() {
    return get('userExams') || [];
  },
  
  addExamResult(exam) {
    const exams = this.getUserExams();
    exams.push({
      ...exam,
      id: Date.now(),
      createdAt: new Date().toISOString()
    });
    set('userExams', exams);
  },
  
  updateExam(id, updates) {
    const exams = this.getUserExams().map(e => 
      e.id === id ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e
    );
    set('userExams', exams);
  },
  
  deleteExam(id) {
    const exams = this.getUserExams().filter(e => e.id !== id);
    set('userExams', exams);
  },
  
  // ============================================
  // CONSULTA - Appointments & Locations
  // ============================================
  
  // Pharmacy Locations with wait times
  getLocations() {
    return get('locations') || [
      { 
        id: 'loc1', 
        name: 'Farmacia Apollo - Centro', 
        address: 'Av. Juárez 123, Centro, CDMX', 
        phone: '555-1234',
        currentWait: 15, // minutes
        isOpen: true,
        hours: '8:00 - 22:00',
        services: ['Consulta general', 'Vacunación', 'Laboratorio']
      },
      { 
        id: 'loc2', 
        name: 'Farmacia Apollo - Polanco', 
        address: 'Masaryk 456, Polanco, CDMX', 
        phone: '555-5678',
        currentWait: 5,
        isOpen: true,
        hours: '7:00 - 23:00',
        services: ['Consulta general', 'Especialidades', 'Vacunación', 'Laboratorio']
      },
      { 
        id: 'loc3', 
        name: 'Farmacia Apollo - Condesa', 
        address: 'Av. Ámsterdam 789, Condesa, CDMX', 
        phone: '555-9012',
        currentWait: 25,
        isOpen: true,
        hours: '8:00 - 22:00',
        services: ['Consulta general', 'Vacunación']
      },
      { 
        id: 'loc4', 
        name: 'Farmacia Apollo - Satélite', 
        address: 'Av. Lomas Verdes 321, Naucalpan', 
        phone: '555-3456',
        currentWait: 10,
        isOpen: false,
        hours: '8:00 - 21:00',
        services: ['Consulta general', 'Laboratorio']
      }
    ];
  },
  
  updateLocationWaitTime(locationId, waitMinutes) {
    const locations = this.getLocations().map(loc => 
      loc.id === locationId ? { ...loc, currentWait: waitMinutes, updatedAt: new Date().toISOString() } : loc
    );
    set('locations', locations);
  },
  
  // In-person appointments
  getAppointments() {
    return get('appointments') || [];
  },
  
  addAppointment(appointment) {
    const appointments = this.getAppointments();
    appointments.push({
      ...appointment,
      id: Date.now(),
      status: 'scheduled', // scheduled, checked-in, completed, cancelled
      createdAt: new Date().toISOString()
    });
    set('appointments', appointments);
  },
  
  updateAppointment(id, updates) {
    const appointments = this.getAppointments().map(a => 
      a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
    );
    set('appointments', appointments);
  },
  
  cancelAppointment(id) {
    this.updateAppointment(id, { status: 'cancelled' });
  },
  
  // Video consultation appointments
  getVideoConsultations() {
    return get('videoConsultations') || [];
  },
  
  addVideoConsultation(consultation) {
    const consultations = this.getVideoConsultations();
    consultations.push({
      ...consultation,
      id: Date.now(),
      status: 'scheduled', // scheduled, in-progress, completed, cancelled
      createdAt: new Date().toISOString()
    });
    set('videoConsultations', consultations);
  },
  
  // Chat history for symptom checker
  getChatHistory() {
    return get('chatHistory') || [];
  },
  
  addChatMessage(message) {
    const history = this.getChatHistory();
    history.push({
      ...message,
      id: Date.now(),
      timestamp: new Date().toISOString()
    });
    // Keep only last 50 messages
    if (history.length > 50) history.shift();
    set('chatHistory', history);
  },
  
  clearChatHistory() {
    set('chatHistory', []);
  },
  
  // ============================================
  // MULTIPLE PROFILES / CAREGIVER ACCESS
  // ============================================
  
  // Get all profiles (main + sub-accounts)
  getAllProfiles() {
    return get('allProfiles') || [
      {
        id: 'main',
        name: 'Yo',
        isMain: true,
        avatar: '👤',
        createdAt: new Date().toISOString()
      }
    ];
  },
  
  // Get currently active profile
  getActiveProfileId() {
    return get('activeProfileId') || 'main';
  },
  
  // Set active profile
  setActiveProfile(profileId) {
    set('activeProfileId', profileId);
  },
  
  // Add new sub-profile
  addSubProfile(profile) {
    const profiles = this.getAllProfiles();
    const newProfile = {
      ...profile,
      id: 'profile_' + Date.now(),
      isMain: false,
      createdAt: new Date().toISOString()
    };
    profiles.push(newProfile);
    set('allProfiles', profiles);
    return newProfile;
  },
  
  // Update profile
  updateProfile(profileId, updates) {
    const profiles = this.getAllProfiles().map(p => 
      p.id === profileId ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    );
    set('allProfiles', profiles);
  },
  
  // Delete sub-profile
  deleteSubProfile(profileId) {
    const profiles = this.getAllProfiles().filter(p => p.id !== profileId);
    set('allProfiles', profiles);
    // If active profile was deleted, switch to main
    if (this.getActiveProfileId() === profileId) {
      set('activeProfileId', 'main');
    }
  },
  
  // Get profile by ID
  getProfileById(profileId) {
    return this.getAllProfiles().find(p => p.id === profileId);
  },
  
  // ============================================
  // ENHANCED PRESCRIPTIONS - Linked to profiles
  // ============================================
  
  // Get all prescriptions across all profiles
  getAllPrescriptions() {
    return get('allPrescriptions') || [];
  },
  
  // Get prescriptions for a specific profile
  getPrescriptionsByProfile(profileId) {
    const all = this.getAllPrescriptions();
    return all.filter(p => p.profileId === profileId);
  },
  
  // Mark prescription as used/completed
  markPrescriptionUsed(id) {
    this.updatePrescription(id, { status: 'used', usedAt: new Date().toISOString() });
  },
  
  // Upload prescription image
  uploadPrescriptionImage(imageData) {
    const activeProfileId = this.getActiveProfileId();
    const uploads = get('prescriptionUploads') || [];
    uploads.push({
      id: Date.now(),
      profileId: activeProfileId,
      image: imageData,
      createdAt: new Date().toISOString()
    });
    set('prescriptionUploads', uploads);
  },
  
  // Get all prescription uploads
  getPrescriptionUploads(profileId) {
    const uploads = get('prescriptionUploads') || [];
    if (profileId) {
      return uploads.filter(u => u.profileId === profileId);
    }
    return uploads;
  },
  
  // ============================================
  // REFILL REQUESTS
  // ============================================
  
  getRefillRequests() {
    return get('refillRequests') || [];
  },
  
  getRefillRequestsByPrescription(prescriptionId) {
    return this.getRefillRequests().filter(r => r.prescriptionId === prescriptionId);
  },
  
  requestRefill(requestData) {
    const requests = this.getRefillRequests();
    const newRequest = {
      ...requestData,
      id: 'REF-' + Math.floor(1000 + Math.random() * 9000),
      status: 'pending',
      statusText: 'Pendiente',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    requests.unshift(newRequest);
    set('refillRequests', requests);
    return newRequest;
  },
  
  updateRefillStatus(requestId, status, statusText) {
    const requests = this.getRefillRequests().map(r => 
      r.id === requestId ? { ...r, status, statusText, updatedAt: new Date().toISOString() } : r
    );
    set('refillRequests', requests);
  },
  
  cancelRefillRequest(requestId) {
    const requests = this.getRefillRequests().map(r => 
      r.id === requestId ? { ...r, status: 'cancelled', statusText: 'Cancelada', updatedAt: new Date().toISOString() } : r
    );
    set('refillRequests', requests);
  }
};

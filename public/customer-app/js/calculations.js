// Health Calculations Service
// Based on SparkyFitness - Pure JavaScript math formulas

/**
 * Calculate BMR using Mifflin-St Jeor Equation
 * Men: 10W + 6.25H - 5A + 5
 * Women: 10W + 6.25H - 5A - 161
 */
export function calculateBMR(weight, height, age, gender) {
  if (!weight || !height || !age || !gender) return null;
  
  const base = (10 * weight) + (6.25 * height) - (5 * age);
  return gender === 'male' ? base + 5 : base - 161;
}

/**
 * Calculate TDEE (Total Daily Energy Expenditure)
 * BMR × activity multiplier
 */
export function calculateTDEE(bmr, activityLevel = 'moderate') {
  if (!bmr) return null;
  
  const multipliers = {
    sedentary: 1.2,      // Little to no exercise
    light: 1.375,        // Light exercise 1-3 days/week
    moderate: 1.55,      // Moderate exercise 3-5 days/week
    active: 1.725,       // Hard exercise 6-7 days/week
    veryActive: 1.9      // Very hard exercise + physical job
  };
  
  return Math.round(bmr * (multipliers[activityLevel] || 1.55));
}

/**
 * Calculate Body Fat % using BMI-based estimation
 * Formula: (1.20 × BMI) + (0.23 × Age) − (10.8 × Sex) − 5.4
 * Sex: 1 for male, 0 for female
 */
export function calculateBodyFatFromBMI(bmi, age, gender) {
  if (!bmi || !age || !gender) return null;
  
  const sexFactor = gender === 'male' ? 1 : 0;
  const bodyFat = (1.20 * bmi) + (0.23 * age) - (10.8 * sexFactor) - 5.4;
  
  return Math.max(2, Math.min(60, bodyFat)); // Clamp between 2-60%
}

/**
 * Navy Method for Body Fat % (more accurate if measurements available)
 * Requires: height, neck, waist, hip (women only)
 */
export function calculateBodyFatNavy(height, waist, neck, hip = null, gender) {
  if (!height || !waist || !neck || !gender) return null;
  
  const heightLog = Math.log10(height);
  const waistNeckLog = Math.log10(waist - neck);
  
  if (gender === 'male') {
    return 86.010 * waistNeckLog - 70.041 * heightLog + 36.76;
  } else {
    if (!hip) return null;
    const waistHipNeckLog = Math.log10(waist + hip - neck);
    return 163.205 * waistHipNeckLog - 97.684 * heightLog - 78.387;
  }
}

/**
 * Calculate Lean Body Mass
 * Weight × (1 - bodyFat%)
 */
export function calculateLeanMass(weight, bodyFatPercentage) {
  if (!weight || !bodyFatPercentage) return null;
  return weight * (1 - (bodyFatPercentage / 100));
}

/**
 * Get body fat category
 */
export function getBodyFatCategory(bodyFat, gender) {
  if (!bodyFat || !gender) return null;
  
  const categories = {
    male: [
      { max: 6, label: 'Essential Fat', color: '#3b82f6' },
      { max: 14, label: 'Athletic', color: '#10b981' },
      { max: 18, label: 'Fitness', color: '#22c55e' },
      { max: 25, label: 'Average', color: '#f59e0b' },
      { max: 100, label: 'Obese', color: '#ef4444' }
    ],
    female: [
      { max: 14, label: 'Essential Fat', color: '#3b82f6' },
      { max: 21, label: 'Athletic', color: '#10b981' },
      { max: 25, label: 'Fitness', color: '#22c55e' },
      { max: 32, label: 'Average', color: '#f59e0b' },
      { max: 100, label: 'Obese', color: '#ef4444' }
    ]
  };
  
  return categories[gender].find(c => bodyFat <= c.max);
}

/**
 * Calculate ideal weight range based on BMI 18.5-24.9
 */
export function calculateIdealWeightRange(height) {
  if (!height) return null;
  
  const heightM = height / 100;
  const minWeight = (18.5 * heightM * heightM).toFixed(1);
  const maxWeight = (24.9 * heightM * heightM).toFixed(1);
  
  return { min: minWeight, max: maxWeight };
}

/**
 * Calculate daily macros based on TDEE and goals
 */
export function calculateMacros(tdee, goal = 'maintain') {
  if (!tdee) return null;
  
  // Adjust calories based on goal
  const calorieAdjustments = {
    lose: -500,      // Lose ~0.5kg/week
    maintain: 0,
    gain: 500        // Gain ~0.5kg/week
  };
  
  const targetCalories = tdee + (calorieAdjustments[goal] || 0);
  
  // Macro split: 30% protein, 35% carbs, 35% fat
  const protein = Math.round((targetCalories * 0.30) / 4); // 4 cal/g
  const carbs = Math.round((targetCalories * 0.35) / 4);   // 4 cal/g
  const fat = Math.round((targetCalories * 0.35) / 9);     // 9 cal/g
  
  return {
    calories: targetCalories,
    protein,
    carbs,
    fat
  };
}

/**
 * Calculate water intake recommendation
 * ~35ml per kg of body weight
 */
export function calculateWaterIntake(weight) {
  if (!weight) return null;
  return Math.round(weight * 35); // ml per day
}

/**
 * Calculate max heart rate and zones
 */
export function calculateHeartRateZones(age) {
  if (!age) return null;
  
  const maxHR = 220 - age;
  
  return {
    max: maxHR,
    zones: {
      resting: { min: 0, max: Math.round(maxHR * 0.5), label: 'Resting' },
      fatBurn: { min: Math.round(maxHR * 0.5), max: Math.round(maxHR * 0.7), label: 'Fat Burn' },
      cardio: { min: Math.round(maxHR * 0.7), max: Math.round(maxHR * 0.85), label: 'Cardio' },
      peak: { min: Math.round(maxHR * 0.85), max: maxHR, label: 'Peak' }
    }
  };
}


/**
 * Calculate daily protein recommendation
 * Based on weight, activity level, and fitness goal
 * 
 * Sedentary: 0.8g per kg
 * Light activity: 1.0g per kg
 * Moderate: 1.2g per kg
 * Active: 1.6g per kg
 * Very Active: 2.0g per kg
 * 
 * Goal adjustments:
 * - Lose weight: +0.2g (preserve muscle)
 * - Gain muscle: +0.4g (build muscle)
 */
export function calculateProteinGoal(weight, activityLevel = 'moderate', goal = 'maintain') {
  if (!weight) return null;
  
  const baseProtein = {
    sedentary: 0.8,
    light: 1.0,
    moderate: 1.2,
    active: 1.6,
    veryActive: 2.0
  };
  
  const goalAdjustment = {
    lose: 0.2,      // Extra protein to preserve muscle during deficit
    maintain: 0,
    gain: 0.4       // Extra protein for muscle building
  };
  
  const base = baseProtein[activityLevel] || 1.2;
  const adjustment = goalAdjustment[goal] || 0;
  
  return Math.round(weight * (base + adjustment));
}

/**
 * Common foods database with estimated calories and protein per serving
 */
export const COMMON_FOODS = {
  // Breakfast items
  'huevo': { name: 'Huevo', calories: 70, protein: 6, serving: '1 pieza' },
  'huevos': { name: 'Huevos', calories: 70, protein: 6, serving: '1 pieza' },
  'avena': { name: 'Avena cocida', calories: 150, protein: 5, serving: '1 taza' },
  'pan': { name: 'Pan integral', calories: 80, protein: 4, serving: '1 rebanada' },
  'yogurt': { name: 'Yogurt natural', calories: 120, protein: 8, serving: '1 taza' },
  'yogur': { name: 'Yogurt natural', calories: 120, protein: 8, serving: '1 taza' },
  'cereal': { name: 'Cereal con leche', calories: 200, protein: 8, serving: '1 taza' },
  'tortilla': { name: 'Tortilla de maíz', calories: 60, protein: 1.5, serving: '1 pieza' },
  'tortillas': { name: 'Tortilla de maíz', calories: 60, protein: 1.5, serving: '1 pieza' },
  'frijoles': { name: 'Frijoles', calories: 120, protein: 8, serving: '1/2 taza' },
  
  // Proteins
  'pollo': { name: 'Pechuga de pollo', calories: 165, protein: 31, serving: '100g' },
  'res': { name: 'Carne de res magra', calories: 250, protein: 26, serving: '100g' },
  'pescado': { name: 'Pescado blanco', calories: 120, protein: 20, serving: '100g' },
  'salmón': { name: 'Salmón', calories: 200, protein: 22, serving: '100g' },
  'salmon': { name: 'Salmón', calories: 200, protein: 22, serving: '100g' },
  'atún': { name: 'Atún en agua', calories: 130, protein: 30, serving: '100g' },
  'atun': { name: 'Atún en agua', calories: 130, protein: 30, serving: '100g' },
  'camarón': { name: 'Camarones', calories: 100, protein: 24, serving: '100g' },
  'camaron': { name: 'Camarones', calories: 100, protein: 24, serving: '100g' },
  'camarones': { name: 'Camarones', calories: 100, protein: 24, serving: '100g' },
  
  // Dairy
  'queso': { name: 'Queso fresco', calories: 100, protein: 6, serving: '30g' },
  'leche': { name: 'Leche', calories: 150, protein: 8, serving: '1 taza' },
  'cottage': { name: 'Queso cottage', calories: 110, protein: 12, serving: '1/2 taza' },
  
  // Grains & Carbs
  'arroz': { name: 'Arroz cocido', calories: 200, protein: 4, serving: '1 taza' },
  'pasta': { name: 'Pasta cocida', calories: 220, protein: 8, serving: '1 taza' },
  'papa': { name: 'Papa cocida', calories: 160, protein: 4, serving: '1 pieza mediana' },
  'papas': { name: 'Papa cocida', calories: 160, protein: 4, serving: '1 pieza mediana' },
  'camote': { name: 'Camote', calories: 110, protein: 2, serving: '1 pieza mediana' },
  
  // Vegetables
  'ensalada': { name: 'Ensalada mixta', calories: 50, protein: 2, serving: '2 tazas' },
  'brócoli': { name: 'Brócoli', calories: 55, protein: 4, serving: '1 taza' },
  'brocoli': { name: 'Brócoli', calories: 55, protein: 4, serving: '1 taza' },
  'espinaca': { name: 'Espinaca', calories: 40, protein: 5, serving: '2 tazas' },
  
  // Fruits
  'manzana': { name: 'Manzana', calories: 95, protein: 0.5, serving: '1 pieza' },
  'plátano': { name: 'Plátano', calories: 105, protein: 1, serving: '1 pieza' },
  'platano': { name: 'Plátano', calories: 105, protein: 1, serving: '1 pieza' },
  'naranja': { name: 'Naranja', calories: 65, protein: 1, serving: '1 pieza' },
  'fresa': { name: 'Fresas', calories: 50, protein: 1, serving: '1 taza' },
  'fresas': { name: 'Fresas', calories: 50, protein: 1, serving: '1 taza' },
  
  // Snacks
  'nueces': { name: 'Nueces mixtas', calories: 170, protein: 5, serving: '30g (puñado)' },
  'almendras': { name: 'Almendras', calories: 160, protein: 6, serving: '30g' },
  'cacahuates': { name: 'Cacahuates', calories: 170, protein: 7, serving: '30g' },
  'yogurt griego': { name: 'Yogurt griego', calories: 100, protein: 15, serving: '1 taza' },
  'proteina': { name: 'Batido de proteína', calories: 120, protein: 25, serving: '1 scoop' },
  'proteína': { name: 'Batido de proteína', calories: 120, protein: 25, serving: '1 scoop' },
  
  // Mexican dishes
  'tacos': { name: 'Tacos (3)', calories: 300, protein: 15, serving: '3 piezas' },
  'taco': { name: 'Taco', calories: 100, protein: 5, serving: '1 pieza' },
  'burrito': { name: 'Burrito', calories: 450, protein: 20, serving: '1 pieza' },
  'quesadilla': { name: 'Quesadilla', calories: 350, protein: 12, serving: '1 pieza' },
  'enchiladas': { name: 'Enchiladas (3)', calories: 400, protein: 18, serving: '3 piezas' },
  'sopes': { name: 'Sopes (2)', calories: 320, protein: 8, serving: '2 piezas' },
  'gorditas': { name: 'Gorditas (2)', calories: 350, protein: 6, serving: '2 piezas' },
  'chilaquiles': { name: 'Chilaquiles', calories: 450, protein: 12, serving: '1 plato' },
  'mollete': { name: 'Mollete', calories: 280, protein: 10, serving: '1 pieza' },
  'mole': { name: 'Mole con pollo', calories: 500, protein: 35, serving: '1 plato' },
  
  // Fast food / common meals
  'hamburguesa': { name: 'Hamburguesa', calories: 500, protein: 25, serving: '1 pieza' },
  'pizza': { name: 'Pizza (rebanada)', calories: 285, protein: 12, serving: '1 rebanada' },
  'sandwich': { name: 'Sándwich', calories: 350, protein: 15, serving: '1 pieza' },
  'sushi': { name: 'Sushi roll (8 piezas)', calories: 300, protein: 8, serving: '1 rollo' },
  
  // Beverages
  'café': { name: 'Café negro', calories: 5, protein: 0, serving: '1 taza' },
  'cafe': { name: 'Café negro', calories: 5, protein: 0, serving: '1 taza' },
  'jugo': { name: 'Jugo natural', calories: 120, protein: 2, serving: '1 vaso' },
  'refresco': { name: 'Refresco', calories: 150, protein: 0, serving: '1 vaso' },
  'agua': { name: 'Agua', calories: 0, protein: 0, serving: '1 vaso' },
  'cerveza': { name: 'Cerveza', calories: 150, protein: 1, serving: '1 lata' },
  'vino': { name: 'Vino', calories: 120, protein: 0, serving: '1 copa' }
};

/**
 * Search for foods in the database
 */
export function searchFoods(query) {
  if (!query || query.length < 2) return [];
  
  const normalized = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const results = [];
  
  for (const [key, food] of Object.entries(COMMON_FOODS)) {
    if (key.includes(normalized) || food.name.toLowerCase().includes(normalized)) {
      // Avoid duplicates
      if (!results.find(r => r.name === food.name)) {
        results.push(food);
      }
    }
  }
  
  return results.slice(0, 5); // Return top 5 matches
}


/**
 * Calculate recommended calorie adjustment based on weight goal and timeline
 * 
 * Safe rates:
 * - Weight loss: 0.5-1% of body weight per week (max 1%)
 * - Weight gain: 0.25-0.5% of body weight per week
 * 
 * 1 kg fat = ~7700 kcal deficit/surplus needed
 * 
 * Returns: { dailyCalorieAdjustment, weeklyWeightChange, isSafe, recommendation }
 */
export function calculateWeightGoalPlan(currentWeight, goalWeight, timelineWeeks) {
  if (!currentWeight || !goalWeight || !timelineWeeks) return null;
  
  const weightDiff = goalWeight - currentWeight; // negative for loss, positive for gain
  const isLoss = weightDiff < 0;
  const absDiff = Math.abs(weightDiff);
  
  // Calculate required weekly change
  const requiredWeeklyChange = absDiff / timelineWeeks;
  
  // Safe rates (% of body weight per week)
  const safeRateLoss = currentWeight * 0.005; // 0.5% per week (conservative)
  const safeRateLossMax = currentWeight * 0.01; // 1% per week (max safe)
  const safeRateGain = currentWeight * 0.0025; // 0.25% per week (conservative)
  const safeRateGainMax = currentWeight * 0.005; // 0.5% per week (max safe)
  
  let recommendation;
  let isSafe = true;
  let adjustedTimeline = timelineWeeks;
  
  if (isLoss) {
    // Weight loss
    if (requiredWeeklyChange > safeRateLossMax) {
      // Too aggressive
      isSafe = false;
      adjustedTimeline = Math.ceil(absDiff / safeRateLossMax);
      recommendation = `Tu meta es muy agresiva. Te recomendamos ${adjustedTimeline} semanas para perder ${absDiff}kg de forma segura.`;
    } else if (requiredWeeklyChange > safeRateLoss) {
      // Aggressive but acceptable
      recommendation = 'Ritmo ambicioso pero seguro. Considera aumentar actividad física.';
    } else {
      // Conservative
      recommendation = 'Ritmo conservador y sostenible. ¡Perfecto para mantener a largo plazo!';
    }
  } else {
    // Weight gain
    if (requiredWeeklyChange > safeRateGainMax) {
      // Too aggressive
      isSafe = false;
      adjustedTimeline = Math.ceil(absDiff / safeRateGainMax);
      recommendation = `Tu meta es muy agresiva. Te recomendamos ${adjustedTimeline} semanas para ganar ${absDiff}kg de forma segura.`;
    } else if (requiredWeeklyChange > safeRateGain) {
      // Moderate gain
      recommendation = 'Buen ritmo para ganar masa muscular con entrenamiento adecuado.';
    } else {
      // Slow gain
      recommendation = 'Ritmo lento. Ideal para minimizar grasa y maximizar músculo.';
    }
  }
  
  // Calculate daily calorie adjustment
  // 7700 kcal = 1 kg fat
  const totalCalorieChange = absDiff * 7700;
  const dailyCalorieAdjustment = Math.round(totalCalorieChange / (timelineWeeks * 7));
  
  // Weekly weight change in kg
  const actualWeeklyChange = Math.min(
    requiredWeeklyChange,
    isLoss ? safeRateLossMax : safeRateGainMax
  );
  
  return {
    weightDiff,
    isLoss,
    dailyCalorieAdjustment: isLoss ? -dailyCalorieAdjustment : dailyCalorieAdjustment,
    weeklyWeightChange: isLoss ? -actualWeeklyChange : actualWeeklyChange,
    requiredWeeklyChange,
    isSafe,
    adjustedTimeline,
    recommendation,
    caloriesPerKg: 7700
  };
}

/**
 * Calculate recommended exercise minutes based on goal
 */
export function calculateRecommendedExercise(goal, currentLevel) {
  const recommendations = {
    lose: {
      sedentary: { min: 30, max: 45, type: 'Cardio + Fuerza', message: '30-45 min diarios: cardio + entrenamiento de fuerza' },
      light: { min: 45, max: 60, type: 'Cardio moderado + Fuerza', message: '45-60 min: 3-4 días cardio, 2-3 días fuerza' },
      moderate: { min: 60, max: 75, type: 'Cardio intenso + Fuerza', message: '60-75 min: HIIT 2x semana + fuerza 3x' },
      active: { min: 60, max: 90, type: 'Cardio + Fuerza avanzado', message: '60-90 min: mantén intensidad alta' },
      veryActive: { min: 60, max: 90, type: 'Mantenimiento', message: '60-90 min: tu nivel actual es ideal' }
    },
    gain: {
      sedentary: { min: 45, max: 60, type: 'Fuerza principal', message: '45-60 min: 3-4 días fuerza, mínimo cardio' },
      light: { min: 60, max: 75, type: 'Fuerza + Cardio ligero', message: '60-75 min: 4 días fuerza, cardio opcional' },
      moderate: { min: 60, max: 75, type: 'Fuerza progresivo', message: '60-75 min: 4-5 días fuerza, cardio 1-2x' },
      active: { min: 60, max: 90, type: 'Fuerza + Cardio', message: '60-90 min: 4-5 días fuerza, mantén cardio moderado' },
      veryActive: { min: 60, max: 90, type: 'Ajuste', message: '60-90 min: reduce cardio, enfócate en fuerza' }
    },
    maintain: {
      sedentary: { min: 20, max: 30, type: 'Actividad ligera', message: '20-30 min diarios de actividad' },
      light: { min: 30, max: 45, type: 'Cardio + Fuerza', message: '30-45 min: mix de cardio y fuerza' },
      moderate: { min: 45, max: 60, type: 'Cardio + Fuerza', message: '45-60 min: 3 días cardio, 2 días fuerza' },
      active: { min: 60, max: 75, type: 'Mantenimiento', message: '60-75 min: mantén tu rutina actual' },
      veryActive: { min: 60, max: 90, type: 'Mantenimiento', message: '60-90 min: excelente nivel de actividad' }
    }
  };
  
  return recommendations[goal]?.[currentLevel] || recommendations.maintain.moderate;
}

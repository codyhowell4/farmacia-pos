// Voice AI Service
// Free voice input using Web Speech API + keyword parsing
// No external AI API required!

export const VoiceAI = {
  recognition: null,
  isListening: false,

  // Initialize speech recognition
  init() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('Web Speech API not supported');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'es-MX';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;

    return true;
  },

  // Start listening
  startListening(onResult, onError) {
    if (!this.recognition && !this.init()) {
      onError?.('Tu navegador no soporta reconocimiento de voz');
      return false;
    }

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const parsed = this.parseCommand(transcript);
      onResult?.(transcript, parsed);
    };

    this.recognition.onerror = (event) => {
      onError?.(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };

    this.isListening = true;
    this.recognition.start();
    return true;
  },

  // Stop listening
  stopListening() {
    if (this.recognition) {
      this.recognition.stop();
      this.isListening = false;
    }
  },

  // Parse natural language into structured data
  parseCommand(text) {
    const lowerText = text.toLowerCase().trim();
    
    // Exercise patterns
    const exercisePatterns = [
      {
        pattern: /(?:corri|run|trotar|jog).*?(\d+(?:\.\d+)?)\s*(km|kilometros?|metros?|m)/i,
        type: 'exercise',
        action: 'log',
        parse: (match) => ({
          activity: 'running',
          distance: parseFloat(match[1]),
          unit: match[2].startsWith('km') ? 'km' : 'm'
        })
      },
      {
        pattern: /(?:camine|walk|andar).*?(\d+(?:\.\d+)?)\s*(km|kilometros?|metros?|m|pasos?)/i,
        type: 'exercise',
        action: 'log',
        parse: (match) => ({
          activity: 'walking',
          distance: parseFloat(match[1]),
          unit: match[2].startsWith('km') ? 'km' : match[2].startsWith('paso') ? 'steps' : 'm'
        })
      },
      {
        pattern: /(?:nade|swim|natacion).*?(\d+(?:\.\d+)?)\s*(metros?|m|km)/i,
        type: 'exercise',
        action: 'log',
        parse: (match) => ({
          activity: 'swimming',
          distance: parseFloat(match[1]),
          unit: match[2].startsWith('km') ? 'km' : 'm'
        })
      },
      {
        pattern: /(?:bicicleta|bike|ciclismo|pedalear).*?(\d+(?:\.\d+)?)\s*(km|kilometros?|metros?|m)/i,
        type: 'exercise',
        action: 'log',
        parse: (match) => ({
          activity: 'cycling',
          distance: parseFloat(match[1]),
          unit: match[2].startsWith('km') ? 'km' : 'm'
        })
      },
      {
        pattern: /(?:pesas?|gym|ejercicio|entrenamiento).*?(\d+)\s*(min|minutos?)/i,
        type: 'exercise',
        action: 'log',
        parse: (match) => ({
          activity: 'weightlifting',
          duration: parseInt(match[1]),
          unit: 'minutes'
        })
      },
      {
        pattern: /(?:yoga|pilates|estiramiento).*?(\d+)\s*(min|minutos?)/i,
        type: 'exercise',
        action: 'log',
        parse: (match) => ({
          activity: 'yoga',
          duration: parseInt(match[1]),
          unit: 'minutes'
        })
      }
    ];

    // Weight patterns
    const weightPatterns = [
      {
        pattern: /(?:peso|pesar|estoy pesando|mi peso es).*?(\d+(?:\.\d+)?)\s*(kg|kilos?)/i,
        type: 'weight',
        action: 'log',
        parse: (match) => ({
          value: parseFloat(match[1]),
          unit: 'kg'
        })
      },
      {
        pattern: /(?:peso|pesar|estoy pesando|mi peso es).*?(\d+(?:\.\d+)?)\s*(lb|libras?)/i,
        type: 'weight',
        action: 'log',
        parse: (match) => ({
          value: parseFloat(match[1]) * 0.453592, // Convert to kg
          unit: 'kg'
        })
      }
    ];

    // Water patterns
    const waterPatterns = [
      {
        pattern: /(?:bebi|tome|agua).*?(\d+)\s*(vasos?|copas?|litros?|l)/i,
        type: 'water',
        action: 'log',
        parse: (match) => ({
          amount: parseInt(match[1]),
          unit: match[2].startsWith('litro') || match[2] === 'l' ? 'liters' : 'glasses'
        })
      },
      {
        pattern: /(?:agua|hidratacion)/i,
        type: 'water',
        action: 'log',
        parse: () => ({
          amount: 1,
          unit: 'glasses'
        })
      }
    ];

    // Food patterns
    const foodPatterns = [
      {
        pattern: /(?:comi|almorce|cene|desayune|snack).*?(?:una?\s*)?(.*?)(?:\s+de\s+)?(\d+)?\s*(calorias?)?/i,
        type: 'food',
        action: 'log',
        parse: (match) => ({
          description: match[1]?.trim() || 'Comida',
          calories: match[2] ? parseInt(match[2]) : null
        })
      }
    ];

    // Blood pressure patterns
    const bpPatterns = [
      {
        pattern: /(?:presion|tension).*?(\d{2,3})\s*(?:sobre|por|\/)?\s*(\d{2,3})/i,
        type: 'bloodPressure',
        action: 'log',
        parse: (match) => ({
          systolic: parseInt(match[1]),
          diastolic: parseInt(match[2]),
          value: `${match[1]}/${match[2]}`
        })
      }
    ];

    // Glucose patterns
    const glucosePatterns = [
      {
        pattern: /(?:glucosa|azucar).*?(\d{2,3})/i,
        type: 'glucose',
        action: 'log',
        parse: (match) => ({
          value: parseInt(match[1])
        })
      }
    ];

    // Heart rate patterns
    const hrPatterns = [
      {
        pattern: /(?:pulso|ritmo cardiaco|frecuencia cardiaca|heart rate).*?(\d{2,3})/i,
        type: 'heartRate',
        action: 'log',
        parse: (match) => ({
          value: parseInt(match[1])
        })
      }
    ];

    // Check all patterns
    const allPatterns = [
      ...exercisePatterns,
      ...weightPatterns,
      ...waterPatterns,
      ...foodPatterns,
      ...bpPatterns,
      ...glucosePatterns,
      ...hrPatterns
    ];

    for (const pattern of allPatterns) {
      const match = lowerText.match(pattern.pattern);
      if (match) {
        return {
          success: true,
          originalText: text,
          type: pattern.type,
          action: pattern.action,
          data: pattern.parse(match)
        };
      }
    }

    // No pattern matched - return as general query
    return {
      success: false,
      originalText: text,
      type: 'unknown',
      message: 'No pude entender el comando. Intenta ser más específico.'
    };
  },

  // Execute the parsed command
  executeCommand(parsed, Store) {
    if (!parsed.success) {
      return { success: false, message: parsed.message };
    }

    switch (parsed.type) {
      case 'exercise':
        Store.addExercise({
          type: parsed.data.activity,
          duration: parsed.data.duration || 30,
          distance: parsed.data.distance,
          unit: parsed.data.unit,
          date: new Date().toISOString()
        });
        return { 
          success: true, 
          message: `✅ Ejercicio registrado: ${parsed.data.activity} ${parsed.data.distance ? parsed.data.distance + parsed.data.unit : parsed.data.duration + 'min'}`
        };

      case 'weight':
        Store.addVitalEntry({
          type: 'weight',
          value: parsed.data.value,
          date: new Date().toISOString(),
          notes: 'Voice input'
        });
        return { 
          success: true, 
          message: `✅ Peso registrado: ${parsed.data.value.toFixed(1)} kg` 
        };

      case 'water':
        const glasses = parsed.data.unit === 'liters' ? parsed.data.amount * 4 : parsed.data.amount;
        Store.addWater(glasses);
        return { 
          success: true, 
          message: `✅ Agua registrada: ${glasses} vasos` 
        };

      case 'food':
        Store.addMeal({
          type: 'snack',
          name: parsed.data.description,
          calories: parsed.data.calories || 0,
          date: new Date().toISOString()
        });
        return { 
          success: true, 
          message: `✅ Comida registrada: ${parsed.data.description}` 
        };

      case 'bloodPressure':
        Store.addVitalEntry({
          type: 'bloodPressure',
          value: parsed.data.value,
          date: new Date().toISOString(),
          notes: 'Voice input'
        });
        return { 
          success: true, 
          message: `✅ Presión registrada: ${parsed.data.value} mmHg` 
        };

      case 'glucose':
        Store.addVitalEntry({
          type: 'glucose',
          value: parsed.data.value,
          date: new Date().toISOString(),
          notes: 'Voice input'
        });
        return { 
          success: true, 
          message: `✅ Glucosa registrada: ${parsed.data.value} mg/dL` 
        };

      case 'heartRate':
        Store.addVitalEntry({
          type: 'heartRate',
          value: parsed.data.value,
          date: new Date().toISOString(),
          notes: 'Voice input'
        });
        return { 
          success: true, 
          message: `✅ Pulso registrado: ${parsed.data.value} bpm` 
        };

      default:
        return { success: false, message: 'Tipo de comando no reconocido' };
    }
  }
};

// Pre-defined responses for common questions
export const HealthFAQ = {
  responses: {
    'imc': 'El IMC (Índice de Masa Corporal) se calcula dividiendo tu peso en kg por tu altura en metros al cuadrado. Un IMC saludable está entre 18.5 y 24.9.',
    'peso ideal': 'Tu peso ideal depende de tu altura, edad y género. Puedes ver tu rango de peso ideal en la página de Salud.',
    'agua': 'Se recomienda beber al menos 2 litros de agua al día (unos 8 vasos). Tu necesidad exacta depende de tu peso y nivel de actividad.',
    'pasos': 'Se recomienda caminar al menos 10,000 pasos al día para mantener una buena salud cardiovascular.',
    'sueno': 'Los adultos necesitan entre 7 y 9 horas de sueño por noche para un óptimo descanso y recuperación.',
    'bmr': 'El BMR (Tasa Metabólica Basal) es la cantidad de calorías que tu cuerpo quema en reposo absoluto. Se usa como base para calcular tus necesidades calóricas diarias.',
    'tdee': 'El TDEE (Gasto Energético Total Diario) es el total de calorías que quemas en un día, incluyendo tu actividad física. Se calcula multiplicando tu BMR por tu nivel de actividad.',
    'proteina': 'Se recomienda consumir entre 0.8 y 1.2 gramos de proteína por kg de peso corporal, dependiendo de tu nivel de actividad física.',
    'grasa corporal': 'La grasa corporal saludable varía por género: mujeres 21-31%, hombres 14-24%. Los atletas tienen porcentajes más bajos.',
    'ayuda': 'Puedes decir cosas como: "Corrí 5 kilómetros", "Peso 70 kilos", "Bebí 2 vasos de agua", o "Mi presión es 120 sobre 80". También puedes preguntarme sobre IMC, peso ideal, o agua.'
  },

  getResponse(question) {
    const lowerQ = question.toLowerCase();
    
    for (const [key, response] of Object.entries(this.responses)) {
      if (lowerQ.includes(key)) {
        return response;
      }
    }
    
    return 'Lo siento, no tengo información sobre eso. Intenta preguntar sobre IMC, peso ideal, agua, pasos, sueño, BMR, TDEE, proteína, o grasa corporal.';
  }
};

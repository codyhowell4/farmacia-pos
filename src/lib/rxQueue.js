// Cola de reintento (R2-26) para registros sanitarios que fallan DESPUÉS de
// que la venta ya quedó confirmada: la receta COFEPRIS y la bitácora de
// controlados no pueden quedar solo en un toast. Los trabajos se guardan en
// localStorage (`rx_failed_queue`) y se reintentan al montar el POS, después
// de cada venta completada y cuando vuelve la conexión ('online').

const QUEUE_KEY = 'rx_failed_queue';

const readQueue = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (jobs) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(jobs)); } catch { /* storage no disponible */ }
};

// job: { kind: 'prescription' | 'controlled_register', payload }
export const enqueueRxJob = (job) => {
  const queue = readQueue();
  queue.push({ ...job, queuedAt: job?.queuedAt || new Date().toISOString() });
  writeQueue(queue);
};

export const getRxQueueSize = () => readQueue().length;

// Vacía la cola sin reintentar (LFPDPPP): los payloads contienen datos de
// pacientes (nombre, folio) y no deben quedar en localStorage del equipo
// compartido después del cierre de turno. Se llama solo tras un cierre
// exitoso; durante el turno la cola sigue reintentándose con normalidad.
export const clearRxQueue = () => {
  try { localStorage.removeItem(QUEUE_KEY); } catch { /* storage no disponible */ }
};

// Reintenta toda la cola; los éxitos salen y los fallos se quedan para el
// próximo intento. Un folio duplicado (23505) es error de captura, no un
// fallo transitorio: se descarta en vez de reintentarse para siempre.
export const flushRxQueue = async ({ createPrescriptionFn, insertControlledFn } = {}) => {
  const queue = readQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };
  const remaining = [];
  let flushed = 0;
  for (const job of queue) {
    try {
      if (job.kind === 'prescription') {
        await createPrescriptionFn(job.payload);
      } else if (job.kind === 'controlled_register') {
        await insertControlledFn(job.payload);
      }
      // kind desconocido: se descarta igualmente (no re-encolar)
      flushed++;
    } catch (err) {
      if (err?.code !== '23505') remaining.push(job);
      else console.warn('flushRxQueue: folio duplicado descartado de la cola', job.payload?.prescription_number || '');
    }
  }
  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
};

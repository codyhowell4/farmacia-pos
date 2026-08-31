// ============================================================
// PayPal SDK helper for subscription checkout
// Dynamically loads the PayPal JS SDK and renders buttons.
// ============================================================

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;
const PAYPAL_ENV = import.meta.env.VITE_PAYPAL_ENV || 'sandbox';

export const PAYPAL_PLAN_IDS = {
  individual: import.meta.env.VITE_PAYPAL_PLAN_INDIVIDUAL,
  familiar: import.meta.env.VITE_PAYPAL_PLAN_FAMILIAR,
};

const PAYPAL_SCRIPT_BASE =
  PAYPAL_ENV === 'live'
    ? 'https://www.paypal.com/sdk/js'
    : 'https://www.sandbox.paypal.com/sdk/js';

let scriptLoadPromise = null;

export const isPayPalConfigured = () =>
  Boolean(PAYPAL_CLIENT_ID && PAYPAL_PLAN_IDS.individual && PAYPAL_PLAN_IDS.familiar);

export const loadPayPalScript = () => {
  if (!isPayPalConfigured()) {
    return Promise.reject(new Error('PayPal no está configurado'));
  }

  if (window.paypal) {
    return Promise.resolve(window.paypal);
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('paypal-sdk-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.paypal));
      existing.addEventListener('error', () => reject(new Error('Error cargando PayPal')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'paypal-sdk-script';
    script.src = `${PAYPAL_SCRIPT_BASE}?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=MXN`;
    script.setAttribute('data-sdk-integration-source', 'button-factory');
    script.async = true;

    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error('No se pudo cargar el SDK de PayPal'));

    document.body.appendChild(script);
  });

  return scriptLoadPromise;
};

export const renderPayPalButtons = ({
  containerId,
  planId,
  onApprove,
  onError,
  onCancel,
}) => {
  if (!planId) {
    throw new Error('Plan ID de PayPal no configurado');
  }

  return loadPayPalScript().then((paypal) => {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Contenedor de PayPal no encontrado: #${containerId}`);
    }

    container.innerHTML = '';

    return paypal
      .Buttons({
        style: {
          shape: 'rect',
          color: 'blue',
          layout: 'vertical',
          label: 'subscribe',
        },
        createSubscription: (data, actions) => {
          return actions.subscription.create({ plan_id: planId });
        },
        onApprove: async (data, actions) => {
          if (onApprove) {
            await onApprove(data, actions);
          }
        },
        onCancel: (data) => {
          if (onCancel) onCancel(data);
        },
        onError: (err) => {
          console.error('[PayPal Buttons] error:', err);
          if (onError) onError(err);
        },
      })
      .render(`#${containerId}`);
  });
};

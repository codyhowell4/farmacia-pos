const SCRIPT_URL = 'https://js.openpay.mx/openpay.v1.min.js';

let scriptPromise = null;

const loadOpenPayScript = () => {
  if (typeof window === 'undefined') return Promise.reject('No browser');
  if (window.OpenPay) return Promise.resolve(window.OpenPay);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(window.OpenPay);
    script.onerror = () => reject(new Error('No se pudo cargar OpenPay.js'));
    document.body.appendChild(script);
  });
  return scriptPromise;
};

export const isOpenPayConfigured = () => {
  return Boolean(
    import.meta.env.VITE_OPENPAY_MERCHANT_ID &&
    import.meta.env.VITE_OPENPAY_PUBLIC_KEY
  );
};

export const tokenizeCard = async (card) => {
  const merchantId = import.meta.env.VITE_OPENPAY_MERCHANT_ID;
  const publicKey = import.meta.env.VITE_OPENPAY_PUBLIC_KEY;
  const sandbox = import.meta.env.VITE_OPENPAY_SANDBOX_MODE === 'true';

  if (!merchantId || !publicKey) {
    throw new Error('OpenPay no está configurado. Agrega VITE_OPENPAY_MERCHANT_ID y VITE_OPENPAY_PUBLIC_KEY al .env.');
  }

  const OpenPay = await loadOpenPayScript();
  OpenPay.setId(merchantId);
  OpenPay.setApiKey(publicKey);
  OpenPay.setSandboxMode(sandbox);

  return new Promise((resolve, reject) => {
    const success = (response) => {
      resolve({
        token: response?.data?.id,
        deviceSessionId: response?.data?.device_session_id,
      });
    };
    const errorFn = (response) => {
      const msg = response?.data?.description || response?.message || 'Error al tokenizar tarjeta';
      reject(new Error(msg));
    };
    OpenPay.token.create(card, success, errorFn);
  });
};

export const maskCardNumber = (number) => {
  const cleaned = (number || '').replace(/\D/g, '');
  return cleaned.slice(-4);
};

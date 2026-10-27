// ============================================================
// Stripe SDK helper for subscription checkout
// Lazily loads Stripe.js and exposes an embedded-card form flow.
// ============================================================

import { loadStripe } from '@stripe/stripe-js';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY;

export const STRIPE_PRICE_IDS = {
  individual: import.meta.env.VITE_STRIPE_PRICE_INDIVIDUAL,
  familiar: import.meta.env.VITE_STRIPE_PRICE_FAMILIAR,
};

export const isStripeConfigured = () => Boolean(STRIPE_PUBLIC_KEY);

let stripePromise = null;

export const getStripe = () => {
  if (!isStripeConfigured()) {
    return Promise.reject(new Error('Stripe no está configurado'));
  }
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLIC_KEY);
  }
  return stripePromise;
};

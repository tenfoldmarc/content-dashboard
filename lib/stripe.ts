import Stripe from 'stripe';

export function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!.trim(), {
    apiVersion: '2026-02-25.clover',
  });
}

// api/_validate.js — Zod schemas for all API input validation
// Usage: import { schemas, validate } from './_validate.js';

import { z } from 'zod';

// ── AU phone helper ────────────────────────────────────────────────────────────
const auPhone = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine(
    (v) =>
      (v.startsWith('61') && v.length === 11) ||
      (v.startsWith('0') && v.length === 10) ||
      v.length === 9,
    { message: 'Invalid Australian phone number' }
  );

// ── Shared field definitions ───────────────────────────────────────────────────
const email = z.string().email().max(254).toLowerCase().trim();
const name = z.string().min(2).max(100).trim();
const uuid = z.string().uuid();
const bookingId = uuid;

// ── Schemas ────────────────────────────────────────────────────────────────────
export const schemas = {
  // /api/auth — client bookings / cancel / reschedule
  clientBookings: z.object({
    role: z.literal('client-bookings'),
    access_token: z.string().min(10),
    client_id: uuid,
  }),
  clientCancel: z.object({
    role: z.literal('client-cancel'),
    access_token: z.string().min(10),
    booking_id: bookingId,
    client_id: uuid,
  }),
  clientReschedule: z.object({
    role: z.literal('client-reschedule'),
    access_token: z.string().min(10),
    booking_id: bookingId,
    client_id: uuid,
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scheduled_time: z.string().regex(/^\d{2}:\d{2}$/),
  }),

  // /api/send-email
  sendEmail: z.object({
    to: email,
    subject: z.string().min(1).max(200),
    bookingId: z.string().optional(),
    name: name.optional(),
    service: z.string().max(200).optional(),
    date: z.string().max(50).optional(),
    time: z.string().max(20).optional(),
    address: z.string().max(300).optional(),
    price: z.string().max(20).optional(),
  }),

  // /api/send-message (SMS/WhatsApp)
  sendMessage: z.object({
    to: auPhone,
    message: z.string().min(1).max(1600),
    channel: z.enum(['sms', 'whatsapp']).optional(),
  }),

  // /api/create-payment-session
  createPaymentIntent: z.object({
    type: z.literal('intent'),
    amount: z.number().int().min(100).max(100000),
    currency: z.literal('aud').default('aud'),
    bookingId: z.string().uuid().optional(),
  }),

  // /api/chat
  chat: z.object({
    message: z.string().min(1).max(2000),
    type: z.enum(['chat', 'diagnose', 'health']).optional(),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(4000),
        })
      )
      .max(20)
      .optional(),
  }),

  // Membership signup
  membership: z.object({
    plan: z.enum(['basic', 'standard', 'vip']),
    billing: z.enum(['monthly', 'annual']),
    priceId: z.string().startsWith('price_'),
    name: name,
    email: email,
    phone: auPhone,
  }),

  // Newsletter
  newsletter: z.object({
    email: email,
    name: name.optional(),
  }),
};

// ── validate() helper ──────────────────────────────────────────────────────────
// Returns { data, error } — data is the parsed+typed object, error is a string
export function validate(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const messages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    return { data: null, error: messages.join('; ') };
  }
  return { data: result.data, error: null };
}

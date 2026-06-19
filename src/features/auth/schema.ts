import { z } from 'zod';

export const EmailSchema = z.string().trim().toLowerCase().email({ message: 'Invalid email' });

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[a-z0-9_]+$/, 'Use only lowercase letters, digits, and underscores')
  .refine((v) => !v.startsWith('u_'), 'Username cannot start with "u_"');

export type EmailInput = z.infer<typeof EmailSchema>;
export type UsernameInput = z.infer<typeof UsernameSchema>;

import { EmailSchema, UsernameSchema } from '../schema';

describe('EmailSchema', () => {
  it('accepts a valid email', () => {
    expect(EmailSchema.parse('Mira@Example.com')).toBe('mira@example.com');
  });
  it('rejects an invalid email', () => {
    expect(() => EmailSchema.parse('not-an-email')).toThrow();
  });
});

describe('UsernameSchema', () => {
  it('lowercases + accepts valid', () => {
    expect(UsernameSchema.parse('Mira_')).toBe('mira_');
  });
  it('rejects too short', () => {
    expect(() => UsernameSchema.parse('ab')).toThrow();
  });
  it('rejects bad chars', () => {
    expect(() => UsernameSchema.parse('mira!')).toThrow();
  });
  it('rejects u_ prefix', () => {
    expect(() => UsernameSchema.parse('u_xyz123')).toThrow();
  });
});

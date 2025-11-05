import { z } from 'zod';

/**
 * Zod schemas for runtime validation
 */

// Environment variables validation
export const envConfigSchema = z.object({
  REDIS_TOKEN: z.string().min(1, 'Redis token is required'),
  REDIS_ADDR: z.string().min(1, 'Redis address is required'),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_TO: z.string().email().optional(),
  REAUTH_URL: z.string().url().optional(),
  EXPIRED_EMAIL_RECIPIENT: z.string().email().optional(),
});

// Token data validation
export const tokenDataSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  expire: z.number().positive('Expire time must be positive'),
});

// WeChat UUID validation
export const wechatUUIDSchema = z.object({
  uuid: z.string().min(1, 'UUID is required'),
});

// WeChat poll response validation
export const wechatPollResponseSchema = z.object({
  code: z.string().optional(),
  status: z.enum(['waiting', 'scanned', 'expired', 'confirmed']).optional(),
});

// WeChat token response validation
export const wechatTokenResponseSchema = z.object({
  Data: z.object({
    Token: z.string().optional(),
    Expire: z.number().optional(),
  }).optional(),
});

// Location validation
export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// Check-in record field validation
export const checkInRecordFieldSchema = z.object({
  FieldId: z.number(),
  Values: z.array(z.string()),
  Texts: z.array(z.string()),
  HasValue: z.boolean(),
});

// Check-in payload validation
export const checkInPayloadSchema = z.object({
  Id: z.number(),
  ThreadId: z.number().positive(),
  Signature: z.string().min(1, 'Signature is required'),
  RecordValues: z.array(checkInRecordFieldSchema),
});

// Email configuration validation
export const emailConfigSchema = z.object({
  host: z.string().min(1, 'Email host is required'),
  port: z.number().positive().max(65535),
  secure: z.boolean(),
  auth: z.object({
    user: z.string().min(1, 'Email user is required'),
    pass: z.string().min(1, 'Email password is required'),
  }),
});

// Request options validation
export const requestOptionsSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
});

// Generic API response validation
export const apiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema.optional(),
    status: z.number().optional(),
    statusText: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  });

// Log entry validation
export const logEntrySchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().min(1, 'Log message is required'),
  timestamp: z.date(),
  context: z.record(z.string(), z.unknown()).optional(),
  error: z.instanceof(Error).optional(),
});

// Type inference helpers
export type EnvConfig = z.infer<typeof envConfigSchema>;
export type TokenData = z.infer<typeof tokenDataSchema>;
export type WeChatUUIDResponse = z.infer<typeof wechatUUIDSchema>;
export type WeChatPollResponse = z.infer<typeof wechatPollResponseSchema>;
export type WeChatTokenResponse = z.infer<typeof wechatTokenResponseSchema>;
export type Location = z.infer<typeof locationSchema>;
export type CheckInRecordField = z.infer<typeof checkInRecordFieldSchema>;
export type CheckInPayload = z.infer<typeof checkInPayloadSchema>;
export type EmailConfig = z.infer<typeof emailConfigSchema>;
export type RequestOptions = z.infer<typeof requestOptionsSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
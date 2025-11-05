/**
 * Core types for the School Check-in System
 */

// Environment configuration types
export interface EnvConfig {
  REDIS_TOKEN: string;
  REDIS_ADDR: string;
  EMAIL_HOST?: string;
  EMAIL_PORT?: string;
  EMAIL_USER?: string;
  EMAIL_PASS?: string;
  EMAIL_TO?: string;
}

// Redis client types
export interface RedisClientType {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<string>;
  on(event: 'error', callback: (err: Error) => void): RedisClientType;
  connect(): Promise<RedisClientType>;
}

// Token information types
export interface TokenData {
  token: string | null;
  expire: number | null;
}

export class TokenInfo implements TokenData {
  constructor(public token: string | null = null, public expire: number | null = null) {}

  isValid(): boolean {
    return !!(this.token && this.expire && Date.now() < this.expire);
  }
}

// WeChat API types
export interface WeChatUUIDResponse {
  uuid: string;
}

export interface WeChatQRResponse {
  qrcode: string;
}

export interface WeChatPollResponse {
  code?: string;
  status?: 'waiting' | 'scanned' | 'expired' | 'confirmed';
}

export interface WeChatTokenResponse {
  Data?: {
    Token?: string;
    Expire?: number;
  };
}

// Check-in API types
export interface Location {
  latitude: number;
  longitude: number;
}

export interface CheckInRecordField {
  FieldId: number;
  Values: string[];
  Texts: string[];
  HasValue: boolean;
}

export interface CheckInPayload {
  Id: number;
  ThreadId: number;
  Signature: string;
  RecordValues: CheckInRecordField[];
}

export interface CheckInInfoResponse {
  // TODO: 根据API响应添加特定字段
  [key: string]: unknown;
}

export interface CheckInSubmitResponse {
  // TODO: 根据API响应添加特定字段
  [key: string]: unknown;
}

// Email configuration types
export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailOptions {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
  }>;
}

// HTTP request types
export interface RequestHeaders {
  [key: string]: string;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: RequestHeaders;
  body?: unknown;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  status?: number;
  statusText?: string;
  headers?: RequestHeaders;
}

// Error types
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, _field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'NETWORK_ERROR', 503);
    this.name = 'NetworkError';
  }
}

export class RedisError extends AppError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'REDIS_ERROR', 503);
    this.name = 'RedisError';
  }
}

// Logging types
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  error?: Error;
}

// Configuration validation schemas (for zod)
export const envConfigSchema = {
  REDIS_TOKEN: { type: 'string', required: true },
  REDIS_ADDR: { type: 'string', required: true },
  EMAIL_HOST: { type: 'string', required: false },
  EMAIL_PORT: { type: 'string', required: false },
  EMAIL_USER: { type: 'string', required: false },
  EMAIL_PASS: { type: 'string', required: false },
  EMAIL_TO: { type: 'string', required: false },
};

// Constants
export const DEFAULT_TTL = 3600; // 1小时（以秒为单位）
export const THREAD_ID = 163231508;
export const DEFAULT_LOCATION: Location = {
  latitude: 28.423147,
  longitude: 117.976543,
};

// API endpoints
export const WECHAT_ENDPOINTS = {
  QR_CODE: 'https://open.weixin.qq.com/connect/qrcode/{uuid}',
  API_BASE: 'https://i-api.jielong.com/api',
} as const;

export const CHECKIN_ENDPOINTS = {
  INFO: (threadId: number) => `${WECHAT_ENDPOINTS.API_BASE}/Thread/CheckIn/NameScope?threadId=${threadId}`,
  SUBMIT: `${WECHAT_ENDPOINTS.API_BASE}/CheckIn/EditRecord`,
  AUTH: (wxCode: string) => `${WECHAT_ENDPOINTS.API_BASE}/User/OpenAuth?code=${wxCode}`,
} as const;
import { expect } from 'vitest';

// 模拟控制台方法以防止测试期间产生噪音
global.console = {
  ...console,
  // 取消注释以在测试期间忽略特定控制台方法
  // log: vi.fn(),
  // debug: vi.fn(),
  // info: vi.fn(),
  // warn: vi.fn(),
  // error: vi.fn(),
};

// 模拟 process.env 用于测试
process.env['NODE_ENV'] = 'test';

// 设置全局测试工具
declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toBeValidUUID(): T;
      toBeValidToken(): T;
      toBeValidLocation(): T;
    }
  }
}

// 自定义匹配器
expect.extend({
  toBeValidUUID(received: string) {
    const uuidPattern = /^[a-zA-Z0-9_-]+$/;
    const pass = uuidPattern.test(received);
    return {
      message: () =>
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`,
      pass,
    };
  },
  toBeValidToken(received: string) {
    const tokenPattern = /^Bearer\s+.+/;
    const pass = tokenPattern.test(received);
    return {
      message: () =>
        pass
          ? `expected ${received} not to be a valid bearer token`
          : `expected ${received} to be a valid bearer token`,
      pass,
    };
  },
  toBeValidLocation(received: { latitude: number; longitude: number }) {
    const validLat = typeof received?.latitude === 'number' && received.latitude >= -90 && received.latitude <= 90;
    const validLng = typeof received?.longitude === 'number' && received.longitude >= -180 && received.longitude <= 180;
    const pass = validLat && validLng;
    return {
      message: () =>
        pass
          ? `expected ${JSON.stringify(received)} not to be valid coordinates`
          : `expected ${JSON.stringify(received)} to be valid coordinates`,
      pass,
    };
  },
});
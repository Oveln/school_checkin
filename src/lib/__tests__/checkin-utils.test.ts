import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCheckInInfo, submitCheckIn } from '@/lib/checkin-utils';
import { request } from '@/lib/request';
import { ValidationError, NetworkError } from '@/types';

// 模拟依赖
vi.mock('@/lib/request', () => ({
  request: vi.fn(),
}));

describe('checkin-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCheckInInfo', () => {
    it('should make GET request to correct endpoint', async () => {
      const mockResponse = { Data: 'test-info' };
      (request as any).mockResolvedValue(mockResponse);
      const mockToken = 'Bearer test-token';

      const result = await getCheckInInfo(mockToken);

      expect(request).toHaveBeenCalledWith(
        expect.stringContaining('/api/Thread/CheckIn/NameScope?threadId=163231508'),
        { method: 'GET' },
        mockToken
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw ValidationError when no token provided', async () => {
      await expect(getCheckInInfo('')).rejects.toThrow(ValidationError);
      await expect(getCheckInInfo(null as any)).rejects.toThrow(ValidationError);
    });

    it('should propagate network errors', async () => {
      const error = new NetworkError('Network error');
      (request as any).mockRejectedValue(error);

      await expect(getCheckInInfo('Bearer token')).rejects.toThrow(NetworkError);
    });
  });

  describe('submitCheckIn', () => {
    const mockToken = 'Bearer test-token';
    const mockSignature = 'test-signature';
    const mockLocation = { latitude: 28.423147, longitude: 117.976543 };

    it('should submit check-in with provided location', async () => {
      const mockResponse = { Data: 'success' };
      (request as any).mockResolvedValue(mockResponse);

      const result = await submitCheckIn(mockToken, mockSignature, mockLocation);

      expect(request).toHaveBeenCalledWith(
        expect.stringContaining('/api/CheckIn/EditRecord'),
        {
          method: 'POST',
          body: {
            Id: 0,
            ThreadId: 163231508,
            Signature: mockSignature,
            RecordValues: [
              {
                FieldId: 1,
                Values: [],
                Texts: [],
                HasValue: false,
              },
              {
                FieldId: 2,
                Values: [JSON.stringify(mockLocation)],
                Texts: ['上饶市信州区•上饶师范学院'],
                HasValue: true,
              },
            ],
          },
        },
        mockToken
      );
      expect(result).toEqual(mockResponse);
    });

    it('should submit check-in with default location when none provided', async () => {
      const mockResponse = { Data: 'success' };
      (request as any).mockResolvedValue(mockResponse);

      await submitCheckIn(mockToken, mockSignature);

      expect(request).toHaveBeenCalledWith(
        expect.stringContaining('/api/CheckIn/EditRecord'),
        expect.objectContaining({
          body: expect.objectContaining({
            RecordValues: expect.arrayContaining([
              expect.objectContaining({
                FieldId: 2,
                Values: [JSON.stringify({ latitude: 28.423147, longitude: 117.976543 })],
              }),
            ]),
          }),
        }),
        mockToken
      );
    });

    it('should throw ValidationError when no token provided', async () => {
      await expect(submitCheckIn('', mockSignature)).rejects.toThrow(ValidationError);
      await expect(submitCheckIn(null as any, mockSignature)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when no signature provided', async () => {
      await expect(submitCheckIn(mockToken, '')).rejects.toThrow(ValidationError);
      await expect(submitCheckIn(mockToken, null as any)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid location', async () => {
      const invalidLocation = { latitude: 91, longitude: 0 }; // 无效的纬度

      await expect(submitCheckIn(mockToken, mockSignature, invalidLocation)).rejects.toThrow(ValidationError);
    });

    it('should trim signature whitespace', async () => {
      const mockResponse = { Data: 'success' };
      (request as any).mockResolvedValue(mockResponse);

      await submitCheckIn(mockToken, '  test-signature  ');

      expect(request).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            Signature: 'test-signature', // 应该被修剪
          }),
        }),
        mockToken
      );
    });
  });
});
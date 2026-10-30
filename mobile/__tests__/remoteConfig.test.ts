import { checkForcedUpdate } from '../src/updateGate/remoteConfig';

const mockFetchAndActivate = jest.fn();
let mockMinimumVersion = '0.0.0';

jest.mock('@react-native-firebase/remote-config', () => ({
  __esModule: true,
  default: () => ({
    setDefaults: async () => {},
    setConfigSettings: async () => {},
    ensureInitialized: async () => {},
    getValue: () => ({ asString: () => mockMinimumVersion }),
    fetchAndActivate: mockFetchAndActivate,
  }),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: { getVersion: () => '1.2.0' },
}));

describe('checkForcedUpdate', () => {
  beforeEach(() => {
    mockMinimumVersion = '0.0.0';
    mockFetchAndActivate.mockReset();
    mockFetchAndActivate.mockResolvedValue(true);
  });

  it('answers without waiting for the network', async () => {
    mockFetchAndActivate.mockReturnValue(new Promise(() => {}));
    await expect(checkForcedUpdate()).resolves.toBe(false);
  });

  it('still refreshes the value for the next launch', async () => {
    await checkForcedUpdate();
    expect(mockFetchAndActivate).toHaveBeenCalledTimes(1);
  });

  it('blocks a version below the cached minimum', async () => {
    mockMinimumVersion = '1.3.0';
    await expect(checkForcedUpdate()).resolves.toBe(true);
  });

  it('lets through a version at the minimum', async () => {
    mockMinimumVersion = '1.2.0';
    await expect(checkForcedUpdate()).resolves.toBe(false);
  });

  it('survives the background refresh failing', async () => {
    mockFetchAndActivate.mockRejectedValue(new Error('offline'));
    await expect(checkForcedUpdate()).resolves.toBe(false);
  });
});

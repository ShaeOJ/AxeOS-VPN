import { useState, useCallback } from 'react';
import { useDeviceStore } from '../stores/deviceStore';

interface PairingModalProps {
  onClose: () => void;
}

export function PairingModal({ onClose }: PairingModalProps) {
  const { addDeviceByIp, testConnection } = useDeviceStore();
  const [ipAddress, setIpAddress] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showAuthFields, setShowAuthFields] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    hostname?: string;
    model?: string;
    hashRate?: number;
    deviceType?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  const handleTestConnection = async () => {
    if (!ipAddress.trim()) {
      setError('Please enter an IP address');
      return;
    }

    setIsTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const result = await testConnection(
        ipAddress.trim(),
        username.trim() || undefined,
        password || undefined
      );

      // Check if device requires authentication
      if (result.requiresAuth) {
        setShowAuthFields(true);
        setError('This device requires authentication. Please enter your miner credentials below.');
        return;
      }

      if (result.success && result.data) {
        setTestResult({
          success: true,
          hostname: result.data.hostname,
          model: result.data.ASICModel,
          hashRate: result.data.hashRate,
          deviceType: result.deviceType,
        });
        // Pre-fill device name with hostname if not already set
        if (!deviceName && result.data.hostname) {
          setDeviceName(result.data.hostname);
        }
      } else {
        setError(result.error || 'Cannot connect to device');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddDevice = async () => {
    if (!ipAddress.trim()) {
      setError('Please enter an IP address');
      return;
    }

    // If auth fields are shown, require credentials
    if (showAuthFields && (!username.trim() || !password)) {
      setError('Please enter username and password for this device');
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      const result = await addDeviceByIp(
        ipAddress.trim(),
        deviceName.trim() || undefined,
        username.trim() || undefined,
        password || undefined
      );

      if (result.requiresAuth) {
        setShowAuthFields(true);
        setError('This device requires authentication. Please enter your miner credentials.');
        return;
      }

      if (!result.success) {
        setError(result.error || 'Failed to add device');
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add device');
    } finally {
      setIsAdding(false);
    }
  };

  const formatHashrate = (hashrate: number) => {
    if (hashrate >= 1000) return `${(hashrate / 1000).toFixed(2)} TH/s`;
    return `${hashrate.toFixed(2)} GH/s`;
  };

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto ${isClosing ? 'animate-modal-backdrop-out' : 'animate-modal-backdrop-in'}`}>
      <div className={`bg-bg-secondary rounded-xl border border-border w-full max-w-lg mt-4 mb-4 overflow-auto ${isClosing ? 'animate-modal-out' : 'animate-modal-in'}`} style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Add Mining Device</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-bg-tertiary transition-colors"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {success ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">Device Added</h3>
              <p className="text-text-secondary mb-4">
                Your BitAxe device has been added and is now being monitored.
              </p>
              <button
                onClick={handleClose}
                className="px-6 py-2 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors btn-ripple"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* IP Address Input */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Device IP Address
                </label>
                <p className="text-xs text-text-secondary mb-3">
                  Enter the local IP address of your miner (BitAxe, Bitmain S9, etc.)
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ipAddress}
                    onChange={(e) => {
                      setIpAddress(e.target.value);
                      setTestResult(null);
                      setError(null);
                    }}
                    placeholder="e.g., 192.168.1.100"
                    className="flex-1 px-3 py-2 rounded-lg bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
                    onKeyDown={(e) => e.key === 'Enter' && handleTestConnection()}
                  />
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !ipAddress.trim()}
                    className="px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTesting ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Testing
                      </span>
                    ) : (
                      'Test'
                    )}
                  </button>
                </div>
              </div>

              {/* Test Result */}
              {testResult && testResult.success && (
                <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 text-success mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium">Device Found</span>
                    {testResult.deviceType === 'bitmain' && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-warning/20 border border-warning/40 text-warning uppercase font-bold ml-2">
                        BETA
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-text-secondary">Hostname: </span>
                      <span className="text-text-primary">{testResult.hostname || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-text-secondary">Model: </span>
                      <span className="text-text-primary">{testResult.model || 'Unknown'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-text-secondary">Hashrate: </span>
                      <span className="text-accent font-medium">
                        {testResult.hashRate ? formatHashrate(testResult.hashRate) : '--'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Authentication Fields (for Bitmain) */}
              {showAuthFields && (
                <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="flex items-center gap-2 text-warning mb-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="font-medium">Miner Authentication Required</span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-warning/20 border border-warning/40 text-warning uppercase font-bold">
                      BETA
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mb-3">
                    This appears to be a Bitmain miner (S9, etc.) that requires login credentials.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-text-primary mb-1">Username</label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="e.g., root"
                        className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-primary mb-1">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter miner password"
                        className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent text-sm"
                      />
                    </div>
                    <button
                      onClick={handleTestConnection}
                      disabled={isTesting || !username.trim() || !password}
                      className="w-full py-2 rounded-lg border border-warning text-warning hover:bg-warning/10 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTesting ? 'Testing...' : 'Test with Credentials'}
                    </button>
                  </div>
                </div>
              )}

              {/* Device Name Input */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Device Name (optional)
                </label>
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g., Living Room BitAxe"
                  className="w-full px-3 py-2 rounded-lg bg-bg-primary border border-border text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
                />
                <p className="text-xs text-text-secondary mt-1">
                  Leave blank to use the device hostname.
                </p>
              </div>

              {/* Error Display */}
              {error && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                  {error}
                </div>
              )}

              {/* Add Button */}
              <button
                onClick={handleAddDevice}
                disabled={isAdding || !ipAddress.trim()}
                className="w-full py-3 px-4 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAdding ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Adding Device...
                  </span>
                ) : (
                  'Add Device'
                )}
              </button>

              {/* Help Text */}
              <div className="pt-2 border-t border-border">
                <h4 className="text-sm font-medium text-text-primary mb-2">How to find your device IP:</h4>
                <ol className="text-xs text-text-secondary space-y-1 list-decimal list-inside">
                  <li>Connect to the same network as your BitAxe</li>
                  <li>Open your router's admin page to see connected devices</li>
                  <li>Look for a device named "bitaxe" or similar</li>
                  <li>You can also check the AxeOS display if your device has one</li>
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

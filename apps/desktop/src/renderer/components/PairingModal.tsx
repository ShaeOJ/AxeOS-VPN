import { useState } from 'react';
import { useDeviceStore } from '../stores/deviceStore';

interface PairingModalProps {
  onClose: () => void;
}

export function PairingModal({ onClose }: PairingModalProps) {
  const { addDeviceByIp, testConnection } = useDeviceStore();
  const [ipAddress, setIpAddress] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    hostname?: string;
    model?: string;
    hashRate?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleTestConnection = async () => {
    if (!ipAddress.trim()) {
      setError('Please enter an IP address');
      return;
    }

    setIsTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const result = await testConnection(ipAddress.trim());
      if (result.success && result.data) {
        setTestResult({
          success: true,
          hostname: result.data.hostname,
          model: result.data.ASICModel,
          hashRate: result.data.hashRate,
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

    setIsAdding(true);
    setError(null);

    try {
      await addDeviceByIp(ipAddress.trim(), deviceName.trim() || undefined);
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bg-secondary rounded-xl border border-border w-full max-w-lg m-4 max-h-[90vh] overflow-auto animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-medium text-text-primary">Add BitAxe Device</h2>
          <button
            onClick={onClose}
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
                onClick={onClose}
                className="px-6 py-2 rounded-lg bg-accent text-bg-primary font-medium hover:bg-accent-hover transition-colors"
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
                  Enter the local IP address of your BitAxe device running AxeOS.
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

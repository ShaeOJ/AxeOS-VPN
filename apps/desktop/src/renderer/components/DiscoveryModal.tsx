import { useState, useEffect, useCallback } from 'react';
import { useDeviceStore } from '../stores/deviceStore';

interface DiscoveredDevice {
  ip: string;
  hostname: string;
  model: string;
  hashRate: number;
  version: string;
  alreadyAdded: boolean;
}

interface DiscoveryProgress {
  scanned: number;
  total: number;
  found: DiscoveredDevice[];
  currentIp: string;
  isComplete: boolean;
  isCancelled: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DiscoveryModal({ isOpen, onClose }: Props) {
  const { loadDevices } = useDeviceStore();
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [addingDevices, setAddingDevices] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Handle open animation
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setIsClosing(false);
    }
  }, [isOpen]);

  // Handle close with animation
  const handleClose = useCallback(() => {
    if (isScanning) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsClosing(false);
      onClose();
    }, 200);
  }, [isScanning, onClose]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setIsScanning(false);
      setProgress(null);
      setSelectedDevices(new Set());
      setAddingDevices(false);
      setAddedCount(0);
    }
  }, [isOpen]);

  useEffect(() => {
    // Set up progress listener
    const handleProgress = (prog: DiscoveryProgress) => {
      setProgress(prog);
      if (prog.isComplete || prog.isCancelled) {
        setIsScanning(false);
      }
    };

    window.electronAPI.onDiscoveryProgress(handleProgress);

    return () => {
      window.electronAPI.removeAllListeners('discovery-progress');
    };
  }, []);

  const startDiscovery = async () => {
    setIsScanning(true);
    setProgress(null);
    setSelectedDevices(new Set());
    setAddedCount(0);

    try {
      await window.electronAPI.startDeviceDiscovery();
    } catch (err) {
      console.error('Discovery failed:', err);
      setIsScanning(false);
    }
  };

  const cancelDiscovery = async () => {
    await window.electronAPI.cancelDeviceDiscovery();
  };

  const toggleDevice = (ip: string) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(ip)) {
      newSelected.delete(ip);
    } else {
      newSelected.add(ip);
    }
    setSelectedDevices(newSelected);
  };

  const selectAllNew = () => {
    if (!progress) return;
    const newDevices = progress.found.filter(d => !d.alreadyAdded);
    setSelectedDevices(new Set(newDevices.map(d => d.ip)));
  };

  const addSelectedDevices = async () => {
    if (!progress) return;

    setAddingDevices(true);
    let added = 0;

    for (const device of progress.found) {
      if (selectedDevices.has(device.ip) && !device.alreadyAdded) {
        try {
          const result = await window.electronAPI.addDiscoveredDevice(device.ip, device.hostname);
          if (result.success) {
            added++;
            // Mark as added in the UI
            device.alreadyAdded = true;
          }
        } catch (err) {
          console.error('Failed to add device:', device.ip, err);
        }
      }
    }

    setAddedCount(added);
    setSelectedDevices(new Set());
    setAddingDevices(false);

    // Refresh the device list
    await loadDevices();
  };

  const formatHashrate = (hr: number): string => {
    if (hr >= 1000) return (hr / 1000).toFixed(2) + ' TH/s';
    return hr.toFixed(2) + ' GH/s';
  };

  if (!isOpen && !isVisible) return null;

  const newDevicesCount = progress?.found.filter(d => !d.alreadyAdded).length || 0;
  const progressPercent = progress ? Math.round((progress.scanned / progress.total) * 100) : 0;

  return (
    <div className={`fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto ${isClosing ? 'animate-modal-backdrop-out' : 'animate-modal-backdrop-in'}`}>
      <div className={`bg-bg-secondary border-2 border-border rounded-lg w-full max-w-2xl flex flex-col shadow-2xl mt-4 mb-4 ${isClosing ? 'animate-modal-out' : 'animate-modal-in'}`} style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/20 rounded-lg">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">Network Discovery</h2>
              <p className="text-xs text-text-secondary">Scan your local network for BitAxe devices</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isScanning}
            className="p-2 hover:bg-bg-tertiary rounded transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Progress Section */}
          {isScanning && progress && (
            <div className="mb-4 p-4 bg-bg-tertiary/50 rounded-lg border border-border/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-text-secondary">
                  Scanning: <span className="font-mono text-accent">{progress.currentIp || '...'}</span>
                </span>
                <span className="text-sm text-text-secondary">
                  {progress.scanned} / {progress.total}
                </span>
              </div>
              <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-success font-mono">
                {progress.found.length} device{progress.found.length !== 1 ? 's' : ''} found
              </div>
            </div>
          )}

          {/* Results */}
          {progress && progress.found.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-text-primary">
                  Discovered Devices ({progress.found.length})
                </span>
                {newDevicesCount > 0 && !isScanning && (
                  <button
                    onClick={selectAllNew}
                    className="text-xs text-accent hover:text-accent/80 transition-colors"
                  >
                    Select All New ({newDevicesCount})
                  </button>
                )}
              </div>

              {progress.found.map((device) => (
                <div
                  key={device.ip}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    device.alreadyAdded
                      ? 'bg-bg-tertiary/30 border-border/30 opacity-60'
                      : selectedDevices.has(device.ip)
                      ? 'bg-accent/10 border-accent'
                      : 'bg-bg-tertiary/50 border-border/30 hover:border-border'
                  }`}
                  onClick={() => !device.alreadyAdded && toggleDevice(device.ip)}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        device.alreadyAdded
                          ? 'border-success bg-success/20'
                          : selectedDevices.has(device.ip)
                          ? 'border-accent bg-accent'
                          : 'border-border'
                      }`}
                    >
                      {(device.alreadyAdded || selectedDevices.has(device.ip)) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    {/* Device Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-text-primary truncate">
                          {device.hostname}
                        </span>
                        {device.alreadyAdded && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-success/20 text-success rounded">
                            ADDED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-secondary mt-0.5">
                        <span className="font-mono">{device.ip}</span>
                        <span>{device.model}</span>
                        <span className="text-accent">{formatHashrate(device.hashRate)}</span>
                      </div>
                    </div>

                    {/* Version */}
                    <div className="text-xs text-text-secondary font-mono">
                      v{device.version}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No Devices Found */}
          {progress && progress.isComplete && progress.found.length === 0 && (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto text-text-secondary/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-text-secondary">No BitAxe devices found on your network</p>
              <p className="text-xs text-text-secondary/70 mt-1">
                Make sure your devices are powered on and connected to the same network
              </p>
            </div>
          )}

          {/* Initial State */}
          {!progress && !isScanning && (
            <div className="text-center py-8">
              <svg className="w-16 h-16 mx-auto text-accent/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
              <p className="text-text-secondary mb-2">Click "Start Scan" to search for BitAxe devices</p>
              <p className="text-xs text-text-secondary/70">
                This will scan all devices on your local network (typically takes 30-60 seconds)
              </p>
            </div>
          )}

          {/* Added Success */}
          {addedCount > 0 && (
            <div className="mt-4 p-3 bg-success/10 border border-success/30 rounded-lg">
              <div className="flex items-center gap-2 text-success">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium">
                  Successfully added {addedCount} device{addedCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-bg-tertiary/30">
          <div className="text-xs text-text-secondary">
            {isScanning ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                Scanning network...
              </span>
            ) : progress?.isCancelled ? (
              'Scan cancelled'
            ) : progress?.isComplete ? (
              `Scan complete - ${progress.found.length} device${progress.found.length !== 1 ? 's' : ''} found`
            ) : (
              'Ready to scan'
            )}
          </div>

          <div className="flex items-center gap-2">
            {isScanning ? (
              <button
                onClick={cancelDiscovery}
                className="px-4 py-2 bg-danger/20 text-danger border border-danger/30 rounded-lg hover:bg-danger/30 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            ) : (
              <>
                {selectedDevices.size > 0 && (
                  <button
                    onClick={addSelectedDevices}
                    disabled={addingDevices}
                    className="px-4 py-2 bg-success text-black rounded-lg hover:bg-success/80 transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {addingDevices ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Adding...
                      </>
                    ) : (
                      <>Add Selected ({selectedDevices.size})</>
                    )}
                  </button>
                )}
                <button
                  onClick={startDiscovery}
                  className="px-4 py-2 bg-accent text-black rounded-lg hover:bg-accent/80 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {progress ? 'Scan Again' : 'Start Scan'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

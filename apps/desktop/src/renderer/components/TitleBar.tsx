import { useState, useEffect } from 'react';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI.isMaximized().then(setIsMaximized);
    window.electronAPI.onWindowMaximized(setIsMaximized);

    return () => {
      window.electronAPI.removeAllListeners('window-maximized');
    };
  }, []);

  return (
    <div className="h-8 bg-bg-secondary flex items-center justify-between px-4 draggable border-b border-border">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-accent flex items-center justify-center">
          <span className="text-xs font-bold text-bg-primary">A</span>
        </div>
        <span className="text-sm font-medium text-text-secondary">AxeOS VPN</span>
      </div>

      <div className="flex items-center gap-1 non-draggable">
        <button
          onClick={() => window.electronAPI.minimizeWindow()}
          className="w-8 h-6 flex items-center justify-center hover:bg-bg-tertiary rounded transition-colors"
          aria-label="Minimize"
        >
          <svg className="w-3 h-3 text-text-secondary" fill="currentColor" viewBox="0 0 10 1">
            <rect width="10" height="1" />
          </svg>
        </button>

        <button
          onClick={() => window.electronAPI.maximizeWindow()}
          className="w-8 h-6 flex items-center justify-center hover:bg-bg-tertiary rounded transition-colors"
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg className="w-3 h-3 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 10 10">
              <path d="M2 0h6v6H2zM0 2v6h6" strokeWidth="1" />
            </svg>
          ) : (
            <svg className="w-3 h-3 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 10 10">
              <rect x="0.5" y="0.5" width="9" height="9" strokeWidth="1" />
            </svg>
          )}
        </button>

        <button
          onClick={() => window.electronAPI.closeWindow()}
          className="w-8 h-6 flex items-center justify-center hover:bg-danger rounded transition-colors"
          aria-label="Close"
        >
          <svg className="w-3 h-3 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1l-8 8" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

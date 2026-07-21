// Makes the preload-exposed `window.electronAPI` visible to the renderer's
// TypeScript program (the preload lives in a separate tsconfig project, so its
// global augmentation isn't otherwise in scope here).
import type { ElectronAPI } from '../preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  url: string;
  description?: string;
}

export function QRCodeDisplay({ url, description = 'Scan with your phone camera to access' }: QRCodeDisplayProps) {
  return (
    <div className="mt-4 flex flex-col items-center">
      <div className="p-3 rounded-lg bg-bg-primary border-2 border-accent shadow-[0_0_15px_rgba(255,176,0,0.3)]">
        <QRCodeSVG
          value={url}
          size={140}
          bgColor="#0a1929"
          fgColor="#FFB000"
          level="M"
          includeMargin={false}
        />
      </div>
      <p className="mt-2 text-xs text-text-secondary text-center">
        {description}
      </p>
    </div>
  );
}

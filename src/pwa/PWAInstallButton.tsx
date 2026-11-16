import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Dialog } from '../components/ui';
import { usePWAInstall } from './usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <Button
        variant="primary"
        size="sm"
        icon={<Download className="w-3.5 h-3.5" />}
        onClick={() => void install()}
      >
        Install App
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          icon={<Download className="w-3.5 h-3.5" />}
          onClick={() => setShowIOSGuide(true)}
        >
          Install on iOS
        </Button>

        <Dialog
          open={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          title="Install SOLODESK AI on iPhone / iPad"
          size="sm"
          footer={
            <Button variant="primary" onClick={() => setShowIOSGuide(false)}>
              Got It
            </Button>
          }
        >
          <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-300 list-decimal pl-5">
            <li>
              Tap the <strong>Share</strong> button in your Safari toolbar.
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </li>
            <li>Launch SOLODESK AI directly from your home screen with offline access.</li>
          </ol>
        </Dialog>
      </>
    );
  }

  return null;
};

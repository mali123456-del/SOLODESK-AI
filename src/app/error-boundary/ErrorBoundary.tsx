import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen flex items-center justify-center p-6 bg-[#F5F7FB] dark:bg-[#101827] text-slate-900 dark:text-slate-100"
        >
          <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#172338] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-base font-semibold">Something went wrong</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your local IndexedDB workspace data has not been deleted.
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#101827] rounded-lg p-3 font-mono text-xs break-words">
              {this.state.errorMessage}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '' });
                }}
              >
                Try Recovering View
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Reload Workspace
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

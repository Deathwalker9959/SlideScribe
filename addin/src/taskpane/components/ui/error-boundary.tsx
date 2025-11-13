import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetOnPropsChange?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Log error for debugging
    console.error('ErrorBoundary caught an error:', {
      error,
      errorInfo,
      errorId: this.state.errorId,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Auto-reset after 30 seconds for non-critical errors
    if (!this._isCriticalError(error)) {
      this.resetTimeoutId = setTimeout(() => {
        this.resetError();
      }, 30000);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset error when props change if enabled
    if (
      this.props.resetOnPropsChange &&
      this.state.hasError &&
      prevProps.children !== this.props.children
    ) {
      this.resetError();
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  private _isCriticalError(error: Error): boolean {
    // Define what constitutes a critical error that shouldn't auto-reset
    const criticalErrors = [
      'ChunkLoadError',
      'TypeError: Cannot read propert',
      'NetworkError',
      'Offline',
    ];

    return criticalErrors.some(criticalError =>
      error.message.includes(criticalError)
    );
  }

  private resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
    });
  };

  private handleRetry = () => {
    this.resetError();
    // Force a re-render by updating a state that doesn't affect the component
    this.forceUpdate();
  };

  private handleGoHome = () => {
    this.resetError();
    // You could add navigation logic here if needed
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Something went wrong
            </h1>

            <p className="text-gray-600 mb-6">
              We encountered an unexpected error. This has been logged and we'll look into it.
            </p>

            {/* Error details for development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left mb-6 p-4 bg-gray-100 rounded-lg">
                <summary className="cursor-pointer font-medium text-gray-900 mb-2">
                  Error Details (Development Only)
                </summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <strong>Error ID:</strong> {this.state.errorId}
                  </div>
                  <div>
                    <strong>Error:</strong> {this.state.error.message}
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre className="mt-1 text-xs overflow-auto bg-gray-200 p-2 rounded">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={this.handleRetry}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>

              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="flex items-center gap-2"
              >
                <Home className="w-4 h-4" />
                Go Home
              </Button>
            </div>

            {!this._isCriticalError(this.state.error!) && (
              <p className="text-xs text-gray-500 mt-4">
                This error will automatically reset in 30 seconds.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Specialized error boundaries for different contexts
export function OfficeJSErrorBoundary({ children }: { children: ReactNode }) {
  const handleOfficeJSError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Special handling for Office.js related errors
    if (error.message.includes('Office') || error.message.includes('PowerPoint')) {
      console.error('Office.js Error:', error);
      // You could send this to an analytics service
    }
  };

  const officeJSErrorFallback = (
    <div className="p-6 text-center">
      <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-6 h-6 text-orange-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Office.js Error
      </h3>
      <p className="text-gray-600 mb-4">
        There was an issue with PowerPoint. Make sure PowerPoint is running and try again.
      </p>
      <Button onClick={() => window.location.reload()}>
        Reload Page
      </Button>
    </div>
  );

  return (
    <ErrorBoundary
      fallback={officeJSErrorFallback}
      onError={handleOfficeJSError}
    >
      {children}
    </ErrorBoundary>
  );
}

export function NetworkErrorBoundary({ children }: { children: ReactNode }) {
  const handleNetworkError = (error: Error, errorInfo: React.ErrorInfo) => {
    if (error.message.includes('fetch') || error.message.includes('network')) {
      console.error('Network Error:', error);
    }
  };

  const networkErrorFallback = (
    <div className="p-6 text-center">
      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-6 h-6 text-red-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Network Error
      </h3>
      <p className="text-gray-600 mb-4">
        Unable to connect to the server. Please check your internet connection and try again.
      </p>
      <Button onClick={() => window.location.reload()}>
        Reload Page
      </Button>
    </div>
  );

  return (
    <ErrorBoundary
      fallback={networkErrorFallback}
      onError={handleNetworkError}
    >
      {children}
    </ErrorBoundary>
  );
}

// Hook for handling errors in functional components
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = React.useCallback((error: Error) => {
    console.error('Error caught by useErrorHandler:', error);
    setError(error);
  }, []);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  // Throw error to be caught by ErrorBoundary
  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { handleError, resetError };
}

// Component for displaying inline errors
interface InlineErrorProps {
  error: Error | string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function InlineError({
  error,
  onRetry,
  onDismiss,
  className = ''
}: InlineErrorProps) {
  const errorMessage = typeof error === 'string' ? error : error.message;

  return (
    <div className={`flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-red-800">
          Error occurred
        </h4>
        <p className="text-sm text-red-700 mt-1 break-words">
          {errorMessage}
        </p>
        {(onRetry || onDismiss) && (
          <div className="flex gap-2 mt-3">
            {onRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                className="text-red-700 border-red-300 hover:bg-red-100"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            )}
            {onDismiss && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                className="text-red-700 hover:bg-red-100"
              >
                Dismiss
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in ${this.props.name || 'Component'}:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
            <AlertCircle size={24} />
          </div>
          <h4 className="font-bold text-gray-900 mb-1">Component Failed to Load</h4>
          <p className="text-sm text-gray-500 mb-4 max-w-xs">
            Something went wrong while rendering this section ({this.props.name || 'Component'}).
          </p>
          {this.state.error && (
            <div className="mb-4 max-w-lg text-left">
              <p className="text-xs font-mono text-red-600 break-all">{this.state.error.message}</p>
              <pre className="mt-2 text-[10px] text-gray-400 font-mono overflow-auto max-h-40 bg-gray-50 p-2 rounded border">{this.state.error.stack}</pre>
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
          >
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

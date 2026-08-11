import React from "react";
import { logRuntimeError } from "../utils/runtimeLogger";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logRuntimeError(error, {
      type: "react.error_boundary",
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ifdark flex items-center justify-center px-4">
          <div className="max-w-sm w-full rounded-2xl border border-ifborder bg-ifcard p-6 text-center">
            <h1 className="text-lg font-bold text-iftext">We hit a launch issue</h1>
            <p className="text-xs text-ifmuted mt-2">
              Please refresh to continue using Interplanetary Fund.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full py-2.5 rounded-xl bg-ifaccent text-white text-sm font-semibold"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

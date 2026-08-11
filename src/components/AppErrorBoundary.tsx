import React from "react";
import { logRuntimeError } from "../utils/runtimeLogger";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  resetKey: number;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, resetKey: 0 };

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ hasError: true });
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
              onClick={() =>
                this.setState((prev) => ({ hasError: false, resetKey: prev.resetKey + 1 }))
              }
              className="mt-4 w-full py-2.5 rounded-xl border border-ifborder text-iftext text-sm font-semibold"
            >
              Try again
            </button>
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
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

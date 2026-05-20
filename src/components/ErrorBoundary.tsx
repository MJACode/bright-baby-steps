import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="text-destructive" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display font-bold text-xl leading-tight">Something broke</h1>
              <p className="text-sm text-muted-foreground">Your data is safe.</p>
            </div>
          </div>

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-semibold text-foreground break-words">
              {error.message || "Unknown error"}
            </p>
            {error.stack ? (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer font-semibold">
                  Stack trace
                </summary>
                <pre className="text-[10px] text-muted-foreground mt-2 whitespace-pre-wrap break-words">
                  {error.stack}
                </pre>
              </details>
            ) : null}
          </div>

          <div className="space-y-2">
            <Button className="w-full min-h-[48px]" onClick={this.reset}>
              Try again
            </Button>
            <Button
              variant="outline"
              className="w-full min-h-[48px]"
              onClick={() => {
                window.location.href = "/dashboard";
              }}
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;

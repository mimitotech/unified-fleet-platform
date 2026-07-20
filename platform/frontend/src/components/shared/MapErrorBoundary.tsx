import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  children: ReactNode;
  fallbackHeight?: string;
};

type State = { hasError: boolean; message?: string };

/** Isolates map failures so the rest of the dashboard still renders. */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MapErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 p-8 bg-muted/30 border border-dashed rounded-lg text-center"
          style={{ minHeight: this.props.fallbackHeight || '50vh' }}
        >
          <AlertTriangle className="h-8 w-8 text-warning" />
          <p className="text-sm font-medium">Map could not load</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            {this.state.message || 'The map module hit an error. Fleet data and the rest of the dashboard still work.'}
          </p>
          <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false })}>
            Retry map
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

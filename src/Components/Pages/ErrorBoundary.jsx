import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light p-4">
          <div className="text-center">
            <h4 className="text-danger mb-3">Something went wrong</h4>
            <pre className="text-start small bg-white p-3 rounded border overflow-auto" style={{ maxHeight: "200px" }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button type="button" className="btn btn-primary mt-3" onClick={() => this.setState({ hasError: false, error: null })}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

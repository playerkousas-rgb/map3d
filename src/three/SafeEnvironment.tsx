import { Component, ComponentProps, ReactNode } from "react";
import { Environment } from "@react-three/drei";

/**
 * <Environment preset="…"> downloads its HDR map from a public CDN at
 * runtime. If that download fails (CDN down, ad-blocker, offline, corporate
 * proxy…) drei throws, and without a boundary the error unmounts the whole
 * React tree -> blank white page. This boundary simply drops the
 * environment lighting instead; the scene keeps its regular lights.
 *
 * Only errors are caught here — the pending (Suspense) state still bubbles
 * up exactly like before.
 */
class EnvironmentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("[map3d] Environment map failed to load, rendering without it.", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function SafeEnvironment(props: ComponentProps<typeof Environment>) {
  return (
    <EnvironmentBoundary>
      <Environment {...props} />
    </EnvironmentBoundary>
  );
}

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type ErrorListener = (error: Error, isFatal: boolean) => void;

const listeners: ErrorListener[] = [];

export function reportError(error: Error, isFatal = true) {
  listeners.forEach((l) => {
    try {
      l(error, isFatal);
    } catch {
      // listener errors must never kill the reporting chain
    }
  });
}

export function subscribeErrors(listener: ErrorListener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/**
 * Replaces React Native's default global error handler (red box in dev,
 * silent native crash in release) so uncaught JS errors surface on screen.
 */
export function installGlobalErrorHandler() {
  const ErrorUtils = (globalThis as any).ErrorUtils;
  if (ErrorUtils?.setGlobalHandler) {
    ErrorUtils.setGlobalHandler((error: unknown, isFatal: boolean) => {
      reportError(error instanceof Error ? error : new Error(String(error)), isFatal);
    });
  }
}

/**
 * Full-screen error view. Renders the message + stack so a tester can
 * screenshot/report it without adb.
 */
export function ErrorScreen({ error, isFatal = true }: { error: Error; isFatal?: boolean }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isFatal ? 'Unexpected error' : 'Error'}</Text>
      <ScrollView style={styles.scroll}>
        <Text selectable style={styles.message}>
          {error.message || String(error)}
        </Text>
        {!!error.stack && (
          <Text selectable style={styles.stack}>
            {error.stack}
          </Text>
        )}
      </ScrollView>
      <Text style={styles.hint}>Screenshot this screen and send it to the developer.</Text>
    </View>
  );
}

/**
 * Error boundary that shows errors on-screen AND listens for uncaught JS
 * errors via the global handler. Wrap the whole app in this component.
 */
export default class ErrorOverlay extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; isFatal: boolean }
> {
  state: { error: Error | null; isFatal: boolean } = { error: null, isFatal: true };

  private unsubscribe: (() => void) | null = null;

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidMount() {
    this.unsubscribe = subscribeErrors((error, isFatal) => this.setState({ error, isFatal }));
  }

  componentDidCatch(error: Error) {
    console.error('ErrorOverlay caught:', error);
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} isFatal={this.state.isFatal} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1C1C1E', padding: 24 },
  title: { color: '#FF453A', fontSize: 22, fontWeight: '800', marginBottom: 16 },
  scroll: { flex: 1 },
  message: { color: '#FFFFFF', fontSize: 15, marginBottom: 16 },
  stack: { color: '#C7C7CC', fontSize: 12 },
  hint: { color: '#8E8E93', fontSize: 12, marginTop: 16, textAlign: 'center' },
});

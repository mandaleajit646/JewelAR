import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from './src/state';
import { ThemeProvider, useTheme } from './src/ThemeProvider';
import Navigation from './src/navigation';

function ThemedApp() {
  const { c } = useTheme();
  return (
    <>
      <StatusBar barStyle={c.statusBar} />
      <Navigation />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <ThemedApp />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

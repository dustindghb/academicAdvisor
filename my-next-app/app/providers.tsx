// app/providers.tsx
"use client";

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// Optional: Create a custom theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#862633', // SCU's primary color (maroon)
    },
    secondary: {
      main: '#d6ad00', // SCU's secondary color (gold)
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
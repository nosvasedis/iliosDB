
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UIProvider } from './components/UIProvider';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <UIProvider>
        <App />
      </UIProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

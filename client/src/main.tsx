import { AccessBoundary } from './features/access/components/AccessBoundary';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { Loading } from './components/common';
const App = lazy(() => import('./App'));
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccessBoundary>
      <Suspense fallback={<Loading />}>
        <App />
      </Suspense>
    </AccessBoundary>
  </React.StrictMode>,
);

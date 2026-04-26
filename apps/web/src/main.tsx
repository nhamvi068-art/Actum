import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import './styles.scss';
import App from './app/app';
import { ErrorBoundary } from './app/components/error-boundary';
import { CrashRecoveryDialog } from './app/components/crash-recovery-dialog';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <StrictMode>
    <ErrorBoundary fallback={<CrashRecoveryDialog error={null} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

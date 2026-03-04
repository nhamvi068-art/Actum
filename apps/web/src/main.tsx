import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';

import './styles.scss';
import App from './app/app';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>
);

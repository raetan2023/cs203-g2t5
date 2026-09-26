import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/app.css';

const root = createRoot(document.getElementById('root')!);
// Keep simulated authentication out of the production entry point entirely.
if (import.meta.env.DEV) {
  import('./preview/PreviewApp').then(({ PreviewApp }) => root.render(<StrictMode><PreviewApp /></StrictMode>));
} else {
  root.render(<div className="bb-app"><main className="bb-status"><h1>Bunker Buddy</h1><p>Authentication integration is not configured.</p><p>The local demo is available through the development server.</p></main></div>);
}

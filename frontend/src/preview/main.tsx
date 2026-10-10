import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewApp } from './PreviewApp';
import { navigate } from '../app/router';

// Dedicated local preview entry; the normal app keeps Clerk and real services.
navigate('/purchase-plans/recommendation', true);
createRoot(document.getElementById('root')!).render(<StrictMode><PreviewApp /></StrictMode>);

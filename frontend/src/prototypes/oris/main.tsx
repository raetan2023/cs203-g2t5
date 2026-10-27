import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OrisLogin } from './OrisLogin';
import './oris.css';

createRoot(document.getElementById('root')!).render(<StrictMode><OrisLogin /></StrictMode>);

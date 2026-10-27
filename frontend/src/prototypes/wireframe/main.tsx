import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WireframeLogin } from './WireframeLogin';
import '../oris/oris.css';
import './wireframe.css';

createRoot(document.getElementById('root')!).render(<StrictMode><WireframeLogin /></StrictMode>);

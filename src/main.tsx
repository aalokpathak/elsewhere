import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

// StrictMode is intentionally not used: its double-mounted effects would create
// and immediately destroy a WebGL context on the same canvas in development.
createRoot(document.getElementById('root')!).render(<App />);

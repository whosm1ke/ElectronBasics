// main.tsx — React entry point, mounted into #reactRoot alongside the
// original app.js-driven UI (see App.tsx's header comment). Loaded as a
// second <script type="module"> in index.html, after app.js.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// sonner's own stylesheet — structural (toaster container position, per-toast
// stacking/swipe transforms), not the pill "theme" (that part is overridden
// via toastOptions.classNames in App.tsx onto our own style.css classes), so
// this import is required even with `unstyled: true`.
import 'sonner/dist/styles.css';
import { App } from './App';
import { mountLegacyReplacements } from './legacyMounts';

const container = document.getElementById('reactRoot');
if (!container) {
  throw new Error('main.tsx: #reactRoot container missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

mountLegacyReplacements();

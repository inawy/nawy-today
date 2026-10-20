import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import 'virtual:theme.css';
import '@/ui/styles/base.css';
import '@/ui/styles/shell.css';
import '@/ui/styles/month.css';
import '@/ui/styles/timegrid.css';
import '@/ui/styles/editor.css';
import '@/ui/styles/agenda.css';
import '@/ui/styles/search.css';
import '@/ui/styles/backup.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

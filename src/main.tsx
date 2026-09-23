/**
 * src/main.tsx - React DOM Client Entry Point
 * Mounts the root App component with ThemeProvider inside React StrictMode into the DOM element #root.
 */

// Install global protection against circular JSON serialization errors (e.g. DOM elements, React Fiber nodes)
const nativeStringify = JSON.stringify;
JSON.stringify = function (value: any, replacer?: any, space?: any): string {
  const seen = new WeakSet();

  function safeReplacer(key: string, val: any) {
    if (val !== null && typeof val === 'object') {
      // Check for DOM elements / nodes
      if (
        (typeof Element !== 'undefined' && val instanceof Element) ||
        (typeof Node !== 'undefined' && val instanceof Node) ||
        ('nodeType' in val && 'nodeName' in val)
      ) {
        return `[DOM ${val.nodeName || 'Element'}]`;
      }
      // Check for React Fiber internal nodes
      if (typeof key === 'string' && (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'))) {
        return '[ReactFiber]';
      }
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }
    if (typeof replacer === 'function') {
      return replacer(key, val);
    }
    return val;
  }

  try {
    if (typeof replacer === 'function') {
      return nativeStringify(value, safeReplacer as any, space);
    } else if (Array.isArray(replacer)) {
      return nativeStringify(value, replacer, space);
    } else {
      return nativeStringify(value, safeReplacer as any, space);
    }
  } catch (_err) {
    try {
      return nativeStringify(value, safeReplacer as any, space);
    } catch {
      return '"[Unserializable]"';
    }
  }
};

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

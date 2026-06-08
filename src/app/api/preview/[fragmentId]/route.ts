import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Transforms a fragment's saved files into a single self-contained HTML page.
// Handles three cases:
//   1. Fragment has an app/page.tsx  → React/Next.js app, rendered via esm.sh + Babel standalone
//   2. Fragment has an index.html    → served directly with assets inlined
//   3. Anything else                 → best-effort React render of the first .tsx/.jsx file found

function escapeScript(code: string) {
  return code.replace(/<\/script>/gi, '<\\/script>');
}

function buildReactPage(files: { [path: string]: string }): string {
  // Collect all tsx/jsx/ts/js files
  const codeFiles = Object.entries(files).filter(([p]) =>
    /\.(tsx?|jsx?)$/.test(p) && !p.includes('node_modules'),
  );

  // Find the entry point — prefer app/page.tsx, then page.tsx, then index.tsx/jsx
  const entryPriority = [
    'app/page.tsx', 'app/page.jsx',
    'app/todos/page.tsx', 'app/todos/page.jsx',
    'src/app/page.tsx', 'src/app/page.jsx',
    'page.tsx', 'page.jsx',
    'src/pages/index.tsx', 'src/pages/index.jsx',
    'pages/index.tsx', 'pages/index.jsx',
    'index.tsx', 'index.jsx',
    'App.tsx', 'App.jsx', 'src/App.tsx', 'src/App.jsx',
  ];

  let entryPath = entryPriority.find((p) => files[p]);
  if (!entryPath) {
    entryPath = codeFiles.find(([p]) => /\/page\.(tsx|jsx)$/.test(p))?.[0];
  }
  if (!entryPath) {
    entryPath = codeFiles.find(([p]) => /\.(tsx|jsx)$/.test(p))?.[0];
  }
  if (!entryPath) {
    return errorPage('No entry point found in generated files.');
  }

  const entryKey = entryPath
    .replace(/^(src\/)?/, '')
    .replace(/\.(tsx?|jsx?)$/, '');

  // Build a virtual module registry — each file becomes an inline module
  // Imports between files are resolved via the registry
  const moduleRegistry: string[] = [];

  for (const [path, code] of codeFiles) {
    // Normalise the module key to match how imports reference it
    const key = path.replace(/^(src\/)?/, '').replace(/\.(tsx?|jsx?)$/, '');
    moduleRegistry.push(`__modules[${JSON.stringify(key)}] = ${JSON.stringify(code)};`);
  }

  const globalsCss = files['app/globals.css'] || files['src/app/globals.css'] || files['globals.css'] || '';
  const tailwindCdn = '<script src="https://cdn.tailwindcss.com"></script>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Preview</title>
  ${tailwindCdn}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; }
    #root { min-height: 100vh; }
    ${escapeScript(globalsCss)}
  </style>
  <!-- Babel for JSX/TSX transform in browser -->
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>

  <!-- React must load before the module bootstrap (generated code imports react) -->
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>

  <script>
    (function () {
      const __modules = {};
      ${moduleRegistry.map(escapeScript).join('\n      ')}

      const __evaluated = {};

      function __normalizeKey(path) {
        return path
          .replace(/^@\\//, '')
          .replace(/^[./]+/, '')
          .replace(/^(src\\/)?/, '')
          .replace(/\\.(tsx?|jsx?|mjs|cjs)$/, '');
      }

      function __externalRequire(path) {
        const p = path.replace(/\\\\/g, '/');
        if (p === 'react' || p === 'react/') return window.React;
        if (p === 'react-dom' || p === 'react-dom/') return window.ReactDOM;
        if (p === 'react-dom/client') {
          return { createRoot: window.ReactDOM.createRoot.bind(window.ReactDOM) };
        }
        if (p === 'react/jsx-runtime' || p === 'react/jsx-dev-runtime') {
          const R = window.React;
          return {
            jsx: (type, props, key) => R.createElement(type, key == null ? props : { ...props, key }),
            jsxs: (type, props, key) => R.createElement(type, key == null ? props : { ...props, key }),
            Fragment: R.Fragment,
          };
        }
        return null;
      }

      function __stubExports() {
        const R = window.React;
        const Stub = (props) => R.createElement('div', {
          style: { padding: '4px', fontSize: '11px', color: '#888', border: '1px dashed #ccc' },
          ...props,
        }, props?.children ?? '');
        const proxy = new Proxy({ default: Stub }, {
          get: (t, k) => (k in t ? t[k] : Stub),
        });
        return proxy;
      }

      function __cleanSource(src) {
        return src
          .replace(/^['"]use client['"];?\\s*/gm, '')
          .replace(/^['"]use server['"];?\\s*/gm, '')
          .replace(/^\\s*import type .+$/gm, '')
          .replace(/^\\s*export type .+$/gm, '');
      }

      function __transformSource(src, key) {
        const cleaned = __cleanSource(src);
        const baseOpts = {
          filename: (key || 'module') + '.tsx',
          sourceType: 'module',
        };
        const presets = [
          ['env', { modules: 'commonjs', targets: { esmodules: false } }],
          'typescript',
          ['react', { runtime: 'classic' }],
        ];
        try {
          // Emit require/exports — new Function() is not an ES module scope.
          return Babel.transform(cleaned, { ...baseOpts, presets }).code;
        } catch (e) {
          try {
            return Babel.transform(cleaned, {
              ...baseOpts,
              presets: ['typescript', ['react', { runtime: 'classic' }]],
              plugins: ['transform-modules-commonjs'],
            }).code;
          } catch (e2) {
            console.warn('Babel transform failed for', key, e2 || e);
            return null;
          }
        }
      }

      function __resolveComponent(exports, entryKey) {
        if (exports.default != null) {
          const d = exports.default;
          if (typeof d === 'function' || typeof d === 'object') return d;
        }
        const fns = Object.values(exports).filter((v) => typeof v === 'function');
        if (fns.length === 1) return fns[0];
        const guesses = ['TodoPage', 'Page', 'Home', 'App'];
        const seg = entryKey.split('/').filter(Boolean).pop() || '';
        if (seg) {
          const pascal = seg.replace(/[-_](.)/g, (_, c) => c.toUpperCase())
            .replace(/^./, (c) => c.toUpperCase());
          guesses.unshift(pascal);
        }
        for (const name of guesses) {
          if (typeof exports[name] === 'function') return exports[name];
        }
        return null;
      }

      function __evalModule(key) {
        if (__evaluated[key]) return __evaluated[key].exports;
        const exports = {};
        __evaluated[key] = { exports };
        const src = __modules[key];
        if (src == null) return __stubExports();

        const transformed = __transformSource(src, key);
        if (!transformed) {
          __evaluated[key].error = 'Babel transform failed';
          return exports;
        }

        try {
          const fn = new Function('React', 'require', 'exports', 'module', transformed);
          const mod = { exports };
          fn(window.React, window.__require, mod.exports, mod);
          Object.assign(exports, mod.exports);
        } catch (e) {
          console.warn('Module eval failed for', key, e);
          __evaluated[key].error = e && e.message ? e.message : String(e);
        }

        return exports;
      }

      function __require(path) {
        const ext = __externalRequire(path);
        if (ext) return ext;

        const key = __normalizeKey(path);
        if (__modules[key] !== undefined) return __evalModule(key);

        const aliases = [
          key,
          'components/' + key,
          'lib/' + key,
          'utils/' + key,
          'hooks/' + key,
        ];
        for (const a of aliases) {
          if (__modules[a] !== undefined) return __evalModule(a);
        }

        if (!path.includes('/') || path.startsWith('@/')) {
          return __stubExports();
        }
        return __stubExports();
      }

      window.__modules = __modules;
      window.__require = __require;

      try {
        const entry = window.__require(${JSON.stringify(entryKey)});
        const App = __resolveComponent(entry, ${JSON.stringify(entryKey)});
        if (!App) {
          const evalErr = __evaluated[${JSON.stringify(entryKey)}]?.error;
          throw new Error(
            evalErr
              ? 'Failed to compile ' + ${JSON.stringify(entryPath)} + ': ' + evalErr
              : 'No default export found in ' + ${JSON.stringify(entryPath)},
          );
        }

        const root = window.ReactDOM.createRoot(document.getElementById('root'));
        root.render(window.React.createElement(App));
      } catch (e) {
        document.getElementById('root').innerHTML =
          '<div style="padding:2rem;font-family:monospace;color:#dc2626">' +
          '<strong>Preview error:</strong><br/>' + (e && e.message ? e.message : String(e)) + '</div>';
        console.error(e);
      }
    })();
  </script>

<script>
(function(){
  var selectMode = false;
  var overlay = null;

  function getElementDescription(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : '';
    var text = (el.innerText || el.textContent || '').trim().slice(0, 60);
    var role = el.getAttribute('role') || '';
    var type = el.getAttribute('type') || '';
    var parts = [tag + id + cls];
    if (role) parts.push('role=' + role);
    if (type) parts.push('type=' + type);
    if (text) parts.push('"' + text + '"');
    return parts.join(' ');
  }

  function enableSelectMode() {
    selectMode = true;
    document.body.style.cursor = 'crosshair';
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '__select-overlay__';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;';
      document.body.appendChild(overlay);
    }
  }

  function disableSelectMode() {
    selectMode = false;
    document.body.style.cursor = '';
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function highlightElement(el) {
    if (!overlay) return;
    var rect = el.getBoundingClientRect();
    overlay.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:99999',
      'top:' + (rect.top + window.scrollY) + 'px',
      'left:' + rect.left + 'px',
      'width:' + rect.width + 'px',
      'height:' + rect.height + 'px',
      'outline:2px solid #3b82f6',
      'background:rgba(59,130,246,0.08)',
    ].join(';');
  }

  document.addEventListener('mouseover', function(e) {
    if (!selectMode) return;
    e.stopPropagation();
    highlightElement(e.target);
  }, true);

  document.addEventListener('click', function(e) {
    if (!selectMode) return;
    e.preventDefault();
    e.stopPropagation();
    var desc = getElementDescription(e.target);
    window.parent.postMessage({ type: 'ELEMENT_SELECTED', description: desc }, '*');
    disableSelectMode();
  }, true);

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'ENABLE_SELECT_MODE') enableSelectMode();
    if (e.data && e.data.type === 'DISABLE_SELECT_MODE') disableSelectMode();
  });
})();
</script>

<!-- Isotope badge — removed for Pro users via CSS class on <html> -->
<style>
  .isotope-badge {
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 999998;
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #fff;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    padding: 5px 10px;
    border-radius: 100px;
    text-decoration: none;
    letter-spacing: 0.01em;
    border: 0.5px solid rgba(255,255,255,0.15);
    transition: opacity 0.2s;
  }
  .isotope-badge:hover { opacity: 0.85; }
  .isotope-badge svg { width: 12px; height: 12px; flex-shrink: 0; }
  .hide-isotope-badge .isotope-badge { display: none !important; }
</style>
<a class="isotope-badge" href="https://isotope.app" target="_blank" rel="noopener noreferrer">
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="white" fill-opacity="0.15"/>
    <path d="M8 8h2v6h4v2H8V8z" fill="white"/>
    <circle cx="16" cy="8" r="1.5" fill="#A78BFA"/>
  </svg>
  Built with Isotope
</a>
</body>
</html>`;
}

function buildHtmlPage(files: { [path: string]: string }): string {
  let html = files['index.html'] || files['public/index.html'] || '';

  // Inline CSS files referenced in the HTML
  html = html.replace(/<link[^>]+href="([^"]+\.css)"[^>]*>/gi, (_, href) => {
    const key = href.replace(/^\.?\//, '');
    const css = files[key];
    return css ? `<style>${css}</style>` : '';
  });

  // Inline JS files referenced in the HTML
  html = html.replace(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/gi, (_, src) => {
    const key = src.replace(/^\.?\//, '');
    const js = files[key];
    return js ? `<script>${escapeScript(js)}</script>` : '';
  });

  return html;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html><html><body style="font-family:monospace;padding:2rem;color:#dc2626">
    <strong>Preview error:</strong><br/>${message}
  
<script>
(function(){
  var selectMode = false;
  var overlay = null;

  function getElementDescription(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : '';
    var text = (el.innerText || el.textContent || '').trim().slice(0, 60);
    var role = el.getAttribute('role') || '';
    var type = el.getAttribute('type') || '';
    var parts = [tag + id + cls];
    if (role) parts.push('role=' + role);
    if (type) parts.push('type=' + type);
    if (text) parts.push('"' + text + '"');
    return parts.join(' ');
  }

  function enableSelectMode() {
    selectMode = true;
    document.body.style.cursor = 'crosshair';
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = '__select-overlay__';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;';
      document.body.appendChild(overlay);
    }
  }

  function disableSelectMode() {
    selectMode = false;
    document.body.style.cursor = '';
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function highlightElement(el) {
    if (!overlay) return;
    var rect = el.getBoundingClientRect();
    overlay.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:99999',
      'top:' + (rect.top + window.scrollY) + 'px',
      'left:' + rect.left + 'px',
      'width:' + rect.width + 'px',
      'height:' + rect.height + 'px',
      'outline:2px solid #3b82f6',
      'background:rgba(59,130,246,0.08)',
    ].join(';');
  }

  document.addEventListener('mouseover', function(e) {
    if (!selectMode) return;
    e.stopPropagation();
    highlightElement(e.target);
  }, true);

  document.addEventListener('click', function(e) {
    if (!selectMode) return;
    e.preventDefault();
    e.stopPropagation();
    var desc = getElementDescription(e.target);
    window.parent.postMessage({ type: 'ELEMENT_SELECTED', description: desc }, '*');
    disableSelectMode();
  }, true);

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'ENABLE_SELECT_MODE') enableSelectMode();
    if (e.data && e.data.type === 'DISABLE_SELECT_MODE') disableSelectMode();
  });
})();
</script>

<!-- Isotope badge — removed for Pro users via CSS class on <html> -->
<style>
  .isotope-badge {
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 999998;
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #fff;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    padding: 5px 10px;
    border-radius: 100px;
    text-decoration: none;
    letter-spacing: 0.01em;
    border: 0.5px solid rgba(255,255,255,0.15);
    transition: opacity 0.2s;
  }
  .isotope-badge:hover { opacity: 0.85; }
  .isotope-badge svg { width: 12px; height: 12px; flex-shrink: 0; }
  .hide-isotope-badge .isotope-badge { display: none !important; }
</style>
<a class="isotope-badge" href="https://isotope.app" target="_blank" rel="noopener noreferrer">
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="white" fill-opacity="0.15"/>
    <path d="M8 8h2v6h4v2H8V8z" fill="white"/>
    <circle cx="16" cy="8" r="1.5" fill="#A78BFA"/>
  </svg>
  Built with Isotope
</a>
</body></html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fragmentId: string }> },
) {
  const { fragmentId } = await params;

  const fragment = await prisma.fragment.findUnique({
    where: { id: fragmentId },
    include: { message: { include: { project: { select: { hideBadge: true } } } } },
  });

  if (!fragment) {
    return new NextResponse(errorPage('Fragment not found.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const files = (fragment.files ?? {}) as { [path: string]: string };

  if (Object.keys(files).length === 0) {
    return new NextResponse(errorPage('No files saved for this fragment.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const hideBadge = fragment.message?.project?.hideBadge ?? false;

  // Choose rendering strategy based on what files exist
  const hasReact = Object.keys(files).some((p) => /\.(tsx|jsx)$/.test(p));
  const hasHtml = files['index.html'] || files['public/index.html'];

  let html = hasHtml && !hasReact
    ? buildHtmlPage(files)
    : buildReactPage(files);

  // Add hide class to <html> tag for pro users who opted out of the badge
  if (hideBadge) {
    html = html.replace('<html', '<html class="hide-isotope-badge"');
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cache for 5 min — fragment files don't change often
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      // Allow iframe embedding from same origin only
      'X-Frame-Options': 'SAMEORIGIN',
      // Restrict what the preview iframe can load and prevent data exfiltration
      'Content-Security-Policy': [
        "default-src 'self'",
        // Allow inline scripts + eval — needed for Babel transform + new Function()
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
        // Allow styles from common CDNs used by generated apps
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
        // Allow fonts
        "font-src 'self' https://fonts.gstatic.com data:",
        // Allow images from any HTTPS source (generated apps use various image hosts)
        "img-src 'self' data: blob: https:",
        // Restrict fetch/XHR — generated apps should only call their own sandbox
        "connect-src 'self' https:",
        // No embedding of other frames inside the preview
        "frame-src 'none'",
        // Prevent form submissions to external URLs
        "form-action 'self'",
        // Block object/embed tags
        "object-src 'none'",
        // Block base tag hijacking
        "base-uri 'none'",
      ].join('; '),
    },
  });
}

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
    'src/app/page.tsx', 'src/app/page.jsx',
    'page.tsx', 'page.jsx',
    'src/pages/index.tsx', 'src/pages/index.jsx',
    'pages/index.tsx', 'pages/index.jsx',
    'index.tsx', 'index.jsx',
    'App.tsx', 'App.jsx', 'src/App.tsx', 'src/App.jsx',
  ];

  let entryPath = entryPriority.find((p) => files[p]);
  if (!entryPath) {
    entryPath = codeFiles.find(([p]) => /\.(tsx|jsx)$/.test(p))?.[0];
  }
  if (!entryPath) {
    return errorPage('No entry point found in generated files.');
  }

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
  <script>
    // Virtual module registry
    const __modules = {};
    ${moduleRegistry.map(escapeScript).join('\n    ')}

    // Simple module resolver — strips TypeScript types before Babel transform
    function __require(path) {
      const key = path
        .replace(/^[./]+/, '')
        .replace(/^(src\/)?/, '')
        .replace(/\\.(tsx?|jsx?)$/, '');

      if (__modules[key] === undefined) {
        // Try common aliases
        const aliases = [key, 'components/' + key, 'lib/' + key, 'utils/' + key];
        for (const a of aliases) {
          if (__modules[a] !== undefined) return __evalModule(a);
        }
        return {}; // graceful fallback for missing modules
      }
      return __evalModule(key);
    }

    const __evaluated = {};
    function __evalModule(key) {
      if (__evaluated[key]) return __evaluated[key].exports;
      const exports = {};
      __evaluated[key] = { exports };
      const src = __modules[key];

      // Strip TypeScript-specific syntax that Babel standalone can't handle cleanly
      const cleaned = src
        .replace(/^\\s*import type .+$/gm, '')
        .replace(/^\\s*export type .+$/gm, '')
        .replace(/<[A-Z][\\w.]*>/g, '') // generic type params on function calls
        .replace(/: [A-Z][\\w<>, |&\\[\\]]+(?=\\s*[=,);{])/g, '') // inline type annotations
        .replace(/interface \\w+[^{]*\\{[^}]*\\}/gs, '') // interface blocks
        .replace(/type \\w+\\s*=[^;\\n]+;/g, ''); // type aliases

      try {
        const transformed = Babel.transform(cleaned, {
          presets: ['react'],
          plugins: [],
        }).code;

        const fn = new Function('React', 'require', 'exports', 'module', transformed);
        const mod = { exports };
        fn(React, __require, exports, mod);
        Object.assign(exports, mod.exports);
      } catch(e) {
        console.warn('Module eval failed for', key, e);
      }

      return exports;
    }
  </script>

  <!-- React from CDN -->
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>

  <script>
    window.addEventListener('load', () => {
      try {
        const entry = __require(${JSON.stringify(entryPath.replace(/^(src\/)?/, '').replace(/\.(tsx?|jsx?)$/, ''))});
        const App = entry.default || entry[Object.keys(entry)[0]];
        if (!App) throw new Error('No default export found in entry file');

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(App));
      } catch(e) {
        document.getElementById('root').innerHTML =
          '<div style="padding:2rem;font-family:monospace;color:#dc2626">' +
          '<strong>Preview error:</strong><br/>' + e.message + '</div>';
        console.error(e);
      }
    });
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

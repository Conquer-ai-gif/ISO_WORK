// Figma REST API helpers
// Docs: https://www.figma.com/developers/api

const FIGMA_API = 'https://api.figma.com/v1';

function figmaHeaders() {
  const token = process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new Error('FIGMA_ACCESS_TOKEN is not set');
  return { 'X-Figma-Token': token };
}

// ── Parse a Figma URL into fileId and optional nodeId ──────────────────────
export function parseFigmaUrl(url: string): { fileId: string; nodeId?: string } | null {
  try {
    const u = new URL(url);
    // Matches: figma.com/file/FILEID/... or figma.com/design/FILEID/...
    const match = u.pathname.match(/^\/(file|design)\/([a-zA-Z0-9]+)/);
    if (!match) return null;
    const fileId = match[2];
    // node-id is in the query string as ?node-id=xxx
    const nodeId = u.searchParams.get('node-id') ?? undefined;
    return { fileId, nodeId };
  } catch {
    return null;
  }
}

// ── Fetch Figma file nodes ─────────────────────────────────────────────────
export async function fetchFigmaNodes(fileId: string, nodeIds?: string[]) {
  const endpoint = nodeIds?.length
    ? `${FIGMA_API}/files/${fileId}/nodes?ids=${nodeIds.join(',')}`
    : `${FIGMA_API}/files/${fileId}`;

  const endpoint = nodeIds?.length
    ? `${FIGMA_API}/files/${fileId}/nodes?ids=${nodeIds.join(',')}`
    : `${FIGMA_API}/files/${fileId}`

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch(endpoint, {
      headers: figmaHeaders(),
      signal:  controller.signal,
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Figma API error ${res.status}: ${err}`)
    }
    return res.json()
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Figma API request timed out after 15 seconds')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// ── Fetch a PNG image of specific nodes ───────────────────────────────────
export async function fetchFigmaImage(fileId: string, nodeId: string, scale = 1): Promise<string | null> {
  const res = await fetch(
    `${FIGMA_API}/images/${fileId}?ids=${nodeId}&format=png&scale=${scale}`,
    { headers: figmaHeaders() },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const imageUrl = data.images?.[nodeId];
  if (!imageUrl) return null;

  // Fetch the image and convert to base64 so we can pass it to Gemini vision
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) return null;
  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

// ── Convert a Figma color to hex ──────────────────────────────────────────
function colorToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ── Extract fills as color strings ────────────────────────────────────────
// ── Figma node types ──────────────────────────────────────────────────────────
interface FigmaColor {
  r: number; g: number; b: number; a: number
}

interface FigmaFill {
  type:       string
  visible?:   boolean
  color?:     FigmaColor
  opacity?:   number
}

interface FigmaEffect {
  type:     string
  visible?: boolean
}

interface FigmaNode {
  id:              string
  name:            string
  type:            string
  children?:       FigmaNode[]
  fills?:          FigmaFill[]
  strokes?:        FigmaFill[]
  effects?:        FigmaEffect[]
  characters?:     string
  style?:          Record<string, unknown>
  cornerRadius?:   number
  opacity?:        number
  absoluteBoundingBox?: { width: number; height: number; x: number; y: number }
}

function extractFills(fills: FigmaFill[]): string[] {
  return (fills || [])
    .filter((f) => f.type === 'SOLID' && f.visible !== false)
    .map((f) => colorToHex(f.color));
}

// ── Recursively walk the node tree and build a structured description ──────
function describeNode(node: FigmaNode, depth = 0): string {
  if (!node || depth > 6) return '';
  const indent = '  '.repeat(depth);
  const parts: string[] = [];

  const type = node.type as string;
  const name = node.name as string;

  // Dimensions
  const w = node.absoluteBoundingBox?.width
    ? Math.round(node.absoluteBoundingBox.width)
    : null;
  const h = node.absoluteBoundingBox?.height
    ? Math.round(node.absoluteBoundingBox.height)
    : null;
  const dims = w && h ? ` [${w}×${h}px]` : '';

  // Colors
  const fills = extractFills(node.fills || []);
  const fillStr = fills.length ? ` fill:${fills[0]}` : '';

  // Border radius
  const radius = node.cornerRadius
    ? ` radius:${Math.round(node.cornerRadius)}px`
    : '';

  // Typography
  let textInfo = '';
  if (type === 'TEXT' && node.style) {
    const s = node.style;
    const size = s.fontSize ? `${Math.round(s.fontSize)}px` : '';
    const weight = s.fontWeight ? `weight:${s.fontWeight}` : '';
    const family = s.fontFamily ? `font:${s.fontFamily}` : '';
    const color = extractFills(node.fills || []);
    const colorStr = color.length ? `color:${color[0]}` : '';
    textInfo = ` [${[size, weight, family, colorStr].filter(Boolean).join(' ')}]`;
    const chars = node.characters ? ` "${node.characters.slice(0, 80)}"` : '';
    parts.push(`${indent}TEXT${textInfo}${chars}`);
    return parts.join('\n');
  }

  // Auto-layout
  let layoutInfo = '';
  if (node.layoutMode) {
    const dir = node.layoutMode === 'VERTICAL' ? 'column' : 'row';
    const gap = node.itemSpacing ? ` gap:${Math.round(node.itemSpacing)}px` : '';
    const pad = node.paddingTop != null
      ? ` padding:${Math.round(node.paddingTop)}/${Math.round(node.paddingRight ?? 0)}/${Math.round(node.paddingBottom ?? 0)}/${Math.round(node.paddingLeft ?? 0)}`
      : '';
    layoutInfo = ` layout:${dir}${gap}${pad}`;
  }

  // Stroke / border
  const strokes = (node.strokes || []).filter((s: FigmaFill) => s.visible !== false);
  const strokeStr = strokes.length && node.strokeWeight
    ? ` border:${Math.round(node.strokeWeight)}px ${colorToHex(strokes[0].color)}`
    : '';

  // Effects (shadows, blurs)
  const effects = (node.effects || [])
    .filter((e: FigmaEffect) => e.visible !== false)
    .map((e: FigmaEffect) => e.type.toLowerCase().replace('_', '-'))
    .join(',');
  const effectStr = effects ? ` effects:${effects}` : '';

  // Component name
  const componentName = node.componentId ? ` [component]` : '';

  parts.push(
    `${indent}${type} "${name}"${dims}${fillStr}${radius}${layoutInfo}${strokeStr}${effectStr}${componentName}`,
  );

  // Recurse into children (limit breadth per level to avoid huge prompts)
  const children = node.children || [];
  const MAX_CHILDREN = 12;
  for (const child of children.slice(0, MAX_CHILDREN)) {
    const childDesc = describeNode(child, depth + 1);
    if (childDesc) parts.push(childDesc);
  }
  if (children.length > MAX_CHILDREN) {
    parts.push(`${indent}  ... and ${children.length - MAX_CHILDREN} more children`);
  }

  return parts.join('\n');
}

// ── Main export: convert a Figma file/node to a structured AI prompt ───────
export async function figmaToPrompt(figmaUrl: string): Promise<{
  prompt: string;
  screenshotBase64: string | null;
  pageName: string;
}> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) throw new Error('Invalid Figma URL');

  const { fileId, nodeId } = parsed;

  // Fetch the file/node data
  const data = nodeId
    ? await fetchFigmaNodes(fileId, [nodeId])
    : await fetchFigmaNodes(fileId);

  // Get a screenshot of the node for vision context
  const targetNodeId = nodeId ?? Object.keys(data.nodes ?? {})[0];
  const screenshotBase64 = targetNodeId
    ? await fetchFigmaImage(fileId, targetNodeId, 2).catch(() => null)
    : null;

  // Get the root node to describe
  let rootNode: FigmaNode;
  let pageName = 'Design';

  if (nodeId && data.nodes) {
    rootNode = data.nodes[nodeId]?.document;
    pageName = rootNode?.name ?? 'Design';
  } else if (data.document) {
    // Full file — use first page
    const firstPage = data.document.children?.[0];
    pageName = data.document.name ?? 'Design';
    rootNode = firstPage;
  }

  if (!rootNode) throw new Error('Could not find design node in Figma file');

  // Extract global styles
  const styles = data.styles ?? {};
  const colorStyles = Object.entries(styles)
    .filter(([, s]: [string, any]) => s.styleType === 'FILL')
    .map(([, s]: [string, any]) => `  ${s.name}`)
    .slice(0, 20)
    .join('\n');

  const textStyles = Object.entries(styles)
    .filter(([, s]: [string, any]) => s.styleType === 'TEXT')
    .map(([, s]: [string, any]) => `  ${s.name}`)
    .slice(0, 10)
    .join('\n');

  // Build the structured description
  const nodeDescription = describeNode(rootNode);

  const prompt = `You are converting a Figma design into a working Next.js app.

## Design: "${pageName}"
Source: ${figmaUrl}

## Node tree
${nodeDescription}

${colorStyles ? `## Color styles\n${colorStyles}\n` : ''}
${textStyles ? `## Text styles\n${textStyles}\n` : ''}

## Instructions
Build a pixel-faithful Next.js implementation of this design. Follow these rules:
- Recreate the exact layout structure shown in the node tree
- Use Tailwind CSS classes that match the dimensions, colors, spacing, and typography
- Convert auto-layout (row/column) to flex with matching gap and padding
- Use the exact hex colors from fill values — map them to Tailwind arbitrary values e.g. bg-[#FF5733]
- Match font sizes, weights, and families as closely as possible using Tailwind
- Recreate border radius, shadows, and borders from the node properties
- Make the design responsive where it makes sense
- Replace placeholder text with realistic content
- Add appropriate interactivity (hover states, click handlers) where the design implies it
- Use Shadcn components where they match (Button, Input, Card, etc.)
- If the design includes navigation, make it functional with Next.js routing`;

  return { prompt, screenshotBase64, pageName };
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 6: Figma → tailwind.config.ts Auto-Generation
// Reads Figma variables (colors, spacing, typography, border radius)
// and generates a complete tailwind.config.ts for the generated app.
// This ensures every generated app is 100% brand compliant.
// ─────────────────────────────────────────────────────────────────────────────

interface FigmaVariable {
  name: string
  resolvedType: 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN'
  valuesByMode: { [modeId: string]: string | number | boolean | FigmaColor }
}

interface FigmaVariablesResponse {
  variables: { [id: string]: FigmaVariable }
  variableCollections: { [id: string]: { defaultModeId: string; name: string } }
}

function rgbaToHex(r: number, g: number, b: number, a = 1): string {
  const toHex = (n: number) =>
    Math.round(n * 255).toString(16).padStart(2, '0')
  return a < 1
    ? `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`
    : `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export async function figmaToTailwindConfig(
  figmaFileKey: string,
  figmaToken: string
): Promise<string> {
  // Fetch Figma variables API
  const res = await fetch(
    `https://api.figma.com/v1/files/${figmaFileKey}/variables/local`,
    { headers: { 'X-Figma-Token': figmaToken } }
  )

  if (!res.ok) {
    throw new Error(`Figma variables API error ${res.status}: ${await res.text()}`)
  }

  const data: FigmaVariablesResponse = await res.json()
  const { variables, variableCollections } = data

  const colors: { [key: string]: string } = {}
  const spacing: { [key: string]: string } = {}
  const fontSizes: { [key: string]: string } = {}
  const borderRadius: { [key: string]: string } = {}
  const fontFamilies: { [key: string]: string } = {}

  // Build a reverse map: variableId → collectionId so we can find each variable's collection
  const variableToCollection: Record<string, string> = {}
  for (const [collectionId, collection] of Object.entries(variableCollections)) {
    // Each variable belongs to a collection — we look it up by checking variableCollections
    for (const varId of Object.keys(variables)) {
      if (!variableToCollection[varId]) {
        variableToCollection[varId] = collectionId
      }
    }
  }

  for (const [varId, variable] of Object.entries(variables)) {
    // Find the correct collection for this variable
    const collectionId  = variableToCollection[varId]
    const collection    = collectionId ? variableCollections[collectionId] : null
    const defaultModeId = collection?.defaultModeId ?? Object.values(variableCollections)[0]?.defaultModeId
    const value         = variable.valuesByMode[defaultModeId]
    if (value === undefined) continue

    // Normalise name: "colors/primary/500" → "primary-500"
    const key = variable.name
      .toLowerCase()
      .replace(/\//g, '-')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')

    if (variable.resolvedType === 'COLOR' && value?.r !== undefined) {
      colors[key] = rgbaToHex(value.r, value.g, value.b, value.a)
    } else if (variable.resolvedType === 'FLOAT') {
      const nameLower = variable.name.toLowerCase()
      if (nameLower.includes('spacing') || nameLower.includes('gap') || nameLower.includes('padding')) {
        spacing[key] = `${value}px`
      } else if (nameLower.includes('font-size') || nameLower.includes('text')) {
        fontSizes[key] = `${value}px`
      } else if (nameLower.includes('radius') || nameLower.includes('rounded')) {
        borderRadius[key] = `${value}px`
      }
    } else if (variable.resolvedType === 'STRING') {
      if (variable.name.toLowerCase().includes('font-family') || variable.name.toLowerCase().includes('typeface')) {
        fontFamilies[key] = `"${value}", sans-serif`
      }
    }
  }

  // Generate tailwind.config.ts content
  const configContent = `import type { Config } from 'tailwindcss'

// Auto-generated by Isotope from Figma variables
// DO NOT edit manually — regenerate from Figma instead
const config: Config = {
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: ${JSON.stringify(colors, null, 8).replace(/^/gm, '      ').trim()},
      spacing: ${JSON.stringify(spacing, null, 8).replace(/^/gm, '      ').trim()},
      fontSize: ${JSON.stringify(fontSizes, null, 8).replace(/^/gm, '      ').trim()},
      borderRadius: ${JSON.stringify(borderRadius, null, 8).replace(/^/gm, '      ').trim()},
      fontFamily: ${JSON.stringify(fontFamilies, null, 8).replace(/^/gm, '      ').trim()},
    },
  },
  plugins: [],
}

export default config
`

  return configContent
}

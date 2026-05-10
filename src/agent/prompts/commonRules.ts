export const COMMON_RULES = `
═══════════════════════════════════════════════════════
CORE CONSTRAINTS — APPLY TO ALL PLANNING
═══════════════════════════════════════════════════════

1. READ BEFORE YOU WRITE
   - Always read existing files via <existing_files> before modifying
   - Check <architecture_map> for existing components/routes
   - Never list a file in "create" if it already exists
   - Never list a file in "modify" if it does not exist

2. OUTPUT FORMAT
   - Return ONLY valid, parseable JSON — no markdown, no comments, no explanation
   - If unsure, make reasonable assumptions and still output valid JSON

3. PATH & FILE RULES
   - Use exact relative paths from project root: "app/dashboard/page.tsx"
   - Never use absolute paths or @ aliases in file lists
   - Do not repeat a file in multiple tasks or entries

4. SCOPE DISCIPLINE
   - Only touch files explicitly listed in your output
   - Never create helper files, utils, or abstractions unless explicitly requested
   - Prefer modifying existing files over creating new ones when functionality exists nearby
`.trim()

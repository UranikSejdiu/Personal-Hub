/**
 * Utilities for extracting preview content from Lexical JSON.
 * Used by the notes list to render a text preview of each note.
 */

interface LexicalNode {
  type?: string;
  text?: string;
  children?: LexicalNode[];
  checked?: boolean;
  listType?: string;
  format?: number;
  style?: string;
}

/**
 * Extract plain text lines from Lexical JSON.
 * Returns an array of strings, one per line/paragraph.
 */
export function extractLexicalLines(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    const root = parsed?.root;
    if (!root?.children) return [];
    return root.children.flatMap((node: LexicalNode) => extractNodeText(node));
  } catch {
    return [];
  }
}

function extractNodeText(node: LexicalNode): string[] {
  if (node.type === "text") {
    return [node.text ?? ""];
  }

  if (node.type === "listitem") {
    const prefix = node.checked ? "✓ " : "○ ";
    const text = (node.children ?? [])
      .flatMap((c: LexicalNode) => extractNodeText(c))
      .join("");
    return [prefix + text];
  }

  if (node.type === "list") {
    return (node.children ?? []).flatMap((c: LexicalNode) => extractNodeText(c));
  }

  if (node.type === "paragraph" || node.type === "heading") {
    return [(node.children ?? []).flatMap((c: LexicalNode) => extractNodeText(c)).join("")];
  }

  // For any other node type, try to extract text from children
  if (node.children) {
    return [node.children.flatMap((c: LexicalNode) => extractNodeText(c)).join("")];
  }

  return [];
}

/**
 * Valid empty Lexical editor state (one empty paragraph).
 * Used as the canonical empty-value instead of "{}".
 */
export const EMPTY_LEXICAL_JSON = JSON.stringify({
  root: {
    children: [
      {
        children: [
          { detail: 0, format: 0, mode: "normal", style: "", text: "", type: "text", version: 1 },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

/**
 * Check if a content string is Lexical JSON (starts with `{` and has a root).
 */
export function isLexicalJson(content: string): boolean {
  if (!content || content[0] !== "{") return false;
  try {
    const parsed = JSON.parse(content);
    return parsed?.root?.type === "root";
  } catch {
    return false;
  }
}

/**
 * Get preview text from note content (handles both Lexical JSON and legacy HTML).
 * Returns up to `maxLines` lines of text.
 */
export function getNotePreviewText(content: string, maxLines: number = 3): string[] {
  if (!content) return [];

  if (isLexicalJson(content)) {
    return extractLexicalLines(content).slice(0, maxLines);
  }

  // Legacy HTML — strip tags for basic preview
  const stripped = content
    .replace(/<li[^>]*>/gi, "○ ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  return stripped.split("\n").filter(Boolean).slice(0, maxLines);
}

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

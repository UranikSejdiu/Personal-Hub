import type { Block } from "@chaitrabhairappa/react-native-rich-text-editor";

export const EMPTY_BLOCKS: Block[] = [];

export function blocksToJson(blocks: Block[]): string {
  return JSON.stringify(blocks);
}

export function jsonToBlocks(json: string): Block[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) return parsed as Block[];
    const obj = parsed as Record<string, unknown>;
    const root = obj?.root as Record<string, unknown> | undefined;
    if (root?.children) {
      return convertLexicalToBlocks(obj as LexicalRoot);
    }
    return [];
  } catch {
    return [];
  }
}

export function isBlockArray(content: string): boolean {
  if (!content || content[0] !== "[") return false;
  try {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function getPlainTextFromBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      if (block.type === "checklist") {
        return (block.checked ? "✓ " : "○ ") + block.text;
      }
      if (block.type === "bullet") {
        return "○ " + block.text;
      }
      if (block.type === "numbered") {
        return "• " + block.text;
      }
      return block.text;
    })
    .join("\n");
}

export function getPreviewLines(
  blocks: Block[],
  maxLines: number = 3
): string[] {
  return blocks
    .map((block) => {
      if (block.type === "checklist") {
        return (block.checked ? "✓ " : "○ ") + block.text;
      }
      if (block.type === "bullet") {
        return "○ " + block.text;
      }
      if (block.type === "numbered") {
        return "• " + block.text;
      }
      return block.text;
    })
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);
}

interface LexicalTextNode {
  text?: string;
}

interface LexicalChildNode {
  type?: string;
  text?: string;
  children?: LexicalTextNode[];
  checked?: boolean;
}

interface LexicalRoot {
  root?: {
    children?: LexicalChildNode[];
  };
}

function convertLexicalToBlocks(lexical: LexicalRoot): Block[] {
  const children = lexical?.root?.children ?? [];
  const blocks: Block[] = [];

  for (const node of children) {
    if (node.type === "listitem") {
      const text =
        node.children?.map((c) => c.text ?? "").join("") ?? "";
      blocks.push({
        type: "checklist",
        text,
        styles: [],
        checked: node.checked ?? false,
      });
    } else if (node.type === "paragraph" || node.type === "heading") {
      const text =
        node.children?.map((c) => c.text ?? "").join("") ?? "";
      blocks.push({ type: "paragraph", text, styles: [] });
    }
  }

  return blocks;
}

export function getPlainTextFromContent(
  content: string,
  extractLexicalLines: (json: string) => string[],
  stripHtml: (html: string) => string
): string {
  if (!content) return "";
  if (isBlockArray(content)) {
    const blocks = jsonToBlocks(content);
    return getPlainTextFromBlocks(blocks);
  }
  if (content[0] === "{") {
    return extractLexicalLines(content).join("\n");
  }
  return stripHtml(content);
}

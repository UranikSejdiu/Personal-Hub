import { isLexicalJson, extractLexicalLines } from "./lexicalPreview";

export function stripMarkdown(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

export function getPreviewLines(
  content: string,
  maxLines: number = 3
): string[] {
  if (!content) return [];
  return content
    .split("\n")
    .map((line) => stripMarkdown(line))
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);
}

export function contentToMarkdown(content: string): string {
  if (!content) return "";
  if (content[0] === "[") {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (Array.isArray(parsed)) {
        return blocksToMarkdown(parsed as BlockLegacy[]);
      }
    } catch {
      // not JSON array
    }
  }
  if (isLexicalJson(content)) {
    return extractLexicalLines(content).join("\n");
  }
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return htmlToMarkdown(content);
  }
  return content;
}

interface BlockLegacy {
  type?: string;
  text?: string;
  checked?: boolean;
}

function blocksToMarkdown(blocks: BlockLegacy[]): string {
  return blocks
    .map((block) => {
      const text = block.text ?? "";
      switch (block.type) {
        case "checklist":
          return (block.checked ? "✓ " : "☐ ") + text;
        case "bullet":
          return "• " + text;
        case "numbered":
          return "1. " + text;
        default:
          return text;
      }
    })
    .join("\n");
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

import { isLexicalJson, extractLexicalLines } from "./lexicalPreview";

export interface PreviewSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
}

export function getPreviewSegments(content: string, maxLines = 3): PreviewSegment[][] {
  return contentToMarkdown(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map((line) => {
      const task = line.match(/^- \[([ xX])\]\s+(.*)$/);
      const legacyTask = line.match(/^([☐✓○•])\s+(.*)$/);
      const orderedTask = line.match(/^(\d+)\.\s+(.*)$/);
      if (task) {
        return parseInlineMarkdown(`${task[1].toLowerCase() === "x" ? "✓" : "☐"} ${task[2]}`);
      }
      if (legacyTask) {
        const prefix = legacyTask[1] === "○" ? "☐" : legacyTask[1];
        return parseInlineMarkdown(`${prefix} ${legacyTask[2]}`);
      }
      if (orderedTask) {
        return parseInlineMarkdown(`${orderedTask[1]}. ${orderedTask[2]}`);
      }
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      if (heading) {
        return parseInlineMarkdown(heading[1]);
      }
      const bullet = line.match(/^[-*]\s+(.*)$/);
      if (bullet) {
        return parseInlineMarkdown(`• ${bullet[1]}`);
      }
      return parseInlineMarkdown(line);
    });
}

export function parseInlineMarkdown(line: string): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  const pattern = /(\*\*\*|~~|\*\*|\*)(.+?)\1/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) segments.push({ text: line.slice(cursor, match.index) });
    const marker = match[1];
    if (marker === "***") {
      segments.push({ text: match[2], bold: true, italic: true });
    } else if (marker === "**") {
      segments.push({ text: match[2], bold: true });
    } else if (marker === "*") {
      segments.push({ text: match[2], italic: true });
    } else {
      segments.push({ text: match[2], strikethrough: true });
    }
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) segments.push({ text: line.slice(cursor) });
  return segments.length > 0 ? segments : [{ text: line }];
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

export function contentToEditorHtml(content: string): string {
  if (!content) return "<p></p>";
  if (/<[a-z][\s\S]*>/i.test(content)) return content;
  return markdownToHtml(contentToMarkdown(content));
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | "task" | null = null;

  const closeList = () => {
    if (!listType) return;
    html.push(listType === "task" ? "</ul>" : `</${listType}>`);
    listType = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const task = line.match(/^- \[([ xX])\]\s+(.*)$/);
    const checklist = line.match(/^[☐✓]\s+(.*)$/);
    const bullet = line.match(/^(?:[-*•])\s+(.*)$/);
    const ordered = line.match(/^\d+[.)]\s+(.*)$/);

    if (task || checklist) {
      if (listType !== "task") {
        closeList();
        html.push('<ul data-type="taskList">');
        listType = "task";
      }
      const checked = task ? task[1].toLowerCase() === "x" : line.startsWith("✓");
      const text = task ? task[2] : checklist?.[1] ?? "";
      html.push(`<li data-checked="${checked}"><p>${inlineMarkdownToHtml(text)}</p></li>`);
      continue;
    }

    if (bullet) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li><p>${inlineMarkdownToHtml(bullet[1])}</p></li>`);
      continue;
    }

    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li><p>${inlineMarkdownToHtml(ordered[1])}</p></li>`);
      continue;
    }

    closeList();
    if (line.trim()) html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }

  closeList();
  return html.join("") || "<p></p>";
}

function inlineMarkdownToHtml(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface BlockLegacy {
  type?: string;
  text?: string;
  checked?: boolean;
}

function blocksToMarkdown(blocks: BlockLegacy[]): string {
  let orderedCounter = 0;
  return blocks
    .map((block) => {
      const text = block.text ?? "";
      switch (block.type) {
        case "checklist":
          orderedCounter = 0;
          return (block.checked ? "✓ " : "☐ ") + text;
        case "bullet":
          orderedCounter = 0;
          return "• " + text;
        case "numbered":
          orderedCounter += 1;
          return `${orderedCounter}. ${text}`;
        default:
          orderedCounter = 0;
          return text;
      }
    })
    .join("\n");
}

function htmlToMarkdown(html: string): string {
  const withOrderedNumbers = html.replace(
    /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
    (match, inner: string) => {
      let n = 0;
      return inner.replace(/<li[^>]*>/gi, () => `${++n}. `);
    }
  );
  return withOrderedNumbers
    .replace(/<li[^>]*data-checked=["']true["'][^>]*>/gi, "- [x] ")
    .replace(/<li[^>]*data-checked=["']false["'][^>]*>/gi, "- [ ] ")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n")
    .replace(/<(strong|b)>/gi, "**")
    .replace(/<\/(strong|b)>/gi, "**")
    .replace(/<(em|i)>/gi, "*")
    .replace(/<\/(em|i)>/gi, "*")
    .replace(/<(s|del|strike)>/gi, "~~")
    .replace(/<\/(s|del|strike)>/gi, "~~")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
  if (/<[a-z][\s\S]*>/i.test(content)) return normalizeHtmlForEditor(content);
  return markdownToHtml(contentToMarkdown(content));
}

const CHECKBOX_LIST_OPEN = /<ul\b[^>]*\bdata-type=(["'])checkbox\1[^>]*>/gi;

/**
 * Append an empty unchecked item to the last checkbox list in the given HTML.
 * Returns `null` when the document has no checkbox list. Used as a fallback
 * when the caret cannot be mapped to a specific checkbox item.
 */
export function appendCheckboxItem(html: string): string | null {
  if (!html) return null;
  let lastOpenEnd = -1;
  let match: RegExpExecArray | null;
  CHECKBOX_LIST_OPEN.lastIndex = 0;
  while ((match = CHECKBOX_LIST_OPEN.exec(html)) !== null) {
    lastOpenEnd = match.index + match[0].length;
  }
  if (lastOpenEnd === -1) return null;
  const closeIndex = findListClose(html, lastOpenEnd);
  if (closeIndex === -1) return null;
  return `${html.slice(0, closeIndex)}<li></li>${html.slice(closeIndex)}`;
}

interface HtmlBlock {
  kind: "li" | "paragraph" | "heading" | "break";
  checkbox: boolean;
  closeEnd: number;
}

/**
 * The native serializer emits exactly one block element per plain-text line
 * (`<li>`, `<p>`, `<h1..6>`, or `<br>` for empty lines), in document order.
 * This walks the HTML and records each block so a plain-text line index can be
 * mapped back to its element.
 */
function collectHtmlBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const listStack: boolean[] = [];
  let liDepth = 0;
  let openLi: HtmlBlock | null = null;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const attrs = match[3];

    if (name === "ul" || name === "ol") {
      if (closing) {
        listStack.pop();
      } else {
        listStack.push(name === "ul" && /data-type\s*=\s*(["'])checkbox\1/i.test(attrs));
      }
      continue;
    }

    if (name === "li") {
      if (closing) {
        liDepth = Math.max(0, liDepth - 1);
        if (liDepth === 0 && openLi) {
          openLi.closeEnd = tagRe.lastIndex;
          openLi = null;
        }
      } else {
        if (liDepth === 0) {
          const block: HtmlBlock = {
            kind: "li",
            checkbox: listStack[listStack.length - 1] === true,
            closeEnd: -1,
          };
          blocks.push(block);
          openLi = block;
        }
        liDepth += 1;
      }
      continue;
    }

    if (liDepth > 0) continue;

    if (closing) continue;

    if (name === "br") {
      blocks.push({ kind: "break", checkbox: false, closeEnd: tagRe.lastIndex });
      continue;
    }

    if (name === "p" || /^h[1-6]$/.test(name)) {
      const closeRe = new RegExp(`</${name}\\s*>`, "i");
      const rest = html.slice(tagRe.lastIndex);
      const closeMatch = closeRe.exec(rest);
      blocks.push({
        kind: name === "p" ? "paragraph" : "heading",
        checkbox: false,
        closeEnd: closeMatch ? tagRe.lastIndex + closeMatch.index + closeMatch[0].length : tagRe.lastIndex,
      });
    }
  }

  return blocks;
}

function findListClose(html: string, from: number): number {
  let depth = 1;
  const re = /<\/?ul\b[^>]*>/gi;
  re.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    depth += match[0][1] === "/" ? -1 : 1;
    if (depth === 0) return match.index;
  }
  return -1;
}

/**
 * Insert an empty unchecked item immediately after the checkbox item on the
 * given plain-text line (mirrors Google Keep's "Add item"). Returns `null`
 * when that line is not a checkbox item.
 */
export function insertCheckboxItemAtLine(html: string, lineIndex: number): string | null {
  if (!html || lineIndex < 0) return null;
  const block = collectHtmlBlocks(html)[lineIndex];
  if (!block || block.kind !== "li" || !block.checkbox || block.closeEnd < 0) return null;
  return `${html.slice(0, block.closeEnd)}<li></li>${html.slice(block.closeEnd)}`;
}

interface CheckboxItemRange {
  checked: boolean;
  contentStart: number;
  contentEnd: number;
}

function findLiClose(html: string, from: number): { start: number; end: number } | null {
  let depth = 1;
  const re = /<(\/?)li\b[^>]*>/gi;
  re.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) return { start: match.index, end: re.lastIndex };
    } else {
      depth += 1;
    }
  }
  return null;
}

/** Every direct `<li>` inside a checkbox list, in document order. */
function collectCheckboxItems(html: string): CheckboxItemRange[] {
  const items: CheckboxItemRange[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const listStack: boolean[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const attrs = match[3];

    if (name === "ul" || name === "ol") {
      if (closing) listStack.pop();
      else listStack.push(name === "ul" && /data-type\s*=\s*(["'])checkbox\1/i.test(attrs));
      continue;
    }

    const inCheckbox = listStack.length > 0 && listStack[listStack.length - 1] === true;
    if (name === "li" && !closing && inCheckbox) {
      const contentStart = tagRe.lastIndex;
      const close = findLiClose(html, contentStart);
      if (!close) break;
      const checked =
        /(?:^|\s)checked(?:\s|=|$)/i.test(attrs) ||
        /data-checked\s*=\s*["']true["']/i.test(attrs);
      items.push({ checked, contentStart, contentEnd: close.start });
      tagRe.lastIndex = close.end;
    }
  }

  return items;
}

/** Checked/unchecked state of each checkbox item, in document order. */
export function parseCheckedStates(html: string): boolean[] {
  return collectCheckboxItems(html).map((item) => item.checked);
}

/**
 * Cheap, allocation-light check for checkbox-list markup, used to skip the
 * full-document parse on the editor's per-keystroke `onChangeHtml` path.
 */
export function hasCheckboxMarkup(html: string): boolean {
  return html.includes('data-type="checkbox"') || html.includes("data-type='checkbox'");
}

function stripStrikeTags(inner: string): string {
  return inner.replace(/<\/?s\b[^>]*>/gi, "");
}

/**
 * Wrap checked checkbox item text in `<s>` and remove the strikethrough from
 * unchecked items, since the native editor has no checked-text style of its
 * own. Unchecked items are stripped unconditionally rather than unwrapping a
 * single outer `<s>`, because an item created from a checked line can carry the
 * strike span in more than one run. Intended to run over the editor's HTML
 * output; idempotent for checked items and preserves all other markup.
 */
export function applyCheckedStrikethrough(html: string): string {
  const items = collectCheckboxItems(html);
  if (items.length === 0) return html;

  let out = "";
  let last = 0;
  for (const item of items) {
    const inner = html.slice(item.contentStart, item.contentEnd);
    const next = item.checked ? `<s>${stripStrikeTags(inner)}</s>` : stripStrikeTags(inner);
    out += html.slice(last, item.contentStart) + next;
    last = item.contentEnd;
  }
  return out + html.slice(last);
}

/**
 * Map legacy TipTap/ProseMirror note HTML onto the Enriched HTML
 * checkbox format (`ul[data-type="checkbox"]` + `li[checked]`).
 * The native normalizer already rewrites `data-checked`, but it does not
 * recognize TipTap's `taskList` type, so checklists would load as bullets.
 */
function normalizeHtmlForEditor(html: string): string {
  return html
    .replace(/data-type=(["'])taskList\1/gi, 'data-type="checkbox"')
    .replace(/data-type=(["'])taskItem\1/gi, "");
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
    // Leading indentation is stripped so indented list markers are still parsed
    // as list items instead of leaking into a literal paragraph. Nested lists
    // are flattened, matching the native editor's own normalizer.
    const line = rawLine.trim();
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const task = line.match(/^- \[([ xX])\]\s+(.*)$/);
    const checklist = line.match(/^[☐✓]\s+(.*)$/);
    const bullet = line.match(/^(?:[-*•])\s+(.*)$/);
    const ordered = line.match(/^\d+[.)]\s+(.*)$/);

    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      continue;
    }

    if (task || checklist) {
      if (listType !== "task") {
        closeList();
        html.push('<ul data-type="checkbox">');
        listType = "task";
      }
      const checked = task ? task[1].toLowerCase() === "x" : line.startsWith("✓");
      const text = task ? task[2] : checklist?.[1] ?? "";
      html.push(`<li${checked ? " checked" : ""}>${inlineMarkdownToHtml(text)}</li>`);
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
    if (line) html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
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

/**
 * Rewrite Enriched checkbox lists into TipTap-style `data-checked` items so
 * the shared markdown converter can emit `- [x]` / `- [ ]` previews/search text.
 */
function normalizeCheckboxHtmlForMarkdown(html: string): string {
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const listStack: boolean[] = [];
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    out += html.slice(last, match.index);
    last = tagRe.lastIndex;
    const closing = match[1] === "/";
    const name = match[2].toLowerCase();
    const attrs = match[3];

    if (name === "ul" || name === "ol") {
      if (closing) {
        listStack.pop();
        out += match[0];
      } else {
        const isCheckbox = name === "ul" && /data-type\s*=\s*(["'])checkbox\1/i.test(attrs);
        listStack.push(isCheckbox);
        out += isCheckbox ? '<ul data-type="taskList">' : match[0];
      }
      continue;
    }

    const inCheckbox = listStack.length > 0 && listStack[listStack.length - 1] === true;
    if (name === "li" && !closing && inCheckbox) {
      const checked =
        /(?:^|\s)checked(?:\s|=|$)/i.test(attrs) ||
        /data-checked\s*=\s*["']true["']/i.test(attrs);
      out += `<li data-checked="${checked}">`;
      continue;
    }

    out += match[0];
  }

  return out + html.slice(last);
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
  const withCheckboxes = normalizeCheckboxHtmlForMarkdown(html);
  const withOrderedNumbers = withCheckboxes.replace(
    /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
    (_match, inner: string) => {
      let n = 0;
      return inner.replace(/<li[^>]*>/gi, () => `${++n}. `);
    }
  );
  return withOrderedNumbers
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_match, level: string, content: string) =>
        `${"#".repeat(Number(level))} ${content}\n`
    )
    .replace(/<li[^>]*data-checked=["']true["'][^>]*>/gi, "- [x] ")
    .replace(/<li[^>]*data-checked=["']false["'][^>]*>/gi, "- [ ] ")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
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

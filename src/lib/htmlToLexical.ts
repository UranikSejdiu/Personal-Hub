/**
 * Convert legacy HTML (from react-native-enriched-html) to Lexical JSON.
 * Handles common patterns: paragraphs, text formatting, lists, checkboxes.
 */

interface LexicalTextNode {
  type: "text";
  text: string;
  format: number;
  style: string;
  version: number;
}

interface LexicalParagraphNode {
  type: "paragraph";
  children: LexicalTextNode[];
  direction: "ltr" | "rtl";
  format: string;
  indent: number;
  version: number;
}

interface LexicalListItemNode {
  type: "listitem";
  children: LexicalTextNode[];
  direction: "ltr" | "rtl";
  format: string;
  indent: number;
  version: number;
  checked: boolean;
  value: number;
}

interface LexicalListNode {
  type: "list";
  children: LexicalListItemNode[];
  direction: "ltr" | "rtl";
  format: string;
  indent: number;
  version: number;
  listType: "bullet" | "number" | "check";
  start: number;
  tag: string;
}

type LexicalNode = LexicalParagraphNode | LexicalListNode;

// Text format flags (Lexical uses bitmask)
const BOLD = 1;
const ITALIC = 2;
const STRIKETHROUGH = 8;
const UNDERLINE = 4;

function parseInlineFormat(html: string): { text: string; format: number } {
  let format = 0;
  let text = html;

  // Strip inline tags and track formatting
  if (text.includes("<strong>") || text.includes("<b>")) {
    format |= BOLD;
    text = text.replace(/<\/?(strong|b)>/gi, "");
  }
  if (text.includes("<em>") || text.includes("<i>")) {
    format |= ITALIC;
    text = text.replace(/<\/?(em|i)>/gi, "");
  }
  if (text.includes("<s>") || text.includes("<del>") || text.includes("<strike>")) {
    format |= STRIKETHROUGH;
    text = text.replace(/<\/?(s|del|strike)>/gi, "");
  }
  if (text.includes("<u>")) {
    format |= UNDERLINE;
    text = text.replace(/<\/?u>/gi, "");
  }

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return { text, format };
}

function extractTextFromHtml(html: string): LexicalTextNode[] {
  const segments: LexicalTextNode[] = [];

  // Split by inline tags to preserve formatting boundaries
  const parts = html.split(/(<(?:strong|b|em|i|s|del|strike|u)>.*?<\/(?:strong|b|em|i|s|del|strike|u)>)/gi);

  for (const part of parts) {
    if (!part.trim()) continue;
    if (part.startsWith("<")) {
      const { text, format } = parseInlineFormat(part);
      if (text) {
        segments.push({
          type: "text",
          text,
          format,
          style: "",
          version: 1,
        });
      }
    } else {
      const text = part.replace(/<[^>]+>/g, "").trim();
      if (text) {
        segments.push({
          type: "text",
          text,
          format: 0,
          style: "",
          version: 1,
        });
      }
    }
  }

  return segments;
}

function createEmptyText(): LexicalTextNode {
  return { type: "text", text: "", format: 0, style: "", version: 1 };
}

let itemCount = 0;

function htmlToLexical(html: string): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  itemCount = 0;

  // Handle empty content
  if (!html || !html.trim()) return nodes;

  // Check if it's a checkbox list
  const isCheckboxList = /data-type=["']checkbox["']/.test(html);

  if (isCheckboxList) {
    // Parse checkbox list
    const listMatch = html.match(/<ul[^>]*data-type=["']checkbox["'][^>]*>([\s\S]*?)<\/ul>/i);
    if (listMatch) {
      const items: LexicalListItemNode[] = [];
      const itemRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
      let match;
      while ((match = itemRegex.exec(listMatch[1])) !== null) {
        const attrs = match[1];
        const content = match[2];
        const isChecked = /\bchecked\b/.test(attrs);
        itemCount++;
        items.push({
          type: "listitem",
          children: extractTextFromHtml(content) || [createEmptyText()],
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
          checked: isChecked,
          value: itemCount,
        });
      }
      if (items.length > 0) {
        nodes.push({
          type: "list",
          children: items,
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
          listType: "check",
          start: 1,
          tag: "ul",
        });
      }
      return nodes;
    }
  }

  // Check if it's a bullet or ordered list
  const ulMatch = html.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
  const olMatch = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);

  if (ulMatch) {
    const items: LexicalListItemNode[] = [];
    const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = itemRegex.exec(ulMatch[1])) !== null) {
      itemCount++;
      items.push({
        type: "listitem",
        children: extractTextFromHtml(match[2]) || [createEmptyText()],
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
        checked: false,
        value: itemCount,
      });
    }
    if (items.length > 0) {
      nodes.push({
        type: "list",
        children: items,
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
        listType: "bullet",
        start: 1,
        tag: "ul",
      });
    }
    return nodes;
  }

  if (olMatch) {
    const items: LexicalListItemNode[] = [];
    const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = itemRegex.exec(olMatch[1])) !== null) {
      itemCount++;
      items.push({
        type: "listitem",
        children: extractTextFromHtml(match[2]) || [createEmptyText()],
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
        checked: false,
        value: itemCount,
      });
    }
    if (items.length > 0) {
      nodes.push({
        type: "list",
        children: items,
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
        listType: "number",
        start: 1,
        tag: "ol",
      });
    }
    return nodes;
  }

  // Split by block-level tags
  const blockRegex = /<(p|div|h[1-6]|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(html)) !== null) {
    const tag = blockMatch[1].toLowerCase();
    const content = blockMatch[2];

    if (tag === "li") {
      // Standalone <li> — wrap in a paragraph
      itemCount++;
      nodes.push({
        type: "paragraph",
        children: extractTextFromHtml(content) || [createEmptyText()],
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
      });
    } else if (tag.startsWith("h")) {
      const level = parseInt(tag[1]);
      nodes.push({
        type: "paragraph",
        children: extractTextFromHtml(content) || [createEmptyText()],
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
      });
    } else {
      // <p> or <div>
      nodes.push({
        type: "paragraph",
        children: extractTextFromHtml(content) || [createEmptyText()],
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
      });
    }
  }

  // If no block tags found, split by <br> or treat as single paragraph
  if (nodes.length === 0) {
    const lines = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .filter((l) => l.trim());

    for (const line of lines) {
      const { text, format } = parseInlineFormat(line);
      nodes.push({
        type: "paragraph",
        children: text ? [{ type: "text", text, format, style: "", version: 1 }] : [createEmptyText()],
        direction: "ltr",
        format: "",
        indent: 0,
        version: 1,
      });
    }
  }

  return nodes;
}

/**
 * Convert legacy HTML to Lexical JSON string.
 * Returns the Lexical JSON string ready to store in the database.
 */
export function htmlToLexicalJson(html: string): string {
  const children = htmlToLexical(html);

  // Ensure at least one empty paragraph
  if (children.length === 0) {
    children.push({
      type: "paragraph",
      children: [createEmptyText()],
      direction: "ltr",
      format: "",
      indent: 0,
      version: 1,
    });
  }

  return JSON.stringify({
    root: {
      children,
      direction: "ltr",
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  });
}

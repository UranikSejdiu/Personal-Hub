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
const UNDERLINE = 4;
const STRIKETHROUGH = 8;

function parseInlineFormat(html: string): { text: string; format: number } {
  let format = 0;
  let text = html;

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

  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return { text, format };
}

/**
 * Extract text nodes from inline HTML.
 * Preserves spaces between segments (does not trim individual parts).
 */
function extractTextFromHtml(html: string): LexicalTextNode[] {
  const segments: LexicalTextNode[] = [];
  const inlineTagRe = /(<(?:strong|b|em|i|s|del|strike|u)>[\s\S]*?<\/(?:strong|b|em|i|s|del|strike|u)>)/gi;
  const parts = html.split(inlineTagRe);

  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("<")) {
      const { text, format } = parseInlineFormat(part);
      if (text) {
        segments.push({ type: "text", text, format, style: "", version: 1 });
      }
    } else {
      // Decode entities but preserve whitespace
      const decoded = part
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      if (decoded) {
        segments.push({ type: "text", text: decoded, format: 0, style: "", version: 1 });
      }
    }
  }

  return segments;
}

function getChildren(html: string): LexicalTextNode[] {
  const children = extractTextFromHtml(html);
  return children.length > 0 ? children : [{ type: "text", text: "", format: 0, style: "", version: 1 }];
}

function makeListItem(content: string, checked: boolean, value: number): LexicalListItemNode {
  return {
    type: "listitem",
    children: getChildren(content),
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
    checked,
    value,
  };
}

function parseListItems(html: string, checked: boolean, startValue: number): LexicalListItemNode[] {
  const items: LexicalListItemNode[] = [];
  const itemRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
  let match;
  let value = startValue;
  while ((match = itemRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];
    const isChecked = checked || /\bchecked\b/.test(attrs);
    items.push(makeListItem(content, isChecked, value));
    value++;
  }
  return items;
}

function makeList(listType: "bullet" | "number" | "check", tag: string, items: LexicalListItemNode[]): LexicalListNode | null {
  if (items.length === 0) return null;
  return {
    type: "list",
    children: items,
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
    listType,
    start: 1,
    tag,
  };
}

function makeParagraph(html: string): LexicalParagraphNode {
  return {
    type: "paragraph",
    children: getChildren(html),
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
  };
}

/**
 * Process HTML top-to-bottom, handling every block element in document order.
 * No first-match early returns — all blocks are converted.
 */
function htmlToLexical(html: string): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  if (!html || !html.trim()) return nodes;

  // Top-level block regex: matches <ul>, <ol>, <p>, <div>, <h1>-<h6>, <li>
  const blockRe = /(<(?:ul|ol|p|div|h[1-6]|li)(?:\s[^>]*)?>[\s\S]*?<\/(?:ul|ol|p|div|h[1-6]|li)>)/gi;
  let blockMatch;
  let cursor = 0;

  while ((blockMatch = blockRe.exec(html)) !== null) {
    // Capture any text between blocks (e.g. bare text outside tags)
    const gap = html.slice(cursor, blockMatch.index);
    const gapText = gap.replace(/<[^>]*>/g, "").trim();
    if (gapText) {
      nodes.push(makeParagraph(gapText));
    }
    cursor = blockRe.lastIndex;

    const full = blockMatch[1];
    const tagMatch = full.match(/^<([a-z]+)/i);
    const tag = tagMatch ? tagMatch[1].toLowerCase() : "";

    if (tag === "ul") {
      const isCheckbox = /data-type=["']checkbox["']/.test(full);
      const inner = full.replace(/<\/?ul[^>]*>/gi, "");
      const items = parseListItems(inner, isCheckbox, 1);
      const listType = isCheckbox ? "check" : "bullet";
      const listNode = makeList(listType, "ul", items);
      if (listNode) nodes.push(listNode);
    } else if (tag === "ol") {
      const inner = full.replace(/<\/?ol[^>]*>/gi, "");
      const items = parseListItems(inner, false, 1);
      const listNode = makeList("number", "ol", items);
      if (listNode) nodes.push(listNode);
    } else if (tag === "li") {
      // Standalone <li> outside a list — wrap in paragraph
      const inner = full.replace(/<\/?li[^>]*>/gi, "");
      nodes.push(makeParagraph(inner));
    } else if (tag.startsWith("h")) {
      // Heading treated as paragraph (Lexical doesn't have heading nodes in this config)
      const inner = full.replace(/<\/?h[1-6][^>]*>/gi, "");
      nodes.push(makeParagraph(inner));
    } else {
      // <p>, <div>, or other block
      const inner = full.replace(/<\/?[^>]+>/g, "");
      nodes.push(makeParagraph(inner));
    }
  }

  // Handle any trailing text after the last block tag
  const trailing = html.slice(cursor);
  const trailingText = trailing.replace(/<[^>]*>/g, "").trim();
  if (trailingText) {
    nodes.push(makeParagraph(trailingText));
  }

  // Fallback: if no block tags matched, treat entire content as paragraphs
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
        children: text ? [{ type: "text", text, format, style: "", version: 1 }] : [{ type: "text", text: "", format: 0, style: "", version: 1 }],
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

  if (children.length === 0) {
    children.push({
      type: "paragraph",
      children: [{ type: "text", text: "", format: 0, style: "", version: 1 }],
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

'use dom';

import { useMemo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListNode, ListItemNode } from '@lexical/list';
import type { EditorState } from 'lexical';

export interface LexicalChecklistProps {
  /** Lexical JSON string for initial content. Empty string = blank editor. */
  initialJson: string;
  /** 'light' | 'dark' — drives CSS variables for theming. */
  colorScheme: 'light' | 'dark';
  /** Fired (debounced by caller) with Lexical JSON string on every change. */
  onChange: (json: string) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}

const theme = {
  list: {
    checklist: 'keep-checklist',
    listitem: 'keep-listitem',
    listitemChecked: 'keep-listitem-checked',
    listitemUnchecked: 'keep-listitem-unchecked',
  },
  text: {
    strikethrough: 'keep-strikethrough',
  },
};

function onError(error: Error) {
  // eslint-disable-next-line no-console
  console.error('[LexicalChecklist]', error);
}

export default function LexicalChecklist({
  initialJson,
  colorScheme,
  onChange,
}: LexicalChecklistProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: 'keep-checklist',
      theme,
      nodes: [ListNode, ListItemNode],
      onError,
      editorState: initialJson
        ? (editor: { parseEditorState: (s: string) => EditorState }) =>
            editor.parseEditorState(initialJson)
        : undefined,
    }),
    // Parse initial JSON once on mount. Later prop changes are ignored
    // (native side owns persistence; editor owns live state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className={`keep-root ${colorScheme === 'dark' ? 'keep-dark' : ''}`}>
      <style>{KEEP_CSS}</style>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="keep-editable" aria-label="Checklist editor" />
          }
          placeholder={<div className="keep-placeholder">New list…</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        <CheckListPlugin />
        <HistoryPlugin />
        <OnChangePlugin
          onChange={(editorState) => {
            void onChange(JSON.stringify(editorState.toJSON()));
          }}
        />
        <ChecklistToolbar />
      </LexicalComposer>
    </div>
  );
}

function ChecklistToolbar() {
  return null;
}

const KEEP_CSS = `
.keep-root {
  --keep-text: #1f2937;
  --keep-muted: #6b7280;
  --keep-box-border: #9ca3af;
  --keep-box-fill: #3b82f6;
  --keep-check: #ffffff;
  --keep-placeholder: #9ca3af;
  font-family: system-ui, -apple-system, sans-serif;
  color: var(--keep-text);
}
.keep-root.keep-dark {
  --keep-text: #e5e7eb;
  --keep-muted: #9ca3af;
  --keep-box-border: #6b7280;
  --keep-box-fill: #60a5fa;
  --keep-check: #111827;
  --keep-placeholder: #6b7280;
}
.keep-editable {
  outline: none;
  font-size: 16px;
  line-height: 1.5;
  padding: 12px 4px;
  min-height: 200px;
  caret-color: var(--keep-box-fill);
}
.keep-editable:focus {
  outline: none;
}
.keep-placeholder {
  position: absolute;
  top: 12px;
  left: 4px;
  color: var(--keep-placeholder);
  font-size: 16px;
  pointer-events: none;
  user-select: none;
}
.keep-root {
  position: relative;
}
/* Checklist container */
.keep-checklist {
  list-style: none;
  margin: 0;
  padding: 0;
}
/* Each item row: reserve space for the box, vertically center first line */
.keep-listitem {
  position: relative;
  margin: 2px 0;
  padding: 6px 4px 6px 34px;
  min-height: 32px;
  font-size: 16px;
  line-height: 1.45;
  border-radius: 6px;
  -webkit-tap-highlight-color: transparent;
}
/* The checkbox box drawn with ::before */
.keep-listitem::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 8px;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid var(--keep-box-border);
  background: transparent;
  box-sizing: border-box;
}
/* Checked state: filled box */
.keep-listitem-checked::before {
  background: var(--keep-box-fill);
  border-color: var(--keep-box-fill);
}
/* Checked state: white checkmark drawn with ::after */
.keep-listitem-checked::after {
  content: '';
  position: absolute;
  left: 10px;
  top: 10px;
  width: 6px;
  height: 11px;
  border: solid var(--keep-check);
  border-width: 0 2.5px 2.5px 0;
  transform: rotate(45deg);
  box-sizing: border-box;
}
/* Checked state: strikethrough + dimmed text (Google Keep style) */
.keep-listitem-checked {
  color: var(--keep-muted);
  opacity: 0.6;
}
.keep-listitem-checked > span {
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}
.keep-listitem-unchecked {
  opacity: 1;
}
`;

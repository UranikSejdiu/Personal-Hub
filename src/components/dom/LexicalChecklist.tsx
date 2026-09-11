'use dom';

import { useEffect, useRef, useCallback } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListNode, ListItemNode } from '@lexical/list';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import type { EditorState } from 'lexical';

// ── Command types sent from native toolbar ──────────────────────────
export type LexicalCommandType =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'strikethrough' }
  | { type: 'underline' }
  | { type: 'bulletList' }
  | { type: 'orderedList' }
  | { type: 'checkList' }
  | { type: 'removeList' }
  | { type: 'indent' }
  | { type: 'outdent' };

export interface LexicalChecklistProps {
  /** Lexical JSON string for initial content. Empty string = blank editor. */
  initialJson: string;
  /** 'light' | 'dark' — drives CSS variables for theming. */
  colorScheme: 'light' | 'dark';
  /** Fired (debounced by caller) with Lexical JSON string on every change. */
  onChange: (json: string) => Promise<void>;
  /** Command from native toolbar. Execute when command changes. */
  command?: LexicalCommandType;
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
  console.error('[LexicalChecklist]', error);
}

// ── Command handler plugin (runs inside Lexical context) ────────────
function CommandHandlerPlugin({
  command,
  initialJson,
}: {
  command?: LexicalCommandType;
  initialJson: string;
}) {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);

  // Load initial content once
  useEffect(() => {
    if (initializedRef.current) return;
    if (initialJson) {
      try {
        const state = editor.parseEditorState(initialJson);
        editor.setEditorState(state);
      } catch {
        // Invalid JSON — start blank
      }
    }
    initializedRef.current = true;
  }, [editor, initialJson]);

  // Handle commands from native toolbar
  useEffect(() => {
    if (!command) return;
    editor.focus();
    switch (command.type) {
      case 'bold':
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
        break;
      case 'italic':
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
        break;
      case 'strikethrough':
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
        break;
      case 'underline':
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
        break;
      case 'bulletList':
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        break;
      case 'orderedList':
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        break;
      case 'checkList':
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
        break;
      case 'removeList':
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        break;
      case 'indent':
        editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
        break;
      case 'outdent':
        editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
        break;
    }
  }, [editor, command]);

  return null;
}

export default function LexicalChecklist({
  initialJson,
  colorScheme,
  onChange,
  command,
}: LexicalChecklistProps) {
  const initialConfig = {
    namespace: 'keep-checklist',
    theme,
    nodes: [ListNode, ListItemNode],
    onError,
    // No editorState function — CommandHandlerPlugin loads it
  };

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
        <CommandHandlerPlugin command={command} initialJson={initialJson} />
        <OnChangePlugin
          onChange={(editorState) => {
            void onChange(JSON.stringify(editorState.toJSON()));
          }}
        />
      </LexicalComposer>
    </div>
  );
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
.keep-checklist {
  list-style: none;
  margin: 0;
  padding: 0;
}
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
.keep-listitem-checked::before {
  background: var(--keep-box-fill);
  border-color: var(--keep-box-fill);
}
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

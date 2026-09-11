'use dom';

import { useEffect, useRef, useCallback, useState } from 'react';
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
  $getRoot,
  $getSelection,
  $isRangeSelection,
  ElementNode,
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
  initialJson: string;
  colorScheme: 'light' | 'dark';
  onChange: (json: string) => Promise<void>;
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

// ── Command handler plugin ──────────────────────────────────────────
function CommandHandlerPlugin({
  command,
  initialJson,
}: {
  command?: LexicalCommandType;
  initialJson: string;
}) {
  const [editor] = useLexicalComposerContext();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    if (initialJson) {
      try {
        const state = editor.parseEditorState(initialJson);
        editor.setEditorState(state);
      } catch (error) {
        console.warn('[LexicalChecklist] Failed to parse initial editor state:', error);
      }
    }
    initializedRef.current = true;
  }, [editor, initialJson]);

  useEffect(() => {
    if (!command) return;
    // Delay to let the browser settle focus after native touch event
    const raf = requestAnimationFrame(() => {
      editor.focus();
      // Ensure there's an active selection before dispatching
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          const root = $getRoot();
          root.selectEnd();
        }
      });
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
    });
    return () => cancelAnimationFrame(raf);
  }, [editor, command]);

  return null;
}

// ── Drag-to-reorder plugin ──────────────────────────────────────────
interface DragState {
  /** key of the node being dragged */
  dragKey: string | null;
  /** current Y offset of dragged item (px from original position) */
  dragOffsetY: number;
  /** index of the drop target (insert before this index) */
  dropIndex: number | null;
  /** original bounding rects of all list items */
  itemRects: { key: string; top: number; bottom: number; mid: number }[];
  /** total number of checklist items */
  itemCount: number;
}

function DragReorderPlugin() {
  const [editor] = useLexicalComposerContext();
  const dragRef = useRef<DragState>({
    dragKey: null,
    dragOffsetY: 0,
    dropIndex: null,
    itemRects: [],
    itemCount: 0,
  });
  const dragCloneRef = useRef<HTMLDivElement | null>(null);
  const dropIndicatorRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const getListItemElements = useCallback((): HTMLElement[] => {
    const editable = document.querySelector('.keep-editable');
    if (!editable) return [];
    return Array.from(editable.querySelectorAll('li')).filter((el) =>
      el.classList.contains('keep-listitem'),
    );
  }, []);

  const getListItems = useCallback(() => {
    let items: { key: string; element: HTMLElement }[] = [];
    editor.getEditorState().read(() => {
      const root = $getRoot();
      const children = root.getChildren();
      for (const child of children) {
        if (child.getType() === 'list') {
          const listNode = child as ListNode;
          const listChildren = listNode.getChildren().filter((c): c is ListItemNode => c.getType() === 'listitem');
          items = listChildren
            .map((c, i) => ({
              key: c.getKey(),
              element: getListItemElements()[i],
            }))
            .filter((item) => item.element != null);
        }
      }
    });
    return items;
  }, [editor, getListItemElements]);

  const reorderNodes = useCallback(
    (fromKey: string, toIndex: number) => {
      editor.update(() => {
        const root = $getRoot();
        const children = root.getChildren();
        for (const child of children) {
          if (child.getType() === 'list') {
            const listNode = child as ListNode;
            const listItems = listNode.getChildren().filter((c): c is ListItemNode => c.getType() === 'listitem');
            const fromIndex = listItems.findIndex((item) => item.getKey() === fromKey);
            if (fromIndex === -1 || fromIndex === toIndex) return;

            const [draggedNode] = listItems.splice(fromIndex, 1);
            if (!draggedNode) return;

            const adjustedIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
            listItems.splice(adjustedIndex, 0, draggedNode);

            listNode.clear();
            for (const item of listItems) {
              listNode.append(item);
            }
            return;
          }
        }
      });
    },
    [editor],
  );

  // Handle long-press on drag handle to start drag
  const handleDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      const listItem = target.closest('li') as HTMLElement;
      if (!listItem) return;

      // Find key by matching element position in Lexical state
      const elements = getListItemElements();
      const elementIndex = elements.indexOf(listItem);
      if (elementIndex === -1) return;

      let key = '';
      let currentIndex = 0;
      editor.getEditorState().read(() => {
        const root = $getRoot();
        for (const child of root.getChildren()) {
          if (child.getType() === 'list') {
            const listNode = child as ListNode;
            for (const item of listNode.getChildren()) {
              if (item.getType() === 'listitem') {
                if (currentIndex === elementIndex) {
                  key = item.getKey();
                  return;
                }
                currentIndex++;
              }
            }
          }
        }
      });
      if (!key) return;

      // Prevent text selection
      e.preventDefault();
      e.stopPropagation();

      const rect = listItem.getBoundingClientRect();
      const startY = e.clientY;
      const startScrollTop = document.documentElement.scrollTop;

      longPressTimerRef.current = setTimeout(() => {
        isDraggingRef.current = true;
        listItem.classList.add('dragging');

        // Build item rects
        const elements = getListItemElements();
        const rects = elements.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            key: el.getAttribute('data-lexical-key') || '',
            top: r.top + document.documentElement.scrollTop,
            bottom: r.bottom + document.documentElement.scrollTop,
            mid: (r.top + r.bottom) / 2,
          };
        });

        dragRef.current = {
          dragKey: key,
          dragOffsetY: 0,
          dropIndex: null,
          itemRects: rects,
          itemCount: rects.length,
        };

        // Create clone
        const clone = listItem.cloneNode(true) as HTMLDivElement;
        clone.classList.add('drag-clone');
        clone.style.position = 'absolute';
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.zIndex = '9999';
        clone.style.pointerEvents = 'none';
        clone.style.transition = 'none';
        document.body.appendChild(clone);
        dragCloneRef.current = clone;

        // Create drop indicator
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        indicator.style.position = 'absolute';
        indicator.style.left = '0';
        indicator.style.right = '0';
        indicator.style.height = '3px';
        indicator.style.background = 'var(--keep-box-fill)';
        indicator.style.borderRadius = '2px';
        indicator.style.zIndex = '9998';
        indicator.style.display = 'none';
        indicator.style.transition = 'top 100ms ease';
        document.body.appendChild(indicator);
        dropIndicatorRef.current = indicator;

        forceUpdate((n) => n + 1);
      }, 400);

      const handlePointerMove = (me: PointerEvent) => {
        const dy = me.clientY - startY;
        const scrollDelta = document.documentElement.scrollTop - startScrollTop;

        if (isDraggingRef.current && dragCloneRef.current) {
          me.preventDefault();
          const itemHeight = rect.height;
          const newTop = rect.top + dy;
          dragCloneRef.current.style.top = `${newTop}px`;
          dragRef.current.dragOffsetY = dy;

          // Find drop target
          const currentMid = (rect.top + rect.bottom) / 2 + dy;
          const { itemRects } = dragRef.current;
          const fromIndex = itemRects.findIndex((r) => r.key === key);
          let newDropIndex = fromIndex;

          for (let i = 0; i < itemRects.length; i++) {
            if (i === fromIndex) continue;
            if (currentMid < itemRects[i].mid) {
              newDropIndex = i;
              break;
            }
            newDropIndex = i + 1;
          }

          dragRef.current.dropIndex = newDropIndex;

          // Update drop indicator
          if (dropIndicatorRef.current) {
            const indicatorY =
              newDropIndex <= fromIndex
                ? itemRects[newDropIndex]?.top ?? itemRects[fromIndex].top
                : itemRects[newDropIndex]?.bottom ?? itemRects[fromIndex].bottom;

            dropIndicatorRef.current.style.display = 'block';
            dropIndicatorRef.current.style.top = `${indicatorY - 1.5}px`;
            dropIndicatorRef.current.style.left = '0px';
            dropIndicatorRef.current.style.width = '100%';
          }
        }
      };

      const handlePointerUp = () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);

        if (isDraggingRef.current) {
          isDraggingRef.current = false;
          listItem.classList.remove('dragging');

          // Clean up visual elements
          if (dragCloneRef.current) {
            dragCloneRef.current.remove();
            dragCloneRef.current = null;
          }
          if (dropIndicatorRef.current) {
            dropIndicatorRef.current.remove();
            dropIndicatorRef.current = null;
          }

          // Perform the reorder
          const { dropIndex } = dragRef.current;
          if (dropIndex !== null) {
            reorderNodes(key, dropIndex);
          }

          dragRef.current = {
            dragKey: null,
            dragOffsetY: 0,
            dropIndex: null,
            itemRects: [],
            itemCount: 0,
          };
        }
      };

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [editor, getListItemElements, reorderNodes],
  );

  // Attach drag handles to checklist items
  useEffect(() => {
    const elements = getListItemElements();
    for (const el of elements) {
      if (el.querySelector('.drag-handle')) continue;

      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="5" cy="3" r="1.2"/>
        <circle cx="11" cy="3" r="1.2"/>
        <circle cx="5" cy="8" r="1.2"/>
        <circle cx="11" cy="8" r="1.2"/>
        <circle cx="5" cy="13" r="1.2"/>
        <circle cx="11" cy="13" r="1.2"/>
      </svg>`;
      handle.style.cssText = `
        position: absolute;
        left: -2px;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        opacity: 0;
        transition: opacity 150ms ease;
        touch-action: none;
        user-select: none;
        color: var(--keep-muted);
        border-radius: 4px;
        z-index: 10;
      `;
      handle.addEventListener('pointerdown', handleDragHandlePointerDown as any);
      el.appendChild(handle);
    }

    // Show/hide handles on hover via CSS
    const style = document.getElementById('drag-handle-style') || document.createElement('style');
    style.id = 'drag-handle-style';
    style.textContent = `
      li.keep-listitem:hover > .drag-handle,
      li.keep-listitem.dragging > .drag-handle {
        opacity: 1;
      }
      li.keep-listitem.dragging {
        opacity: 0.4 !important;
      }
      .drag-clone {
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        border-radius: 6px;
        background: var(--keep-bg, #fff);
        opacity: 0.95;
      }
      .drop-indicator {
        pointer-events: none;
      }
    `;
    if (!document.getElementById('drag-handle-style')) {
      document.head.appendChild(style);
    }
  }, [editor, getListItemElements, handleDragHandlePointerDown]);

  // Re-attach handles when editor content changes
  useEffect(() => {
    const unsubscribe = editor.registerUpdateListener(() => {
      queueMicrotask(() => {
        const elements = getListItemElements();
        for (const el of elements) {
          if (el.querySelector('.drag-handle')) continue;
          const handle = document.createElement('div');
          handle.className = 'drag-handle';
          handle.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.2"/>
            <circle cx="11" cy="3" r="1.2"/>
            <circle cx="5" cy="8" r="1.2"/>
            <circle cx="11" cy="8" r="1.2"/>
            <circle cx="5" cy="13" r="1.2"/>
            <circle cx="11" cy="13" r="1.2"/>
          </svg>`;
          handle.style.cssText = `
            position: absolute;
            left: -2px;
            top: 50%;
            transform: translateY(-50%);
            width: 20px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            opacity: 0;
            transition: opacity 150ms ease;
            touch-action: none;
            user-select: none;
            color: var(--keep-muted);
            border-radius: 4px;
            z-index: 10;
          `;
          handle.addEventListener('pointerdown', handleDragHandlePointerDown as any);
          el.appendChild(handle);
        }
      });
    });
    return unsubscribe;
  }, [editor, getListItemElements, handleDragHandlePointerDown]);

  return null;
}

// ── Main component ──────────────────────────────────────────────────
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
        <DragReorderPlugin />
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
  --keep-bg: #fff;
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
  --keep-bg: #1c1c1e;
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
  transition: opacity 150ms ease;
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

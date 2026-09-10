import { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useTheme } from '../src/lib/theme';
import { createNote, searchNotes, getNote, deleteNote } from '../src/lib/notes';
import LexicalChecklist from '../src/components/dom/LexicalChecklist';

// TEMPORARY prototype route for the Lexical checklist editor. Delete after verification.

const SCRATCH_TITLE = 'LEXICAL-PROTOTYPE-SCRATCH';

const SAMPLE_JSON = JSON.stringify({
  root: {
    children: [
      {
        children: [
          {
            children: [
              { detail: 0, format: 0, mode: 'normal', style: '', text: 'Buy milk', type: 'text', version: 1 },
            ],
            direction: 'ltr', format: '', indent: 0, type: 'listitem', version: 1, checked: false, value: 1,
          },
          {
            children: [
              { detail: 0, format: 0, mode: 'normal', style: '', text: 'Walk the dog', type: 'text', version: 1 },
            ],
            direction: 'ltr', format: '', indent: 0, type: 'listitem', version: 1, checked: true, value: 2,
          },
          {
            children: [
              { detail: 0, format: 0, mode: 'normal', style: '', text: 'Call mom', type: 'text', version: 1 },
            ],
            direction: 'ltr', format: '', indent: 0, type: 'listitem', version: 1, checked: false, value: 3,
          },
        ],
        direction: 'ltr', format: '', indent: 0, type: 'list', version: 1, listType: 'check', start: 1, tag: 'ul',
      },
    ],
    direction: 'ltr', format: '', indent: 0, type: 'root', version: 1,
  },
});

function summarize(json: string): string {
  try {
    const root = JSON.parse(json)?.root;
    const lists = (root?.children ?? []).filter((n: { type?: string }) => n.type === 'list');
    let total = 0;
    let checked = 0;
    const texts: string[] = [];
    for (const list of lists) {
      for (const item of list.children ?? []) {
        if (item.type !== 'listitem') continue;
        total += 1;
        if (item.checked) checked += 1;
        const text = (item.children ?? [])
          .filter((c: { type?: string }) => c.type === 'text')
          .map((c: { text?: string }) => c.text ?? '')
          .join('');
        texts.push(`${item.checked ? '[x]' : '[ ]'} ${text}`);
      }
    }
    return `items=${total} checked=${checked}\n${texts.join('\n')}`;
  } catch {
    return '(invalid json)';
  }
}

export default function DomNotesTestScreen() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [json, setJson] = useState('');
  const [mountKey, setMountKey] = useState(0);
  const [changeCount, setChangeCount] = useState(0);
  const [storageStatus, setStorageStatus] = useState('not tested');

  const handleChange = useCallback(async (next: string) => {
    setJson(next);
    setChangeCount((c) => c + 1);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const existing = await searchNotes(SCRATCH_TITLE);
      for (const n of existing) {
        if (n.title === SCRATCH_TITLE) await deleteNote(n.id);
      }
      await createNote({ title: SCRATCH_TITLE, content: json || '{}', color: 'default', is_pinned: false });
      setStorageStatus(`saved ${json.length} chars`);
    } catch (e) {
      setStorageStatus(`save failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }, [json]);

  const handleLoad = useCallback(async () => {
    try {
      const existing = await searchNotes(SCRATCH_TITLE);
      const hit = existing.find((n) => n.title === SCRATCH_TITLE);
      if (!hit) {
        setStorageStatus('no scratch note found');
        return;
      }
      const full = await getNote(hit.id);
      if (!full) {
        setStorageStatus('load failed: note missing');
        return;
      }
      setJson(full.content);
      setMountKey((k) => k + 1);
      setStorageStatus(`loaded ${full.content.length} chars (id ${full.id})`);
    } catch (e) {
      setStorageStatus(`load failed: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }, []);

  const summary = useMemo(() => summarize(json), [json]);

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="gap-3 p-4">
        <Text className="text-base font-semibold text-foreground">
          Lexical checklist prototype
        </Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => {
              setJson(SAMPLE_JSON);
              setMountKey((k) => k + 1);
            }}
            className="rounded-lg bg-primary px-3 py-2"
          >
            <Text className="text-sm font-medium text-primary-foreground">Load sample</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setJson('');
              setMountKey((k) => k + 1);
            }}
            className="rounded-lg bg-muted px-3 py-2"
          >
            <Text className="text-sm font-medium text-foreground">Clear</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSave()}
            className="rounded-lg bg-muted px-3 py-2"
          >
            <Text className="text-sm font-medium text-foreground">Save to sqlite</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleLoad()}
            className="rounded-lg bg-muted px-3 py-2"
          >
            <Text className="text-sm font-medium text-foreground">Load from sqlite</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              void (async () => {
                const existing = await searchNotes(SCRATCH_TITLE);
                for (const n of existing) {
                  if (n.title === SCRATCH_TITLE) await deleteNote(n.id);
                }
                setStorageStatus('scratch deleted');
              })()
            }
            className="rounded-lg bg-muted px-3 py-2"
          >
            <Text className="text-sm font-medium text-foreground">Delete scratch</Text>
          </Pressable>
        </View>
        <Text className="text-xs text-muted-foreground">
          sqlite: {storageStatus}
        </Text>

        <View className="overflow-hidden rounded-xl border border-border">
          <LexicalChecklist
            key={mountKey}
            initialJson={json}
            colorScheme={isDark ? 'dark' : 'light'}
            onChange={handleChange}
          />
        </View>

        <Text className="text-xs text-muted-foreground">
          onChange calls: {changeCount}
        </Text>
        <Text className="font-mono text-xs text-foreground">{summary}</Text>
      </View>
    </ScrollView>
  );
}

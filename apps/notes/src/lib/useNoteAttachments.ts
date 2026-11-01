import { useCallback, useRef, useState } from "react";
import type { AttachmentActions, NoteAttachment } from "./attachmentData";

export function useNoteAttachments() {
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const valueRef = useRef<NoteAttachment[]>([]);
  const initialRef = useRef<readonly NoteAttachment[]>([]);
  const actionRef = useRef<AttachmentActions | null>(null);
  const setBusy = useCallback((value: boolean) => { busyRef.current = value; setBusyState(value); }, []);
  const onChange = useCallback((rows: NoteAttachment[]) => { valueRef.current = rows; setAttachments(rows); }, []);
  const initialize = useCallback((rows: NoteAttachment[]) => {
    initialRef.current = rows;
    valueRef.current = rows;
    setAttachments(rows);
  }, []);
  // Attachment edits replace the array; media objects themselves are immutable.
  // Comparing at most ten references avoids serializing megabytes on Back.
  const hasChanges = useCallback(() => busyRef.current || valueRef.current.length !== initialRef.current.length
    || valueRef.current.some((row, index) => row !== initialRef.current[index]), []);
  return { attachments, valueRef, busy, busyRef, setBusy, onChange, initialize, hasChanges, actionRef };
}

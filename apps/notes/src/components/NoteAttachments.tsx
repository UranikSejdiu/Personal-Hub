import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AppState, Image, Keyboard, Linking, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import { getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from "expo-audio";
import { toast } from "sonner-native";
import { serializeAttachments, type NoteAttachment } from "../lib/attachmentData";
import { readAttachment, materializeAttachment } from "../lib/attachmentFiles";
import type { useNoteAttachments } from "../lib/useNoteAttachments";
import { useThemeColors } from "../lib/theme";
import { Trash2 } from "./AppIcons";
import { AttachmentIcon } from "./AttachmentIcons";
import { FormDialog } from "./ui/FormDialog";
import { Button } from "./ui/Button";
import { Text } from "./ui/Typography";
import { ConfirmDialog } from "./ConfirmDialog";

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
const report = (error: unknown) => toast.error(error instanceof Error ? error.message : "Could not add attachment. Please try again.");

function AudioAttachment({ item, disabled }: { item: NoteAttachment; disabled: boolean }) {
  const colors = useThemeColors();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const ready = status.isLoaded;
  useEffect(() => {
    try { player.replace(materializeAttachment(item).uri); }
    catch (error) { report(error); }
  }, [item, player]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") player.pause(); });
    if (disabled) player.pause();
    return () => subscription.remove();
  }, [disabled, player]);
  return <Pressable disabled={disabled || !ready} accessibilityRole="button"
    accessibilityLabel={`${status.playing ? "Pause" : "Play"} ${item.name}`}
    onPress={() => {
      void (async () => {
        if (status.playing) player.pause();
        else {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
          if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) await player.seekTo(0);
          player.play();
        }
      })().catch(report);
    }} className="min-h-[48px] min-w-0 flex-1 flex-row items-center gap-3 py-2 disabled:opacity-50">
    <AttachmentIcon name={status.playing ? "pause" : "play"} color={colors.primary} />
    <View className="min-w-0 flex-1">
      <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{item.name}</Text>
      <Text className="text-xs text-muted-foreground">{ready ? `${time(status.currentTime)} / ${time(status.duration)}` : "Audio unavailable"}</Text>
    </View>
  </Pressable>;
}

export function NoteAttachments({ state, readOnly = false, disabled = false }: {
  state: ReturnType<typeof useNoteAttachments>; readOnly?: boolean; disabled?: boolean;
}) {
  const colors = useThemeColors();
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [preview, setPreview] = useState<NoteAttachment | null>(null);
  const [permissionNeeded, setPermissionNeeded] = useState<"audio" | "camera" | null>(null);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, bitRate: 64000 });
  const [durationMillis, setDurationMillis] = useState(0);
  // Native status polling is needed only while this dialog is recording.
  useEffect(() => {
    if (!recordingOpen) return;
    const timer = setInterval(() => setDurationMillis(recorder.getStatus().durationMillis), 250);
    return () => clearInterval(timer);
  }, [recorder, recordingOpen]);
  const endingRef = useRef(false);
  const { onChange, setBusy, valueRef, busyRef } = state;

  const append = useCallback((item: NoteAttachment) => {
    const next = [...valueRef.current, item];
    serializeAttachments(next);
    onChange(next);
  }, [onChange, valueRef]);

  const finishRecording = useCallback(async (keep: boolean) => {
    if (endingRef.current) return;
    endingRef.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        if (keep) append(await readAttachment(uri, `Voice ${new Date().toLocaleString().replace(/[/\\:]/g, "-")}.m4a`, "audio/mp4"));
        try { new File(uri).delete(); } catch { /* Cache cleanup is best effort. */ }
      }
    } catch (error) { report(error); }
    finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      setRecordingOpen(false);
      setBusy(false);
      endingRef.current = false;
    }
  }, [append, recorder, setBusy]);

  useEffect(() => {
    if (!recordingOpen) return;
    const subscription = AppState.addEventListener("change", next => {
      if (next !== "active") void finishRecording(true);
    });
    return () => subscription.remove();
  }, [finishRecording, recordingOpen]);
  useEffect(() => {
    if (recordingOpen && durationMillis >= 120000) void finishRecording(true);
  }, [durationMillis, recordingOpen, finishRecording]);

  const ensurePermission = async (kind: "audio" | "camera") => {
    let permission = kind === "audio" ? await getRecordingPermissionsAsync() : await ImagePicker.getCameraPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = kind === "audio" ? await requestRecordingPermissionsAsync() : await ImagePicker.requestCameraPermissionsAsync();
    }
    if (permission.granted) return true;
    if (!permission.canAskAgain) setPermissionNeeded(kind);
    else toast.error(kind === "audio" ? "Microphone access was not allowed. Tap Record voice to try again when ready." : "Camera access was not allowed. Tap Take photo to try again when ready.");
    return false;
  };

  const add = async (kind: "image" | "camera" | "audio" | "file") => {
    if (disabled || readOnly || busyRef.current) return;
    Keyboard.dismiss();
    setBusy(true);
    let recordingStarted = false;
    try {
      if (valueRef.current.length >= 10) throw new Error("A note can contain up to 10 attachments.");
      if (kind === "audio") {
        setDurationMillis(0);
        if (!await ensurePermission("audio")) return;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        recordingStarted = true;
        setRecordingOpen(true);
      } else if (kind === "file") {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (result.canceled) return;
        const asset = result.assets[0];
        append(await readAttachment(asset.uri, asset.name, asset.mimeType ?? "application/octet-stream"));
        try { new File(asset.uri).delete(); } catch { /* Provider may keep its copy locked. */ }
      } else {
        if (kind === "camera") {
          if (!await ensurePermission("camera")) return;
        }
        const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.65 };
        const result = kind === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled) return;
        const asset = result.assets[0];
        append(await readAttachment(asset.uri, asset.fileName ?? "Photo.jpg", asset.mimeType ?? "image/jpeg"));
      }
    } catch (error) { report(error); }
    finally {
      if (!recordingStarted) {
        if (kind === "audio") await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        setBusy(false);
      }
    }
  };

  useImperativeHandle(state.actionRef, () => ({ add }));

  const share = async (item: NoteAttachment) => {
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device.");
      await Sharing.shareAsync(materializeAttachment(item).uri, { mimeType: item.mimeType, dialogTitle: item.name });
    } catch (error) { report(error); }
  };

  return <View className={state.attachments.length > 0 ? "gap-3 px-5 pb-4" : undefined}>
    {state.attachments.map(item => <View key={item.id} className="overflow-hidden rounded-[18px] border border-border/60 bg-card">
      {item.kind === "image" && <Pressable onPress={() => { Keyboard.dismiss(); setPreview(item); }} accessibilityRole="button" accessibilityLabel={`View ${item.name}`}>
        <Image source={{ uri: `data:${item.mimeType};base64,${item.base64}` }} resizeMethod="resize" resizeMode="cover" style={{ width: "100%", height: 180 }} />
      </Pressable>}
      <View className="flex-row items-center gap-2 px-3">
        {item.kind === "audio" ? <AudioAttachment item={item} disabled={disabled || state.busy} /> : <Pressable onPress={() => void share(item)}
          accessibilityRole="button" accessibilityLabel={`Open or share ${item.name}`} className="min-h-[48px] min-w-0 flex-1 flex-row items-center gap-3 py-2">
          <AttachmentIcon name={item.kind === "image" ? "image" : "file"} color={colors.primary} />
          <Text className="min-w-0 flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>{item.name}</Text>
        </Pressable>}
        {!readOnly && <Pressable onPress={() => onChange(valueRef.current.filter(row => row.id !== item.id))}
          disabled={disabled || state.busy} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-secondary disabled:opacity-50">
          <Trash2 size={18} color={colors.mutedForeground} />
        </Pressable>}
      </View>
    </View>)}
    <FormDialog visible={recordingOpen} title="Recording voice" onClose={() => void finishRecording(false)}>
      <View className="items-center gap-3 py-4">
        <AttachmentIcon name="audio" size={36} color={colors.destructive} />
        <Text accessibilityLiveRegion="none" className="text-[32px] font-semibold text-foreground">{time(durationMillis / 1000)}</Text>
        <Text className="text-sm text-muted-foreground">Recording stops at 2 minutes.</Text>
      </View>
      <Button label="Stop & attach" onPress={() => void finishRecording(true)} />
      <Button variant="secondary" label="Discard recording" onPress={() => void finishRecording(false)} />
    </FormDialog>
    <FormDialog visible={preview !== null} title={preview?.name ?? "Image"} onClose={() => setPreview(null)}>
      {preview && <Image source={{ uri: `data:${preview.mimeType};base64,${preview.base64}` }} resizeMethod="resize" resizeMode="contain" style={{ width: "100%", height: 320 }} />}
      {preview && <Button label="Share image" variant="secondary" onPress={() => void share(preview)} />}
    </FormDialog>
    <ConfirmDialog visible={permissionNeeded !== null}
      title={permissionNeeded === "audio" ? "Microphone access is off" : "Camera access is off"}
      message={permissionNeeded === "audio"
        ? "To record a voice note, allow microphone access for My Notes in your phone settings. You can keep using notes without it."
        : "To take a photo, allow camera access for My Notes in your phone settings. You can still attach an existing image or use notes without it."}
      confirmLabel="Open app settings" cancelLabel="Not now" onClose={() => setPermissionNeeded(null)}
      onConfirm={async () => {
        try { await Linking.openSettings(); setPermissionNeeded(null); }
        catch { toast.error("Could not open app settings. Open system Settings and select My Notes."); }
      }} />
  </View>;
}

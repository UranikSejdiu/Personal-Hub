import { Stack } from "expo-router";
import { HubHeader } from "../../src/components/HubHeader";
import { useAppSwitching } from "../../src/hooks/useAppSwitching";

export default function NotesLayout() {
  const { handleAppSelect } = useAppSwitching("notes");

  return (
    <>
      <HubHeader activeAppId="notes" onAppSelect={handleAppSelect} />
      <Stack
        screenOptions={{ headerShown: false }}
        initialRouteName="(tabs)"
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="editor" />
      </Stack>
    </>
  );
}

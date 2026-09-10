import { View, Text } from 'react-native';
import DomSmokeTest from '../src/components/dom/DomSmokeTest';

// TEMPORARY smoke-test route for Expo DOM Components. Delete after verification.
export default function DomTestScreen() {
  return (
    <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
      <Text style={{ fontSize: 16, marginBottom: 12 }}>
        If the green box below renders, DOM Components work.
      </Text>
      <DomSmokeTest
        message="hello from native"
        dom={{ scrollEnabled: false }}
        onPing={async (payload: string) => {
          return `pong: ${payload}`;
        }}
      />
    </View>
  );
}

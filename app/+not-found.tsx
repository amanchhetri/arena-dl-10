import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>This screen doesn&apos;t exist.</Text>
        <Link href="/">Go home</Link>
      </View>
    </>
  );
}

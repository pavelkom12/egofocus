import { AppState } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { defaultDatabaseDirectory } from 'expo-sqlite';

type ActivityModule = {
  refresh(path: string, allowStart: boolean): Promise<void>;
  addListener(event: 'onChange', listener: () => void): { remove(): void };
};
const activity = requireOptionalNativeModule<ActivityModule>('EgoLiveActivity');
export async function refreshLiveActivity() {
  if (!activity) return; // Expo Go and older development builds.
  const directory = String(defaultDatabaseDirectory).replace(/^file:\/\//, '');
  await activity.refresh(
    decodeURIComponent(`${directory.replace(/\/$/, '')}/egofocus.db`),
    AppState.currentState === 'active',
  );
}
export function observeLiveActivity(refresh: () => void) {
  return activity?.addListener('onChange', refresh) ?? { remove() {} };
}

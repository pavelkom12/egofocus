// Native implementation is selected by Metro on iOS; web has no Live Activities.
export async function refreshLiveActivity() {}
export function observeLiveActivity(_refresh: () => void) {
  return { remove() {} };
}

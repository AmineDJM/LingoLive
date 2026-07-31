import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';

/**
 * Microphone permission.
 *
 * The status is re-checked when the app returns to the foreground, because a
 * user can revoke the permission in system settings while a session is open —
 * and a product that keeps showing "LIVE" after that would be lying.
 */
export type PermissionState = 'undetermined' | 'granted' | 'denied';

export function useAudioRecorderPermissions() {
  const [status, setStatus] = useState<PermissionState>('undetermined');

  const refresh = useCallback(async (): Promise<PermissionState> => {
    try {
      const result = await getRecordingPermissionsAsync();
      const next: PermissionState = result.granted
        ? 'granted'
        : result.canAskAgain
          ? 'undetermined'
          : 'denied';
      setStatus(next);
      return next;
    } catch {
      setStatus('denied');
      return 'denied';
    }
  }, []);

  const request = useCallback(async (): Promise<PermissionState> => {
    try {
      const result = await requestRecordingPermissionsAsync();
      const next: PermissionState = result.granted ? 'granted' : 'denied';
      setStatus(next);
      return next;
    } catch {
      setStatus('denied');
      return 'denied';
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { status, request, refresh };
}

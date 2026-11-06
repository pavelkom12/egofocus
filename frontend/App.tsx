import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { type Database } from './src/domain';
import { observeLiveActivity, refreshLiveActivity } from './src/liveActivity';
import { current, repository } from './src/repository';
import { Auth, Home, Profile, Statistics } from './src/screens';
import { Button, C, Glass, Icon, type IconName, Notice, S } from './src/ui';

function Root() {
  const [db, setDb] = useState<Database>();
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'home' | 'stats' | 'profile'>('home');
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const refreshing = useRef(false);
  const insets = useSafeAreaInsets();
  const refresh = useCallback(async () => {
    if (lock.current || refreshing.current) return;
    refreshing.current = true;
    const version = generation.current;
    const accept = (value: Database) => {
      if (version === generation.current && !lock.current) setDb(value);
    };
    try {
      accept(await repository.load());
      accept(await repository.sync());
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : 'Не удалось открыть данные.');
    } finally {
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const retry = setInterval(() => void refresh(), 30000);
    const online = () => void refresh();
    if (Platform.OS === 'web') window.addEventListener('online', online);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(Date.now());
        void refresh();
      }
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
        void refresh();
      }
    };
    if (Platform.OS === 'web')
      document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      clearInterval(retry);
      if (Platform.OS === 'web') window.removeEventListener('online', online);
      sub.remove();
      if (Platform.OS === 'web')
        document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  async function run(operation: () => Promise<Database>) {
    if (lock.current) return false;
    generation.current++;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      setDb(await operation());
      setNow(Date.now());
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось сохранить изменения.',
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!db) return;
    // Read the committed database natively, never push a potentially stale React snapshot.
    void refreshLiveActivity().catch((e: unknown) => {
      console.warn('Live Activity:', e);
    });
  }, [db]);
  useEffect(() => {
    const subscription = observeLiveActivity(() => void refresh());
    return () => subscription.remove();
  }, [refresh]);
  const account = db && current(db);
  return (
    <SafeAreaView style={S.page} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      {!db ? (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 20,
            padding: 24,
          }}
        >
          {error ? (
            <>
              <Notice message={error} />
              <Button title="Повторить" onPress={() => void refresh()} />
            </>
          ) : (
            <ActivityIndicator color={C.green} />
          )}
        </View>
      ) : !account ? (
        <Auth
          onChange={(value) => {
            generation.current++;
            setDb(value);
            setTab('home');
            setError('');
          }}
        />
      ) : (
        <>
          {!!db.syncNotice && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}>
              <Notice message={db.syncNotice} />
              {db.conflict && (
                <>
                  <Text style={S.subtitle}>
                    Какую версию использовать для спорных участков?
                  </Text>
                  <Button
                    disabled={busy}
                    title="С этого устройства"
                    onPress={() => void run(() => repository.sync('local'))}
                  />
                  <Button
                    disabled={busy}
                    secondary
                    title="С сервера"
                    onPress={() => void run(() => repository.sync('server'))}
                  />
                </>
              )}
            </View>
          )}
          {!!error && (
            <View
              style={{
                padding: 16,
                maxWidth: 560,
                width: '100%',
                alignSelf: 'center',
              }}
            >
              <Notice message={error} />
            </View>
          )}
          {tab === 'home' ? (
            <Home account={account} now={now} run={run} busy={busy} />
          ) : tab === 'stats' ? (
            <Statistics account={account} now={now} />
          ) : (
            <Profile key={account.id} account={account} run={run} busy={busy} />
          )}
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              bottom: Math.max(18, insets.bottom),
              left: 24,
              right: 24,
              alignItems: 'center',
            }}
          >
            <Glass
              style={{
                flexDirection: 'row',
                width: '100%',
                maxWidth: 390,
                padding: 6,
              }}
            >
              {(
                [
                  ['home', 'Фокус', 'focus'],
                  ['stats', 'Статистика', 'stats'],
                  ['profile', 'Профиль', 'person'],
                ] as [typeof tab, string, IconName][]
              ).map(([key, label, icon]) => (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: tab === key }}
                  onPress={() => {
                    setTab(key);
                    setError('');
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 57,
                    borderRadius: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    backgroundColor: tab === key ? '#55806b38' : 'transparent',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Icon
                    name={icon}
                    color={tab === key ? C.green : '#a1b5a9'}
                    size={21}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: tab === key ? '600' : '400',
                      color: tab === key ? C.green : '#a1b5a9',
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </Glass>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

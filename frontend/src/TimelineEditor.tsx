import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  VirtualizedList,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  type Account,
  type Database,
  type Interval,
  type Mode,
  type Transition,
  changedRanges,
  clockTime,
  duration,
  fullDate,
  names,
  paintRange,
} from './domain';
import { repository } from './repository';
import { Button, C, Field, Notice, S } from './ui';

const colors = { focus: C.green, rest: C.rest, unknown: C.unknown };
const uuid = () => Crypto.randomUUID();
const stamp = (at: number) => fullDate(at) + ' ' + clockTime(at);
function parseStamp(value: string) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    value.trim(),
  );
  if (!m) throw new Error('Формат времени: ДД.ММ.ГГГГ ЧЧ:ММ:СС.');
  const [, d, mo, y, h, mi, s] = m;
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  if (
    date.getFullYear() !== +y ||
    date.getMonth() !== +mo - 1 ||
    date.getDate() !== +d ||
    date.getHours() !== +h ||
    date.getMinutes() !== +mi ||
    date.getSeconds() !== +s
  )
    throw new Error('Проверьте дату и время.');
  return +date;
}
type Selection = {
  from: number;
  to: number;
  mode: Mode;
  base: Transition[];
  originalFrom: number;
  originalTo: number;
};

function Handle({
  label,
  at,
  min,
  max,
  scale,
  onMove,
  onMenu,
  onDragging,
}: {
  label: string;
  at: number;
  min: number;
  max: number;
  scale: number;
  onMove: (time: number) => void;
  onMenu: () => void;
  onDragging: (value: boolean) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef(at);
  const menuOpened = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // PanResponder stores these callbacks; refs are only accessed during gestures.
  // eslint-disable-next-line react-hooks/refs
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      origin.current = at;
      menuOpened.current = false;
      onDragging(true);
      timer.current = setTimeout(() => {
        menuOpened.current = true;
        onMenu();
        onDragging(false);
      }, 550);
    },
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) clear();
      if (!menuOpened.current && Math.abs(gesture.dx) > 3)
        onMove(
          Math.max(
            min,
            Math.min(
              max,
              Math.round((origin.current + gesture.dx * scale) / 1000) * 1000,
            ),
          ),
        );
    },
    onPanResponderRelease: () => {
      clear();
      onDragging(false);
    },
    onPanResponderTerminate: () => {
      clear();
      onDragging(false);
    },
    onPanResponderTerminationRequest: () => false,
  });
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: stamp(at) }}
      accessibilityActions={[
        { name: 'increment' },
        { name: 'decrement' },
        { name: 'activate' },
      ]}
      onAccessibilityAction={(e) =>
        e.nativeEvent.actionName === 'activate'
          ? onMenu()
          : onMove(
              Math.max(
                min,
                Math.min(
                  max,
                  at +
                    (e.nativeEvent.actionName === 'increment' ? 60000 : -60000),
                ),
              ),
            )
      }
      style={T.handle}
    >
      <View style={T.handleLine} />
      <View style={T.handleLine} />
    </View>
  );
}

export function TimelineEditor({
  account,
  item,
  remove,
  onClose,
  onSave,
}: {
  account: Account;
  item: Interval;
  remove: boolean;
  onClose: () => void;
  onSave: (db: Database) => void;
}) {
  const [snapshot] = useState(() => account);
  const [limit] = useState(() => Date.now());
  const [draft, setDraft] = useState<Transition[]>(() =>
    remove
      ? paintRange(
          account.transitions,
          account.bornAt,
          Date.now(),
          item.at,
          item.end,
          'unknown',
          uuid,
        )
      : account.transitions,
  );
  const initialSelection = (): Selection => ({
    from: item.at,
    to: item.end,
    mode: item.mode,
    base: snapshot.transitions,
    originalFrom: item.at,
    originalTo: item.end,
  });
  const [selection, setSelection] = useState<Selection>(() => ({
    ...initialSelection(),
    mode: remove ? 'unknown' : item.mode,
  }));
  const [fromText, setFromText] = useState(() => stamp(item.at));
  const [toText, setToText] = useState(() => stamp(item.end));
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [width, setWidth] = useState(300);
  const [hours, setHours] = useState(6);
  const list = useRef<InstanceType<typeof VirtualizedList>>(null);
  const [anchor, setAnchor] = useState(() =>
    Math.floor((item.at + item.end) / 2),
  );
  const span = hours * 3600000;
  const origin = snapshot.bornAt;
  const count = Math.max(1, Math.ceil((limit - origin) / span));
  const initialIndex = Math.min(
    count - 1,
    Math.max(0, Math.floor((anchor - origin) / span)),
  );
  const before = useMemo(
    () => changedRanges(snapshot.transitions, draft, limit),
    [snapshot, draft, limit],
  );
  const changed = before.length > 0;

  function select(range: Interval, openMenu = false) {
    setSelection({
      from: range.at,
      to: range.end,
      mode: range.mode,
      base: draft,
      originalFrom: range.at,
      originalTo: range.end,
    });
    setFromText(stamp(range.at));
    setToText(stamp(range.end));
    setError('');
    setMenu(openMenu);
  }
  function preview(from: number, to: number, mode = selection.mode) {
    try {
      let next = paintRange(
        selection.base,
        origin,
        limit,
        selection.originalFrom,
        selection.originalTo,
        'unknown',
        uuid,
      );
      next = paintRange(next, origin, limit, from, to, mode, uuid);
      setDraft(next);
      setSelection({ ...selection, from, to, mode });
      setFromText(stamp(from));
      setToText(stamp(to));
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось изменить интервал.',
      );
    }
  }
  function reset() {
    setDraft(snapshot.transitions);
    setSelection(initialSelection());
    setFromText(stamp(item.at));
    setToText(stamp(item.end));
    setError('');
    setMenu(false);
  }
  function go(at: number) {
    list.current?.scrollToIndex({
      index: Math.min(count - 1, Math.max(0, Math.floor((at - origin) / span))),
      animated: false,
    });
  }
  async function save() {
    if (saving.current || !changed) return;
    if (fromText !== stamp(selection.from) || toText !== stamp(selection.to)) {
      setError('Сначала примените введённые границы.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      onSave(
        await repository.saveHistory(
          snapshot.id,
          snapshot.revision,
          draft,
          limit,
        ),
      );
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Не удалось сохранить историю.',
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const segments = useMemo(
    () =>
      draft.map((event, i) => ({
        ...event,
        end: Math.min(limit, draft[i + 1]?.at ?? limit),
      })),
    [draft, limit],
  );
  function page(index: number) {
    const start = origin + index * span,
      end = Math.min(limit, start + span);
    const position = (time: number) =>
      Math.max(0, Math.min(width, ((time - start) / span) * width));
    const visible = segments.filter((r) => r.at < end && r.end > start);
    return (
      <View style={{ width, height: 202 }}>
        <Text style={T.pageDate}>{stamp(start)}</Text>
        <View style={T.track}>
          {visible.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={
                names[r.mode] + ', ' + stamp(r.at) + ' — ' + stamp(r.end)
              }
              onPress={() => select(r)}
              onLongPress={() => select(r, true)}
              delayLongPress={550}
              style={{
                position: 'absolute',
                left: position(r.at),
                width: Math.max(1, position(r.end) - position(r.at)),
                height: 54,
                backgroundColor: colors[r.mode],
                opacity:
                  selection.from < r.end && selection.to > r.at ? 0.85 : 0.4,
                borderRightWidth: 1,
                borderRightColor: C.bg,
              }}
            />
          ))}
          {selection.to > start && selection.from < end && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: position(selection.from),
                width: position(selection.to) - position(selection.from),
                top: -3,
                height: 60,
                borderWidth: 2,
                borderColor: C.text,
                borderRadius: 3,
              }}
            />
          )}
        </View>
        {(['from', 'to'] as const).map((edge) => {
          const at = selection[edge];
          if (at < start || at > end || (at === end && index < count - 1))
            return null;
          return (
            <View
              key={edge}
              style={{
                position: 'absolute',
                zIndex: 3,
                left: Math.max(0, Math.min(width - 28, position(at) - 14)),
                top: edge === 'from' ? 35 : 70,
              }}
            >
              <Handle
                label={edge === 'from' ? 'Начало интервала' : 'Конец интервала'}
                at={at}
                min={edge === 'from' ? origin : selection.from + 1000}
                max={edge === 'from' ? selection.to - 1000 : limit}
                scale={span / width}
                onMove={(time) =>
                  preview(
                    edge === 'from' ? time : selection.from,
                    edge === 'to' ? time : selection.to,
                  )
                }
                onMenu={() => setMenu(true)}
                onDragging={setDragging}
              />
            </View>
          );
        })}
        <View style={T.ticks}>
          {[0, 1, 2, 3].map((tick) => (
            <Text key={tick} style={T.tick}>
              {clockTime(start + (span * tick) / 4).slice(0, 5)}
            </Text>
          ))}
        </View>
        {changed && (
          <>
            <Text style={T.beforeLabel}>До изменений</Text>
            <View style={T.beforeTrack}>
              {before
                .filter((r) => r.at < end && r.end > start)
                .map((r) => (
                  <View
                    key={r.id}
                    accessibilityLabel={'Было: ' + names[r.mode]}
                    style={{
                      position: 'absolute',
                      left: position(r.at),
                      width: Math.max(1, position(r.end) - position(r.at)),
                      height: 14,
                      borderRadius: 3,
                      backgroundColor: colors[r.mode],
                    }}
                  />
                ))}
            </View>
          </>
        )}
      </View>
    );
  }
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="slide"
      onRequestClose={() => {
        if (!saving.current) onClose();
      }}
    >
      <SafeAreaProvider>
        <SafeAreaView style={T.overlay}>
          <View style={T.sheet} accessibilityViewIsModal>
            <View style={T.heading}>
              <Text style={S.section}>Редактор истории</Text>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Закрыть без сохранения"
                onPress={onClose}
                style={T.close}
              >
                <Text style={{ color: C.text, fontSize: 28 }}>×</Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              scrollEnabled={!dragging}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <Text
                style={[S.subtitle, { paddingHorizontal: 20, fontSize: 12 }]}
              >
                Передвигайте границы. Удерживайте ползунок для выбора состояния.
              </Text>
              <View style={T.zoom}>
                {[1, 6, 24].map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => {
                      setAnchor(selection.from);
                      setHours(h);
                    }}
                    style={[T.chip, hours === h && { borderColor: C.green }]}
                  >
                    <Text style={{ color: hours === h ? C.green : C.muted }}>
                      {h} ч
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View
                onLayout={(e) =>
                  setWidth(Math.max(1, e.nativeEvent.layout.width))
                }
              >
                <VirtualizedList
                  key={hours + '-' + width}
                  ref={list}
                  horizontal
                  data={null}
                  getItem={(_, index) => index}
                  getItemCount={() => count}
                  initialScrollIndex={initialIndex}
                  getItemLayout={(_, index) => ({
                    length: width,
                    offset: width * index,
                    index,
                  })}
                  renderItem={({ item: index }) => page(index)}
                  keyExtractor={(index) => String(index)}
                  initialNumToRender={3}
                  maxToRenderPerBatch={3}
                  windowSize={5}
                  scrollEnabled={!dragging && !busy}
                  showsHorizontalScrollIndicator
                  extraData={{ draft, selection, before, width }}
                />
              </View>
              <View style={{ paddingHorizontal: 20, gap: 14 }}>
                <View style={T.legend}>
                  {(['focus', 'rest', 'unknown'] as Mode[]).map((mode) => (
                    <Text
                      key={mode}
                      style={{ fontSize: 12, color: colors[mode] }}
                    >
                      ● {names[mode]}
                    </Text>
                  ))}
                </View>
                <View style={S.row}>
                  <Text style={{ color: C.text, fontSize: 15 }}>
                    {names[selection.mode]} ·{' '}
                    {duration(selection.to - selection.from)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setMenu(!menu)}
                    style={T.chip}
                  >
                    <Text style={{ color: C.green }}>Действия</Text>
                  </Pressable>
                </View>
                {menu && (
                  <View style={T.menu}>
                    {(['focus', 'rest', 'unknown'] as Mode[]).map((mode) => (
                      <Pressable
                        key={mode}
                        disabled={busy}
                        onPress={() => {
                          preview(selection.from, selection.to, mode);
                          setMenu(false);
                        }}
                        style={T.menuRow}
                      >
                        <Text style={{ color: colors[mode], fontSize: 15 }}>
                          {names[mode]}
                        </Text>
                      </Pressable>
                    ))}
                    <Pressable
                      disabled={busy}
                      onPress={() => {
                        preview(selection.from, selection.to, 'unknown');
                        setMenu(false);
                      }}
                      style={T.menuRow}
                    >
                      <Text style={{ color: '#efaaa4', fontSize: 15 }}>
                        Удалить → Нет данных
                      </Text>
                    </Pressable>
                  </View>
                )}
                <Field
                  label="Начало"
                  value={fromText}
                  onChangeText={setFromText}
                  editable={!busy}
                  placeholder="ДД.ММ.ГГГГ ЧЧ:ММ:СС"
                />
                <Field
                  label="Конец"
                  value={toText}
                  onChangeText={setToText}
                  editable={!busy}
                  placeholder="ДД.ММ.ГГГГ ЧЧ:ММ:СС"
                />
                <View style={T.legend}>
                  <Pressable onPress={() => go(selection.from)} style={T.chip}>
                    <Text style={{ color: C.muted }}>К началу</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => go(selection.to - 1)}
                    style={T.chip}
                  >
                    <Text style={{ color: C.muted }}>К концу</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => {
                      try {
                        preview(parseStamp(fromText), parseStamp(toText));
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : 'Проверьте время.',
                        );
                      }
                    }}
                    style={T.chip}
                  >
                    <Text style={{ color: C.green }}>Применить границы</Text>
                  </Pressable>
                </View>
                <Notice message={error} />
                <Text style={[S.subtitle, { fontSize: 12 }]}>
                  При сужении интервала освобождённое время становится «Нет
                  данных». Изменения сохранятся только по кнопке ниже.
                </Text>
              </View>
            </ScrollView>
            <View style={T.footer}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Отменить"
                  secondary
                  disabled={busy}
                  onPress={reset}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={busy ? 'Сохраняем…' : 'Сохранить'}
                  disabled={busy || !changed || dragging}
                  onPress={() => void save()}
                />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
const T = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.bg },
  sheet: { flex: 1, width: '100%', backgroundColor: C.bg, overflow: 'hidden' },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  close: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoom: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginVertical: 16,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
  },
  pageDate: { color: C.muted, fontSize: 12, padding: 8 },
  track: { height: 54, marginTop: 16, backgroundColor: '#17211c' },
  handle: {
    width: 28,
    height: 42,
    borderRadius: 9,
    backgroundColor: '#e0f5e8',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#527f66',
  },
  handleLine: {
    width: 2,
    height: 16,
    borderRadius: 1,
    backgroundColor: '#345343',
  },
  ticks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingHorizontal: 6,
  },
  tick: { color: C.muted, fontSize: 11 },
  beforeLabel: {
    fontSize: 10,
    color: C.muted,
    marginTop: 12,
    marginBottom: 5,
    paddingLeft: 6,
  },
  beforeTrack: { height: 14, backgroundColor: '#101914' },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  menu: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  menuRow: { paddingVertical: 12 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
});

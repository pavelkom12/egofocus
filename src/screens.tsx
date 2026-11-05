import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  type Account,
  type Database,
  type Interval,
  type Metric,
  type Mode,
  names,
  timer,
  duration,
  intervals,
  clockTime,
  fullDate,
  dayLabel,
  startOfDay,
  totals,
  rangeStart,
} from './domain';
import { repository } from './repository';
import { TimerBackdrop } from './TimerBackdrop';
import { BalanceChart, DailyChart } from './StatisticsCharts';
import { Button, C, Field, Icon, Notice, S } from './ui';

type Run = (operation: () => Promise<Database>) => Promise<boolean>;
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Не удалось выполнить действие.';
export function Auth({ onChange }: { onChange: (db: Database) => void }) {
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birthday, setBirthday] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function openDemo() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onChange(await repository.createDemo());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (register && password !== confirm)
        throw new Error('Пароли не совпадают.');
      onChange(
        await (register
          ? repository.register(username, password, birthday)
          : repository.login(username, password)),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[S.content, { paddingTop: 58, paddingBottom: 48 }]}
    >
      <View style={L.brand}>
        <Icon name="focus" color={C.green} size={25} />
        <Text style={S.eyebrow}>EGO FOCUS</Text>
      </View>
      <Text style={[S.title, { fontSize: 40, marginTop: 38, lineHeight: 46 }]}>
        {register ? 'Время для себя.' : 'С возвращением.'}
      </Text>
      <Text style={[S.subtitle, { marginTop: 12, marginBottom: 32 }]}>
        {register
          ? 'Замечайте свой ритм. Находите баланс\nмежду фокусом и отдыхом.'
          : 'Ваш фокус, отдых и всё время между ними.'}
      </Text>
      <View style={{ gap: 18 }}>
        <Field
          label="Имя пользователя"
          placeholder="Например, alex"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          maxLength={24}
          editable={!busy}
        />
        {register && (
          <Field
            label="Дата рождения"
            placeholder="ДД.ММ.ГГГГ"
            value={birthday}
            onChangeText={setBirthday}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            editable={!busy}
          />
        )}
        <Field
          label="Пароль"
          placeholder={register ? 'Не менее 8 символов' : 'Введите пароль'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={register ? 'new-password' : 'current-password'}
          maxLength={128}
          editable={!busy}
          onSubmitEditing={() => {
            if (!register) void submit();
          }}
        />
        {register && (
          <Field
            label="Повторите пароль"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            maxLength={128}
            editable={!busy}
          />
        )}
        <Notice message={error} />
        <Button
          title={busy ? 'Подождите…' : register ? 'Создать профиль' : 'Войти'}
          onPress={() => void submit()}
          disabled={busy}
          icon="arrow"
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setRegister(!register);
            setError('');
            setPassword('');
            setConfirm('');
          }}
          style={{ padding: 12 }}
        >
          <Text style={{ color: C.green, textAlign: 'center', fontSize: 14 }}>
            {register
              ? 'Уже есть профиль? Войти'
              : 'Нет профиля? Зарегистрироваться'}
          </Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 20, gap: 10 }}>
        <Button
          title="Попробовать с демоданными"
          secondary
          disabled={busy}
          onPress={() => void openDemo()}
        />
        <Text style={[S.subtitle, { fontSize: 12 }]}>
          Отдельный профиль с историей за 28 дней. Пароль: demo12345. Ваши
          данные сохранятся.
        </Text>
      </View>
      <View style={[L.localNote, { marginTop: 30 }]}>
        <View style={L.dot} />
        <Text style={[S.subtitle, { fontSize: 12, flex: 1 }]}>
          Пока профиль и история хранятся только на этом устройстве. Локальный
          вход работает без интернета.
        </Text>
      </View>
    </ScrollView>
  );
}

function HistoryRow({
  item,
  now,
  previous,
}: {
  item: Interval;
  now: number;
  previous?: Interval;
}) {
  const date = dayLabel(item.at, now);
  const divider =
    date && (!previous || startOfDay(previous.at) !== startOfDay(item.at));
  const color =
    item.mode === 'focus' ? C.green : item.mode === 'rest' ? C.rest : C.unknown;
  return (
    <View>
      {!!divider && (
        <View style={L.dayDivider}>
          <Text style={L.dayText}>{date}</Text>
          <View style={L.dividerLine} />
        </View>
      )}
      <View style={L.historyRow}>
        <View style={L.historyName}>
          <View style={[L.stateDot, { backgroundColor: color }]} />
          <Text style={L.historyLabel}>{names[item.mode]}</Text>
        </View>
        <View style={L.historyDetails}>
          <Text style={L.historyDuration}>{duration(item.end - item.at)}</Text>
          <Text style={L.historyTime}>
            {clockTime(item.at)} — {clockTime(item.end)}
          </Text>
        </View>
        <View style={L.historyActions}>
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityLabel="Изменить запись — скоро"
            accessibilityState={{ disabled: true }}
            style={L.historyAction}
          >
            <Icon name="edit" size={16} color="#71867b" />
          </Pressable>
          <Pressable
            disabled
            accessibilityRole="button"
            accessibilityLabel="Удалить запись — скоро"
            accessibilityState={{ disabled: true }}
            style={L.historyAction}
          >
            <Icon name="trash" size={16} color="#71867b" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function Home({
  account,
  now,
  run,
  busy,
}: {
  account: Account;
  now: number;
  run: Run;
  busy: boolean;
}) {
  const [count, setCount] = useState(20);
  const active = account.transitions[account.transitions.length - 1];
  const all = intervals(account, now).slice(0, -1).reverse();
  const rest = active.mode === 'rest';
  const next: Mode = active.mode === 'focus' ? 'rest' : 'focus';
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={S.content}
      data={all.slice(0, count)}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => (
        <HistoryRow item={item} now={now} previous={all[index - 1]} />
      )}
      onEndReached={() => {
        if (count < all.length) setCount((c) => c + 20);
      }}
      onEndReachedThreshold={0.25}
      ListHeaderComponent={
        <>
          <View style={L.brand}>
            <Icon name="focus" color={C.green} size={20} />
            <Text style={S.eyebrow}>EGO FOCUS</Text>
          </View>
          <View style={[S.row, { marginTop: 20, marginBottom: 26 }]}>
            <Text style={S.title}>Сейчас</Text>
            <Text style={L.dateBadge}>
              {new Date(now).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
              })}
            </Text>
          </View>
          <View style={L.timerCard}>
            <TimerBackdrop mode={active.mode} />
            <View style={S.row}>
              <View style={L.modeBadge}>
                <View
                  style={[
                    L.stateDot,
                    {
                      backgroundColor: rest
                        ? C.rest
                        : active.mode === 'focus'
                          ? C.green
                          : C.muted,
                    },
                  ]}
                />
                <Text style={{ color: '#d0e7d9', fontSize: 13 }}>
                  {names[active.mode]}
                </Text>
              </View>
              <Icon
                name={rest ? 'rest' : 'focus'}
                color={rest ? C.rest : '#9cd8b7'}
                size={23}
              />
            </View>
            <View style={L.timerCenter}>
              <Text adjustsFontSizeToFit numberOfLines={1} style={L.timer}>
                {active.mode === 'unknown' ? '—:—' : timer(now - active.at)}
              </Text>
            </View>
            <Text style={L.timerMeta}>Начато: {clockTime(active.at)}</Text>
          </View>
          <View style={{ marginTop: 14 }}>
            <Button
              title={
                busy
                  ? 'Сохраняем…'
                  : next === 'focus'
                    ? 'Начать фокус'
                    : 'Перейти к отдыху'
              }
              icon={next === 'focus' ? 'focus' : 'rest'}
              disabled={busy}
              onPress={() =>
                void run(() => repository.switch(account.id, next))
              }
            />
          </View>
          <View style={L.rule} />
        </>
      }
      ListEmptyComponent={
        <View
          style={[
            S.card,
            {
              marginTop: 18,
              alignItems: 'center',
              gap: 12,
              paddingVertical: 32,
            },
          ]}
        >
          <Icon name="focus" color={C.muted} size={28} />
          <Text style={{ color: C.text, fontSize: 16 }}>
            Всё начинается с момента
          </Text>
          <Text style={[S.subtitle, { textAlign: 'center' }]}>
            Здесь появятся завершённые состояния.\nДо первого фокуса — «Нет
            данных».
          </Text>
        </View>
      }
      ListFooterComponent={
        all.length ? (
          <Text style={L.footer}>
            {count < all.length
              ? 'Прокрутите, чтобы увидеть ещё'
              : 'Каждому моменту — своё состояние'}
          </Text>
        ) : undefined
      }
    />
  );
}

export function Statistics({
  account,
  now,
}: {
  account: Account;
  now: number;
}) {
  const [range, setRange] = useState<'day' | 'week' | 'all'>('day');
  const start = rangeStart(range, account, now);
  const result = totals(account, start, now);
  const total = result.focus + result.rest + result.unknown;
  const percentage = total ? (result.focus / total) * 100 : 0;
  const metric = account.metric;
  return (
    <ScrollView contentContainerStyle={S.content}>
      <Text style={S.eyebrow}>ВРЕМЯ В ДЕТАЛЯХ</Text>
      <Text style={[S.title, { marginTop: 16, marginBottom: 26 }]}>
        Статистика
      </Text>
      <LinearGradient
        colors={['#1e392d', '#13241d']}
        style={[S.card, { minHeight: 204 }]}
      >
        <Text style={{ color: '#afc9ba', fontSize: 14 }}>
          {metric === 'percentage'
            ? 'Доля фокуса'
            : metric === 'focus'
              ? 'Время в фокусе'
              : 'Время отдыха'}
        </Text>
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={{
            color: C.green,
            fontSize: 54,
            fontWeight: '500',
            letterSpacing: -2,
            marginTop: 20,
            marginBottom: 16,
          }}
        >
          {metric === 'percentage'
            ? percentage.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) +
              ' %'
            : duration(result[metric])}
        </Text>
        <Text style={S.subtitle}>
          {metric === 'percentage'
            ? 'От всего времени выбранного периода'
            : 'За выбранный период'}
        </Text>
      </LinearGradient>
      <View style={L.segment}>
        {(
          [
            ['day', 'Сегодня'],
            ['week', 'Неделя'],
            ['all', 'Всё время'],
          ] as const
        ).map(([key, title]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: range === key }}
            onPress={() => setRange(key)}
            style={[L.segmentItem, range === key && L.segmentActive]}
          >
            <Text
              style={{
                color: range === key ? C.text : C.muted,
                fontSize: 14,
                fontWeight: range === key ? '600' : '400',
              }}
            >
              {title}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[S.subtitle, { marginBottom: 20 }]}>
        {range === 'day'
          ? 'Сегодня, с начала дня'
          : range === 'week'
            ? 'Эта неделя, с понедельника'
            : 'С даты рождения'}{' '}
        · {fullDate(start)}
      </Text>
      <BalanceChart result={result} />
      <DailyChart account={account} start={start} now={now} />
    </ScrollView>
  );
}

export function Profile({
  account,
  run,
  busy,
}: {
  account: Account;
  run: Run;
  busy: boolean;
}) {
  const [username, setUsername] = useState(account.username);
  const [email, setEmail] = useState(account.email);
  const [metric, setMetric] = useState<Metric>(account.metric);
  const [oldPassword, setOldPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save() {
    setMessage('');
    setError('');
    if (
      await run(() => repository.profile(account.id, username, email, metric))
    )
      setMessage('Изменения сохранены');
  }
  async function changePassword() {
    setMessage('');
    setError('');
    if (password !== confirm) {
      setError('Пароли не совпадают.');
      return;
    }
    if (
      await run(() => repository.password(account.id, oldPassword, password))
    ) {
      setMessage('Пароль изменён');
      setOldPassword('');
      setPassword('');
      setConfirm('');
    }
  }
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={S.content}
    >
      <Text style={S.eyebrow}>ЛИЧНОЕ ПРОСТРАНСТВО</Text>
      <Text style={[S.title, { marginTop: 16, marginBottom: 28 }]}>
        Профиль
      </Text>
      <View
        style={{
          flexDirection: 'row',
          gap: 16,
          alignItems: 'center',
          marginBottom: 30,
        }}
      >
        <View style={L.avatar}>
          <Text style={{ color: C.green, fontSize: 28, fontWeight: '500' }}>
            {account.username[0].toLocaleUpperCase('ru-RU')}
          </Text>
        </View>
        <View>
          <Text style={S.section}>@{account.username}</Text>
          <Text style={[S.subtitle, { marginTop: 5 }]}>
            Дата рождения · {account.birthday}
          </Text>
        </View>
      </View>
      <View style={[S.card, { gap: 18 }]}>
        <Text style={S.section}>Личные данные</Text>
        <Field
          label="Имя пользователя"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          maxLength={24}
          editable={!busy}
        />
        <Field
          label="Электронная почта"
          value={email}
          onChangeText={setEmail}
          placeholder="Не указана"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!busy}
        />
        <Text style={[S.subtitle, { fontSize: 12 }]}>
          Почта сохраняется в профиле. Вход — по имени пользователя.
        </Text>
        <Text style={[S.label, { marginTop: 4 }]}>
          Главный показатель статистики
        </Text>
        {(
          [
            ['percentage', 'Доля фокуса'],
            ['focus', 'Время в фокусе'],
            ['rest', 'Время отдыха'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ checked: metric === key }}
            onPress={() => setMetric(key)}
            style={S.row}
          >
            <Text
              style={{
                color: metric === key ? C.green : C.muted,
                fontSize: 15,
              }}
            >
              {label}
            </Text>
            <View style={[L.radio, metric === key && { borderColor: C.green }]}>
              {metric === key && (
                <View style={[L.stateDot, { backgroundColor: C.green }]} />
              )}
            </View>
          </Pressable>
        ))}
        <Button
          title="Сохранить изменения"
          disabled={busy}
          onPress={() => void save()}
        />
      </View>
      <View style={{ marginVertical: 14, gap: 6 }}>
        <Notice message={message} good />
        <Notice message={error} />
      </View>
      <View style={[S.card, { gap: 18 }]}>
        <Text style={S.section}>Сменить пароль</Text>
        <Field
          label="Текущий пароль"
          value={oldPassword}
          onChangeText={setOldPassword}
          secureTextEntry
          maxLength={128}
          editable={!busy}
        />
        <Field
          label="Новый пароль"
          placeholder="Не менее 8 символов"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          maxLength={128}
          editable={!busy}
        />
        <Field
          label="Повторите новый пароль"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          maxLength={128}
          editable={!busy}
        />
        <Button
          title="Обновить пароль"
          secondary
          disabled={busy}
          onPress={() => void changePassword()}
        />
      </View>
      <View style={[L.localNote, { marginVertical: 24 }]}>
        <View style={L.dot} />
        <Text style={[S.subtitle, { flex: 1, fontSize: 12 }]}>
          Данные на этом устройстве. Синхронизация с сервером появится позже.
          Очистка данных приложения или сайта удалит локальную историю.
        </Text>
      </View>
      <Button
        title="Выйти из профиля"
        icon="logout"
        secondary
        disabled={busy}
        onPress={() => void run(repository.logout)}
      />
      <View style={[S.card, { marginTop: 22, gap: 14 }]}>
        <Text style={S.section}>Данные для проверки</Text>
        <Text style={S.subtitle}>
          Отдельный профиль с историей за 28 дней. Ваши текущие данные
          сохранятся.
        </Text>
        <Button
          title="Создать демопрофиль"
          secondary
          disabled={busy}
          onPress={() => void run(repository.createDemo)}
        />
        <Text style={[S.subtitle, { fontSize: 12 }]}>
          Имя нового профиля появится сверху. Пароль: demo12345. Каждое нажатие
          создаёт новый профиль.
        </Text>
      </View>
      {busy && <ActivityIndicator color={C.green} style={{ marginTop: 14 }} />}
    </ScrollView>
  );
}

const L = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBadge: {
    color: '#92aa9b',
    fontSize: 13,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
  },
  timerCard: {
    borderRadius: 28,
    overflow: 'hidden',
    padding: 24,
    minHeight: 280,
    borderWidth: 1,
    borderColor: '#355542',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#071b1b35',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  stateDot: { width: 6, height: 6, borderRadius: 3 },

  timerCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  timer: {
    color: '#f1f8f4',
    fontSize: 112,
    lineHeight: 128,
    fontWeight: '300',
    letterSpacing: -4,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    width: '100%',
    includeFontPadding: false,
    textShadowColor: '#05140f80',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 18,
  },
  timerMeta: { color: '#a0b5a8', fontSize: 12, fontVariant: ['tabular-nums'] },
  rule: { height: 1, backgroundColor: C.line, marginTop: 22, marginBottom: 10 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    paddingVertical: 6,
    gap: 10,
  },
  historyName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    width: 90,
  },
  historyLabel: { color: C.text, fontSize: 14, flexShrink: 1 },
  historyDetails: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    columnGap: 14,
    rowGap: 3,
  },
  historyDuration: {
    color: '#b4c6bc',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  historyTime: {
    color: '#718b7d',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  historyActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  historyAction: {
    width: 26,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.65,
  },
  dayDivider: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 5,
  },
  dayText: { fontSize: 12, color: '#718c7d' },
  dividerLine: { height: 1, flex: 1, backgroundColor: C.line },
  footer: {
    textAlign: 'center',
    color: '#536f60',
    fontSize: 11,
    marginTop: 28,
  },
  segment: {
    flexDirection: 'row',
    gap: 5,
    borderRadius: 16,
    backgroundColor: '#111c16',
    borderWidth: 1,
    borderColor: C.line,
    padding: 5,
    marginTop: 22,
    marginBottom: 16,
  },
  segmentItem: {
    flex: 1,
    minHeight: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  segmentActive: { backgroundColor: '#2b4235' },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 23,
    backgroundColor: '#19382a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#335743',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.green,
    marginTop: 8,
  },
});

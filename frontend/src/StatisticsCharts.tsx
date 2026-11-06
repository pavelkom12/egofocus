import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { type Account, type Mode, names, startOfDay } from './domain';
import { dailyAverage } from './statistics';
import { C, S } from './ui';
const modes: Mode[] = ['focus', 'rest', 'unknown'];
const colors = { focus: C.green, rest: C.rest, unknown: C.unknown };
const percent = (value: number) =>
  value > 0 && value < 0.1
    ? '<0,1 %'
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' %';

export function BalanceChart({ result }: { result: Record<Mode, number> }) {
  const total = result.focus + result.rest + result.unknown;
  const circumference = 2 * Math.PI * 52;
  const parts = modes.map((mode, i) => ({
    mode,
    fraction: total ? result[mode] / total : 0,
    offset: total
      ? (modes.slice(0, i).reduce((sum, key) => sum + result[key], 0) / total) *
        circumference
      : 0,
  }));
  return (
    <View style={S.card}>
      <Text style={S.section}>Баланс времени</Text>
      <View style={styles.balance}>
        <View
          style={{ flex: 0.85, maxWidth: 156, minWidth: 72 }}
          accessible
          accessibilityLabel={parts
            .map((p) => names[p.mode] + ': ' + percent(p.fraction * 100))
            .join(', ')}
        >
          <Svg width="100%" height={150} viewBox="0 0 140 140">
            <Circle
              cx={70}
              cy={70}
              r={52}
              fill="none"
              stroke={C.line}
              strokeWidth={23}
            />
            <G transform="rotate(-90 70 70)">
              {parts
                .filter((p) => p.fraction > 0)
                .map((p) => (
                  <Circle
                    key={p.mode}
                    cx={70}
                    cy={70}
                    r={52}
                    fill="none"
                    stroke={colors[p.mode]}
                    strokeWidth={23}
                    strokeLinecap="butt"
                    strokeDasharray={[
                      p.fraction * circumference,
                      circumference,
                    ]}
                    strokeDashoffset={-p.offset}
                  />
                ))}
            </G>
            {result.focus + result.rest === 0 ? (
              <Line
                x1={61}
                x2={79}
                y1={70}
                y2={70}
                stroke={C.muted}
                strokeWidth={3}
                strokeLinecap="round"
              />
            ) : result.focus > result.rest ? (
              <G>
                <Path
                  d="M70 47C74 58 87 63 85 77C84 87 76 92 68 90C54 89 50 77 56 67C57 72 61 73 62 73C59 61 69 57 70 47Z"
                  fill={C.green}
                  fillOpacity={0.16}
                  stroke={C.green}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                <Path
                  d="M70 69C69 76 63 78 65 83C67 88 76 86 76 81C76 77 72 75 70 69Z"
                  fill={C.green}
                />
              </G>
            ) : (
              <Path
                d="M57 81C44 81 43 64 56 61C60 47 80 49 83 62C98 61 100 81 85 81Z"
                fill={C.rest}
                fillOpacity={0.16}
                stroke={C.rest}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            )}
          </Svg>
        </View>
        <View style={{ flex: 1, gap: 17 }}>
          {parts.map((p) => (
            <View
              key={p.mode}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <View
                style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors[p.mode],
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{ color: C.muted, fontSize: 12 }}
                >
                  {names[p.mode]}
                </Text>
              </View>
              <Text
                style={{
                  color: C.text,
                  fontSize: 14,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {percent(p.fraction * 100)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function DailyChart({
  account,
  start,
  now,
}: {
  account: Account;
  start: number;
  now: number;
}) {
  const minute = Math.floor(now / 60000) * 60000;
  const bins = useMemo(
    () => dailyAverage(account, start, minute),
    [account, start, minute],
  );
  const x = (hour: number) => 4 + (hour / 24) * 432;
  const y = (value: number) => 232 - value * 2.24;
  const todayOnly = startOfDay(start) === startOfDay(now);
  const local = new Date(minute);
  const lastHour = todayOnly ? local.getHours() + local.getMinutes() / 60 : 24;
  const lines = modes.map((mode) => {
    let path = '';
    let previous = -2;
    bins.forEach((bin, hour) => {
      if (!bin.total || hour >= lastHour) return;
      const height = y((bin[mode] / bin.total) * 100);
      path += (previous === hour - 1 ? ' L' : ' M') + x(hour) + ' ' + height;
      path += ' L' + x(Math.min(hour + 1, lastHour)) + ' ' + height;
      previous = hour;
    });
    return { mode, path };
  });
  return (
    <View style={[S.card, { marginTop: 18 }]}>
      <Text style={S.section}>Суточный ритм</Text>

      <View
        style={{ marginTop: 20 }}
        accessible
        accessibilityLabel="Три линии: фокус, отдых, нет данных. По горизонтали время суток от 00 до 24 часов, по вертикали доля времени от 0 до 100 процентов."
      >
        <Svg
          width="100%"
          height={240}
          viewBox="0 0 440 240"
          preserveAspectRatio="none"
        >
          {[0, 25, 50, 75, 100].map((value) => (
            <G key={value}>
              <Line
                x1={4}
                x2={436}
                y1={y(value)}
                y2={y(value)}
                stroke={C.line}
              />
            </G>
          ))}
          {[0, 6, 12, 18, 24].map((hour) => (
            <G key={hour}>
              <Line
                x1={x(hour)}
                x2={x(hour)}
                y1={8}
                y2={232}
                stroke={C.line}
                strokeOpacity={0.45}
              />
            </G>
          ))}
          {lines
            .filter((line) => line.path)
            .map(({ mode, path }) => (
              <Path
                key={mode}
                d={path}
                fill="none"
                stroke={colors[mode]}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeDasharray={
                  mode === 'rest'
                    ? [7, 4]
                    : mode === 'unknown'
                      ? [2, 4]
                      : undefined
                }
              />
            ))}
        </Svg>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 12,
            marginBottom: 8,
          }}
        >
          {[0, 6, 12, 18, 24].map((hour) => (
            <Text
              key={hour}
              style={{
                color: C.muted,
                fontSize: 14,
                fontVariant: ['tabular-nums'],
              }}
            >
              {String(hour).padStart(2, '0')}:00
            </Text>
          ))}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          columnGap: 10,
          rowGap: 12,
          marginTop: 14,
        }}
      >
        {modes.map((mode) => (
          <View
            key={mode}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Svg width={20} height={8}>
              <Line
                x1={0}
                x2={20}
                y1={4}
                y2={4}
                stroke={colors[mode]}
                strokeWidth={2}
                strokeDasharray={
                  mode === 'rest'
                    ? [7, 4]
                    : mode === 'unknown'
                      ? [2, 4]
                      : undefined
                }
              />
            </Svg>
            <Text style={{ color: C.muted, fontSize: 15, fontWeight: '500' }}>
              {names[mode]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
  },
});

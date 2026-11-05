import React, { type PropsWithChildren } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
export const C = {
  bg: '#080e0d',
  card: '#111b18',
  line: '#24332e',
  text: '#eff7f3',
  muted: '#8da399',
  green: '#6ce3b1',
  rest: '#a8b5df',
  unknown: '#63766e',
};
export type IconName =
  | 'focus'
  | 'stats'
  | 'person'
  | 'arrow'
  | 'rest'
  | 'logout'
  | 'check'
  | 'chevron'
  | 'edit'
  | 'trash';
export function Icon({
  name,
  color = C.muted,
  size = 22,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const paths: Record<IconName, string> = {
    focus:
      'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3',
    stats: 'M5 20v-6m7 6V4m7 16V9',
    person: 'M4 21v-2a7 7 0 0 1 14 0v2M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    arrow: 'M4 12h15m-6-6 6 6-6 6',
    rest: 'M20 15A8.5 8.5 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z',
    logout: 'M9 4H4v16h5m4-12 4 4-4 4m-6-4h13',
    check: 'm5 12 4 4 10-10',
    chevron: 'm9 5 7 7-7 7',
    edit: 'm15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6',
  };
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d={paths[name]}
          stroke={color}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {name === 'focus' && (
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.7} />
        )}
      </Svg>
    </View>
  );
}
export function Glass({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle }>) {
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable())
    return (
      <GlassView
        colorScheme="dark"
        glassEffectStyle="regular"
        isInteractive
        style={[S.glass, style]}
      >
        {children}
      </GlassView>
    );
  return (
    <View
      style={[
        S.glass,
        Platform.OS === 'web'
          ? ({
              backdropFilter: 'blur(28px) saturate(160%)',
              WebkitBackdropFilter: 'blur(28px) saturate(160%)',
            } as ViewStyle)
          : {},
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        S.button,
        secondary && S.secondary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[S.buttonText, secondary && { color: C.text }]}>
        {title}
      </Text>
      {icon && (
        <Icon name={icon} size={19} color={secondary ? C.text : '#09251a'} />
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={S.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#61756b"
        selectionColor={C.green}
        style={S.input}
        {...props}
      />
    </View>
  );
}
export function Notice({
  message,
  good = false,
}: {
  message: string;
  good?: boolean;
}) {
  if (!message) return null;
  return (
    <Text
      accessibilityRole="alert"
      style={{
        color: good ? C.green : '#efaaa4',
        lineHeight: 21,
        fontSize: 14,
      }}
    >
      {message}
    </Text>
  );
}
export const S = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 118,
  },
  title: {
    color: C.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  eyebrow: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2.6,
  },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 22 },
  section: {
    color: C.text,
    fontWeight: '600',
    fontSize: 19,
    letterSpacing: -0.4,
  },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 24,
    padding: 22,
  },
  glass: {
    backgroundColor: 'rgba(26,42,35,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(185,233,210,0.18)',
    borderRadius: 30,
    overflow: 'hidden',
  },
  button: {
    backgroundColor: C.green,
    minHeight: 55,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
  },
  secondary: {
    backgroundColor: '#192820',
    borderWidth: 1,
    borderColor: C.line,
  },
  buttonText: {
    color: '#09251a',
    fontSize: 16,
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontWeight: '600',
  },
  label: { fontSize: 13, fontWeight: '500', color: '#b2c3b9' },
  input: {
    minHeight: 53,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: C.text,
    backgroundColor: '#101a16',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

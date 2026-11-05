import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  Path,
  Circle,
  Ellipse,
  G,
} from 'react-native-svg';
import type { Mode } from './domain';

export function TimerBackdrop({ mode }: { mode: Mode }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rest = mode === 'rest';
  const base = id + 'base',
    glow = id + 'glow',
    flame = id + 'flame';
  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={StyleSheet.absoluteFill}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 560 310"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <LinearGradient id={base} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={rest ? '#253449' : '#163c2e'} />
            <Stop offset="1" stopColor={rest ? '#101c2b' : '#0b211b'} />
          </LinearGradient>
          <RadialGradient id={glow} cx="50%" cy="85%" rx="65%" ry="90%">
            <Stop
              offset="0"
              stopColor={rest ? '#7a8cab' : '#d79b58'}
              stopOpacity=".24"
            />
            <Stop
              offset="1"
              stopColor={rest ? '#192838' : '#122d22'}
              stopOpacity="0"
            />
          </RadialGradient>
          <LinearGradient id={flame} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#deaf69" stopOpacity=".38" />
            <Stop offset=".6" stopColor="#c58c4d" stopOpacity=".18" />
            <Stop offset="1" stopColor="#82b99a" stopOpacity=".06" />
          </LinearGradient>
        </Defs>
        <Rect width="560" height="310" fill={`url(#${base})`} />
        <Rect width="560" height="310" fill={`url(#${glow})`} />
        {rest ? (
          <>
            <Circle cx="435" cy="62" r="26" fill="#c5d2df" opacity=".12" />
            <Path
              d="M-40 101C-15 69 13 70 34 83C43 39 99 40 116 73C148 61 181 82 182 105Z"
              fill="#9eb4ca"
              opacity=".13"
            />
            <Path
              d="M363 118C365 96 384 87 405 96C417 61 457 65 471 93C503 81 526 94 531 113C555 105 578 115 589 136H363Z"
              fill="#9eb4ca"
              opacity=".15"
            />
            <Path
              d="M-30 257C40 222 88 236 133 264C183 228 224 244 268 274C313 246 352 252 399 277C457 238 518 235 586 267V310H-30Z"
              fill="#66829a"
              opacity=".12"
            />
            <G fill="#bdd2e0" opacity=".28">
              <Circle cx="193" cy="46" r="1.4" />
              <Circle cx="344" cy="65" r="1.8" />
              <Circle cx="301" cy="34" r="1" />
              <Circle cx="91" cy="181" r="1.4" />
              <Circle cx="492" cy="175" r="1.3" />
            </G>
          </>
        ) : (
          <>
            <Path
              d="M61 334C-9 235 85 192 63 119C129 161 129 190 116 220C164 171 143 116 181 75C171 154 227 167 207 231C252 196 244 132 290 55C270 151 363 165 335 241C382 209 350 166 400 109C383 182 471 201 448 268C492 244 492 212 514 182C558 256 533 309 495 334Z"
              fill={`url(#${flame})`}
            />
            <Path
              d="M156 326C105 264 169 241 158 197C207 230 184 260 217 275C204 220 257 205 266 141C291 210 335 230 312 280C344 252 361 245 361 205C409 256 410 290 378 326Z"
              fill="#d8b078"
              opacity=".14"
            />
            <Path
              d="M230 323C199 281 256 261 262 227C292 263 324 286 302 323Z"
              fill="#e8c28b"
              opacity=".16"
            />
            <G fill="#d8b27a" opacity=".28">
              <Ellipse cx="113" cy="132" rx="2" ry="5" />
              <Ellipse cx="388" cy="78" rx="1.5" ry="4" />
              <Ellipse cx="214" cy="66" rx="1.5" ry="3" />
              <Ellipse cx="453" cy="157" rx="2" ry="5" />
            </G>
            <Path
              d="M42 292Q126 277 198 294T362 293T545 292"
              stroke="#b98a54"
              opacity=".18"
              fill="none"
            />
          </>
        )}
        <Rect width="560" height="310" fill="#071710" opacity=".16" />
      </Svg>
    </View>
  );
}

import React from 'react';
import { Image, View } from 'react-native';
import { C } from './ui';

// Display the supplied transparent artwork without changing the source file.
// Clip its generous outer padding so the symbol reads at header size.
export function BrandLogo({ size = 44 }: { size?: number }) {
  const scale = size / 800;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="EgoFocus"
      style={{ width: size, height: size, overflow: 'hidden' }}
    >
      <Image
        source={require('../assets/brand/egofocus-logo.png')}
        resizeMode="contain"
        style={{
          position: 'absolute',
          width: 1254 * scale,
          height: 1254 * scale,
          left: -224 * scale,
          top: -250 * scale,
          tintColor: C.green,
        }}
      />
    </View>
  );
}

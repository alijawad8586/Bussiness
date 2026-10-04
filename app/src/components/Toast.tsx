import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { T } from './ui';

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <SafeAreaView pointerEvents="none" edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }}>
      <View style={{ marginTop: 12, backgroundColor: '#111b21', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, maxWidth: '92%' }}>
        <T size={14} color="#fff">{toast}</T>
      </View>
    </SafeAreaView>
  );
}

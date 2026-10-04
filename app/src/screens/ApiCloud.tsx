import React, { useState } from 'react';
import { View } from 'react-native';
import { colors, font } from '../theme';
import { AiProvider } from '../ai';
import { Button, Card, CardHeading, Input, T, useLayout } from '../components/ui';
import { Shell } from '../components/Shell';
import { useStore } from '../store';

function ProviderCard({ p }: { p: AiProvider }) {
  const { aiKeys, saveAiKey, removeAiProvider, showToast } = useStore();
  const cfg = aiKeys[p.id];
  const [key, setKey] = useState(cfg?.key ?? '');
  const [model, setModel] = useState(cfg?.model ?? p.model);
  const { wide } = useLayout();
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T weight={font.semi}>{p.name}</T>
        <T size={12} weight={font.medium} color={cfg ? '#15803d' : colors.muted}>{cfg ? '● connected' : 'not set'}</T>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
        <Input style={{ flex: wide ? 2 : undefined }} value={key} onChangeText={setKey} placeholder="API key" secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel={`${p.name} API key`} />
        <Input style={{ flex: wide ? 1 : undefined }} value={model} onChangeText={setModel} placeholder="Model" autoCapitalize="none" autoCorrect={false} accessibilityLabel={`${p.name} model`} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button kind="primary" label="Save" onPress={() => { saveAiKey(p.id, key, model); showToast(key.trim() ? `${p.name} saved` : `${p.name} key removed`); }} />
          {p.custom ? <Button label="Remove" onPress={() => removeAiProvider(p.id)} /> : null}
        </View>
      </View>
    </Card>
  );
}

export default function ApiCloud() {
  const { providers, addAiProvider, googleClient, setGoogleClient, showToast } = useStore();
  const { wide } = useLayout();
  const [cName, setCName] = useState('');
  const [cUrl, setCUrl] = useState('');
  const [cModel, setCModel] = useState('');
  const [gId, setGId] = useState(googleClient);

  const add = () => {
    const url = cUrl.trim().replace(/\/+$/, '');
    if (!cName.trim() || !/^https:\/\//.test(url)) return showToast('Enter a name and a Base URL starting with https://');
    addAiProvider({ name: cName.trim(), url, model: cModel.trim() || 'default' });
    setCName(''); setCUrl(''); setCModel('');
    showToast('Custom AI added');
  };

  return (
    <Shell title="API Cloud" subtitle="Add your AI provider keys (ChatGPT, Gemini, Claude, Groq or any OpenAI-compatible AI).">
      <Card style={{ backgroundColor: colors.tint, borderColor: colors.tint }}>
        <T size={13} color={colors.dark} style={{ lineHeight: 19 }}>
          Keys are saved only on this device and sent straight to the AI company when you chat. Anyone using this browser can see them, so do not use this on a shared computer.
        </T>
      </Card>
      {providers.map((p) => <ProviderCard key={p.id} p={p} />)}

      <Card style={{ gap: 12 }}>
        <CardHeading title="Add custom AI" sub="Any service that supports the OpenAI chat API (for example DeepSeek)." />
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
          <Input style={{ flex: wide ? 1 : undefined }} value={cName} onChangeText={setCName} placeholder="Name (e.g. DeepSeek)" accessibilityLabel="Custom AI name" />
          <Input style={{ flex: wide ? 2 : undefined }} value={cUrl} onChangeText={setCUrl} placeholder="Base URL (e.g. https://api.deepseek.com/v1)" autoCapitalize="none" accessibilityLabel="Custom AI base URL" />
          <Input style={{ flex: wide ? 1 : undefined }} value={cModel} onChangeText={setCModel} placeholder="Model (e.g. deepseek-chat)" autoCapitalize="none" accessibilityLabel="Custom AI model" />
          <Button label="Add" icon="plus" onPress={add} />
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <CardHeading title="Google sign-in (optional, web only)" sub="Paste your Google OAuth Client ID so “Continue with Google” works on the login page." />
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
          <Input style={{ flex: wide ? 1 : undefined }} value={gId} onChangeText={setGId} placeholder="xxxx.apps.googleusercontent.com" autoCapitalize="none" accessibilityLabel="Google client ID" />
          <Button label="Save" onPress={() => { setGoogleClient(gId.trim()); showToast('Google client ID saved'); }} />
        </View>
      </Card>
    </Shell>
  );
}

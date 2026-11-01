import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { ThemePicker } from '@/components/editor-common';
import { Button, Card, ErrorBox, Input, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { hijriYear } from '@/lib/dates';


export default function NewProject() {
  const [title, setTitle] = useState(`ملف إنجاز ${hijriYear()}`);
  const [theme, setTheme] = useState('mint');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const create = async () => {
    setError('');
    setLoading(true);
    try {
      const { id } = await api<{ id: number }>('POST', '/api/projects', { title, theme });
      router.replace({ pathname: '/project/[id]', params: { id } });
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Card>
        <ErrorBox message={error} />
        <Text muted style={{ marginBottom: 14 }}>يجيك ملف جاهز فيه كل صفحات ملف الإنجاز بعناوينها، وتعدّل عليه براحتك.</Text>
        <Input label="اسم الملف" value={title} onChangeText={setTitle} />
        <Text weight="bold" style={{ marginBottom: 8 }}>الألوان</Text>
        <ThemePicker value={theme} onChange={setTheme} />
      </Card>
      <Button title="إنشاء وفتح الملف" onPress={create} loading={loading} />
    </ScrollView>
  );
}

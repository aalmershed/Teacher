import { router } from 'expo-router';
import { Alert } from 'react-native';
import { DocList } from '@/components/doc-list';
import { api } from '@/lib/api';

const open = (id: number) => router.push({ pathname: '/certificate/[id]', params: { id } });

async function create() {
  try {
    const { id } = await api<{ id: number }>('POST', '/api/certificates', {});
    open(id);
  } catch (e: any) {
    Alert.alert('تعذر إنشاء الشهادة', e.message);
  }
}

export default function Certificates() {
  return (
    <DocList
      path="/api/certificates" listKey="certificates" icon="ribbon-outline" newLabel="شهادة جديدة"
      emptyTitle="ما عندك شهادات للحين" emptyHint="صمّم شهادات لطلابك بعدة تصاميم، وسوّ شهادة لكل طالب دفعة وحدة."
      onNew={create} onOpen={(c) => open(c.id)}
    />
  );
}

import { router } from 'expo-router';
import { Alert } from 'react-native';
import { DocList } from '@/components/doc-list';
import { api } from '@/lib/api';
import { hijriYear } from '@/lib/dates';

const open = (id: number) => router.push({ pathname: '/sheet/[id]', params: { id } });


async function create() {
  try {
    const { id } = await api<{ id: number }>('POST', '/api/sheets', { data: { year: hijriYear() + 'هـ' } });
    open(id);
  } catch (e: any) {
    Alert.alert('تعذر إنشاء الكشف', e.message);
  }
}

export default function Sheets() {
  return (
    <DocList
      path="/api/sheets" listKey="sheets" icon="grid-outline" newLabel="كشف جديد"
      emptyTitle="ما عندك كشوف متابعة للحين" emptyHint="كشف درجات جاهز للطباعة بأسماء طلابك وتوزيع الدرجات اللي تختاره."
      onNew={create} onOpen={(s) => open(s.id)}
    />
  );
}

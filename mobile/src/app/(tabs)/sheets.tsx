import { Alert } from 'react-native';
import { DocList } from '@/components/doc-list';

const soon = () => Alert.alert('قريبًا', 'تعديل كشوف المتابعة من التطبيق جاي في التحديث القادم.');

export default function Sheets() {
  return (
    <DocList
      path="/api/sheets" listKey="sheets" icon="grid-outline" newLabel="كشف جديد"
      emptyTitle="ما عندك كشوف متابعة للحين" emptyHint="كشوف متابعة الطلاب ورصد الدرجات تظهر هنا."
      onNew={soon} onOpen={soon}
    />
  );
}

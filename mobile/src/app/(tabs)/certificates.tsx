import { Alert } from 'react-native';
import { DocList } from '@/components/doc-list';

const soon = () => Alert.alert('قريبًا', 'تعديل الشهادات من التطبيق جاي في التحديث القادم.');

export default function Certificates() {
  return (
    <DocList
      path="/api/certificates" listKey="certificates" icon="ribbon-outline" newLabel="شهادة جديدة"
      emptyTitle="ما عندك شهادات للحين" emptyHint="شهادات الشكر والتقدير اللي تسويها تظهر هنا."
      onNew={soon} onOpen={soon}
    />
  );
}

import { DocList } from '@/components/doc-list';

export default function Certificates() {
  return (
    <DocList
      path="/api/certificates" listKey="certificates" icon="ribbon-outline"
      emptyTitle="ما عندك شهادات للحين" emptyHint="شهادات الشكر والتقدير اللي تسويها تظهر هنا."
    />
  );
}

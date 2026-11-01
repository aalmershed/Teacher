import { DocList } from '@/components/doc-list';

export default function Sheets() {
  return (
    <DocList
      path="/api/sheets" listKey="sheets" icon="grid-outline"
      emptyTitle="ما عندك كشوف متابعة للحين" emptyHint="كشوف متابعة الطلاب ورصد الدرجات تظهر هنا."
    />
  );
}

import { DocList } from '@/components/doc-list';

export default function Projects() {
  return (
    <DocList
      path="/api/projects" listKey="projects" icon="book-outline"
      emptyTitle="ما عندك ملفات إنجاز للحين" emptyHint="إنشاء ملف جديد من التطبيق جاي في التحديث القادم."
    />
  );
}

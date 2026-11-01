import { router } from 'expo-router';
import { DocList } from '@/components/doc-list';

export default function Projects() {
  return (
    <DocList
      path="/api/projects" listKey="projects" icon="book-outline" newLabel="ملف إنجاز جديد"
      emptyTitle="ما عندك ملفات إنجاز للحين" emptyHint="اضغط «ملف إنجاز جديد» ويجيك ملف جاهز بكل الصفحات."
      onNew={() => router.push('/project/new')}
      onOpen={(p) => router.push({ pathname: '/project/[id]', params: { id: p.id } })}
    />
  );
}

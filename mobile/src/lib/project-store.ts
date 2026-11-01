import { produce, type Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import { Alert, AppState } from 'react-native';
import { api, ApiError } from './api';
import { migrate, type Project } from './project-types';

// الملف المفتوح في المحرر — مشترك بين شاشة الصفحات وشاشة تعديل الصفحة، مع حفظ تلقائي مثل الموقع
export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
// rev يزيد مع كل تحميل للملف، عشان محررات النص تعيد قراءة المحتوى بعد فتح نسخة أحدث
type State = { project: Project | null; status: SaveStatus; error: string; rev: number };

let state: State = { project: null, status: 'loading', error: '', rev: 0 };
let dirty = false;
let saving = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let opened = 0; // يزيد مع كل فتح للمحرر، حتى لا يمسح إغلاق قديم ملفًا أعيد فتحه
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useProjectState = () => useSyncExternalStore(subscribe, () => state);

export async function openProject(id: number) {
  opened++;
  if (state.project?.id === id && state.status !== 'error') return;
  if (timer) clearTimeout(timer);
  dirty = false;
  set({ project: null, status: 'loading', error: '' });
  try {
    const { project } = await api<{ project: Project }>('GET', `/api/projects/${id}`);
    project.data = migrate(project.data);
    set({ project, status: 'saved', rev: state.rev + 1 });
  } catch (e: any) {
    set({ status: 'error', error: e.message });
  }
}

// عند الخروج من المحرر: يحفظ آخر التعديلات أولًا، وإذا تعذر الحفظ يبقى الملف في الذاكرة حتى لا تضيع
export async function closeProject() {
  const session = opened;
  if (timer) clearTimeout(timer);
  for (let i = 0; i < 30 && (dirty || saving); i++) {
    if (saving) await new Promise((r) => setTimeout(r, 300));
    else if (!(await save())) break;
  }
  if (!dirty && opened === session) set({ project: null, status: 'loading', error: '' });
}

export function updateProject(recipe: (draft: Draft<Project>) => void) {
  if (!state.project) return;
  dirty = true;
  set({ project: produce(state.project, recipe), status: 'dirty' });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => save(), 1200);
}

// يحفظ فورًا (عند الخروج من المحرر أو قبل المعاينة)
export function flush() {
  if (timer) clearTimeout(timer);
  return save();
}

async function save(force = false): Promise<boolean> {
  const p = state.project;
  if (!p || !dirty) return true;
  if (saving) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => save(force), 500);
    return false;
  }
  saving = true;
  dirty = false;
  set({ status: 'saving' });
  try {
    const r = await api<{ updated_at: string }>('PUT', `/api/projects/${p.id}`, {
      title: p.title, data: p.data, ...(force ? {} : { baseUpdatedAt: p.updated_at }),
    });
    if (state.project?.id === p.id) {
      state = { ...state, project: { ...state.project, updated_at: r.updated_at } };
      set({ status: dirty ? 'dirty' : 'saved', error: '' });
    }
    return true;
  } catch (e) {
    dirty = true;
    if (e instanceof ApiError && e.code === 'CONFLICT') {
      set({ status: 'conflict' });
      askConflict(p.id);
      return false;
    }
    set({ status: 'error', error: (e as Error).message });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => save(), 5000);
    return false;
  } finally {
    saving = false;
  }
}

function askConflict(id: number) {
  Alert.alert(
    'الملف تغيّر من جهاز ثاني',
    'عدّلت هذا الملف من الموقع أو من جهاز ثاني بعد ما فتحته هنا. وش تبي تسوي؟',
    [
      { text: 'افتح النسخة الأحدث', onPress: () => { dirty = false; set({ project: null }); openProject(id); } },
      { text: 'احفظ تعديلاتي فوقها', style: 'destructive', onPress: () => { save(true); } },
    ],
    { cancelable: false },
  );
}

// يحفظ فورًا إذا طلع المعلم من التطبيق قبل انتهاء مهلة الحفظ التلقائي
AppState.addEventListener('change', (s) => { if (s !== 'active') flush(); });

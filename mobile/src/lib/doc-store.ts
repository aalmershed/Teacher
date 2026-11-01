import { produce, type Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import { Alert, AppState } from 'react-native';
import { api, ApiError } from './api';

// مستند مفتوح للتعديل (ملف إنجاز، شهادة، كشف) مع حفظ تلقائي مثل الموقع،
// وتنبيه إذا تعدّل نفس المستند من جهاز ثاني بعد ما فتحه المعلم هنا.
export type SaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
export type Doc<D> = { id: number; title: string; data: D; updated_at: string };
// rev يزيد مع كل تحميل للمستند، عشان المحررات اللي تحتفظ بمحتواها (مثل النص المنسق) تعيد قراءته
type State<D, M> = { doc: (Doc<D> & M) | null; meta: Record<string, any>; status: SaveStatus; error: string; rev: number };

type Config<D, M> = {
  base: string;                                   // مثل /api/certificates
  itemKey: string;                                // مفتاح المستند في رد الخادم
  prepare?: (doc: Doc<D> & M) => Doc<D> & M;      // تحويل الصيغ القديمة بعد التحميل
  saveDelay?: number;
};

export function createDocStore<D, M extends object = Record<never, never>>({ base, itemKey, prepare = (d) => d, saveDelay = 1200 }: Config<D, M>) {
  let state: State<D, M> = { doc: null, meta: {}, status: 'loading', error: '', rev: 0 };
  let dirty = false;
  let saving = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let opened = 0; // يزيد مع كل فتح للمحرر، حتى لا يمسح إغلاق قديم مستندًا أعيد فتحه
  const listeners = new Set<() => void>();

  const set = (patch: Partial<State<D, M>>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  const useStore = () => useSyncExternalStore(subscribe, () => state);

  async function open(id: number) {
    opened++;
    if (state.doc?.id === id && state.status !== 'error') return;
    if (timer) clearTimeout(timer);
    dirty = false;
    set({ doc: null, status: 'loading', error: '' });
    try {
      const r = await api<Record<string, any>>('GET', `${base}/${id}`);
      const { [itemKey]: doc, ...meta } = r;
      set({ doc: prepare(doc), meta, status: 'saved', rev: state.rev + 1 });
    } catch (e: any) {
      set({ status: 'error', error: e.message });
    }
  }

  // عند الخروج من المحرر: يحفظ آخر التعديلات، وإذا تعذر الحفظ يبقى المستند في الذاكرة حتى لا تضيع
  async function close() {
    const session = opened;
    if (timer) clearTimeout(timer);
    for (let i = 0; i < 30 && (dirty || saving); i++) {
      if (saving) await new Promise((r) => setTimeout(r, 300));
      else if (!(await save())) break;
    }
    if (!dirty && opened === session) set({ doc: null, status: 'loading', error: '' });
  }

  function update(recipe: (draft: Draft<Doc<D> & M>) => void) {
    if (!state.doc) return;
    dirty = true;
    set({ doc: produce(state.doc, recipe), status: 'dirty' });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => save(), saveDelay);
  }

  // يحفظ فورًا (قبل المعاينة أو تنزيل PDF)
  function flush() {
    if (timer) clearTimeout(timer);
    return save();
  }

  async function save(force = false): Promise<boolean> {
    const d = state.doc;
    if (!d || !dirty) return true;
    if (saving) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => save(force), 500);
      return false;
    }
    saving = true;
    dirty = false;
    set({ status: 'saving' });
    try {
      const r = await api<{ updated_at: string }>('PUT', `${base}/${d.id}`, {
        title: d.title, data: d.data, ...(force ? {} : { baseUpdatedAt: d.updated_at }),
      });
      if (state.doc?.id === d.id) {
        state = { ...state, doc: { ...state.doc, updated_at: r.updated_at } };
        set({ status: dirty ? 'dirty' : 'saved', error: '' });
      }
      return true;
    } catch (e) {
      dirty = true;
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        set({ status: 'conflict' });
        askConflict(d.id);
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
      'تغيّر من جهاز ثاني',
      'عدّلت هذا المستند من الموقع أو من جهاز ثاني بعد ما فتحته هنا. وش تبي تسوي؟',
      [
        { text: 'افتح النسخة الأحدث', onPress: () => { dirty = false; set({ doc: null }); open(id); } },
        { text: 'احفظ تعديلاتي فوقها', style: 'destructive', onPress: () => { save(true); } },
      ],
      { cancelable: false },
    );
  }

  // يحفظ فورًا إذا طلع المعلم من التطبيق قبل انتهاء مهلة الحفظ التلقائي
  AppState.addEventListener('change', (s) => { if (s !== 'active') flush(); });

  return { useStore, open, close, update, flush };
}

// جدولي: جدول الحصص الأسبوعي — نفس بيانات صفحة /schedule في الموقع (server/schedule.js)
// + تنبيهات محلية على الجوال قبل كل حصة تتكرر أسبوعيًا (ما تحتاج إنترنت وقت التنبيه).
'use no memo';

import * as Notifications from 'expo-notifications';
import { produce, type Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { api, ApiError } from './api';

export type Cell = { klass: string; subject: string; place: string };
export type Period = { start: string; end: string };
export type ScheduleData = { days: number[]; periods: Period[]; cells: Record<string, Cell>; notify: { enabled: boolean; before: number } };

export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
export function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}
export const cellKey = (day: number, p: number) => `${day}-${p}`;
export const minutesAr = (n: number) => (n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتين' : n <= 10 ? `${n} دقائق` : `${n} دقيقة`);

// الحصة الحالية أو القادمة حسب وقت الجوال
export function upcoming(d: ScheduleData, now = new Date()) {
  const today = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (let k = 0; k < 7; k++) {
    const day = (today + k) % 7;
    if (!d.days.includes(day)) continue;
    for (let p = 0; p < d.periods.length; p++) {
      const c = d.cells[cellKey(day, p)];
      if (!c) continue;
      const s = toMin(d.periods[p].start);
      const e = toMin(d.periods[p].end);
      if (k === 0 && e <= mins) continue;
      return { day, p, c, k, now: k === 0 && s <= mins && mins < e, inMin: k === 0 ? s - mins : null };
    }
  }
  return null;
}

// ---------- التخزين والحفظ التلقائي ----------
type State = { data: ScheduleData | null; status: 'loading' | 'saved' | 'dirty' | 'saving' | 'error'; error: string; rev: number };
let state: State = { data: null, status: 'loading', error: '', rev: 0 };
let updatedAt: string | null = null;
let dirty = false;
let saving = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => state;
export const useSchedule = () => useSyncExternalStore(subscribe, getSnapshot);

export async function loadSchedule() {
  if (dirty || saving) return;
  try {
    const { schedule } = await api<{ schedule: { data: ScheduleData; updated_at: string | null } }>('GET', '/api/schedule');
    updatedAt = schedule.updated_at;
    set({ data: schedule.data, status: 'saved', error: '', rev: state.rev + 1 });
    syncNotifications(schedule.data);
  } catch (e: any) {
    set({ status: 'error', error: e.message });
  }
}

export function updateSchedule(recipe: (d: Draft<ScheduleData>) => void) {
  if (!state.data) return;
  dirty = true;
  set({ data: produce(state.data, recipe), status: 'dirty' });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => saveSchedule(), 700);
}

export function flushSchedule() {
  if (timer) clearTimeout(timer);
  return saveSchedule();
}

async function saveSchedule(force = false): Promise<void> {
  const d = state.data;
  if (!d || !dirty) return;
  if (saving) { timer = setTimeout(() => saveSchedule(force), 500); return; }
  saving = true;
  dirty = false;
  set({ status: 'saving' });
  try {
    const r = await api<{ data: ScheduleData; updated_at: string }>('PUT', '/api/schedule', { data: d, ...(force ? {} : { baseUpdatedAt: updatedAt }) });
    updatedAt = r.updated_at;
    set({ status: dirty ? 'dirty' : 'saved', error: '' });
    syncNotifications(state.data!);
  } catch (e) {
    dirty = true;
    if (e instanceof ApiError && e.code === 'CONFLICT') {
      Alert.alert('الجدول تغيّر من جهاز ثاني', 'عدّلت جدولك من الموقع أو من جهاز ثاني. وش تبي تسوي؟', [
        { text: 'افتح النسخة الأحدث', onPress: () => { dirty = false; loadSchedule(); } },
        { text: 'احفظ تعديلاتي فوقها', style: 'destructive', onPress: () => { saveSchedule(true); } },
      ], { cancelable: false });
      return;
    }
    set({ status: 'error', error: (e as Error).message });
    timer = setTimeout(() => saveSchedule(), 5000);
  } finally {
    saving = false;
  }
}

export function resetSchedule() {
  if (timer) clearTimeout(timer);
  dirty = false;
  updatedAt = null;
  set({ data: null, status: 'loading', error: '' });
  cancelClassNotifications();
}

// يحفظ إذا طلع المعلم من التطبيق، ويحدّث الجدول (والتنبيهات) إذا رجع، لأنه ممكن عدّله من الموقع
AppState.addEventListener('change', (s) => {
  if (s !== 'active') flushSchedule();
  else if (state.data) loadSchedule();
});

// ---------- التنبيهات ----------
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const TAG = 'class-reminder';
const MAX_IOS_PENDING = 60; // iOS يسمح بـ 64 تنبيه مجدول كحد أقصى

export async function cancelClassNotifications() {
  if (Platform.OS === 'web') return;
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(all.filter((n) => n.content.data?.tag === TAG).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

// يطلب إذن الإشعارات (أول مرة) ويرجع هل هو مسموح
export async function ensureNotificationPermission(ask: boolean) {
  if (Platform.OS === 'web') return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!ask || !cur.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

// يعيد جدولة تنبيه أسبوعي لكل حصة: «عندك حصة الرياضيات في أولى ابتدائي أ بعد 5 دقائق»
let syncing = Promise.resolve();
export function syncNotifications(d: ScheduleData) {
  syncing = syncing.then(async () => {
    if (Platform.OS === 'web') return;
    await cancelClassNotifications();
    if (!d.notify.enabled || !(await ensureNotificationPermission(false))) return;
    const items: { weekday: number; hour: number; minute: number; c: Cell; p: number }[] = [];
    for (const day of d.days) {
      d.periods.forEach((per, p) => {
        const c = d.cells[cellKey(day, p)];
        if (!c) return;
        let m = toMin(per.start) - d.notify.before;
        let wd = day;
        if (m < 0) { m += 24 * 60; wd = (day + 6) % 7; } // قبل منتصف الليل لليوم السابق
        items.push({ weekday: wd + 1, hour: Math.floor(m / 60), minute: m % 60, c, p });
      });
    }
    for (const it of items.slice(0, MAX_IOS_PENDING)) {
      const what = [it.c.subject, it.c.klass].filter(Boolean).join(' في ') || 'حصة';
      await Notifications.scheduleNotificationAsync({
        content: {
          title: d.notify.before ? `عندك حصة بعد ${minutesAr(d.notify.before)}` : 'بدأت حصتك',
          body: `${what}${it.c.place ? ` · ${it.c.place}` : ''} (الحصة ${it.p + 1})`,
          data: { tag: TAG },
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: it.weekday, hour: it.hour, minute: it.minute },
      }).catch(() => {});
    }
  }).catch(() => {});
  return syncing;
}

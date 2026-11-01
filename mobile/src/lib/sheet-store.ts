import { createDocStore } from './doc-store';

// بيانات كشف المتابعة كما يحفظها الخادم (server/sheet-render.js ← normalize)
export type Mark = '' | '✓' | '✗';
export type Sub = { id: string; title: string; max: number; boxes: number };
export type Group = { title: string; subs: Sub[] };
export type Cell = { s?: number; m?: Mark[] };
export type SheetData = {
  theme: string; title: string; line1: string; line2: string; school: string;
  grade: string; section: string; term: string; subject: string; teacher: string; year: string;
  names: string[]; sids: string[]; rows: number; groups: Group[];
  grades: Record<string, Record<string, Cell>>; setup: boolean; logoRight: string; logoLeft: string;
};
export type SheetTheme = { id: string; name: string; colors: string[] };

export const sheetStore = createDocStore<SheetData>({ base: '/api/sheets', itemKey: 'sheet', saveDelay: 700 });

// نفس دوال sheet-render.js حتى يطابق التطبيق الموقع
export const MARKS: Mark[] = ['', '✓', '✗'];
export const newId = () => Math.random().toString(36).slice(2, 10);
export const deg = (n: number) => (n === 1 ? 'درجة' : n === 2 ? 'درجتان' : n >= 3 && n <= 10 ? `${n} درجات` : `${n} درجة`);
export const groupMax = (g: Group) => g.subs.reduce((a, s) => a + s.max, 0);
export const totalMax = (d: SheetData) => d.groups.reduce((a, g) => a + groupMax(g), 0);
export const pageCount = (d: SheetData) => Math.max(1, Math.ceil(d.names.length / d.rows));
export const fmt = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n * 100) / 100));

export function studentTotal(d: SheetData, sid: string): number | null {
  const row = d.grades[sid];
  if (!row) return null;
  let t = 0;
  let any = false;
  d.groups.forEach((g) => g.subs.forEach((sb) => { const c = row[sb.id]; if (c && c.s != null) { t += c.s; any = true; } }));
  return any ? Math.round(t * 100) / 100 : null;
}

// الأسماء الجديدة تأخذ معرّفات الأسماء المطابقة القديمة حتى لا تضيع درجاتها
export function syncNames(d: SheetData, names: string[]) {
  const pool: Record<string, string[]> = {};
  d.names.forEach((n, i) => { (pool[n] = pool[n] || []).push(d.sids[i]); });
  d.sids = names.map((n) => (pool[n] && pool[n].length ? pool[n].shift()! : newId()));
  d.names = names;
}

export const hasGrades = (d: SheetData, subIds: string[]) => Object.values(d.grades || {}).some((r) => subIds.some((k) => r[k]));

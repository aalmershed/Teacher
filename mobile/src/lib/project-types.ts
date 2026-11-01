// بنية ملف الإنجاز — نفس ما يحفظه الخادم (server/template.js و cleanData في server/index.js)
export type FileRef = { id: string; name: string };
export type LinkItem = { title: string; url: string; files?: FileRef[]; bundleId?: string };
export type ImageItem = { uploadId: string; caption: string };
export type FieldItem = { label: string; value: string };

export type Block =
  | { id: string; type: 'text'; heading: string; html: string }
  | { id: string; type: 'fields'; heading: string; items: FieldItem[] }
  | { id: string; type: 'table'; heading: string; columns: string[]; rows: string[][] }
  | { id: string; type: 'images'; heading: string; items: ImageItem[] }
  | { id: string; type: 'links'; heading: string; items: LinkItem[] }
  | { id: string; type: 'quote'; heading: string; text: string; author: string };

export type BlockType = Block['type'];
export type PageType = 'cover' | 'opening' | 'toc' | 'section' | 'backcover';

export type Page = { id: string; type: PageType; title: string; width: 'half' | 'full'; hideInToc?: boolean; blocks: Block[] };
export type ProjectData = { settings: { theme: string; layout: 'spread' | 'single' }; pages: Page[] };
export type Project = { id: number; title: string; data: ProjectData; updated_at: string; baseUrl: string };
export type Theme = { id: string; name: string; colors: string[] };

export const BLOCK_NAMES: Record<BlockType, string> = {
  text: 'نص', fields: 'حقول بيانات', table: 'جدول', images: 'صور', links: 'روابط وQR', quote: 'اقتباس',
};

export const uid = () => Math.random().toString(16).slice(2, 14);
export const randomHex = (bytes: number) =>
  Array.from({ length: bytes * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export function newBlock(type: BlockType): Block {
  const id = uid();
  switch (type) {
    case 'text': return { id, type, heading: '', html: '<p></p>' };
    case 'fields': return { id, type, heading: '', items: [{ label: 'البند', value: '' }] };
    case 'table': return { id, type, heading: '', columns: ['العمود 1', 'العمود 2', 'العمود 3'], rows: [['', '', ''], ['', '', '']] };
    case 'images': return { id, type, heading: '', items: [{ uploadId: '', caption: '' }, { uploadId: '', caption: '' }] };
    case 'links': return { id, type, heading: '', items: [{ title: 'رابط جديد', url: '' }] };
    case 'quote': return { id, type, heading: '', text: '', author: '' };
  }
}

// حقل الاسم يُعبّأ تلقائيًا من اسم العضوية ولا يُعدّل
export const isNameField = (it: FieldItem) => String(it.label).trim() === 'الاسم';

// حقول لها قائمة اختيارات ثابتة بدل الكتابة الحرة (نفس public/assets/js/editor.js)
export const FIELD_OPTIONS: Record<string, string[]> = {
  'إدارة التعليم': [
    'الإدارة العامة للتعليم بمنطقة القصيم',
    'الإدارة العامة للتعليم بمحافظة الأحساء',
    'الإدارة العامة للتعليم بالمنطقة الشرقية',
    'الإدارة العامة للتعليم بمنطقة تبوك',
    'الإدارة العامة للتعليم بمنطقة جازان',
    'الإدارة العامة للتعليم بمنطقة الحدود الشمالية',
    'الإدارة العامة للتعليم بمنطقة عسير',
    'إدارة التعليم بمحافظة الطائف',
    'الإدارة العامة للتعليم بمنطقة نجران',
    'الإدارة العامة للتعليم بمنطقة الجوف',
    'الإدارة العامة للتعليم بمنطقة حائل',
    'الإدارة العامة للتعليم بمنطقة الباحة',
    'الإدارة العامة للتعليم بمنطقة مكة المكرمة',
    'الإدارة العامة للتعليم بمنطقة الرياض',
    'الإدارة العامة للتعليم بمحافظة جدة',
    'الإدارة العامة للتعليم بمنطقة المدينة المنورة',
  ],
};

// رابط الشاهد: ملفات البند لها صفحة عامة واحدة ثابتة (رمز QR واحد)، وإلا الرابط الذي كتبه المعلم
export const itemUrl = (base: string, it: LinkItem) =>
  it.files && it.files.length ? `${base}/b/${it.bundleId}` : (it.url || '').trim();

// تحويل الصيغ القديمة كما يفعل محرر الموقع عند الفتح
export function migrate(data: ProjectData) {
  data.pages.forEach((p) => p.blocks.forEach((b) => {
    if (b.type !== 'links') return;
    b.items.forEach((it: LinkItem & { fileId?: string; fileName?: string }) => {
      if (it.fileId && !it.files) { it.files = [{ id: it.fileId, name: it.fileName || 'ملف' }]; delete it.fileId; delete it.fileName; }
      if (it.files && it.files.length && !it.bundleId) it.bundleId = randomHex(16);
    });
  }));
  data.pages.filter((p) => p.type === 'opening').forEach((p) => p.blocks.forEach((b) => {
    if (b.type === 'fields') b.items = b.items.filter((i) => i.label === 'الآية');
  }));
  return data;
}

import { createDocStore } from './doc-store';

// بيانات الشهادة كما يحفظها الخادم (server/cert-render.js ← normalize)
export type Sign = { label: string; name: string };
export type CertificateData = {
  design: string; title: string; intro: string; lead: string; names: string[]; body: string; date: string;
  sign1: Sign; sign2: Sign; logoRight: string; logoLeft: string;
};
export type Design = { id: string; name: string; colors: string[] };

export const certificateStore = createDocStore<CertificateData>({ base: '/api/certificates', itemKey: 'certificate', saveDelay: 700 });

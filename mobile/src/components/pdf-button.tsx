import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Button } from '@/components/ui';
import { downloadPdf } from '@/lib/pdf';

// زر تنزيل PDF: يحفظ آخر التعديلات أولًا (before) ثم ينزّل الملف ويفتح المشاركة
export function PdfButton({ title = '⬇ تنزيل PDF', path, name, before, variant = 'primary', style }: {
  title?: string; path: string; name: string; before?: () => Promise<unknown>; variant?: 'primary' | 'outline'; style?: StyleProp<ViewStyle>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      title={busy ? 'جارٍ التجهيز...' : title}
      variant={variant}
      loading={busy}
      style={style}
      onPress={async () => {
        setBusy(true);
        try {
          await before?.();
          await downloadPdf(path, name);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

'use client';

import 'client-only';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/client/core/auth-fetch';
import { Button } from '@/client/ui/primitives/button';
import { Skeleton } from '@/client/ui/primitives/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/ui/primitives/alert-dialog';
import FieldSection from './FieldSection';
import { EDITABLE_FIELDS } from './edit-fields-registry';

// ============================================================
// NEW-17d: 프로필 편집 폼 (main).
// v1.1 F4 dirty guard + save + cancel.
// GET /api/profile → prefill → PUT /api/profile/edit.
// 필드 추가 시 registry만 수정. 이 컴포넌트는 무변경.
// ============================================================

type FormState = Record<string, string | string[] | null>;

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; initial: FormState }
  | { status: 'error' };

type SaveState = 'idle' | 'saving' | 'error';

type ProfileEditClientProps = { locale: string };

export default function ProfileEditClient({ locale }: ProfileEditClientProps) {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [form, setForm] = useState<FormState>({});
  const [save, setSave] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await authFetch('/api/profile', { signal: ctrl.signal });
        if (res.status === 404) { router.replace(`/${locale}/chat`); return; }
        if (res.status === 401) { router.replace(`/${locale}`); return; }
        if (!res.ok) { setLoad({ status: 'error' }); return; }
        const json = await res.json();
        const profile = json.data.profile;
        const journey = json.data.active_journey;
        const initial: FormState = {};
        for (const def of EDITABLE_FIELDS) {
          const source = def.target === 'profile' ? profile : journey;
          const raw = source?.[def.key];
          initial[def.key] = raw ?? (def.kind === 'chip-multi' ? [] : '');
        }
        setForm(initial);
        setLoad({ status: 'loaded', initial });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoad({ status: 'error' });
      }
    })();
    return () => ctrl.abort();
  }, [locale, router]);

  // v1.1 F4: beforeunload warn on dirty
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const updateField = useCallback((key: string, v: string | string[]) => {
    setForm((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSave('saving');
    setSaveError(null);
    const profilePatch: Record<string, unknown> = {};
    const journeyPatch: Record<string, unknown> = {};
    for (const def of EDITABLE_FIELDS) {
      const v = form[def.key];
      // Empty array or empty string = "no change, skip" to keep semantic clean.
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === 'string' && v.length === 0) continue;
      const target = def.target === 'profile' ? profilePatch : journeyPatch;
      target[def.key] = v;
    }
    // refine: 최소 1개
    if (Object.keys(profilePatch).length === 0 && Object.keys(journeyPatch).length === 0) {
      setSave('idle');
      router.push(`/${locale}/profile`);
      return;
    }
    try {
      const res = await authFetch('/api/profile/edit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: profilePatch, journey: journeyPatch }),
      });
      if (!res.ok) {
        setSave('error');
        setSaveError(t('saveError'));
        return;
      }
      setDirty(false);
      router.push(`/${locale}/profile`);
    } catch {
      setSave('error');
      setSaveError(t('saveError'));
    }
  }, [form, locale, router, t]);

  if (load.status === 'loading') {
    return (
      <div className="px-5 py-6 flex flex-col gap-4">
        {EDITABLE_FIELDS.map((f) => <Skeleton key={f.key} className="h-16 w-full" />)}
      </div>
    );
  }
  if (load.status === 'error') {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center px-5 text-center">
        <p className="mb-4 text-sm text-muted-foreground">{tc('error')}</p>
        <Button size="cta" onClick={() => window.location.reload()}>{tc('retry')}</Button>
      </div>
    );
  }

  const skinTypes = form['skin_types'];
  const hasSkinTypes = Array.isArray(skinTypes) && skinTypes.length >= 1;
  const canSave = dirty && hasSkinTypes && save !== 'saving';

  return (
    <div className="px-5 py-6 flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{t('editTitle')}</h1>
      {EDITABLE_FIELDS.map((def) => (
        <FieldSection
          key={def.key}
          def={def}
          value={form[def.key] ?? null}
          onChange={(v) => updateField(def.key, v)}
        />
      ))}
      {saveError && <p className="text-xs text-destructive" role="alert">{saveError}</p>}
      <div className="flex flex-col gap-2 mt-4">
        <Button size="cta" onClick={handleSave} disabled={!canSave}>
          {save === 'saving' ? tc('saving') : t('save')}
        </Button>
        <Button
          size="cta"
          variant="outline"
          onClick={() => {
            if (dirty) setCancelOpen(true);
            else router.push(`/${locale}/profile`);
          }}
        >
          {t('cancel')}
        </Button>
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('unsavedChanges')}</AlertDialogTitle>
              <AlertDialogDescription>{t('unsavedChanges')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('stay')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setCancelOpen(false);
                  router.push(`/${locale}/profile`);
                }}
              >
                {tc('leave')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

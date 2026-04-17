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
    if (load.status !== 'loaded') return;
    setSave('saving');
    setSaveError(null);
    const profilePatch: Record<string, unknown> = {};
    const journeyPatch: Record<string, unknown> = {};
    const initial = load.initial;
    for (const def of EDITABLE_FIELDS) {
      const current = form[def.key];
      const initialVal = initial[def.key];
      // Compare current vs initial — only include changed fields (Q-12 멱등).
      const isArrayField = def.spec.cardinality === 'array';
      let changed: boolean;
      if (isArrayField) {
        if (!Array.isArray(current) || !Array.isArray(initialVal)) {
          changed = true;
        } else if (current.length !== initialVal.length) {
          changed = true;
        } else {
          // v1.1 RT-4: Sort before compare (order-insensitive set equality).
          // UI toggle-off-then-on reorders, DB IS DISTINCT FROM is order-sensitive.
          // Without sort, user round-trips trigger cooldown stamp + AI 30d block.
          const a = [...current].sort();
          const b = [...initialVal].sort();
          changed = a.some((x, i) => x !== b[i]);
        }
      } else {
        changed = current !== initialVal;
      }
      if (!changed) continue;

      const target = def.target === 'profile' ? profilePatch : journeyPatch;
      // Scalar '' (user deselected single-select chip) → null (clear intent).
      // 019b migration handles scalar null as SET NULL (spec §7.1 EC-3).
      if (!isArrayField && current === '') {
        target[def.key] = null;
      } else {
        target[def.key] = current;
      }
    }
    if (Object.keys(profilePatch).length === 0 && Object.keys(journeyPatch).length === 0) {
      // No-op save (dirty=true but values round-tripped back to initial).
      setSave('idle');
      setDirty(false);
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
  }, [form, load, locale, router, t]);

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
      {dirty && !hasSkinTypes && (
        // NEW-17d: skin_types .min(1) 정책(spec §5.2) UX 안내.
        // Skip onboarding 사용자는 skin_types=[] 상태이므로 canSave 영구 false.
        // 사용자가 "왜 저장 안 되지?" 혼란을 방지하는 inline hint.
        <p className="text-xs text-muted-foreground" role="note">
          {t('skinTypeRequired')}
        </p>
      )}
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
              <AlertDialogDescription>{t('unsavedChangesDescription')}</AlertDialogDescription>
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

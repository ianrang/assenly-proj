'use client';

import 'client-only';

import { useTranslations } from 'next-intl';
import OptionGroup from '@/client/ui/primitives/option-group';
import type { EditableFieldDef } from './edit-fields-registry';

// ============================================================
// NEW-17d: kind 기반 OptionGroup 렌더러.
// L-10 client → shared (OK). L-15 shared/ui 단방향.
// 필드 추가 시 registry 만 수정. 이 컴포넌트는 무변경.
// ============================================================

type FieldSectionProps = {
  def: EditableFieldDef;
  value: string | string[] | null;
  onChange: (v: string | string[]) => void;
};

export default function FieldSection({ def, value, onChange }: FieldSectionProps) {
  const tOnb = useTranslations('onboarding');
  const tProfile = useTranslations('profile');

  const options = def.options.map((v) => ({
    value: v,
    label: tOnb(`${def.optionLabelPrefix}${v}`),
  }));

  const normalizedValue: string | string[] =
    def.kind === 'chip-multi'
      ? Array.isArray(value) ? value : []
      : typeof value === 'string' ? value : '';

  const count = Array.isArray(normalizedValue) ? normalizedValue.length : 0;
  const isArray = def.spec.cardinality === 'array';
  const max = isArray ? (def.spec as { cardinality: 'array'; max: number }).max : undefined;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {tProfile(def.sectionLabelKey)}
        {isArray && (
          <span className="text-muted-foreground/70"> ({count}/{max})</span>
        )}
      </p>
      <OptionGroup
        options={options}
        value={normalizedValue}
        onChange={onChange}
        mode={def.kind === 'chip-multi' ? 'multiple' : 'single'}
        max={max}
      />
    </div>
  );
}

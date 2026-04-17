import { setRequestLocale } from 'next-intl/server';
import ProfileEditClient from '@/client/features/profile/ProfileEditClient';

type Props = { params: Promise<{ locale: string }> };

export default async function ProfileEditPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProfileEditClient locale={locale} />;
}

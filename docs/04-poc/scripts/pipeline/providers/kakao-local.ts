/**
 * 카카오 로컬 API 프로바이더
 *
 * 환경변수: KAKAO_REST_API_KEY
 * 문서: https://developers.kakao.com/docs/latest/ko/local/dev-guide
 * 무료: 일 30만건
 */
import type { PlaceProvider, RawPlace } from '../types.js';

function getApiKey() {
  return process.env.KAKAO_REST_API_KEY;
}

export const kakaoLocalProvider: PlaceProvider = {
  name: 'kakao',

  isAvailable() {
    return !!getApiKey();
  },

  async search(query: string, options?: { lat?: number; lng?: number; radius?: number }): Promise<RawPlace[]> {
    const API_KEY = getApiKey();
    if (!API_KEY) throw new Error('KAKAO_REST_API_KEY not set');

    const params = new URLSearchParams({
      query,
      size: '10',
    });

    if (options?.lat && options?.lng) {
      params.set('y', String(options.lat));
      params.set('x', String(options.lng));
      params.set('radius', String(options.radius ?? 5000));
      params.set('sort', 'distance');
    }

    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,
      {
        headers: { Authorization: `KakaoAK ${API_KEY}` },
      },
    );

    if (!response.ok) {
      throw new Error(`Kakao API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const documents = (data.documents ?? []) as Array<Record<string, any>>;

    return documents.map((d) => ({
      source: 'kakao' as const,
      sourceId: d.id ?? '',
      name: d.place_name ?? '',
      category: d.category_name ?? '',
      address: d.road_address_name || d.address_name || '',
      lat: d.y ? parseFloat(d.y) : undefined,
      lng: d.x ? parseFloat(d.x) : undefined,
      phone: d.phone || undefined,
      placeUrl: d.place_url || undefined,
      raw: d,
    }));
  },
};

/**
 * 네이버 검색 API (지역 검색) 프로바이더
 *
 * 환경변수: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 * 문서: https://developers.naver.com/docs/serviceapi/search/local/local.md
 * 무료: 일 25,000건
 */
import type { PlaceProvider, RawPlace } from '../types.js';

function getKeys() {
  return {
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
  };
}

export const naverSearchProvider: PlaceProvider = {
  name: 'naver',

  isAvailable() {
    const { clientId, clientSecret } = getKeys();
    return !!clientId && !!clientSecret;
  },

  async search(query: string): Promise<RawPlace[]> {
    const { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } = getKeys();
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('NAVER_CLIENT_ID and NAVER_CLIENT_SECRET not set');
    }

    const params = new URLSearchParams({
      query,
      display: '10',
      sort: 'random',
    });

    const response = await fetch(
      `https://openapi.naver.com/v1/search/local.json?${params}`,
      {
        headers: {
          'X-Naver-Client-Id': CLIENT_ID,
          'X-Naver-Client-Secret': CLIENT_SECRET,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Naver API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const items = (data.items ?? []) as Array<Record<string, any>>;

    return items.map((item) => ({
      source: 'naver' as const,
      sourceId: item.link ?? '',
      name: (item.title ?? '').replace(/<\/?b>/g, ''), // HTML 볼드 태그 제거
      category: item.category ?? '',
      address: item.roadAddress || item.address || '',
      lat: item.mapy ? parseFloat(item.mapy) / 1e7 : undefined,  // 네이버 좌표는 1e7 스케일
      lng: item.mapx ? parseFloat(item.mapx) / 1e7 : undefined,
      placeUrl: item.link || undefined,
      raw: item,
    }));
  },
};

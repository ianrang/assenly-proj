/**
 * Google Places API (New) 프로바이더
 *
 * 환경변수: GOOGLE_PLACES_API_KEY (Maps Platform 키)
 * 참고: GOOGLE_GENERATIVE_AI_API_KEY (Gemini)와 다른 키.
 *       동일 GCP 프로젝트에서 Places API 활성화 후 동일 키 사용 가능할 수 있음.
 */
import type { PlaceProvider, RawPlace } from '../types.js';

function getApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

export const googlePlacesProvider: PlaceProvider = {
  name: 'google',

  isAvailable() {
    return !!getApiKey();
  },

  async search(query: string, options?: { lat?: number; lng?: number; radius?: number }): Promise<RawPlace[]> {
    const API_KEY = getApiKey();
    if (!API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not set');

    // Google Places API (New) — Text Search
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const body: Record<string, unknown> = {
      textQuery: query,
      languageCode: 'ko',
      maxResultCount: 10,
    };

    if (options?.lat && options?.lng) {
      body.locationBias = {
        circle: {
          center: { latitude: options.lat, longitude: options.lng },
          radius: options.radius ?? 5000,
        },
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.rating',
          'places.websiteUri',
          'places.nationalPhoneNumber',
          'places.googleMapsUri',
          'places.primaryType',
        ].join(','),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Places API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const places = (data.places ?? []) as Array<Record<string, any>>;

    return places.map((p) => ({
      source: 'google' as const,
      sourceId: p.id ?? '',
      name: p.displayName?.text ?? '',
      nameEn: p.displayName?.languageCode === 'en' ? p.displayName.text : undefined,
      category: p.primaryType ?? '',
      address: p.formattedAddress ?? '',
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      phone: p.nationalPhoneNumber,
      website: p.websiteUri,
      rating: p.rating,
      placeUrl: p.googleMapsUri,
      raw: p,
    }));
  },
};

import type { ExploreDomainConfig } from '@/shared/types/explore';

export const EXPLORE_REGISTRY: ExploreDomainConfig[] = [
  {
    id: 'products',
    labelKey: 'explore.tabs.products',
    filterFields: [
      {
        key: 'skin_types',
        labelKey: 'explore.filters.skinType',
        type: 'multi',
        options: [
          { value: 'dry', labelKey: 'beauty.skinType.dry' },
          { value: 'oily', labelKey: 'beauty.skinType.oily' },
          { value: 'combination', labelKey: 'beauty.skinType.combination' },
          { value: 'sensitive', labelKey: 'beauty.skinType.sensitive' },
          { value: 'normal', labelKey: 'beauty.skinType.normal' },
        ],
      },
      {
        key: 'category',
        labelKey: 'explore.filters.category',
        type: 'multi',
        options: [
          { value: 'skincare', labelKey: 'beauty.productCategory.skincare' },
          { value: 'makeup', labelKey: 'beauty.productCategory.makeup' },
          { value: 'haircare', labelKey: 'beauty.productCategory.haircare' },
          { value: 'bodycare', labelKey: 'beauty.productCategory.bodycare' },
          { value: 'tools', labelKey: 'beauty.productCategory.tools' },
        ],
      },
      {
        key: 'budget_max',
        labelKey: 'explore.filters.budget',
        type: 'range',
        max: 100000,
        unit: '₩',
      },
    ],
    sortFields: [
      { value: 'relevance', labelKey: 'explore.sort.relevance', requiresProfile: true },
      { value: 'rating', labelKey: 'explore.sort.rating' },
      { value: 'price', labelKey: 'explore.sort.price' },
    ],
    defaultSort: { field: 'rating', order: 'desc' },
  },
  {
    id: 'treatments',
    labelKey: 'explore.tabs.treatments',
    filterFields: [
      {
        key: 'concerns',
        labelKey: 'explore.filters.concerns',
        type: 'multi',
        options: [
          { value: 'acne', labelKey: 'beauty.concern.acne' },
          { value: 'wrinkles', labelKey: 'beauty.concern.wrinkles' },
          { value: 'dark_spots', labelKey: 'beauty.concern.dark_spots' },
          { value: 'redness', labelKey: 'beauty.concern.redness' },
          { value: 'dryness', labelKey: 'beauty.concern.dryness' },
          { value: 'pores', labelKey: 'beauty.concern.pores' },
          { value: 'dullness', labelKey: 'beauty.concern.dullness' },
          { value: 'dark_circles', labelKey: 'beauty.concern.dark_circles' },
          { value: 'uneven_tone', labelKey: 'beauty.concern.uneven_tone' },
          { value: 'sun_damage', labelKey: 'beauty.concern.sun_damage' },
          { value: 'eczema', labelKey: 'beauty.concern.eczema' },
        ],
      },
      {
        key: 'category',
        labelKey: 'explore.filters.category',
        type: 'multi',
        options: [
          { value: 'skin', labelKey: 'beauty.treatmentCategory.skin' },
          { value: 'laser', labelKey: 'beauty.treatmentCategory.laser' },
          { value: 'injection', labelKey: 'beauty.treatmentCategory.injection' },
          { value: 'facial', labelKey: 'beauty.treatmentCategory.facial' },
          { value: 'body', labelKey: 'beauty.treatmentCategory.body' },
          { value: 'hair', labelKey: 'beauty.treatmentCategory.hair' },
        ],
      },
      {
        key: 'budget_max',
        labelKey: 'explore.filters.budget',
        type: 'range',
        max: 500000,
        unit: '₩',
      },
      {
        key: 'max_downtime',
        labelKey: 'explore.filters.downtime',
        type: 'range',
        max: 30,
        unit: 'days',
      },
    ],
    sortFields: [
      { value: 'relevance', labelKey: 'explore.sort.relevance', requiresProfile: true },
      { value: 'rating', labelKey: 'explore.sort.rating' },
      { value: 'price', labelKey: 'explore.sort.priceLow' },
    ],
    defaultSort: { field: 'rating', order: 'desc' },
  },
  {
    id: 'stores',
    labelKey: 'explore.tabs.stores',
    filterFields: [
      {
        key: 'store_type',
        labelKey: 'explore.filters.storeType',
        type: 'select',
        options: [
          { value: 'olive_young', labelKey: 'beauty.storeType.olive_young' },
          { value: 'chicor', labelKey: 'beauty.storeType.chicor' },
          { value: 'daiso', labelKey: 'beauty.storeType.daiso' },
          { value: 'department_store', labelKey: 'beauty.storeType.department_store' },
          { value: 'brand_store', labelKey: 'beauty.storeType.brand_store' },
          { value: 'pharmacy', labelKey: 'beauty.storeType.pharmacy' },
          { value: 'other', labelKey: 'beauty.storeType.other' },
        ],
      },
      {
        key: 'english_support',
        labelKey: 'explore.filters.englishSupport',
        type: 'select',
        options: [
          { value: 'basic', labelKey: 'beauty.englishSupport.basic' },
          { value: 'good', labelKey: 'beauty.englishSupport.good' },
          { value: 'fluent', labelKey: 'beauty.englishSupport.fluent' },
        ],
      },
    ],
    sortFields: [
      { value: 'relevance', labelKey: 'explore.sort.relevance', requiresProfile: true },
      { value: 'rating', labelKey: 'explore.sort.rating' },
    ],
    defaultSort: { field: 'rating', order: 'desc' },
  },
  {
    id: 'clinics',
    labelKey: 'explore.tabs.clinics',
    filterFields: [
      {
        key: 'clinic_type',
        labelKey: 'explore.filters.clinicType',
        type: 'select',
        options: [
          { value: 'dermatology', labelKey: 'beauty.clinicType.dermatology' },
          { value: 'plastic_surgery', labelKey: 'beauty.clinicType.plastic_surgery' },
          { value: 'aesthetic', labelKey: 'beauty.clinicType.aesthetic' },
          { value: 'med_spa', labelKey: 'beauty.clinicType.med_spa' },
        ],
      },
      {
        key: 'english_support',
        labelKey: 'explore.filters.englishSupport',
        type: 'select',
        options: [
          { value: 'basic', labelKey: 'beauty.englishSupport.basic' },
          { value: 'good', labelKey: 'beauty.englishSupport.good' },
          { value: 'fluent', labelKey: 'beauty.englishSupport.fluent' },
        ],
      },
    ],
    sortFields: [
      { value: 'relevance', labelKey: 'explore.sort.relevance', requiresProfile: true },
      { value: 'rating', labelKey: 'explore.sort.rating' },
    ],
    defaultSort: { field: 'rating', order: 'desc' },
  },
];

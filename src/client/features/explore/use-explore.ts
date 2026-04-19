"use client";

import "client-only";

import { useCallback } from "react";
import useSWRInfinite from "swr/infinite";
import { authFetch } from "@/client/core/auth-fetch";
import type { ExploreDomain, ExploreResponse } from "@/shared/types/explore";

const PAGE_SIZE = 10;

function buildUrl(
  domain: ExploreDomain,
  filters: Record<string, string>,
  sort: string,
  offset: number,
): string {
  const params = new URLSearchParams({
    domain,
    ...filters,
    sort,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  return `/api/explore?${params}`;
}

async function fetcher(url: string): Promise<ExploreResponse> {
  const res = await authFetch(url);
  if (!res.ok) {
    throw new Error(`Explore fetch failed: ${res.status}`);
  }
  return res.json();
}

export function useExplore(
  domain: ExploreDomain,
  filters: Record<string, string>,
  sort: string,
) {
  const getKey = (pageIndex: number, previousPageData: ExploreResponse | null) => {
    if (previousPageData && previousPageData.data.length === 0) return null;
    return buildUrl(domain, filters, sort, pageIndex * PAGE_SIZE);
  };

  const { data, setSize, isLoading, isValidating } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );

  const items = data ? data.flatMap((page) => page.data) : [];
  const total = data?.[0]?.meta.total ?? 0;
  const scored = data?.[0]?.meta.scored ?? false;
  const hasMore = items.length < total;
  const loadMore = useCallback(() => setSize((s) => s + 1), [setSize]);

  return {
    items,
    total,
    scored,
    hasMore,
    isLoading,
    isValidating,
    loadMore,
  };
}

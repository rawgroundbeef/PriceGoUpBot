"use client";

import useSWR from "swr";

export type VolumeOrder = {
  id: string;
  user_id: string;
  token_address: string;
  pool_address: string;
  volume_target: number;
  duration_hours: number;
  tasks_count: number;
  total_cost: number;
  status: string;
  created_at: string;
};

export function useOrdersQuery() {
  const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch orders: ${res.status}`);
    return (await res.json()) as { orders: VolumeOrder[] };
  };

  const { data, error, isLoading, mutate } = useSWR<{ orders: VolumeOrder[] }>(
    "/api/orders",
    fetcher,
    {
      refreshInterval: 15000, // auto-refresh every 15s
      revalidateOnFocus: true,
    },
  );

  return {
    orders: data?.orders ?? [],
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refresh: mutate,
  };
}



import { useQuery } from '@tanstack/react-query';
import { fetchAudits } from '@/lib/auditSupabase';
import { fetchCAPAs, fetchFindings } from '@/lib/executionSupabase';
import { fetchIncidents } from '@/lib/incidentSupabase';
import { fetchBranches, fetchBCKs, fetchSuppliers, fetchRegions } from '@/lib/entitySupabase';

// React Query hooks for dashboard data fetching
// Tuned staleTime based on data volatility:
// - High volatility (audits, CAPAs, findings, incidents): 1 minute
// - Medium volatility (templates): 3 minutes
// - Low volatility (entities): 5 minutes

export function useAudits() {
  return useQuery({
    queryKey: ['audits'],
    queryFn: fetchAudits,
    staleTime: 1 * 60 * 1000,          // 1 minute - audits change frequently
    refetchInterval: 2 * 60 * 1000,    // Background refetch every 2 minutes for dashboards
  });
}

export function useCAPAs() {
  return useQuery({
    queryKey: ['capas'],
    queryFn: fetchCAPAs,
    staleTime: 1 * 60 * 1000,          // 1 minute - CAPAs change frequently
    refetchInterval: 2 * 60 * 1000,    // Background refetch every 2 minutes
  });
}

export function useFindings() {
  return useQuery({
    queryKey: ['findings'],
    queryFn: fetchFindings,
    staleTime: 1 * 60 * 1000,          // 1 minute - findings change frequently
  });
}

export function useIncidents() {
  return useQuery({
    queryKey: ['incidents'],
    queryFn: fetchIncidents,
    staleTime: 1 * 60 * 1000,          // 1 minute - incidents change frequently
  });
}

// Entity hooks - entities change less frequently
export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    staleTime: 5 * 60 * 1000,          // 5 minutes - entities are relatively stable
  });
}

export function useBCKs() {
  return useQuery({
    queryKey: ['bcks'],
    queryFn: fetchBCKs,
    staleTime: 5 * 60 * 1000,          // 5 minutes - entities are relatively stable
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
    staleTime: 5 * 60 * 1000,          // 5 minutes - entities are relatively stable
  });
}

export function useRegions() {
  return useQuery({
    queryKey: ['regions'],
    queryFn: fetchRegions,
    staleTime: 5 * 60 * 1000,          // 5 minutes - entities are relatively stable
  });
}

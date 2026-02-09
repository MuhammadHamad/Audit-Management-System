/**
 * Centralized React Query configuration and cache invalidation helpers
 * 
 * Caching Strategy:
 * - High volatility data (audits, CAPAs, findings, incidents): 1 minute staleTime
 * - Medium volatility data (templates): 3 minutes staleTime  
 * - Low volatility data (entities): 5 minutes staleTime
 * - Global default: 3 minutes staleTime
 * 
 * Refetch Strategy:
 * - refetchOnWindowFocus: true (with built-in throttle)
 * - refetchOnReconnect: always
 * - refetchOnMount: true for stale data
 * - refetchInterval: enabled for critical dashboard data (audits, CAPAs)
 */

import type { QueryClient } from '@tanstack/react-query';

// Query key constants for type safety and consistency
export const QUERY_KEYS = {
  // Entities
  regions: ['regions'] as const,
  branches: ['branches'] as const,
  bcks: ['bcks'] as const,
  suppliers: ['suppliers'] as const,
  users: ['users'] as const,
  
  // Templates
  templates: ['templates'] as const,
  template: (id: string) => ['template', id] as const,
  
  // Audits
  audits: ['audits'] as const,
  audit: (id: string) => ['audit', id] as const,
  auditPlans: ['auditPlans'] as const,
  
  // Quality Management
  capas: ['capas'] as const,
  capa: (id: string) => ['capa', id] as const,
  findings: ['findings'] as const,
  finding: (id: string) => ['finding', id] as const,
  
  // Incidents
  incidents: ['incidents'] as const,
  incident: (id: string) => ['incident', id] as const,
} as const;

// Stale time constants (in milliseconds)
export const STALE_TIME = {
  HIGH_VOLATILITY: 1 * 60 * 1000,    // 1 minute - for frequently changing data
  MEDIUM_VOLATILITY: 3 * 60 * 1000,  // 3 minutes - for moderately changing data
  LOW_VOLATILITY: 5 * 60 * 1000,     // 5 minutes - for stable data
  VERY_LOW_VOLATILITY: 10 * 60 * 1000, // 10 minutes - for very stable data
} as const;

// Refetch interval constants (in milliseconds)
export const REFETCH_INTERVAL = {
  CRITICAL: 2 * 60 * 1000,   // 2 minutes - for critical dashboard data
  NORMAL: 5 * 60 * 1000,     // 5 minutes - for normal background updates
  SLOW: 10 * 60 * 1000,      // 10 minutes - for slow background updates
} as const;

/**
 * Invalidate all entity-related queries
 * Use after creating/updating/deleting entities
 */
export async function invalidateEntities(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.regions }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.branches }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.bcks }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.suppliers }),
  ]);
}

/**
 * Invalidate all audit-related queries
 * Use after creating/updating/deleting audits
 */
export async function invalidateAudits(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.audits }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auditPlans }),
  ]);
}

/**
 * Invalidate all quality management queries
 * Use after creating/updating/deleting CAPAs or findings
 */
export async function invalidateQualityManagement(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.capas }),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.findings }),
  ]);
}

/**
 * Invalidate all dashboard-critical queries
 * Use when you need to force a full dashboard refresh
 */
export async function invalidateDashboard(queryClient: QueryClient) {
  await Promise.all([
    invalidateAudits(queryClient),
    invalidateQualityManagement(queryClient),
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.incidents }),
    invalidateEntities(queryClient),
  ]);
}

/**
 * Prefetch critical data for faster navigation
 * Call this on app initialization or after login
 */
export async function prefetchCriticalData(queryClient: QueryClient) {
  // Prefetch is optional - React Query will fetch on demand
  // This is useful for data that's almost always needed
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.regions,
      staleTime: STALE_TIME.LOW_VOLATILITY,
    }),
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.templates,
      staleTime: STALE_TIME.MEDIUM_VOLATILITY,
    }),
  ]);
}

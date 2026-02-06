/**
 * Analytics Statistics Module
 * Provides data for the Analytics page with branch coverage, benchmarks, auditor performance, and rankings
 */

import { getAudits } from './auditStorage';
import { getBranches, getUserById } from './entityStorage';
import { getUsers } from './userStorage';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, eachMonthOfInterval, getMonth, getYear } from 'date-fns';

// ============= TYPES =============

export interface MonthlyBreakdown {
  month: string; // e.g., "January"
  monthIndex: number;
  branchesAudited: number;
  totalAudits: number;
}

export interface YearlyAuditVolume {
  year: number;
  totalBranchesAudited: number;
  totalAudits: number;
  monthlyBreakdown: MonthlyBreakdown[];
}

export interface ScoreBenchmark {
  threshold: number;
  label: string;
  count: number;
  branches: Array<{
    id: string;
    code: string;
    name: string;
    score: number;
    achievementCount: number;
  }>;
}

export interface MonthlyAverage {
  month: string;
  monthIndex: number;
  year: number;
  averageScore: number;
  auditCount: number;
}

export interface YearlyAverages {
  year: number;
  monthlyAverages: MonthlyAverage[];
  yearlyAverage: number;
  totalAudits: number;
  isComplete: boolean; // true if all 12 months have data
}

export interface AuditorPerformance {
  id: string;
  name: string;
  avatarUrl?: string;
  monthlyStats: Array<{
    month: string;
    monthIndex: number;
    branchesVisited: number;
    auditsCompleted: number;
  }>;
  totalBranchesVisited: number;
  totalAuditsCompleted: number;
}

export interface BranchRanking {
  id: string;
  code: string;
  name: string;
  regionName: string;
  averageScore: number;
  auditCount: number;
  latestScore: number | null;
}

// ============= BRANCH COVERAGE & AUDIT VOLUME =============

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const getAuditVolumeByYear = (year: number): YearlyAuditVolume => {
  const audits = getAudits();
  const branches = getBranches();
  
  // Filter approved audits for branches in the specified year
  const yearAudits = audits.filter(a => {
    const auditDate = new Date(a.scheduled_date);
    return a.status === 'approved' && 
           a.entity_type === 'branch' &&
           getYear(auditDate) === year;
  });

  // Group by month
  const monthlyBreakdown: MonthlyBreakdown[] = MONTH_NAMES.map((month, index) => {
    const monthAudits = yearAudits.filter(a => getMonth(new Date(a.scheduled_date)) === index);
    const uniqueBranches = new Set(monthAudits.map(a => a.entity_id));
    
    return {
      month,
      monthIndex: index,
      branchesAudited: uniqueBranches.size,
      totalAudits: monthAudits.length,
    };
  });

  const uniqueBranchesYear = new Set(yearAudits.map(a => a.entity_id));

  return {
    year,
    totalBranchesAudited: uniqueBranchesYear.size,
    totalAudits: yearAudits.length,
    monthlyBreakdown,
  };
};

export const getAvailableYears = (): number[] => {
  const audits = getAudits();
  const years = new Set<number>();
  
  audits.forEach(a => {
    if (a.status === 'approved') {
      years.add(getYear(new Date(a.scheduled_date)));
    }
  });
  
  // Also include current year if not present
  years.add(new Date().getFullYear());
  
  return Array.from(years).sort((a, b) => b - a);
};

// ============= SCORE PERFORMANCE & BENCHMARKS =============

export const getScoreBenchmarks = (year?: number, month?: number): ScoreBenchmark[] => {
  const audits = getAudits();
  const branches = getBranches();
  
  // Filter approved branch audits
  let filteredAudits = audits.filter(a => 
    a.status === 'approved' && 
    a.entity_type === 'branch' &&
    a.score !== null && a.score !== undefined
  );
  
  // Apply year filter
  if (year) {
    filteredAudits = filteredAudits.filter(a => 
      getYear(new Date(a.scheduled_date)) === year
    );
  }
  
  // Apply month filter
  if (month !== undefined && month >= 0) {
    filteredAudits = filteredAudits.filter(a => 
      getMonth(new Date(a.scheduled_date)) === month
    );
  }

  // Group audits by branch
  const branchAuditMap = new Map<string, number[]>();
  filteredAudits.forEach(a => {
    const scores = branchAuditMap.get(a.entity_id) || [];
    scores.push(a.score!);
    branchAuditMap.set(a.entity_id, scores);
  });

  const thresholds = [
    { threshold: 95, label: '≥95% (Excellent)' },
    { threshold: 92, label: '≥92% (Benchmark)' },
    { threshold: 80, label: '≥80% (Pass)' },
  ];

  return thresholds.map(({ threshold, label }) => {
    const qualifyingBranches: ScoreBenchmark['branches'] = [];

    branchAuditMap.forEach((scores, branchId) => {
      const achievementCount = scores.filter(s => s >= threshold).length;
      if (achievementCount > 0) {
        const branch = branches.find(b => b.id === branchId);
        if (branch) {
          const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
          qualifyingBranches.push({
            id: branch.id,
            code: branch.code,
            name: branch.name,
            score: Math.round(avgScore * 10) / 10,
            achievementCount,
          });
        }
      }
    });

    // Sort by achievement count descending
    qualifyingBranches.sort((a, b) => b.achievementCount - a.achievementCount);

    return {
      threshold,
      label,
      count: qualifyingBranches.length,
      branches: qualifyingBranches,
    };
  });
};

// ============= MONTHLY & YEARLY AVERAGES =============

export const getYearlyAverages = (year: number): YearlyAverages => {
  const audits = getAudits();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  // Filter approved branch audits with scores for the year
  const yearAudits = audits.filter(a => 
    a.status === 'approved' && 
    a.entity_type === 'branch' &&
    a.score !== null && a.score !== undefined &&
    getYear(new Date(a.scheduled_date)) === year
  );

  // Monthly averages
  const monthlyAverages: MonthlyAverage[] = MONTH_NAMES.map((month, index) => {
    const monthAudits = yearAudits.filter(a => getMonth(new Date(a.scheduled_date)) === index);
    const scores = monthAudits.map(a => a.score!).filter(s => s !== null);
    const avg = scores.length > 0 
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;

    return {
      month,
      monthIndex: index,
      year,
      averageScore: avg,
      auditCount: monthAudits.length,
    };
  });

  // Yearly average
  const allScores = yearAudits.map(a => a.score!).filter(s => s !== null);
  const yearlyAverage = allScores.length > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
    : 0;

  // Check if year is complete
  const isComplete = year < currentYear || 
    (year === currentYear && monthlyAverages.every(m => m.auditCount > 0));

  return {
    year,
    monthlyAverages,
    yearlyAverage,
    totalAudits: yearAudits.length,
    isComplete,
  };
};

// ============= AUDITOR PERFORMANCE =============

export const getAuditorPerformance = (year: number): AuditorPerformance[] => {
  const audits = getAudits();
  const users = getUsers();
  const auditors = users.filter(u => u.role === 'auditor' && u.status === 'active');
  
  // Filter approved branch audits for the year
  const yearAudits = audits.filter(a => 
    a.status === 'approved' && 
    a.entity_type === 'branch' &&
    getYear(new Date(a.scheduled_date)) === year
  );

  return auditors.map(auditor => {
    const auditorAudits = yearAudits.filter(a => a.auditor_id === auditor.id);
    
    const monthlyStats = MONTH_NAMES.map((month, index) => {
      const monthAudits = auditorAudits.filter(a => 
        getMonth(new Date(a.scheduled_date)) === index
      );
      const uniqueBranches = new Set(monthAudits.map(a => a.entity_id));
      
      return {
        month,
        monthIndex: index,
        branchesVisited: uniqueBranches.size,
        auditsCompleted: monthAudits.length,
      };
    });

    const totalBranchesVisited = new Set(auditorAudits.map(a => a.entity_id)).size;
    const totalAuditsCompleted = auditorAudits.length;

    return {
      id: auditor.id,
      name: auditor.full_name,
      avatarUrl: auditor.avatar_url,
      monthlyStats,
      totalBranchesVisited,
      totalAuditsCompleted,
    };
  }).filter(a => a.totalAuditsCompleted > 0) // Only show auditors with activity
    .sort((a, b) => b.totalAuditsCompleted - a.totalAuditsCompleted);
};

// ============= RANKINGS =============

export const getBranchRankings = (
  type: 'top' | 'bottom', 
  count: number = 10, 
  year?: number, 
  month?: number
): BranchRanking[] => {
  const audits = getAudits();
  const branches = getBranches();
  const regions = getBranches(); // We'll get region info from branch
  
  // Import regions properly
  const { getRegions } = require('./entityStorage');
  const allRegions = getRegions();
  
  // Filter approved branch audits with scores
  let filteredAudits = audits.filter(a => 
    a.status === 'approved' && 
    a.entity_type === 'branch' &&
    a.score !== null && a.score !== undefined
  );
  
  // Apply year filter
  if (year) {
    filteredAudits = filteredAudits.filter(a => 
      getYear(new Date(a.scheduled_date)) === year
    );
  }
  
  // Apply month filter
  if (month !== undefined && month >= 0) {
    filteredAudits = filteredAudits.filter(a => 
      getMonth(new Date(a.scheduled_date)) === month
    );
  }

  // Group audits by branch and calculate averages
  const branchScoreMap = new Map<string, { scores: number[], latest: number | null }>();
  
  // Sort by date to track latest
  filteredAudits.sort((a, b) => 
    new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
  );
  
  filteredAudits.forEach(a => {
    const entry = branchScoreMap.get(a.entity_id) || { scores: [], latest: null };
    entry.scores.push(a.score!);
    entry.latest = a.score!;
    branchScoreMap.set(a.entity_id, entry);
  });

  // Create rankings
  const rankings: BranchRanking[] = [];
  
  branchScoreMap.forEach((data, branchId) => {
    const branch = branches.find(b => b.id === branchId);
    if (branch) {
      const region = allRegions.find((r: any) => r.id === branch.region_id);
      const avgScore = Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10;
      
      rankings.push({
        id: branch.id,
        code: branch.code,
        name: branch.name,
        regionName: region?.name || 'Unknown',
        averageScore: avgScore,
        auditCount: data.scores.length,
        latestScore: data.latest,
      });
    }
  });

  // Sort by average score
  if (type === 'top') {
    rankings.sort((a, b) => b.averageScore - a.averageScore);
  } else {
    rankings.sort((a, b) => a.averageScore - b.averageScore);
  }

  return rankings.slice(0, count);
};

// ============= SUMMARY STATS FOR CARDS =============

export interface AnalyticsSummary {
  totalBranchesAudited: number;
  totalAuditsThisYear: number;
  overallPassRate: number;
  excellentRate: number; // ≥95%
  benchmarkRate: number; // ≥92%
  activeAuditors: number;
}

export const getAnalyticsSummary = (year: number): AnalyticsSummary => {
  const audits = getAudits();
  const users = getUsers();
  
  // Filter approved branch audits for the year
  const yearAudits = audits.filter(a => 
    a.status === 'approved' && 
    a.entity_type === 'branch' &&
    getYear(new Date(a.scheduled_date)) === year
  );

  const uniqueBranches = new Set(yearAudits.map(a => a.entity_id));
  const auditsWithScores = yearAudits.filter(a => a.score !== null && a.score !== undefined);
  
  const passCount = auditsWithScores.filter(a => a.score! >= 80).length;
  const excellentCount = auditsWithScores.filter(a => a.score! >= 95).length;
  const benchmarkCount = auditsWithScores.filter(a => a.score! >= 92).length;
  
  const overallPassRate = auditsWithScores.length > 0
    ? Math.round((passCount / auditsWithScores.length) * 100)
    : 0;
  
  const excellentRate = auditsWithScores.length > 0
    ? Math.round((excellentCount / auditsWithScores.length) * 100)
    : 0;
    
  const benchmarkRate = auditsWithScores.length > 0
    ? Math.round((benchmarkCount / auditsWithScores.length) * 100)
    : 0;

  // Active auditors (with completed audits this year)
  const activeAuditorIds = new Set(yearAudits.filter(a => a.auditor_id).map(a => a.auditor_id));

  return {
    totalBranchesAudited: uniqueBranches.size,
    totalAuditsThisYear: yearAudits.length,
    overallPassRate,
    excellentRate,
    benchmarkRate,
    activeAuditors: activeAuditorIds.size,
  };
};

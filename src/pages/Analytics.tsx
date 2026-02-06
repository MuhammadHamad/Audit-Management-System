import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Tooltip,
  Cell,
} from 'recharts';
import {
  Building2,
  ClipboardCheck,
  Target,
  Trophy,
  Users,
  TrendingUp,
  TrendingDown,
  Calendar,
  Award,
  Star,
  Medal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getAuditVolumeByYear,
  getAvailableYears,
  getScoreBenchmarks,
  getYearlyAverages,
  getAuditorPerformance,
  getBranchRankings,
  getAnalyticsSummary,
} from '@/lib/analyticsStats';
import { HealthScoreBadge } from '@/components/entities/HealthScoreBadge';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);
  
  // All hooks must be called before any conditional returns
  const availableYears = useMemo(() => getAvailableYears(), []);
  const summary = useMemo(() => getAnalyticsSummary(selectedYear), [selectedYear]);
  const auditVolume = useMemo(() => getAuditVolumeByYear(selectedYear), [selectedYear]);
  const benchmarks = useMemo(() => getScoreBenchmarks(selectedYear, selectedMonth), [selectedYear, selectedMonth]);
  const yearlyAverages = useMemo(() => getYearlyAverages(selectedYear), [selectedYear]);
  const auditorPerformance = useMemo(() => getAuditorPerformance(selectedYear), [selectedYear]);
  const topBranches = useMemo(() => getBranchRankings('top', 10, selectedYear, selectedMonth), [selectedYear, selectedMonth]);
  const bottomBranches = useMemo(() => getBranchRankings('bottom', 10, selectedYear, selectedMonth), [selectedYear, selectedMonth]);

  const chartConfig = {
    branchesAudited: { label: 'Branches Audited', color: 'hsl(var(--primary))' },
    totalAudits: { label: 'Total Audits', color: 'hsl(var(--muted-foreground))' },
    averageScore: { label: 'Average Score', color: 'hsl(var(--primary))' },
  };
  
  // Block access for non-admin roles (after all hooks)
  if (!user || !['super_admin', 'audit_manager'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">Branch audit performance insights</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select
            value={selectedYear.toString()}
            onValueChange={(val) => setSelectedYear(Number(val))}
          >
            <SelectTrigger className="w-[120px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select
            value={selectedMonth !== undefined ? selectedMonth.toString() : 'all'}
            onValueChange={(val) => setSelectedMonth(val === 'all' ? undefined : Number(val))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTH_NAMES.map((month, idx) => (
                <SelectItem key={idx} value={idx.toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-2">{summary.totalBranchesAudited}</p>
            <p className="text-xs text-muted-foreground">Branches Audited</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <ClipboardCheck className="h-8 w-8 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-2">{summary.totalAuditsThisYear}</p>
            <p className="text-xs text-muted-foreground">Total Audits</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Target className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-2xl font-bold mt-2">{summary.overallPassRate}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate (≥80%)</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Award className="h-8 w-8 text-yellow-600" />
            </div>
            <p className="text-2xl font-bold mt-2">{summary.benchmarkRate}%</p>
            <p className="text-xs text-muted-foreground">Benchmark (≥92%)</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Trophy className="h-8 w-8 text-amber-500" />
            </div>
            <p className="text-2xl font-bold mt-2">{summary.excellentRate}%</p>
            <p className="text-xs text-muted-foreground">Excellent (≥95%)</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <p className="text-2xl font-bold mt-2">{summary.activeAuditors}</p>
            <p className="text-xs text-muted-foreground">Active Auditors</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Section 1: Branch Coverage & Audit Volume */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Branch Coverage & Audit Volume
          </CardTitle>
          <CardDescription>
            Monthly breakdown of branches audited in {selectedYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px]">
            <BarChart data={auditVolume.monthlyBreakdown}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                tickFormatter={(val) => val.slice(0, 3)}
                className="text-xs"
              />
              <YAxis className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar 
                dataKey="branchesAudited" 
                fill="hsl(var(--primary))" 
                radius={[4, 4, 0, 0]}
                name="Branches Audited"
              />
              <Bar 
                dataKey="totalAudits" 
                fill="hsl(var(--muted-foreground))" 
                radius={[4, 4, 0, 0]}
                opacity={0.5}
                name="Total Audits"
              />
            </BarChart>
          </ChartContainer>
          
          {/* Monthly summary table */}
          <div className="mt-4 border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Branches</TableHead>
                  <TableHead className="text-right">Audits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditVolume.monthlyBreakdown.map((m) => (
                  <TableRow key={m.monthIndex}>
                    <TableCell className="font-medium">{m.month}</TableCell>
                    <TableCell className="text-right">{m.branchesAudited}</TableCell>
                    <TableCell className="text-right">{m.totalAudits}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Total {selectedYear}</TableCell>
                  <TableCell className="text-right">{auditVolume.totalBranchesAudited}</TableCell>
                  <TableCell className="text-right">{auditVolume.totalAudits}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Section 2: Score Performance & Benchmarks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Score Performance & Benchmarks
          </CardTitle>
          <CardDescription>
            Branches achieving score thresholds {selectedMonth !== undefined ? `in ${MONTH_NAMES[selectedMonth]}` : ''} {selectedYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {benchmarks.map((benchmark) => (
              <div key={benchmark.threshold} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {benchmark.threshold >= 95 && <Trophy className="h-5 w-5 text-amber-500" />}
                    {benchmark.threshold === 92 && <Award className="h-5 w-5 text-yellow-600" />}
                    {benchmark.threshold === 80 && <Target className="h-5 w-5 text-green-600" />}
                    <span className="font-medium">{benchmark.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-lg px-3">
                    {benchmark.count} branches
                  </Badge>
                </div>
                
                {benchmark.branches.length > 0 ? (
                  <ScrollArea className="h-[200px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Branch</TableHead>
                          <TableHead className="text-right">Avg Score</TableHead>
                          <TableHead className="text-right">Times Achieved</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {benchmark.branches.map((branch) => (
                          <TableRow key={branch.id}>
                            <TableCell>
                              <span className="font-medium">{branch.code}</span>
                              <span className="text-muted-foreground ml-2">{branch.name}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <HealthScoreBadge score={branch.score} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline">{branch.achievementCount}x</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg">
                    No branches achieved this threshold in the selected period
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Section 3: Monthly & Yearly Averages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Monthly & Yearly Averages
          </CardTitle>
          <CardDescription>
            Average audit scores by month for {selectedYear}
            {yearlyAverages.isComplete && (
              <Badge variant="secondary" className="ml-2">Complete Year</Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 bg-muted/50 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Full Year Average</p>
              <p className="text-3xl font-bold">
                {yearlyAverages.yearlyAverage > 0 ? `${yearlyAverages.yearlyAverage}%` : 'N/A'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Audits</p>
              <p className="text-2xl font-semibold">{yearlyAverages.totalAudits}</p>
            </div>
          </div>
          
          <ChartContainer config={chartConfig} className="h-[250px]">
            <LineChart data={yearlyAverages.monthlyAverages}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                tickFormatter={(val) => val.slice(0, 3)}
                className="text-xs"
              />
              <YAxis domain={[0, 100]} className="text-xs" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line 
                type="monotone" 
                dataKey="averageScore" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
                name="Average Score"
              />
            </LineChart>
          </ChartContainer>
          
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {yearlyAverages.monthlyAverages.map((m) => (
              <div 
                key={m.monthIndex}
                className={cn(
                  "text-center p-2 rounded-lg border",
                  m.averageScore >= 92 && "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800",
                  m.averageScore >= 80 && m.averageScore < 92 && "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800",
                  m.averageScore > 0 && m.averageScore < 80 && "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
                  m.averageScore === 0 && "bg-muted"
                )}
              >
                <p className="text-xs font-medium">{m.month.slice(0, 3)}</p>
                <p className="text-sm font-bold">
                  {m.averageScore > 0 ? `${m.averageScore}%` : '-'}
                </p>
                <p className="text-xs text-muted-foreground">{m.auditCount} audits</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Section 4: Auditor Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Auditor Performance
          </CardTitle>
          <CardDescription>
            Branches visited and audits completed per auditor in {selectedYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditorPerformance.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No auditor activity recorded for {selectedYear}
            </p>
          ) : (
            <div className="space-y-6">
              {auditorPerformance.map((auditor, idx) => (
                <div key={auditor.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">
                          {auditor.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{auditor.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {auditor.totalBranchesVisited} branches • {auditor.totalAuditsCompleted} audits
                        </p>
                      </div>
                    </div>
                    {idx === 0 && auditorPerformance.length > 1 && (
                      <Badge className="bg-amber-500">Top Performer</Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                    {auditor.monthlyStats.map((m) => (
                      <div 
                        key={m.monthIndex}
                        className={cn(
                          "text-center p-1 rounded text-xs",
                          m.auditsCompleted > 0 ? "bg-primary/10" : "bg-muted"
                        )}
                        title={`${m.month}: ${m.branchesVisited} branches, ${m.auditsCompleted} audits`}
                      >
                        <p className="font-medium">{m.month.slice(0, 1)}</p>
                        <p className="text-muted-foreground">{m.auditsCompleted || '-'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Section 5: Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Top 10 Branches
            </CardTitle>
            <CardDescription>
              Best performing branches {selectedMonth !== undefined ? `in ${MONTH_NAMES[selectedMonth]}` : ''} {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topBranches.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No audit data available
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Avg Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topBranches.map((branch, idx) => (
                    <TableRow key={branch.id}>
                      <TableCell>
                        {idx === 0 && <Medal className="h-5 w-5 text-amber-500" />}
                        {idx === 1 && <Medal className="h-5 w-5 text-gray-400" />}
                        {idx === 2 && <Medal className="h-5 w-5 text-amber-700" />}
                        {idx > 2 && <span className="text-muted-foreground">{idx + 1}</span>}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{branch.code}</span>
                        <span className="text-muted-foreground ml-2 text-sm">{branch.name}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {branch.regionName}
                      </TableCell>
                      <TableCell className="text-right">
                        <HealthScoreBadge score={branch.averageScore} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        
        {/* Bottom 10 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Bottom 10 Branches
            </CardTitle>
            <CardDescription>
              Lowest performing branches {selectedMonth !== undefined ? `in ${MONTH_NAMES[selectedMonth]}` : ''} {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bottomBranches.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No audit data available
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Avg Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bottomBranches.map((branch, idx) => (
                    <TableRow key={branch.id}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <span className="font-medium">{branch.code}</span>
                        <span className="text-muted-foreground ml-2 text-sm">{branch.name}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {branch.regionName}
                      </TableCell>
                      <TableCell className="text-right">
                        <HealthScoreBadge score={branch.averageScore} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

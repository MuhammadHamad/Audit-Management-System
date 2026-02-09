import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { 
  FileSpreadsheet, 
  Download, 
  CalendarIcon, 
  ClipboardCheck,
  TrendingDown,
  AlertTriangle,
  Truck,
  Users,
  BarChart3,
  CheckCircle,
  Loader2,
  Clock,
  FileText,
  ChevronDown
} from 'lucide-react';
import { format, subDays, startOfMonth, subMonths } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { fetchTemplates } from '@/lib/templateSupabase';
import { 
  ReportType, 
  FileFormat, 
  ReportConfig,
  generateReport,
  quickExportOpenCAPA,
  quickExportHealthScores,
  getLastReportMeta,
  getUserScope
} from '@/lib/reportGenerators';
import { getBranches, getBCKs, getSuppliers } from '@/lib/entityStorage';

// Report type options by role
const getReportTypesForRole = (role: string): { value: ReportType; label: string; icon: React.ReactNode }[] => {
  const allTypes: { value: ReportType; label: string; icon: React.ReactNode }[] = [
    { value: 'audit_summary', label: 'Audit Summary Report', icon: <ClipboardCheck className="h-4 w-4" /> },
    { value: 'health_score_rankings', label: 'Health Score Rankings', icon: <TrendingDown className="h-4 w-4" /> },
    { value: 'capa_performance', label: 'CAPA Performance Report', icon: <CheckCircle className="h-4 w-4" /> },
    { value: 'finding_trends', label: 'Finding Trends Report', icon: <BarChart3 className="h-4 w-4" /> },
    { value: 'incident_analysis', label: 'Incident Analysis Report', icon: <AlertTriangle className="h-4 w-4" /> },
    { value: 'supplier_quality', label: 'Supplier Quality Report', icon: <Truck className="h-4 w-4" /> },
    { value: 'auditor_performance', label: 'Auditor Performance Report', icon: <Users className="h-4 w-4" /> },
  ];
  
  if (role === 'audit_manager' || role === 'super_admin') {
    return allTypes;
  }
  
  if (role === 'regional_manager') {
    return allTypes.filter(t => 
      ['audit_summary', 'health_score_rankings', 'capa_performance', 'finding_trends', 'incident_analysis'].includes(t.value)
    );
  }
  
  if (role === 'branch_manager') {
    return allTypes.filter(t => 
      ['audit_summary', 'capa_performance', 'incident_analysis'].includes(t.value)
    );
  }
  
  if (role === 'bck_manager') {
    return allTypes.filter(t => 
      ['audit_summary', 'capa_performance', 'supplier_quality'].includes(t.value)
    );
  }
  
  return [];
};

export default function ReportsPage() {
  const { user } = useAuth();
  
  // Block access for auditor and staff
  if (!user || ['auditor', 'staff'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  const [reportType, setReportType] = useState<ReportType | ''>('');
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [includeEvidence, setIncludeEvidence] = useState(false);
  const [fileFormat, setFileFormat] = useState<FileFormat>('xlsx');
  const [isGenerating, setIsGenerating] = useState(false);
  const [entitySearchOpen, setEntitySearchOpen] = useState(false);
  
  const reportTypes = useMemo(() => getReportTypesForRole(user.role), [user.role]);
  const scope = useMemo(() => getUserScope(user.id, user.role), [user.id, user.role]);
  const lastReport = getLastReportMeta();
  
  // Get available entities for the multi-select
  const availableEntities = useMemo(() => {
    const entities: { id: string; label: string; type: string }[] = [];
    
    if (user.role === 'branch_manager' || user.role === 'bck_manager') {
      // These roles don't get to choose entities
      return [];
    }
    
    const branches = getBranches().filter(b => scope.branches.includes(b.id));
    const bcks = getBCKs().filter(b => scope.bcks.includes(b.id));
    const suppliers = getSuppliers().filter(s => scope.suppliers.includes(s.id));
    
    branches.forEach(b => entities.push({ id: b.id, label: `${b.code} - ${b.name}`, type: 'Branch' }));
    bcks.forEach(b => entities.push({ id: b.id, label: `${b.code} - ${b.name}`, type: 'BCK' }));
    suppliers.forEach(s => entities.push({ id: s.id, label: `${s.supplier_code} - ${s.name}`, type: 'Supplier' }));
    
    return entities;
  }, [scope, user.role]);
  
  const handleGenerate = async () => {
    if (!reportType) {
      toast({
        title: "Select report type",
        description: "Please select a report type to generate.",
        variant: "destructive",
      });
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const config: ReportConfig = {
        reportType,
        dateRange: { from: dateFrom, to: dateTo },
        entityIds: selectedEntities.length > 0 ? selectedEntities : undefined,
        includeEvidence,
        fileFormat,
      };
      
      // Simulate some processing time for UX
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const templates = await fetchTemplates();
      const templateNameById: Record<string, string> = {};
      for (const t of templates) templateNameById[t.id] = t.name;
      generateReport(config, user.id, user.role, { templateNameById });
      
      const selectedType = reportTypes.find(t => t.value === reportType);
      toast({
        title: "Report downloaded",
        description: `${selectedType?.label} has been generated and downloaded.`,
      });
    } catch (error) {
      console.error('Report generation error:', error);
      toast({
        title: "Error generating report",
        description: "An error occurred while generating the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleQuickExport = (type: 'audits' | 'capa' | 'health') => {
    try {
      if (type === 'audits') {
        void (async () => {
          const templates = await fetchTemplates();
          const templateNameById: Record<string, string> = {};
          for (const t of templates) templateNameById[t.id] = t.name;
          generateReport(
            {
              reportType: 'audit_summary',
              dateRange: { from: subDays(new Date(), 90), to: new Date() },
              includeEvidence: false,
              fileFormat: 'csv',
            },
            user.id,
            user.role,
            { templateNameById }
          );
        })();
        toast({ title: "Export complete", description: "Audits CSV has been downloaded." });
      } else if (type === 'capa') {
        quickExportOpenCAPA(user.id, user.role);
        toast({ title: "Export complete", description: "Open CAPA CSV has been downloaded." });
      } else {
        quickExportHealthScores(user.id, user.role);
        toast({ title: "Export complete", description: "Health Scores CSV has been downloaded." });
      }
    } catch (error) {
      toast({
        title: "Export failed",
        description: "An error occurred during export.",
        variant: "destructive",
      });
    }
  };
  
  const toggleEntity = (entityId: string) => {
    setSelectedEntities(prev => 
      prev.includes(entityId) 
        ? prev.filter(id => id !== entityId)
        : [...prev, entityId]
    );
  };
  
  const getQuickExportLabel = (type: 'audits' | 'capa' | 'health') => {
    const prefix = user.role === 'regional_manager' ? 'My Region' 
      : user.role === 'branch_manager' ? 'My Branch' 
      : user.role === 'bck_manager' ? 'My BCK'
      : 'All';
    
    if (type === 'audits') return `${prefix} Audits (Last 90 Days)`;
    if (type === 'capa') return `${prefix} Open CAPA`;
    return `${prefix} Health Scores`;
  };
  
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground">Generate and export data reports</p>
      </div>
      
      {/* Report Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Generate Report
          </CardTitle>
          <CardDescription>
            Configure your report parameters and download in CSV or Excel format
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Report Type */}
          <div className="space-y-2">
            <Label htmlFor="reportType">Report Type *</Label>
            <Select value={reportType} onValueChange={(value) => setReportType(value as ReportType)}>
              <SelectTrigger id="reportType" className="w-full">
                <SelectValue placeholder="Select report type" />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      {type.icon}
                      <span>{type.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => date && setDateFrom(date)}
                    disabled={(date) => date > new Date() || date > dateTo}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label>To Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(date) => date && setDateTo(date)}
                    disabled={(date) => date > new Date() || date < dateFrom}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          {/* Entity Filter - only for roles that can filter */}
          {availableEntities.length > 0 && (
            <div className="space-y-2">
              <Label>Entity Filter (optional)</Label>
              <Popover open={entitySearchOpen} onOpenChange={setEntitySearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    role="combobox"
                    aria-expanded={entitySearchOpen}
                  >
                    {selectedEntities.length === 0 
                      ? "All entities (no filter)" 
                      : `${selectedEntities.length} entities selected`}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <div className="p-2 border-b">
                    <p className="text-sm text-muted-foreground">
                      Select entities to include in the report. Leave empty for all.
                    </p>
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div className="p-2 space-y-1">
                      {availableEntities.map((entity) => (
                        <div
                          key={entity.id}
                          className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer"
                          onClick={() => toggleEntity(entity.id)}
                        >
                          <Checkbox 
                            checked={selectedEntities.includes(entity.id)} 
                            onCheckedChange={() => toggleEntity(entity.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{entity.label}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {entity.type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  {selectedEntities.length > 0 && (
                    <div className="p-2 border-t">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full"
                        onClick={() => setSelectedEntities([])}
                      >
                        Clear selection
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}
          
          {/* Include Evidence Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="includeEvidence">Include Evidence</Label>
              <p className="text-sm text-muted-foreground">
                Include evidence URLs in Excel reports (increases file size)
              </p>
            </div>
            <Switch 
              id="includeEvidence"
              checked={includeEvidence} 
              onCheckedChange={setIncludeEvidence} 
            />
          </div>
          
          {/* File Format */}
          <div className="space-y-3">
            <Label>File Format</Label>
            <RadioGroup 
              value={fileFormat} 
              onValueChange={(value) => setFileFormat(value as FileFormat)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  CSV
                  <span className="text-xs text-muted-foreground">(Raw data)</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="xlsx" id="xlsx" />
                <Label htmlFor="xlsx" className="flex items-center gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel (XLSX)
                  <span className="text-xs text-muted-foreground">(Formatted with summary)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
          
          {/* Generate Button */}
          <Button 
            onClick={handleGenerate} 
            disabled={!reportType || isGenerating}
            className="w-full md:w-auto"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating report...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Generate Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      
      {/* Quick Export Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Quick Exports</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card 
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => handleQuickExport('audits')}
          >
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <ClipboardCheck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{getQuickExportLabel('audits')}</p>
                <p className="text-sm text-muted-foreground">Export approved audits as CSV</p>
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => handleQuickExport('capa')}
          >
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-warning/10">
                <CheckCircle className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="font-medium text-foreground">{getQuickExportLabel('capa')}</p>
                <p className="text-sm text-muted-foreground">Export open/escalated CAPA as CSV</p>
              </div>
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => handleQuickExport('health')}
          >
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-success/10">
                <TrendingDown className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="font-medium text-foreground">{getQuickExportLabel('health')}</p>
                <p className="text-sm text-muted-foreground">Export current health scores as CSV</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Last Generated Report */}
      {lastReport && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Latest report: {lastReport.filename}</p>
                <p className="text-xs text-muted-foreground">
                  Generated {format(new Date(lastReport.timestamp), 'PPp')}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (lastReport.config) {
                  void (async () => {
                    const config: ReportConfig = {
                      ...lastReport.config,
                      dateRange: {
                        from: new Date(lastReport.config.dateRange.from),
                        to: new Date(lastReport.config.dateRange.to),
                      },
                    };
                    const templates = await fetchTemplates();
                    const templateNameById: Record<string, string> = {};
                    for (const t of templates) templateNameById[t.id] = t.name;
                    generateReport(config, user.id, user.role, { templateNameById });
                    toast({ title: "Report regenerated", description: lastReport.filename });
                  })();
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Again
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HealthScoreIndicator } from '@/components/entities/HealthScoreIndicator';
import { 
  AlertTriangle, 
  MapPin,
  Factory,
  CheckCircle2,
  AlertCircle,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { User, BCK, Supplier } from '@/types';
import { 
  getBCKById, 
  getBCKs,
  getBranchById,
  getBranches,
  getSuppliers,
  getUserById,
} from '@/lib/entityStorage';
import { getAssignmentsForUser } from '@/lib/userStorage';
import { getAudits } from '@/lib/auditStorage';
import { getCAPAs } from '@/lib/auditExecutionStorage';
import { getHealthScores } from '@/lib/healthScoreEngine';
import { getIncidents } from '@/lib/incidentStorage';
import { formatDistanceToNow, format, differenceInDays } from 'date-fns';

interface BCKManagerDashboardProps {
  user: User;
}

interface Certification {
  name: string;
  expiry_date: string;
  document_url?: string;
}

export function BCKManagerDashboard({ user }: BCKManagerDashboardProps) {
  const navigate = useNavigate();

  // Get user's assigned BCK
  const bckData = useMemo(() => {
    // Check assignments
    const assignments = getAssignmentsForUser(user.id);
    const bckAssignment = assignments.find(a => a.assigned_type === 'bck');
    if (bckAssignment) {
      return getBCKById(bckAssignment.assigned_id);
    }
    
    // Also check if user is the manager of any BCK
    const bcks = getBCKs();
    const managedBCK = bcks.find(b => b.manager_id === user.id);
    return managedBCK;
  }, [user.id]);

  // Get health score components
  const healthScoreData = useMemo(() => {
    if (!bckData) return null;
    
    const healthScores = getHealthScores();
    const bckHealth = healthScores.find(
      h => h.entity_type === 'bck' && h.entity_id === bckData.id
    );
    
    return bckHealth?.components || null;
  }, [bckData]);

  // Parse certifications
  const certifications = useMemo((): Certification[] => {
    if (!bckData?.certifications) return [];
    
    // If certifications is an array of strings (legacy format), convert to objects
    if (typeof bckData.certifications[0] === 'string') {
      return (bckData.certifications as string[]).map(name => ({
        name,
        expiry_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), // Default 6 months from now
      }));
    }
    
    return bckData.certifications as unknown as Certification[];
  }, [bckData]);

  // KPI calculations
  const kpiData = useMemo(() => {
    if (!bckData) return null;
    
    const audits = getAudits();
    const capas = getCAPAs();
    const incidents = getIncidents();
    const suppliers = getSuppliers();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // HACCP Compliance from health score components
    const healthScores = getHealthScores();
    const bckHealth = healthScores.find(
      h => h.entity_type === 'bck' && h.entity_id === bckData.id
    );
    const haccpCompliance = bckHealth?.components?.haccp_compliance ?? null;

    // Audits this month
    const auditsThisMonth = audits.filter(a => {
      const date = new Date(a.scheduled_date);
      return date.getMonth() === currentMonth && 
             date.getFullYear() === currentYear &&
             a.entity_id === bckData.id;
    }).length;

    // Open CAPA
    const openCAPA = capas.filter(c =>
      ['open', 'in_progress'].includes(c.status) &&
      c.entity_id === bckData.id
    ).length;

    // Supplier issues - incidents where entity is a supplier that supplies to this BCK
    const bckSuppliers = suppliers.filter(s => 
      s.supplies_to?.bcks?.includes(bckData.id)
    );
    const supplierIds = bckSuppliers.map(s => s.id);
    const supplierIssues = incidents.filter(i =>
      i.entity_type === 'supplier' &&
      supplierIds.includes(i.entity_id) &&
      ['open', 'under_investigation'].includes(i.status)
    ).length;

    // Branches supplied
    const branchesSupplied = bckData.supplies_branches?.length || 0;

    return {
      haccpCompliance,
      auditsThisMonth,
      openCAPA,
      supplierIssues,
      branchesSupplied,
    };
  }, [bckData]);

  // Supplied branches
  const suppliedBranches = useMemo(() => {
    if (!bckData?.supplies_branches) return [];
    
    return bckData.supplies_branches.map(branchId => {
      const branch = getBranchById(branchId);
      if (!branch) return null;
      
      return {
        id: branch.id,
        code: branch.code,
        name: branch.name,
        city: branch.city,
        healthScore: branch.health_score,
        hasAuditHistory: !!branch.last_audit_date,
      };
    }).filter(Boolean).sort((a, b) => a!.healthScore - b!.healthScore) as Array<{
      id: string;
      code: string;
      name: string;
      city?: string;
      healthScore: number;
      hasAuditHistory: boolean;
    }>;
  }, [bckData]);

  // Suppliers that supply to this BCK
  const bckSuppliers = useMemo(() => {
    if (!bckData) return [];
    
    const suppliers = getSuppliers();
    const incidents = getIncidents();
    
    return suppliers
      .filter(s => s.supplies_to?.bcks?.includes(bckData.id))
      .map(supplier => {
        const supplierIncidents = incidents.filter(i =>
          i.entity_type === 'supplier' &&
          i.entity_id === supplier.id &&
          ['open', 'under_investigation'].includes(i.status)
        ).length;
        
        return {
          ...supplier,
          incidentCount: supplierIncidents,
        };
      })
      .sort((a, b) => a.quality_score - b.quality_score);
  }, [bckData]);

  // Recent audits
  const recentAudits = useMemo(() => {
    if (!bckData) return [];
    
    const audits = getAudits()
      .filter(a => a.entity_id === bckData.id)
      .sort((a, b) => {
        const dateA = a.completed_at || a.scheduled_date;
        const dateB = b.completed_at || b.scheduled_date;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .slice(0, 10);

    return audits.map(audit => {
      const auditor = audit.auditor_id ? getUserById(audit.auditor_id) : null;
      return {
        ...audit,
        auditorName: auditor?.full_name || 'Unassigned',
        relativeDate: formatDistanceToNow(new Date(audit.completed_at || audit.scheduled_date), { addSuffix: true }),
      };
    });
  }, [bckData]);

  // Error state: No BCK assigned
  if (!bckData) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">No BCK Assigned</h2>
          <p className="text-muted-foreground">
            No BCK is assigned to your account. Contact your administrator to get access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: BCK Header Card */}
      <Card className="bg-muted/30">
        <CardContent className="py-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">{bckData.name}</h1>
              <p className="text-sm text-muted-foreground">{bckData.code}</p>
              {(bckData.city || bckData.address) && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{[bckData.address, bckData.city].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {bckData.production_capacity && (
                <div className="flex items-center gap-2 mt-2">
                  <Factory className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">{bckData.production_capacity}</Badge>
                </div>
              )}
            </div>
            <div className="flex flex-col items-center">
              <HealthScoreIndicator
                score={bckData.health_score}
                entityType="bck"
                size="lg"
                showLabel
                showComponents
                components={healthScoreData}
                hasAudits={bckData.health_score > 0}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: KPI Cards */}
      {kpiData && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="py-4">
              {kpiData.haccpCompliance != null ? (
                <HealthScoreIndicator 
                  score={kpiData.haccpCompliance} 
                  entityType="bck" 
                  size="sm"
                />
              ) : (
                <span className="text-2xl font-semibold text-muted-foreground">—</span>
              )}
              <p className="text-xs text-muted-foreground mt-1">HACCP Compliance</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-primary">
                {kpiData.auditsThisMonth}
              </p>
              <p className="text-xs text-muted-foreground">Audits This Month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className={cn(
                "text-2xl font-semibold",
                kpiData.openCAPA > 0 ? "text-destructive" : "text-muted-foreground"
              )}>
                {kpiData.openCAPA}
              </p>
              <p className="text-xs text-muted-foreground">Open CAPA</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className={cn(
                "text-2xl font-semibold",
                kpiData.supplierIssues > 0 ? "text-warning" : "text-muted-foreground"
              )}>
                {kpiData.supplierIssues}
              </p>
              <p className="text-xs text-muted-foreground">Supplier Issues</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-muted-foreground">
                {kpiData.branchesSupplied}
              </p>
              <p className="text-xs text-muted-foreground">Branches Supplied</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 3: Certification Status Cards */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Certifications</CardTitle>
        </CardHeader>
        <CardContent>
          {certifications.length === 0 ? (
            <div className="text-center py-8 bg-muted/30 rounded-lg">
              <p className="text-muted-foreground">
                No certifications on file. Add certifications in BCK settings.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {certifications.map((cert, index) => {
                const expiryDate = new Date(cert.expiry_date);
                const today = new Date();
                const daysUntilExpiry = differenceInDays(expiryDate, today);
                
                let status: 'valid' | 'expiring' | 'expired';
                if (daysUntilExpiry < 0) {
                  status = 'expired';
                } else if (daysUntilExpiry <= 30) {
                  status = 'expiring';
                } else {
                  status = 'valid';
                }
                
                return (
                  <Card 
                    key={index}
                    className={cn(
                      "p-4 min-w-[200px]",
                      status === 'expired' && "border-destructive bg-destructive/5",
                      status === 'expiring' && "border-warning bg-warning/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{cert.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Expires: {format(expiryDate, 'MMM d, yyyy')}
                        </p>
                      </div>
                      {status === 'valid' && (
                        <div className="flex items-center gap-1 text-success">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-xs">Valid</span>
                        </div>
                      )}
                      {status === 'expiring' && (
                        <div className="flex items-center gap-1 text-warning">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-xs">Expiring Soon</span>
                        </div>
                      )}
                      {status === 'expired' && (
                        <div className="flex items-center gap-1 text-destructive">
                          <XCircle className="h-4 w-4" />
                          <span className="text-xs">Expired</span>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Supplied Branches + Supplier Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Supplied Branches */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Branches We Supply</CardTitle>
          </CardHeader>
          <CardContent>
            {suppliedBranches.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                This BCK does not supply any branches yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Health Score</TableHead>
                    <TableHead>Last Delivery</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliedBranches.map(branch => (
                    <TableRow key={branch.id}>
                      <TableCell>
                        <span className="font-medium">{branch.code}</span>
                        <span className="text-muted-foreground ml-2 text-sm">{branch.name}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {branch.city || '—'}
                      </TableCell>
                      <TableCell>
                        <HealthScoreIndicator 
                          score={branch.healthScore} 
                          entityType="branch" 
                          size="sm"
                          hasAudits={branch.hasAuditHistory}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Right: Supplier Quality */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Our Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            {bckSuppliers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No suppliers linked to this BCK yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quality Score</TableHead>
                    <TableHead>Incidents</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bckSuppliers.map(supplier => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {supplier.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <HealthScoreIndicator 
                          score={supplier.quality_score} 
                          entityType="supplier" 
                          size="sm"
                          hasAudits={supplier.quality_score > 0}
                        />
                      </TableCell>
                      <TableCell>
                        <span className={supplier.incidentCount > 0 ? 'text-destructive font-medium' : ''}>
                          {supplier.incidentCount}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 5: Recent Audits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Audits</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAudits.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No audits yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Audit</TableHead>
                  <TableHead>Auditor</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAudits.map(audit => (
                  <TableRow 
                    key={audit.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/audits/${audit.id}`)}
                  >
                    <TableCell className="font-medium">{audit.audit_code}</TableCell>
                    <TableCell>{audit.auditorName}</TableCell>
                    <TableCell>
                      {audit.status === 'approved' && audit.score != null ? (
                        <HealthScoreIndicator score={audit.score} entityType="bck" size="sm" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        audit.status === 'approved' ? 'default' :
                        audit.status === 'pending_verification' ? 'secondary' :
                        audit.status === 'overdue' ? 'destructive' : 'outline'
                      }>
                        {audit.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {audit.relativeDate}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  HealthScoreWeights,
  NotificationPreference,
  PasswordPolicy,
  getHealthScoreWeights,
  saveHealthScoreWeights,
  getNotificationPreferences,
  saveNotificationPreferences,
  getPasswordPolicy,
  savePasswordPolicy,
  defaultHealthScoreWeights,
  defaultNotificationPreferences,
  defaultPasswordPolicy,
} from '@/lib/settingsStorage';
import { runBatchRecalculation } from '@/lib/healthScoreEngine';
import { getUsers } from '@/lib/entityStorage';
import { getBranches, getBCKs, getSuppliers } from '@/lib/entityStorage';
import { getAudits } from '@/lib/auditStorage';
import { getCAPAs } from '@/lib/auditExecutionStorage';

export default function SettingsPage() {
  const [branchWeights, setBranchWeights] = useState(defaultHealthScoreWeights.branch);
  const [bckWeights, setBckWeights] = useState(defaultHealthScoreWeights.bck);
  const [supplierWeights, setSupplierWeights] = useState(defaultHealthScoreWeights.supplier);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference[]>(defaultNotificationPreferences);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>(defaultPasswordPolicy);
  const [isRecalculating, setIsRecalculating] = useState(false);

  useEffect(() => {
    const weights = getHealthScoreWeights();
    setBranchWeights(weights.branch);
    setBckWeights(weights.bck);
    setSupplierWeights(weights.supplier);
    setNotificationPrefs(getNotificationPreferences());
    setPasswordPolicy(getPasswordPolicy());
  }, []);

  const calculateTotal = (weights: Record<string, number>) => {
    return Object.values(weights).reduce((sum, val) => sum + val, 0);
  };

  const branchTotal = calculateTotal(branchWeights);
  const bckTotal = calculateTotal(bckWeights);
  const supplierTotal = calculateTotal(supplierWeights);

  const handleSaveBranchWeights = () => {
    if (branchTotal !== 100) {
      toast.error('Branch weights must add up to 100%');
      return;
    }
    const weights: HealthScoreWeights = {
      branch: branchWeights,
      bck: bckWeights,
      supplier: supplierWeights,
    };
    saveHealthScoreWeights(weights);
    toast.success('Branch weights updated. Recalculate health scores to apply changes.');
  };

  const handleSaveBCKWeights = () => {
    if (bckTotal !== 100) {
      toast.error('BCK weights must add up to 100%');
      return;
    }
    const weights: HealthScoreWeights = {
      branch: branchWeights,
      bck: bckWeights,
      supplier: supplierWeights,
    };
    saveHealthScoreWeights(weights);
    toast.success('BCK weights updated. Recalculate health scores to apply changes.');
  };

  const handleSaveSupplierWeights = () => {
    if (supplierTotal !== 100) {
      toast.error('Supplier weights must add up to 100%');
      return;
    }
    const weights: HealthScoreWeights = {
      branch: branchWeights,
      bck: bckWeights,
      supplier: supplierWeights,
    };
    saveHealthScoreWeights(weights);
    toast.success('Supplier weights updated. Recalculate health scores to apply changes.');
  };

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    try {
      await runBatchRecalculation();
      toast.success('All health scores recalculated');
    } catch (error) {
      toast.error('Failed to recalculate health scores');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSaveNotificationPrefs = () => {
    saveNotificationPreferences(notificationPrefs);
    toast.success('Notification preferences updated');
  };

  const handleSavePasswordPolicy = () => {
    savePasswordPolicy(passwordPolicy);
    toast.success('Password policy updated');
  };

  // System stats
  const users = getUsers();
  const branches = getBranches();
  const bcks = getBCKs();
  const suppliers = getSuppliers();
  const audits = getAudits();
  const capas = getCAPAs();

  const approvedAudits = audits.filter(a => a.status === 'approved');
  const openCapas = capas.filter(c => ['open', 'in_progress'].includes(c.status));
  const latestUpdate = [...audits, ...capas]
    .map(item => item.updated_at)
    .sort()
    .reverse()[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure system-wide settings and preferences
        </p>
      </div>

      {/* Health Score Weights */}
      <Card>
        <CardHeader>
          <CardTitle>Health Score Calculation Weights</CardTitle>
          <CardDescription>
            Adjust the weights for each component in the health score calculation. 
            Changes apply to future calculations only. Recalculate all health scores to apply retroactively.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Branch Weights */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Branch Health Score Weights</h4>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-medium",
                  branchTotal === 100 ? "text-green-600" : "text-destructive"
                )}>
                  Total: {branchTotal}%
                </span>
                {branchTotal === 100 ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label>Audit Performance</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={branchWeights.audit_performance}
                    onChange={(e) => setBranchWeights(prev => ({ ...prev, audit_performance: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>CAPA Completion</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={branchWeights.capa_completion}
                    onChange={(e) => setBranchWeights(prev => ({ ...prev, capa_completion: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Repeat Findings</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={branchWeights.repeat_findings}
                    onChange={(e) => setBranchWeights(prev => ({ ...prev, repeat_findings: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Incident Rate</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={branchWeights.incident_rate}
                    onChange={(e) => setBranchWeights(prev => ({ ...prev, incident_rate: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Verification Pass</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={branchWeights.verification_pass}
                    onChange={(e) => setBranchWeights(prev => ({ ...prev, verification_pass: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
            <Button 
              onClick={handleSaveBranchWeights} 
              disabled={branchTotal !== 100}
              size="sm"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Branch Weights
            </Button>
          </div>

          {/* BCK Weights */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">BCK Health Score Weights</h4>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-medium",
                  bckTotal === 100 ? "text-green-600" : "text-destructive"
                )}>
                  Total: {bckTotal}%
                </span>
                {bckTotal === 100 ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>HACCP Compliance</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={bckWeights.haccp_compliance}
                    onChange={(e) => setBckWeights(prev => ({ ...prev, haccp_compliance: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Production Audit Perf</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={bckWeights.production_audit_perf}
                    onChange={(e) => setBckWeights(prev => ({ ...prev, production_audit_perf: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Supplier Quality</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={bckWeights.supplier_quality}
                    onChange={(e) => setBckWeights(prev => ({ ...prev, supplier_quality: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>CAPA Completion</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={bckWeights.capa_completion}
                    onChange={(e) => setBckWeights(prev => ({ ...prev, capa_completion: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
            <Button 
              onClick={handleSaveBCKWeights} 
              disabled={bckTotal !== 100}
              size="sm"
            >
              <Save className="mr-2 h-4 w-4" />
              Save BCK Weights
            </Button>
          </div>

          {/* Supplier Weights */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Supplier Quality Score Weights</h4>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-medium",
                  supplierTotal === 100 ? "text-green-600" : "text-destructive"
                )}>
                  Total: {supplierTotal}%
                </span>
                {supplierTotal === 100 ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Audit Performance</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={supplierWeights.audit_performance}
                    onChange={(e) => setSupplierWeights(prev => ({ ...prev, audit_performance: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Product Quality</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={supplierWeights.product_quality}
                    onChange={(e) => setSupplierWeights(prev => ({ ...prev, product_quality: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Compliance</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={supplierWeights.compliance}
                    onChange={(e) => setSupplierWeights(prev => ({ ...prev, compliance: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Delivery Performance</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={supplierWeights.delivery_perf}
                    onChange={(e) => setSupplierWeights(prev => ({ ...prev, delivery_perf: Number(e.target.value) }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
            <Button 
              onClick={handleSaveSupplierWeights} 
              disabled={supplierTotal !== 100}
              size="sm"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Supplier Weights
            </Button>
          </div>

          {/* Recalculate All */}
          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={handleRecalculateAll}
              disabled={isRecalculating}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isRecalculating && "animate-spin")} />
              {isRecalculating ? 'Recalculating...' : 'Recalculate All Health Scores'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Configure which notifications are sent to which roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium">Notification Type</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Roles That Receive It</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Editable</th>
                </tr>
              </thead>
              <tbody>
                {notificationPrefs.map((pref, index) => (
                  <tr key={pref.type} className="border-b last:border-0">
                    <td className="px-4 py-3 text-sm font-medium">{pref.label}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {pref.roles.map(role => (
                          <Badge 
                            key={role} 
                            variant={pref.editable ? "default" : "secondary"}
                            className={cn(!pref.editable && "opacity-60")}
                          >
                            {role.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {pref.editable ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">Yes</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">System-critical</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Button onClick={handleSaveNotificationPrefs} size="sm">
              <Save className="mr-2 h-4 w-4" />
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password Policy */}
      <Card>
        <CardHeader>
          <CardTitle>Password Policy</CardTitle>
          <CardDescription>
            Configure password and session security settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Require password change on first login</Label>
              <p className="text-xs text-muted-foreground">
                New users must change their password after first login
              </p>
            </div>
            <Switch
              checked={passwordPolicy.requirePasswordChangeOnFirstLogin}
              onCheckedChange={(checked) => setPasswordPolicy(prev => ({ ...prev, requirePasswordChangeOnFirstLogin: checked }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enforce strong passwords</Label>
              <p className="text-xs text-muted-foreground">
                Passwords must include uppercase, lowercase, numbers, and special characters
              </p>
            </div>
            <Switch
              checked={passwordPolicy.enforceStrongPasswords}
              onCheckedChange={(checked) => setPasswordPolicy(prev => ({ ...prev, enforceStrongPasswords: checked }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Session timeout after 7 days</Label>
              <p className="text-xs text-muted-foreground">
                Users will be logged out after 7 days of inactivity
              </p>
            </div>
            <Switch
              checked={passwordPolicy.sessionTimeoutDays === 7}
              onCheckedChange={(checked) => setPasswordPolicy(prev => ({ ...prev, sessionTimeoutDays: checked ? 7 : 30 }))}
            />
          </div>
          <Button onClick={handleSavePasswordPolicy} size="sm">
            <Save className="mr-2 h-4 w-4" />
            Save Policy
          </Button>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>
            Overview of system data and statistics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-2xl font-semibold">{users.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Branches</p>
              <p className="text-2xl font-semibold">{branches.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total BCKs</p>
              <p className="text-2xl font-semibold">{bcks.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Suppliers</p>
              <p className="text-2xl font-semibold">{suppliers.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Audits Completed</p>
              <p className="text-2xl font-semibold">{approvedAudits.length}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Open CAPA</p>
              <p className="text-2xl font-semibold">{openCapas.length}</p>
            </div>
            <div className="rounded-lg border p-4 sm:col-span-2">
              <p className="text-sm text-muted-foreground">Database Last Updated</p>
              <p className="text-lg font-semibold">
                {latestUpdate ? new Date(latestUpdate).toLocaleString() : 'No data'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

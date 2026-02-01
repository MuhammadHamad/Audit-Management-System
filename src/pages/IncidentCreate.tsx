import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, X } from 'lucide-react';
import {
  createIncident,
  incidentTypes,
  categoryMapping,
  IncidentType,
  IncidentSeverity,
  IncidentEntityType,
  getEntitiesForIncidentCreation,
  getManagersForAssignment,
} from '@/lib/incidentStorage';

const severityOptions: IncidentSeverity[] = ['low', 'medium', 'high', 'critical'];

export default function IncidentCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Form state
  const [entityType, setEntityType] = useState<IncidentEntityType | ''>('');
  const [entityId, setEntityId] = useState('');
  const [type, setType] = useState<IncidentType | ''>('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived data
  const [entities, setEntities] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [managers, setManagers] = useState<Array<{ id: string; name: string; role: string }>>([]);

  // Determine locked fields based on role
  const isEntityTypeLocked = user?.role === 'branch_manager';
  const isEntityLocked = user?.role === 'branch_manager' || 
    (user?.role === 'bck_manager' && entityType === 'bck');
  const isTypeLocked = user?.role === 'bck_manager' && entityType === 'supplier';
  const showAssignment = user?.role === 'regional_manager';

  useEffect(() => {
    if (user?.role === 'branch_manager') {
      setEntityType('branch');
    } else if (user?.role === 'bck_manager') {
      setEntityType('bck');
    }
  }, [user]);

  useEffect(() => {
    if (user && entityType) {
      const entityList = getEntitiesForIncidentCreation(user.id, user.role, entityType);
      setEntities(entityList);
      
      // Auto-select for branch/bck managers
      if (entityList.length === 1 && isEntityLocked) {
        setEntityId(entityList[0].id);
      } else if (!entityList.find(e => e.id === entityId)) {
        setEntityId('');
      }
    }
  }, [user, entityType]);

  useEffect(() => {
    if (user && entityType && entityId && showAssignment) {
      const managerList = getManagersForAssignment(user.id, user.role, entityType, entityId);
      setManagers(managerList);
    } else {
      setManagers([]);
    }
  }, [user, entityType, entityId, showAssignment]);

  useEffect(() => {
    // Auto-set type for supplier batch rejection
    if (user?.role === 'bck_manager' && entityType === 'supplier') {
      setType('Supplier Batch Rejection');
      setSeverity('high');
    }
  }, [user, entityType]);

  useEffect(() => {
    // Reset category when type changes
    setCategory('');
  }, [type]);

  const categories = type ? categoryMapping[type] : [];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setEvidenceUrls(prev => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeEvidence = (index: number) => {
    setEvidenceUrls(prev => prev.filter((_, i) => i !== index));
  };

  const isFormValid = entityType && entityId && type && category && title && description;

  const handleSubmit = async () => {
    if (!user || !isFormValid) return;

    setIsSubmitting(true);
    try {
      // Determine assigned_to
      let finalAssignedTo: string | undefined = assignedTo || undefined;
      
      // Auto-assign to self for branch/bck managers
      if (['branch_manager', 'bck_manager'].includes(user.role) && !finalAssignedTo) {
        finalAssignedTo = user.id;
      }

      const incident = createIncident({
        entity_type: entityType as IncidentEntityType,
        entity_id: entityId,
        type: type as IncidentType,
        category,
        severity,
        title,
        description,
        evidence_urls: evidenceUrls,
        assigned_to: finalAssignedTo,
        status: 'open',
        created_by: user.id,
      });

      toast({
        title: 'Incident Reported',
        description: `Incident ${incident.incident_code} has been created.`,
      });

      navigate(`/incidents/${incident.id}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create incident. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/incidents')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Report New Incident</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incident Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Entity Type */}
          <div className="space-y-2">
            <Label>Entity Type *</Label>
            <Select 
              value={entityType} 
              onValueChange={(v) => setEntityType(v as IncidentEntityType)}
              disabled={isEntityTypeLocked}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select entity type" />
              </SelectTrigger>
              <SelectContent>
                {user?.role === 'branch_manager' ? (
                  <SelectItem value="branch">Branch</SelectItem>
                ) : user?.role === 'bck_manager' ? (
                  <>
                    <SelectItem value="bck">BCK</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="branch">Branch</SelectItem>
                    <SelectItem value="bck">BCK</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Entity */}
          {entityType && (
            <div className="space-y-2">
              <Label>Entity *</Label>
              <Select 
                value={entityId} 
                onValueChange={setEntityId}
                disabled={isEntityLocked && entities.length === 1}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select entity" />
                </SelectTrigger>
                <SelectContent>
                  {entities.map(entity => (
                    <SelectItem key={entity.id} value={entity.id}>
                      {entity.name} ({entity.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Incident Type */}
          <div className="space-y-2">
            <Label>Incident Type *</Label>
            <Select 
              value={type} 
              onValueChange={(v) => setType(v as IncidentType)}
              disabled={isTypeLocked}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select incident type" />
              </SelectTrigger>
              <SelectContent>
                {incidentTypes.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          {type && (
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Severity */}
          <div className="space-y-2">
            <Label>Severity *</Label>
            <div className="flex gap-2">
              {severityOptions.map(s => (
                <Button
                  key={s}
                  type="button"
                  variant={severity === s ? 'default' : 'outline'}
                  onClick={() => setSeverity(s)}
                  className={severity === s ? 
                    s === 'critical' ? 'bg-destructive hover:bg-destructive/90' :
                    s === 'high' ? 'bg-orange-500 hover:bg-orange-600' :
                    s === 'medium' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' :
                    'bg-blue-500 hover:bg-blue-600' : ''
                  }
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 150))}
              placeholder="Brief summary of the incident"
              maxLength={150}
            />
            <p className="text-xs text-muted-foreground text-right">
              {title.length}/150 characters
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, when it was discovered, and initial observations..."
              rows={4}
            />
          </div>

          {/* Evidence Upload */}
          <div className="space-y-2">
            <Label>Evidence (Optional)</Label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center">
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="evidence-upload"
              />
              <label
                htmlFor="evidence-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Drop files here or click to upload
                </span>
              </label>
            </div>
            {evidenceUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {evidenceUrls.map((url, index) => (
                  <div key={index} className="relative">
                    {url.startsWith('data:image') ? (
                      <img
                        src={url}
                        alt={`Evidence ${index + 1}`}
                        className="h-20 w-20 object-cover rounded"
                      />
                    ) : (
                      <div className="h-20 w-20 bg-muted rounded flex items-center justify-center text-xs">
                        PDF
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeEvidence(index)}
                      className="absolute -top-2 -right-2 p-1 bg-destructive text-white rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assignment (Regional Manager only) */}
          {showAssignment && entityId && (
            <div className="space-y-2">
              <Label>Assign To (Optional)</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select investigator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {managers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => navigate('/incidents')}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
            >
              {isSubmitting ? 'Reporting...' : 'Report Incident'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

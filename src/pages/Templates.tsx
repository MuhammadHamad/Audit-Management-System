import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreHorizontal, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  getTemplates,
  duplicateTemplate,
  archiveTemplate,
  activateTemplate,
  deleteTemplate,
  getTotalItemsCount,
  AuditTemplate,
  EntityType,
  TemplateStatus,
} from '@/lib/templateStorage';
import { getUsers } from '@/lib/userStorage';
import { User } from '@/types';

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<AuditTemplate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Dialog states
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AuditTemplate | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setIsLoading(true);
    setTimeout(() => {
      setTemplates(getTemplates());
      setUsers(getUsers());
      setIsLoading(false);
    }, 300);
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter(template => {
      const matchesSearch =
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEntityType =
        entityTypeFilter === 'all' || template.entity_type === entityTypeFilter;
      const matchesStatus =
        statusFilter === 'all' || template.status === statusFilter;
      return matchesSearch && matchesEntityType && matchesStatus;
    });
  }, [templates, searchQuery, entityTypeFilter, statusFilter]);

  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTemplates.slice(start, start + pageSize);
  }, [filteredTemplates, currentPage]);

  const totalPages = Math.ceil(filteredTemplates.length / pageSize);

  const getUserName = (createdBy: string): string => {
    if (createdBy === 'system') return 'System';
    const user = users.find(u => u.id === createdBy);
    return user?.full_name || 'Unknown';
  };

  const getEntityTypeBadgeColor = (entityType: EntityType) => {
    switch (entityType) {
      case 'branch':
        return 'bg-gray-100 text-gray-800';
      case 'bck':
        return 'bg-purple-100 text-purple-800';
      case 'supplier':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: TemplateStatus) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'archived':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDuplicate = (template: AuditTemplate) => {
    const duplicated = duplicateTemplate(template.id);
    if (duplicated) {
      toast.success('Template duplicated. Edit the copy now.');
      loadData();
      navigate(`/templates/${duplicated.id}/edit`);
    } else {
      toast.error('Failed to duplicate template.');
    }
  };

  const handleArchive = () => {
    if (!selectedTemplate) return;
    const result = archiveTemplate(selectedTemplate.id);
    if (result) {
      toast.success(`${selectedTemplate.name} archived.`);
      loadData();
    } else {
      toast.error('Failed to archive template.');
    }
    setArchiveDialogOpen(false);
    setSelectedTemplate(null);
  };

  const handleActivate = (template: AuditTemplate) => {
    const result = activateTemplate(template.id);
    if (result) {
      toast.success(`${template.name} is now active.`);
      loadData();
    } else {
      toast.error('Failed to activate template.');
    }
  };

  const handleDelete = () => {
    if (!selectedTemplate) return;
    if (selectedTemplate.status !== 'draft') {
      toast.error('Cannot delete an active or archived template. Archive it first, then only drafts can be deleted.');
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
      return;
    }
    const result = deleteTemplate(selectedTemplate.id);
    if (result) {
      toast.success(`${selectedTemplate.name} deleted.`);
      loadData();
    } else {
      toast.error('Failed to delete template.');
    }
    setDeleteDialogOpen(false);
    setSelectedTemplate(null);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setEntityTypeFilter('all');
    setStatusFilter('all');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-end">
        <Button onClick={() => navigate('/templates/create')}>
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Create Template</span>
          <span className="sm:hidden">Create</span>
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="relative flex-1 sm:flex-none sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 sm:gap-4">
          <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="flex-1 sm:w-44">
              <SelectValue placeholder="All Entity Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entity Types</SelectItem>
              <SelectItem value="branch">Branch</SelectItem>
              <SelectItem value="bck">BCK</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="flex-1 sm:w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table - Responsive wrapper */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div className="rounded-md border min-w-[800px] md:min-w-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Sections</TableHead>
              <TableHead>Total Items</TableHead>
              <TableHead>Pass Threshold</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginatedTemplates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">
                      {templates.length === 0
                        ? 'No templates yet. Create your first template to start auditing.'
                        : 'No templates found. Try adjusting your filters.'}
                    </p>
                    {filteredTemplates.length === 0 && templates.length > 0 && (
                      <Button variant="outline" size="sm" onClick={resetFilters}>
                        Reset Filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedTemplates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <div>
                      <div className="font-semibold">{template.name}</div>
                      <div className="text-xs text-muted-foreground">{template.code}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getEntityTypeBadgeColor(template.entity_type)}>
                      {template.entity_type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{template.checklist_json.sections.length}</TableCell>
                  <TableCell>{getTotalItemsCount(template)}</TableCell>
                  <TableCell>{template.scoring_config.pass_threshold}%</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={getStatusBadgeColor(template.status)}>
                      {template.status.charAt(0).toUpperCase() + template.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>v{template.version}</TableCell>
                  <TableCell>{getUserName(template.created_by)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${template.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/templates/${template.id}/edit`)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                          Duplicate
                        </DropdownMenuItem>
                        {template.status === 'active' && (
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedTemplate(template);
                              setArchiveDialogOpen(true);
                            }}
                          >
                            Archive
                          </DropdownMenuItem>
                        )}
                        {(template.status === 'draft' || template.status === 'archived') && (
                          <DropdownMenuItem onClick={() => handleActivate(template)}>
                            Activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setSelectedTemplate(template);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Pagination */}
      {!isLoading && filteredTemplates.length > 0 && (
        <div className="flex items-center justify-end gap-4">
          <span className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredTemplates.length)} of {filteredTemplates.length} templates
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => p - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Archive Dialog */}
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Template</AlertDialogTitle>
            <AlertDialogDescription>
              Archive "{selectedTemplate?.name}"? Archived templates cannot be used for new audits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{selectedTemplate?.name}" permanently? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Upload, UserPlus } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RoleBadge } from '@/components/RoleBadge';
import { UserAvatar } from '@/components/users/UserAvatar';
import { UserActionsMenu } from '@/components/users/UserActionsMenu';
import { AddUserModal } from '@/components/users/AddUserModal';
import { EditUserModal } from '@/components/users/EditUserModal';
import { ImportUsersModal } from '@/components/users/ImportUsersModal';
import { User, UserRole, UserAssignment } from '@/types';
import {
  getUsers,
  getUserAssignments,
  getRegionById,
  getBranchById,
  getBCKById,
} from '@/lib/userStorage';

const PAGE_SIZE = 25;

const roleFilterOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'All Roles' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'audit_manager', label: 'Audit Manager' },
  { value: 'regional_manager', label: 'Regional Manager' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'bck_manager', label: 'BCK Manager' },
  { value: 'staff', label: 'Staff' },
];

const statusFilterOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const loadData = () => {
    setIsLoading(true);
    // Simulate loading delay for skeleton state
    setTimeout(() => {
      setUsers(getUsers());
      setAssignments(getUserAssignments());
      setIsLoading(false);
    }, 300);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        user.full_name.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower);

      // Role filter
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      // Status filter
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, statusFilter]);

  // Get assignment display for a user
  const getAssignmentDisplay = (userId: string): string => {
    const userAssignments = assignments.filter(a => a.user_id === userId);
    if (userAssignments.length === 0) return '—';

    const first = userAssignments[0];
    let display = '';

    if (first.assigned_type === 'region') {
      const region = getRegionById(first.assigned_id);
      display = region ? `Region: ${region.name}` : '—';
    } else if (first.assigned_type === 'branch') {
      const branch = getBranchById(first.assigned_id);
      display = branch ? `Branch: ${branch.code}` : '—';
    } else if (first.assigned_type === 'bck') {
      const bck = getBCKById(first.assigned_id);
      display = bck ? `BCK: ${bck.code}` : '—';
    }

    if (userAssignments.length > 1) {
      display += ` +${userAssignments.length - 1}`;
    }

    return display;
  };

  const formatLastLogin = (lastLogin?: string): string => {
    if (!lastLogin) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastLogin), { addSuffix: true });
    } catch {
      return 'Never';
    }
  };

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
  };

  const handleRefresh = () => {
    loadData();
  };

  const showingStart = (currentPage - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(currentPage * PAGE_SIZE, filteredUsers.length);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          className="border-primary text-primary hover:bg-primary/5"
          onClick={() => setShowImportModal(true)}
        >
          <Upload className="mr-2 h-4 w-4" />
          Import Users
        </Button>
        <Button onClick={() => setShowAddModal(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-[280px]"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            {roleFilterOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {statusFilterOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Skeleton loading state
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-9 w-9 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : paginatedUsers.length === 0 ? (
              // Empty state
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No users found. Try adjusting your filters.</p>
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Reset Filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              // User rows
              paginatedUsers.map(user => (
                <TableRow key={user.id}>
                  <TableCell>
                    <UserAvatar
                      name={user.full_name}
                      avatarUrl={user.avatar_url}
                      role={user.role}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-sm">{user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {getAssignmentDisplay(user.id)}
                  </TableCell>
                  <TableCell>
                    {user.status === 'active' ? (
                      <span className="text-sm font-medium text-green-600">Active</span>
                    ) : (
                      <span className="text-sm font-medium text-red-600">Inactive</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatLastLogin(user.last_login_at)}
                  </TableCell>
                  <TableCell>
                    <UserActionsMenu
                      user={user}
                      onEdit={() => setEditingUser(user)}
                      onRefresh={handleRefresh}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && filteredUsers.length > 0 && (
        <div className="flex items-center justify-end gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {showingStart}-{showingEnd} of {filteredUsers.length} users
          </p>
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

      {/* Modals */}
      <AddUserModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={handleRefresh}
      />

      <EditUserModal
        user={editingUser}
        open={!!editingUser}
        onOpenChange={open => !open && setEditingUser(null)}
        onSuccess={handleRefresh}
      />

      <ImportUsersModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onSuccess={handleRefresh}
      />
    </div>
  );
}

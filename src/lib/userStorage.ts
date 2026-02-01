import { User, UserAssignment, Region, Branch, BCK } from '@/types';
import { seedUsers, seedUserAssignments, seedRegions, seedBranches, seedBCKs, userCredentials } from '@/data/seedData';

const USERS_KEY = 'burgerizzr_users';
const ASSIGNMENTS_KEY = 'burgerizzr_user_assignments';
const REGIONS_KEY = 'burgerizzr_regions';
const BRANCHES_KEY = 'burgerizzr_branches';
const BCKS_KEY = 'burgerizzr_bcks';
const CREDENTIALS_KEY = 'burgerizzr_credentials';

// Initialize storage with seed data if empty
export const initializeStorage = () => {
  if (!localStorage.getItem(USERS_KEY)) {
    localStorage.setItem(USERS_KEY, JSON.stringify(seedUsers));
  }
  if (!localStorage.getItem(ASSIGNMENTS_KEY)) {
    localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(seedUserAssignments));
  }
  if (!localStorage.getItem(REGIONS_KEY)) {
    localStorage.setItem(REGIONS_KEY, JSON.stringify(seedRegions));
  }
  if (!localStorage.getItem(BRANCHES_KEY)) {
    localStorage.setItem(BRANCHES_KEY, JSON.stringify(seedBranches));
  }
  if (!localStorage.getItem(BCKS_KEY)) {
    localStorage.setItem(BCKS_KEY, JSON.stringify(seedBCKs));
  }
  if (!localStorage.getItem(CREDENTIALS_KEY)) {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(userCredentials));
  }
};

// Users CRUD
export const getUsers = (): User[] => {
  initializeStorage();
  return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
};

export const getUserById = (id: string): User | undefined => {
  return getUsers().find(u => u.id === id);
};

export const getUserByEmail = (email: string): User | undefined => {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
};

export const createUser = (user: Omit<User, 'id' | 'created_at' | 'updated_at'>): User => {
  const users = getUsers();
  const newUser: User = {
    ...user,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  users.push(newUser);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  
  // Set default password
  const credentials = getCredentials();
  credentials[newUser.email.toLowerCase()] = 'TempPass123!';
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  
  return newUser;
};

export const updateUser = (id: string, updates: Partial<User>): User | null => {
  const users = getUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) return null;
  
  users[index] = {
    ...users[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return users[index];
};

export const deleteUser = (id: string): boolean => {
  const users = getUsers();
  const user = users.find(u => u.id === id);
  if (!user || user.last_login_at) return false; // Can't delete users who have logged in
  
  const filtered = users.filter(u => u.id !== id);
  localStorage.setItem(USERS_KEY, JSON.stringify(filtered));
  
  // Also delete their assignments
  const assignments = getUserAssignments().filter(a => a.user_id !== id);
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
  
  // Delete credentials
  const credentials = getCredentials();
  delete credentials[user.email.toLowerCase()];
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  
  return true;
};

export const resetUserPassword = (id: string): boolean => {
  const user = getUserById(id);
  if (!user) return false;
  
  const credentials = getCredentials();
  credentials[user.email.toLowerCase()] = 'TempPass123!';
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  return true;
};

// Credentials
export const getCredentials = (): Record<string, string> => {
  initializeStorage();
  return JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || '{}');
};

// User Assignments
export const getUserAssignments = (): UserAssignment[] => {
  initializeStorage();
  return JSON.parse(localStorage.getItem(ASSIGNMENTS_KEY) || '[]');
};

export const getAssignmentsForUser = (userId: string): UserAssignment[] => {
  return getUserAssignments().filter(a => a.user_id === userId);
};

export const createAssignment = (assignment: Omit<UserAssignment, 'id' | 'created_at'>): UserAssignment => {
  const assignments = getUserAssignments();
  const newAssignment: UserAssignment = {
    ...assignment,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  assignments.push(newAssignment);
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
  return newAssignment;
};

export const deleteAssignmentsForUser = (userId: string): void => {
  const assignments = getUserAssignments().filter(a => a.user_id !== userId);
  localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify(assignments));
};

// Regions
export const getRegions = (): Region[] => {
  initializeStorage();
  return JSON.parse(localStorage.getItem(REGIONS_KEY) || '[]');
};

export const getRegionById = (id: string): Region | undefined => {
  return getRegions().find(r => r.id === id);
};

// Branches
export const getBranches = (): Branch[] => {
  initializeStorage();
  return JSON.parse(localStorage.getItem(BRANCHES_KEY) || '[]');
};

export const getBranchById = (id: string): Branch | undefined => {
  return getBranches().find(b => b.id === id);
};

export const getBranchByCode = (code: string): Branch | undefined => {
  return getBranches().find(b => b.code === code);
};

// BCKs
export const getBCKs = (): BCK[] => {
  initializeStorage();
  return JSON.parse(localStorage.getItem(BCKS_KEY) || '[]');
};

export const getBCKById = (id: string): BCK | undefined => {
  return getBCKs().find(b => b.id === id);
};

export const getBCKByCode = (code: string): BCK | undefined => {
  return getBCKs().find(b => b.code === code);
};

// Import users helper
export const importUsers = (
  users: Array<{
    full_name: string;
    email: string;
    phone?: string;
    role: User['role'];
    assigned_to_type?: 'region' | 'branch' | 'bck';
    assigned_to_code?: string;
  }>
): { success: number; failed: number } => {
  let success = 0;
  let failed = 0;

  for (const userData of users) {
    try {
      // Check for duplicate email
      if (getUserByEmail(userData.email)) {
        failed++;
        continue;
      }

      const user = createUser({
        email: userData.email,
        full_name: userData.full_name,
        phone: userData.phone,
        role: userData.role,
        status: 'active',
      });

      // Create assignment if specified
      if (userData.assigned_to_type && userData.assigned_to_code) {
        let assignedId: string | undefined;
        
        if (userData.assigned_to_type === 'region') {
          const region = getRegions().find(r => r.code === userData.assigned_to_code);
          assignedId = region?.id;
        } else if (userData.assigned_to_type === 'branch') {
          const branch = getBranchByCode(userData.assigned_to_code);
          assignedId = branch?.id;
        } else if (userData.assigned_to_type === 'bck') {
          const bck = getBCKByCode(userData.assigned_to_code);
          assignedId = bck?.id;
        }

        if (assignedId) {
          createAssignment({
            user_id: user.id,
            assigned_type: userData.assigned_to_type,
            assigned_id: assignedId,
          });
        }
      }

      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
};

import type { UserRole } from './types';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  chemist: 'Hóa học viên',
  technician: 'Kỹ thuật viên',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-100 text-red-700 border-red-200',
  chemist: 'bg-blue-100 text-blue-700 border-blue-200',
  technician: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function canManageChemicals(role: UserRole): boolean {
  return role !== 'admin' ? true : true;
}

export function canManageStock(role: UserRole): boolean {
  return true;
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

export function canDeleteData(role: UserRole): boolean {
  return role === 'admin';
}

export function canEditAnySlip(role: UserRole): boolean {
  return role === 'admin';
}

export function canManagePreparations(role: UserRole): boolean {
  return true;
}

export function canViewReports(role: UserRole): boolean {
  return true;
}

export function canResetData(role: UserRole): boolean {
  return role === 'admin';
}

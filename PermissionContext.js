// ====================================================================
// PermissionContext.js — Tracks current user's permission for active member
// ====================================================================
//
// Permission values:
//   'owner' — user owns this member (full access)
//   'admin' — user can edit AND re-share
//   'edit'  — user can add/edit records, can't re-share
//   'view'  — read-only access
//   null    — no access (shouldn't happen for visible members)
//
// Usage:
//   In a screen that needs to gate UI:
//
//     import { usePermission } from '../PermissionContext';
//     ...
//     const { permission, canEdit, canReshare, isViewOnly } = usePermission();
//     if (canEdit) {
//       // show Upload button, Edit button, etc.
//     }
//
// Provider is wrapped in App.js around MainApp.
// The value is updated by HomeScreen when activeMember changes.
// ====================================================================

import React, { createContext, useContext, useState, useMemo } from 'react';

const PermissionContext = createContext({
  permission: 'owner',
  setPermission: () => {},
  canEdit: true,
  canReshare: true,
  isViewOnly: false,
});

export function PermissionProvider({ children }) {
  const [permission, setPermission] = useState('owner');

  const value = useMemo(() => ({
    permission,
    setPermission,
    canEdit:    permission === 'owner' || permission === 'admin' || permission === 'edit',
    canReshare: permission === 'owner' || permission === 'admin',
    isViewOnly: permission === 'view',
  }), [permission]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  return useContext(PermissionContext);
}

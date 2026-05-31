// ====================================================================
// ViewOnlyBanner.js — small banner shown when user has view-only access
// ====================================================================
//
// Usage:
//   import ViewOnlyBanner from '../ViewOnlyBanner';
//   import { usePermission } from '../PermissionContext';
//
//   function ReportsScreen({ activeMember }) {
//     return (
//       <SafeAreaView>
//         <ViewOnlyBanner memberName={activeMember?.name} />
//         ...rest of screen...
//       </SafeAreaView>
//     );
//   }
//
// The banner is automatically hidden when the user has edit/admin/owner access.
// ====================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePermission } from './PermissionContext';

export default function ViewOnlyBanner({ memberName }) {
  const { isViewOnly } = usePermission();

  if (!isViewOnly) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.icon}>👁️</Text>
      <Text style={styles.text}>
        View-only · You're viewing {memberName ? `${memberName}'s` : "someone else's"} records
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
});

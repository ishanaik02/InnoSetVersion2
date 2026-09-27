import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { TripProvider } from '../context/TripContext';

// Auth
import LoginScreen from '../screens/LoginScreen';

// Engineer Screens
import DashboardScreen from '../screens/DashboardScreen';
import NewTripScreen from '../screens/NewTripScreen';
import RoundTripScreen from '../screens/RoundTripScreen';
import StayTripScreen from '../screens/StayTripScreen';
import TripSummaryScreen from '../screens/TripSummaryScreen';
import PastTripsScreen from '../screens/PastTripsScreen';
import EngineerTripDetailScreen from '../screens/EngineerTripDetailScreen';

// Bill Screens
import BillsScreen from '../screens/BillsScreen';
import BillDetailScreen from '../screens/BillDetailScreen';
import BillApprovalScreen from '../screens/BillApprovalScreen';
import EditBillAmountsScreen from '../screens/EditBillAmountsScreen';

// Attendance Screens
import AttendanceScreen from '../screens/AttendanceScreen';
import AttendanceHistoryScreen from '../screens/AttendanceHistoryScreen';
import HRAttendanceScreen from '../screens/HRAttendanceScreen';

// Management Dashboards
import BranchManagerDashboardScreen from '../screens/BranchManagerDashboardScreen';
import HRDashboardScreen from '../screens/HRDashboardScreen';
import ServiceHeadDashboardScreen from '../screens/ServiceHeadDashboardScreen';
import AccountDeptDashboardScreen from '../screens/AccountDeptDashboardScreen';
import SuperAdminDashboardScreen from '../screens/SuperAdminDashboardScreen';
import UserManagementScreen from '../screens/UserManagementScreen';

// Admin Screens (Trips / legacy Admin)
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AdminTripsScreen from '../screens/AdminTripsScreen';
import AdminTripDetailScreen from '../screens/AdminTripDetailScreen';
import AdminEngineersScreen from '../screens/AdminEngineersScreen';
import AdminAddEngineerScreen from '../screens/AdminAddEngineerScreen';

import { colors } from '../theme/theme';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '700' },
};

function EngineerStack() {
  return (
    <TripProvider>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Engineer Dashboard' }} />
        <Stack.Screen name="NewTrip" component={NewTripScreen} options={{ title: 'New Trip' }} />
        <Stack.Screen name="RoundTrip" component={RoundTripScreen} options={{ title: 'Round Trip' }} />
        <Stack.Screen name="StayTrip" component={StayTripScreen} options={{ title: 'Stay Trip' }} />
        <Stack.Screen name="TripSummary" component={TripSummaryScreen} options={{ title: 'Trip Summary' }} />
        <Stack.Screen name="PastTrips" component={PastTripsScreen} options={{ title: 'Past Trips' }} />
        <Stack.Screen name="EngineerTripDetail" component={EngineerTripDetailScreen} options={{ title: 'Trip Details' }} />
        <Stack.Screen name="Bills" component={BillsScreen} options={{ title: 'TA/DA Bills' }} />
        <Stack.Screen name="BillDetail" component={BillDetailScreen} options={{ title: 'Bill Details' }} />
        <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'Daily Attendance' }} />
        <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: 'Attendance History' }} />
      </Stack.Navigator>
    </TripProvider>
  );
}

function BranchManagerStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="BMDashboard" component={BranchManagerDashboardScreen} options={{ title: 'Branch Dashboard' }} />
      <Stack.Screen name="BillApproval" component={BillApprovalScreen} options={{ title: 'Bill Approvals' }} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} options={{ title: 'Bill Details' }} />
      <Stack.Screen name="BranchTrips" component={AdminTripsScreen} options={{ title: 'Branch Trips' }} />
      <Stack.Screen name="AdminTripDetail" component={AdminTripDetailScreen} options={{ title: 'Trip Details' }} />
      <Stack.Screen name="BranchAttendance" component={HRAttendanceScreen} options={{ title: 'Branch Attendance' }} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} options={{ title: 'Staff Management' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'My Attendance' }} />
      <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: 'Attendance History' }} />
    </Stack.Navigator>
  );
}

function HRStack() {
  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerStyle: { backgroundColor: '#6C63FF' } }}>
      <Stack.Screen name="HRDashboard" component={HRDashboardScreen} options={{ title: 'HR Dashboard' }} />
      <Stack.Screen name="HRAttendance" component={HRAttendanceScreen} options={{ title: 'Attendance Approvals' }} />
      <Stack.Screen name="BillApproval" component={BillApprovalScreen} options={{ title: 'Bill Verification' }} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} options={{ title: 'Bill Details' }} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} options={{ title: 'Branch Staff' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'My Attendance' }} />
      <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: 'Attendance History' }} />
    </Stack.Navigator>
  );
}

function ServiceHeadStack() {
  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerStyle: { backgroundColor: '#0F4C81' } }}>
      <Stack.Screen name="ServiceHeadDashboard" component={ServiceHeadDashboardScreen} options={{ title: 'Service Head' }} />
      <Stack.Screen name="BillApproval" component={BillApprovalScreen} options={{ title: 'Bill Final Approval' }} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} options={{ title: 'Bill Details' }} />
      <Stack.Screen name="EditBillAmounts" component={EditBillAmountsScreen} options={{ title: 'Edit Bill Amounts' }} />
      <Stack.Screen name="AllTrips" component={AdminTripsScreen} options={{ title: 'All Dealership Trips' }} />
      <Stack.Screen name="AdminTripDetail" component={AdminTripDetailScreen} options={{ title: 'Trip Details' }} />
      <Stack.Screen name="AllAttendance" component={HRAttendanceScreen} options={{ title: 'All Attendance' }} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} options={{ title: 'All Engineers & Staff' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'My Attendance' }} />
      <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: 'Attendance History' }} />
    </Stack.Navigator>
  );
}

function AccountDeptStack() {
  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerStyle: { backgroundColor: '#1B4965' } }}>
      <Stack.Screen name="AccountDashboard" component={AccountDeptDashboardScreen} options={{ title: 'Accounts & Payouts' }} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} options={{ title: 'Bill Details' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'My Attendance' }} />
      <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: 'Attendance History' }} />
    </Stack.Navigator>
  );
}

function SuperAdminStack() {
  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerStyle: { backgroundColor: '#1E293B' } }}>
      <Stack.Screen name="SuperAdminDashboard" component={SuperAdminDashboardScreen} options={{ title: 'Super Admin HQ' }} />
      <Stack.Screen name="BillApproval" component={BillApprovalScreen} options={{ title: 'All Bills' }} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} options={{ title: 'Bill Details' }} />
      <Stack.Screen name="EditBillAmounts" component={EditBillAmountsScreen} options={{ title: 'Edit Bill Amounts' }} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} options={{ title: 'Enterprise Users' }} />
      <Stack.Screen name="AdminTrips" component={AdminTripsScreen} options={{ title: 'Enterprise Trips' }} />
      <Stack.Screen name="AdminTripDetail" component={AdminTripDetailScreen} options={{ title: 'Trip Details' }} />
      <Stack.Screen name="HRAttendance" component={HRAttendanceScreen} options={{ title: 'Attendance Audit' }} />
      <Stack.Screen name="Attendance" component={AttendanceScreen} options={{ title: 'My Attendance' }} />
      <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: 'Attendance History' }} />
    </Stack.Navigator>
  );
}

// Legacy Admin Stack
function AdminStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Admin Dashboard' }} />
      <Stack.Screen name="AdminTrips" component={AdminTripsScreen} options={{ title: 'All Trips' }} />
      <Stack.Screen name="AdminTripDetail" component={AdminTripDetailScreen} options={{ title: 'Trip Detail' }} />
      <Stack.Screen name="AdminEngineers" component={AdminEngineersScreen} options={{ title: 'Engineers' }} />
      <Stack.Screen name="AdminAddEngineer" component={AdminAddEngineerScreen} options={{ title: 'Add Engineer' }} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const renderRoleStack = () => {
    switch (user?.role) {
      case 'branch_manager':
        return <BranchManagerStack />;
      case 'hr':
        return <HRStack />;
      case 'service_head':
        return <ServiceHeadStack />;
      case 'account_dept':
        return <AccountDeptStack />;
      case 'super_admin':
        return <SuperAdminStack />;
      case 'admin':
        return <AdminStack />;
      case 'service_engineer':
      case 'engineer':
      default:
        return <EngineerStack />;
    }
  };

  return (
    <NavigationContainer>
      {user ? (
        renderRoleStack()
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

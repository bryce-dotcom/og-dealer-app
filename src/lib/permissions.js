// Centralized permission system for OG Dealer
// Role hierarchy: Owner > Admin > Manager > Staff

const ADMIN_ROLES = ['Owner', 'CEO', 'Admin', 'President'];
const FINANCE_ROLES = [...ADMIN_ROLES, 'VP Operations', 'Finance'];
const MANAGER_ROLES = [...ADMIN_ROLES, 'VP Operations', 'General Manager', 'Sales Manager', 'Manager'];
const HR_ROLES = [...ADMIN_ROLES, 'HR'];

// Check if user has any of the specified roles
function hasRole(currentEmployee, allowedRoles) {
  // No employee record = dealer owner = full access
  if (!currentEmployee) return true;
  const userRoles = currentEmployee.roles || [];
  return userRoles.some(r => allowedRoles.includes(r));
}

// Permission definitions
export function getPermissions(currentEmployee) {
  const isOwner = !currentEmployee; // null = dealer owner
  const roles = currentEmployee?.roles || [];

  const isAdmin = isOwner || roles.some(r => ADMIN_ROLES.includes(r));
  const isManager = isAdmin || roles.some(r => MANAGER_ROLES.includes(r));
  const isFinance = isOwner || roles.some(r => FINANCE_ROLES.includes(r));
  const isHR = isOwner || roles.some(r => HR_ROLES.includes(r));
  const isSales = isManager || roles.some(r => ['Sales', 'Salesperson', 'BDC'].includes(r));
  const isService = isManager || roles.some(r => ['Service', 'Service Manager', 'Technician', 'Service Advisor'].includes(r));

  return {
    isOwner,
    isAdmin,
    isManager,
    isFinance,
    isHR,
    isSales,
    isService,

    // Page-level permissions. Keep in step with RLS: only offer a page to people
    // the database will show its data to (owner-only tables -> isOwner; employee
    // tables opened in migrations 20260927000001 and 20260929000001).
    canAccessDashboard: true,
    canAccessInventory: true,
    canAccessDealFinder: true,
    canAccessResearch: true,
    canAccessDeals: isSales,
    canAccessCustomers: isSales,
    canAccessConnect: isOwner, // email marketing tables are owner-only
    canAccessSMS: isOwner, // sms tables are owner-only
    canAccessAppointments: isSales,
    canAccessLeads: isSales,
    canAccessTradeIns: isSales,
    canAccessDealTimeline: isSales,
    canAccessTestDrives: isSales,

    canAccessBHPH: isFinance,
    canAccessBooks: isOwner, // bank data is owner-only (RLS)
    canAccessCommissions: isOwner,
    canAccessReports: isOwner,
    canAccessAnalytics: isOwner,
    canAccessFloorPlan: isOwner,
    canAccessFIProducts: isOwner,
    canAccessAuctions: isOwner,
    canAccessLenders: isOwner,
    canAccessDealJackets: isSales,
    canAccessInvestors: isOwner,

    canAccessTeam: isManager,
    canAccessTimeClock: true, // everyone can clock in/out
    canAccessPayroll: isOwner,
    canAccessTasks: true,

    canAccessImport: isOwner,
    canAccessMarketplaces: isOwner,
    canAccessDocRules: isOwner,
    canAccessESignature: isSales,
    canAccessNotifications: isManager,
    canAccessCompliance: isOwner,
    canAccessListings: isOwner,
    canAccessWorkflows: isOwner,
    canAccessCustomerPortal: isOwner,
    canAccessReconditioning: true,
    canAccessVehicleTracking: isOwner,
    canAccessPhotos: true,
    canAccessTitles: true,
    canAccessVendors: isOwner,
    canAccessKeys: true,
    canAccessWarranty: isService,
    canAccessServiceOrders: isService,
    canAccessInspections: isService,
    canAccessReviews: isManager,
    canAccessSettings: isOwner, // shows investor bank details + exports employee data
    canAccessStateUpdates: isOwner,
    canAccessDevConsole: isOwner,

    // Data-level permissions (for Arnie)
    canViewFinancials: isFinance,
    canViewPayroll: isHR,
    canViewAllEmployeeData: isManager,
    canViewCommissions: isManager,
    canViewBankAccounts: isFinance,
    canViewExpenses: isFinance,
  };
}

// Map nav paths to permission keys
export const NAV_PERMISSION_MAP = {
  '/dashboard': 'canAccessDashboard',
  '/inventory': 'canAccessInventory',
  '/deal-finder': 'canAccessDealFinder',
  '/research': 'canAccessResearch',
  '/deals': 'canAccessDeals',
  '/customers': 'canAccessCustomers',
  '/email-marketing': 'canAccessConnect',
  '/sms': 'canAccessSMS',
  '/appointments': 'canAccessAppointments',
  '/leads': 'canAccessLeads',
  '/trade-ins': 'canAccessTradeIns',
  '/deal-timeline': 'canAccessDealTimeline',
  '/test-drives': 'canAccessTestDrives',
  '/bhph': 'canAccessBHPH',
  '/books': 'canAccessBooks',
  '/commissions': 'canAccessCommissions',
  '/reports': 'canAccessReports',
  '/analytics': 'canAccessAnalytics',
  '/floor-plan': 'canAccessFloorPlan',
  '/fi-products': 'canAccessFIProducts',
  '/auctions': 'canAccessAuctions',
  '/lenders': 'canAccessLenders',
  '/deal-jackets': 'canAccessDealJackets',
  '/admin/investors': 'canAccessInvestors',
  '/team': 'canAccessTeam',
  '/timeclock': 'canAccessTimeClock',
  '/payroll': 'canAccessPayroll',
  '/tasks': 'canAccessTasks',
  '/import': 'canAccessImport',
  '/marketplaces': 'canAccessMarketplaces',
  '/document-rules': 'canAccessDocRules',
  '/esignature': 'canAccessESignature',
  '/notifications': 'canAccessNotifications',
  '/compliance': 'canAccessCompliance',
  '/marketplace-listings': 'canAccessListings',
  '/crm-workflows': 'canAccessWorkflows',
  '/customer-portal': 'canAccessCustomerPortal',
  '/reconditioning': 'canAccessReconditioning',
  '/vehicle-tracking': 'canAccessVehicleTracking',
  '/photos': 'canAccessPhotos',
  '/titles': 'canAccessTitles',
  '/vendors': 'canAccessVendors',
  '/keys': 'canAccessKeys',
  '/warranty-claims': 'canAccessWarranty',
  '/service-orders': 'canAccessServiceOrders',
  '/inspections': 'canAccessInspections',
  '/reviews': 'canAccessReviews',
  '/settings': 'canAccessSettings',
  '/admin/state-updates': 'canAccessStateUpdates',
  '/admin/dev-console': 'canAccessDevConsole',
  '/dev': 'canAccessDevConsole',
};

// Access denied markup helper (returns style object for use in components)
export const ACCESS_DENIED_MESSAGE = 'You don\'t have permission to view this page. Contact your manager or dealer admin if you need access.';

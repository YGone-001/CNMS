// English language dictionary
// Only this file and zh.ts are allowed to contain string literals

const en = {
  // Sidebar navigation - flat 9-item structure
  nav: {
    // Main 9 menu items
    overview: 'Operations Overview',
    topology: 'Network Topology',
    networkElements: 'Network Elements',
    agentManagement: 'Agent Management',
    metricsHistory: 'Real-time Metrics',
    alarms: 'Alarm Center',
    aiops: 'Fault Diagnosis',
    faultResolution: 'Fault Resolution',
    logCenter: 'Log Center',

    // Legacy items (kept for backward compatibility)
    dashboards: 'Dashboards',
    faultPerf: 'Fault & Performance',
    reports: 'Reports',
    opsMaint: 'Operation & Maintenance',
    subscribers: 'Subscribers',
    mmlTerminal: 'MML Terminal',
    configBackups: 'Config Backups',
    cronTasks: 'Cron Tasks',
    knowledgeBase: 'Knowledge Base',
    sysAdmin: 'System & Admin',
    auditLogs: 'Audit Logs',
    userManagement: 'User Management',
    siteSettings: 'Site Settings',
    apiDocs: 'API Docs',
  },

  // Sidebar common
  sidebar: {
    quickFilter: 'Quick filter...',
    noMatch: 'No matching items',
    expand: 'Expand sidebar',
    collapse: 'Collapse sidebar',
    signOut: 'Sign out',
  },

  // StatusBar
  statusbar: {
    dashboard: 'Dashboard',
    connected: 'CONNECTED',
    disconnected: 'DISCONNECTED',
    connecting: 'CONNECTING',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
  },

  // Common actions
  common: {
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    update: 'Update',
    confirm: 'Confirm',
    close: 'Close',
    refresh: 'Refresh',
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    import: 'Import',
    upload: 'Upload',
    download: 'Download',
    enabled: 'Enabled',
    disabled: 'Disabled',
    status: 'Status',
    actions: 'Actions',
    name: 'Name',
    description: 'Description',
    type: 'Type',
    time: 'Time',
    yes: 'Yes',
    no: 'No',
  },

  // Topology page
  topology: {
    title: 'Network Topology',
    subtitle: '5GC SBA architecture . scroll to zoom . drag to pan . click node for details',
    activeLink: 'Active link',
    idleLink: 'Idle link',
    healthy: 'Healthy',
    degraded: 'Degraded',
    down: 'Down',
    performance: 'Performance',
    cpuUsage: 'CPU Usage',
    memoryRss: 'Memory RSS',
    activeAlarms: 'Active Alarms',
    noAlarms: 'No active alarms for this NF',
    details: 'Details',
    nfId: 'NF ID',
    domain: 'Domain',
    restartNf: 'Restart NF',
    restarting: 'Restarting...',
    running: 'Running',
    stopped: 'Stopped',
  },

  // Alarms page
  alarms: {
    title: 'Alarm Management',
    totalAlarms: '{count} total alarm(s) detected',
    active: 'Active',
    history: 'History',
    critical: 'Critical',
    major: 'Major',
    minor: 'Minor',
    warning: 'Warning',
    severity: 'Severity',
    source: 'Source',
    message: 'Message',
    noActive: 'No active alarms',
    noActiveDesc: 'All systems operating normally',
    noHistory: 'No alarm history',
    noHistoryDesc: 'No historical records found',
    acknowledge: 'Acknowledge Alarm',
    clear: 'Clear Alarm',
    acknowledged: 'ACKNOWLEDGED',
    cleared: 'CLEARED',
    alarmMessage: 'Alarm Message',
    diagnosticDetails: 'Diagnostic Details',
    probableCause: 'Probable Cause',
    specificProblem: 'Specific Problem',
    repairAction: 'Proposed Repair Action',
    context: 'Context',
    alarmId: 'Alarm ID',
    sourceNf: 'Source NF',
  },

  // Network Elements page
  elements: {
    title: 'Network Elements',
    subtitle: 'Location-based NF inventory and management',
    filterPlaceholder: 'Filter by name...',
    locationTree: 'Location Tree',
    node: 'Node',
    total: 'Total',
    running: 'Running',
    stopped: 'Stopped',
    restartAll: 'Restart All in Node',
    nfName: 'NF Name',
    hostLocation: 'Host Location',
    pid: 'PID',
    cpu: 'CPU',
    memory: 'Memory',
    noElements: 'No network elements in this location',
    logs: 'Logs',
    live: 'LIVE',
    follow: 'Follow',
    stop: 'Stop',
    pause: 'Pause',
    resume: 'Resume',
    searchKeyword: 'Search keyword...',
    allLevels: 'All Levels',
    noLogs: 'No logs found',
    waitingLogs: 'Waiting for new log entries...',
    loadingLogs: 'Loading logs...',
  },

  // MML Terminal page
  mml: {
    session: 'Session',
    primary: 'Primary',
    secondary: 'Secondary',
    clearTerminal: 'Clear terminal (Ctrl+L)',
    enterCommand: 'Enter MML command...',
    executing: 'Executing...',
    diffComparison: 'Diff Comparison',
    exitDiff: 'Exit Diff',
    sourcePrimary: 'Source (Primary)',
    targetSecondary: 'Target (Secondary)',
    parameterHelper: 'Parameter Helper',
    parameters: 'Parameters:',
    insertCommand: 'Insert Command',
    newTab: 'New tab',
    closeTab: 'Close tab',
    singleView: 'Switch to single view',
    splitView: 'Switch to split view',
    diffView: 'Run diff comparison',
    exitDiffView: 'Exit diff view',
    toggleHelper: 'Toggle parameter helper',
    ctrlClear: 'Ctrl+L: Clear',
    arrowHistory: 'Arrow Up/Down: History',
    enterExecute: 'Enter: Execute',
  },

  // Overview page
  overview: {
    title: 'Overview Dashboard',
    subtitle: 'Real-time 5G Core Network status monitoring',
    totalNfs: 'Total NFs',
    runningNfs: 'Running',
    stoppedNfs: 'Stopped',
    avgCpu: 'Avg CPU',
    avgMemory: 'Avg Memory',
    activeAlarms: 'Active Alarms',
    systemStatus: 'System Status',
    nfStatus: 'NF Status Distribution',
    cpuTop5: 'CPU Top 5',
    memTop5: 'Memory Top 5',
  },

  // Sites page
  sites: {
    title: 'Sites / Regions',
    subtitle: 'Multi-site NF management',
    addSite: 'Add Site',
    editSite: 'Edit Site',
    address: 'Address',
    nrfUrl: 'NRF URL',
    nfCount: 'NF Count',
    noSites: 'No sites configured',
    deleteConfirm: 'Delete this site?',
    parentSite: 'Parent Site',
    noneTopLevel: 'None (top level)',
    nfProcessNames: 'NF Process Names (comma-separated)',
  },

  // Config Backups page
  backups: {
    title: 'Configuration Backups',
    subtitle: 'NF configuration version management',
    backupNow: 'Backup Now',
    version: 'Version',
    size: 'Size',
    checksum: 'Checksum',
    comment: 'Comment',
    noBackups: 'No backups found',
    viewContent: 'View Content',
    diffVersions: 'Diff Versions',
  },

  // Reports page
  reports: {
    title: 'Reports & Analytics',
    subtitle: 'Performance metrics and alarm statistics',
    period1h: '1h',
    period24h: '24h',
    period7d: '7d',
    period30d: '30d',
    availability: 'Availability',
    avgCpu: 'Avg CPU',
    peakCpu: 'Peak',
    avgMem: 'Avg Memory',
    peakMem: 'Peak',
    totalAlarms: 'Total Alarms',
    exportMetrics: 'Export Metrics CSV',
    exportAlarms: 'Export Alarms CSV',
  },

  // AIOps page
  aiops: {
    title: 'AIOps Intelligence',
    subtitle: 'Anomaly detection, root cause analysis, capacity prediction, trend alerting',
    anomalies: 'Anomalies',
    rootCauses: 'Root Causes',
    predictions: 'Predictions',
    trendAlerts: 'Trend Alerts',
    noAnomalies: 'No anomalies detected',
    noPredictions: 'No capacity predictions',
    noTrends: 'No trend alerts',
  },

  // Knowledge Base page
  kb: {
    title: 'Knowledge Base',
    subtitle: 'Telecom fault troubleshooting solutions',
    addSolution: 'Add Solution',
    searchPlaceholder: 'Search solutions...',
    noSolutions: 'No solutions found',
    protocol: 'Protocol',
    phenomenon: 'Phenomenon',
    rootCause: 'Root Cause',
    solution: 'Solution',
    tags: 'Tags',
    attachments: 'Attachments',
    totalSolutions: 'Total Solutions',
    topTags: 'Top Tags',
    topProtocols: 'Top Protocols',
  },

  // Subscribers page
  subscribers: {
    title: 'Subscriber Management',
    subtitle: '5G/4G subscriber CRUD operations',
    imsi: 'IMSI',
    apn: 'APN',
    qos: 'QoS',
    addSubscriber: 'Add Subscriber',
    batchAdd: 'Batch Add',
    exportJson: 'Export JSON',
    importJson: 'Import JSON',
    noSubscribers: 'No subscribers found',
    active: 'Active',
    inactive: 'Inactive',
  },

  // User Management page
  users: {
    title: 'User Management',
    subtitle: 'RBAC user administration',
    username: 'Username',
    role: 'Role',
    addUser: 'Add User',
    admin: 'Admin',
    operator: 'Operator',
    viewer: 'Viewer',
    lastLogin: 'Last Login',
    noUsers: 'No users found',
  },

  // Audit Logs page
  audit: {
    title: 'Audit Logs',
    subtitle: 'System operation audit trail',
    action: 'Action',
    target: 'Target',
    user: 'User',
    timestamp: 'Timestamp',
    noLogs: 'No audit logs found',
  },

  // Scheduled Tasks page
  tasks: {
    title: 'Scheduled Tasks',
    subtitle: 'Cron job management',
    addTask: 'Add Task',
    taskName: 'Task Name',
    taskType: 'Task Type',
    cron: 'Cron',
    lastRun: 'Last Run',
    nextRun: 'Next Run',
    noTasks: 'No tasks configured',
    enabled: 'Enabled',
  },

  // API Docs page
  docs: {
    title: 'API Documentation',
    subtitle: 'RESTful API reference',
  },

  // Login page
  login: {
    title: 'xCloud-CNMS',
    subtitle: '5G Core Network Management Platform',
    username: 'Username',
    password: 'Password',
    signIn: 'Sign In',
    loginFailed: 'Login failed',
  },
} satisfies Locale;

export default en;

// Recursive string type for locale dictionaries
export type Locale = {
  [key: string]: string | Locale;
};

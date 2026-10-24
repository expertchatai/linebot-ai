function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

function list(name: string): string[] {
  return optional(name)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),

  lineCustomer: () => ({
    secret: required("LINE_CHANNEL_SECRET"),
    token: required("LINE_CHANNEL_ACCESS_TOKEN"),
  }),
  lineAdmin: () => ({
    secret: required("LINE_ADMIN_CHANNEL_SECRET"),
    token: required("LINE_ADMIN_CHANNEL_ACCESS_TOKEN"),
  }),
  adminGroupId: () => optional("LINE_ADMIN_GROUP_ID"),
  superAdminGroupId: () => optional("LINE_SUPER_ADMIN_GROUP_ID"),
  superAdminIds: () => list("SUPER_ADMIN_LINE_USER_IDS"),

  messenger: () => ({
    appSecret: required("FB_APP_SECRET"),
    pageToken: required("FB_PAGE_ACCESS_TOKEN"),
    verifyToken: required("FB_VERIFY_TOKEN"),
    graphVersion: optional("FB_GRAPH_VERSION", "v21.0"),
  }),

  geminiApiKey: () => required("GEMINI_API_KEY"),
  geminiModel: () => optional("GEMINI_MODEL", "gemini-3.5-flash"),

  sheetId: () => optional("GOOGLE_SHEETS_ID", "1GXglURewLCrX9Gpv9GtXKgSWdgn1l29Hnb80P_dK1lw"),
  googleServiceAccount: () => optional("GOOGLE_SERVICE_ACCOUNT_JSON"),
  googleApiKey: () => optional("GOOGLE_API_KEY"),

  cronSecret: () => required("CRON_SECRET"),
  dashboardPassword: () => required("DASHBOARD_PASSWORD"),
  sessionSecret: () => required("SESSION_SECRET"),
  allowLiveMode: () => optional("ALLOW_LIVE_MODE") === "true",
};

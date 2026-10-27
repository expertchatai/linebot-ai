function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export const env = {
  lineChannelSecret: () => required("LINE_CHANNEL_SECRET"),
  lineAccessToken: () => required("LINE_CHANNEL_ACCESS_TOKEN"),
  /** LINE group that gets a message whenever the bot hands a customer over to staff. */
  adminGroupId: () => optional("ADMIN_GROUP_ID"),

  geminiApiKey: () => required("GEMINI_API_KEY"),
  geminiModel: () => optional("GEMINI_MODEL", "gemini-3.5-flash"),

  sheetId: () => optional("GOOGLE_SHEETS_ID", "1GXglURewLCrX9Gpv9GtXKgSWdgn1l29Hnb80P_dK1lw"),
  googleServiceAccount: () => optional("GOOGLE_SERVICE_ACCOUNT_JSON"),
  googleApiKey: () => optional("GOOGLE_API_KEY"),
};

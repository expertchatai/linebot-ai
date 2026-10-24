import { JWT } from "google-auth-library";
import { env } from "@/lib/env";
import type { SheetRow } from "./parser";

// Read-only by design: the app never writes to the original Google Sheet.
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

let jwt: JWT | null = null;

async function authParams(): Promise<{ headers: Record<string, string>; query: string }> {
  const sa = env.googleServiceAccount();
  if (sa) {
    if (!jwt) {
      const creds = JSON.parse(sa) as { client_email: string; private_key: string };
      jwt = new JWT({ email: creds.client_email, key: creds.private_key, scopes: [SCOPE] });
    }
    const { token } = await jwt.getAccessToken();
    return { headers: { Authorization: `Bearer ${token}` }, query: "" };
  }
  const key = env.googleApiKey();
  if (key) return { headers: {}, query: `key=${encodeURIComponent(key)}` };
  throw new Error("Google Sheets credentials missing: set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_API_KEY");
}

async function get<T>(path: string, params: string): Promise<T> {
  const auth = await authParams();
  const qs = [params, auth.query].filter(Boolean).join("&");
  const res = await fetch(`${API}/${env.sheetId()}${path}?${qs}`, {
    headers: auth.headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function fetchSheetRows(): Promise<SheetRow[]> {
  const meta = await get<{ sheets: { properties: { title: string } }[] }>("", "fields=sheets.properties.title");
  const titles = meta.sheets.map((s) => s.properties.title);
  if (!titles.length) return [];

  const ranges = titles.map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'!A1:B2000`)}`).join("&");
  const data = await get<{ valueRanges: { values?: string[][] }[] }>(
    "/values:batchGet",
    `${ranges}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
  );

  const rows: SheetRow[] = [];
  data.valueRanges.forEach((vr, i) => {
    (vr.values ?? []).forEach((cells, r) => {
      if (cells.some((c) => c?.trim())) rows.push({ sheet: titles[i], row: r + 1, cells });
    });
  });
  return rows;
}

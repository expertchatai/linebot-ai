export type Channel = "line" | "messenger";

export const CHANNEL_LABEL: Record<Channel, string> = {
  line: "LINE OA",
  messenger: "Facebook Messenger",
};

export type PartKind = "text" | "image" | "audio" | "video" | "file";

/** One inbound customer message, normalised across channels. Media is referenced, never stored. */
export interface InboundPart {
  kind: PartKind;
  text?: string;
  /** LINE message id, or Messenger attachment URL */
  mediaRef?: string;
  mime?: string;
}

export interface BufferedMessage {
  id: number;
  chat_id: string;
  part: InboundPart;
  reply_token: string | null;
  received_at: string;
}

export interface Chat {
  id: string;
  channel: Channel;
  external_id: string;
  ref_code: string;
  ai_enabled: boolean;
  ai_off_reason: string | null;
  ai_off_at: string | null;
  ai_off_by: string | null;
  last_bot_reply_at: string | null;
}

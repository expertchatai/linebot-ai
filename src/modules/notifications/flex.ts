// Minimal LINE Flex builders in the Luxury Minimal palette (black / white / grey).
import type { messagingApi } from "@line/bot-sdk";

const BLACK = "#111111";
const GREY = "#8A8A8A";
const LIGHT = "#F4F4F4";

export interface Button {
  label: string;
  data: string;
  displayText?: string;
  primary?: boolean;
}

export interface BubbleSpec {
  title: string;
  subtitle?: string;
  fields?: [string, string][];
  sections?: { heading: string; text: string }[];
  note?: string;
  buttons?: Button[];
}

const text = (t: string, extra: Record<string, unknown> = {}) => ({
  type: "text",
  text: t.length > 1800 ? `${t.slice(0, 1800)}…` : t || "-",
  wrap: true,
  size: "sm",
  color: BLACK,
  ...extra,
});

export function bubble(spec: BubbleSpec): Record<string, unknown> {
  const body: Record<string, unknown>[] = [text(spec.title, { weight: "bold", size: "md" })];
  if (spec.subtitle) body.push(text(spec.subtitle, { size: "xs", color: GREY, margin: "xs" }));

  if (spec.fields?.length) {
    body.push({ type: "separator", margin: "md" });
    for (const [label, value] of spec.fields) {
      body.push({
        type: "box",
        layout: "baseline",
        margin: "sm",
        spacing: "sm",
        contents: [text(label, { color: GREY, size: "xs", flex: 2 }), text(value, { flex: 5 })],
      });
    }
  }
  for (const s of spec.sections ?? []) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      paddingAll: "8px",
      backgroundColor: LIGHT,
      cornerRadius: "4px",
      contents: [text(s.heading, { size: "xxs", color: GREY }), text(s.text, { margin: "xs" })],
    });
  }
  if (spec.note) body.push(text(spec.note, { size: "xxs", color: GREY, margin: "md" }));

  const result: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    body: { type: "box", layout: "vertical", contents: body },
  };
  if (spec.buttons?.length) {
    result.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: spec.buttons.map((b) => ({
        type: "button",
        height: "sm",
        style: b.primary ? "primary" : "secondary",
        color: b.primary ? BLACK : LIGHT,
        action: { type: "postback", label: b.label.slice(0, 20), data: b.data, displayText: b.displayText ?? b.label },
      })),
    };
  }
  return result;
}

export function flex(altText: string, bubbles: Record<string, unknown>[]): messagingApi.Message {
  const contents = bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles.slice(0, 12) };
  return { type: "flex", altText: altText.slice(0, 400), contents } as unknown as messagingApi.Message;
}

export const textMessage = (t: string): messagingApi.Message => ({ type: "text", text: t.slice(0, 5000) });

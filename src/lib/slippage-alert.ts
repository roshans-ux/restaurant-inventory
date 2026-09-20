export function parseSlippageAlertKind(message: string): "overpour" | "underpour" | null {
  if (message.startsWith("OVERPOUR:")) return "overpour";
  if (message.startsWith("UNDERPOUR:")) return "underpour";
  return null;
}

export function stripSlippageAlertPrefix(message: string): string {
  return message.replace(/^(OVERPOUR|UNDERPOUR):\s*/, "");
}

/** Normalize older stored alert copy to “Expected [N]ml worth of orders”. */
export function formatSlippageAlertBody(message: string): string {
  return stripSlippageAlertPrefix(message)
    .replace(/Expected (\d+(?:\.\d+)?)ml ordered/g, "Expected $1ml worth of orders")
    .replace(/Expected (\d+(?:\.\d+)?) orders worth of ml/g, "Expected $1ml worth of orders");
}

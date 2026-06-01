type OrderLine = {
  productName: string;
  quantityBottles: number;
};

type VendorInfo = {
  name: string;
};

type VenueInfo = {
  name: string;
};

export function buildOrderTxt(
  venue: VenueInfo,
  vendor: VendorInfo,
  lines: OrderLine[],
): string {
  const items = lines
    .map((l) => `${l.productName} — ${l.quantityBottles} bottles`)
    .join("\n");
  return `Hi ${vendor.name}, this is ${venue.name}.

Please process the following order:

${items}

Thank you.`;
}

export function buildCancelTxt(
  venue: VenueInfo,
  vendor: VendorInfo,
  lines: OrderLine[],
): string {
  const items = lines
    .map((l) => `${l.productName} — ${l.quantityBottles} bottles`)
    .join("\n");
  return `Hi ${vendor.name}, this is ${venue.name}.

We need to cancel the following order:

${items}

Sorry for the inconvenience.`;
}

export function buildModifyTxt(
  venue: VenueInfo,
  vendor: VendorInfo,
  lines: OrderLine[],
): string {
  const items = lines
    .map((l) => `${l.productName} — updated to ${l.quantityBottles} bottles`)
    .join("\n");
  return `Hi ${vendor.name}, this is ${venue.name}.

We need to update our order:

${items}

Thank you.`;
}

export function vendorFileSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "vendor";
}

export function txtFilename(prefix: string, vendorName: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${vendorFileSlug(vendorName)}-${date}.txt`;
}

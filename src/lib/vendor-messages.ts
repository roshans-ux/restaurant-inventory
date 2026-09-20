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
  const items = lines.map((l) => l.productName).join("\n");
  return `Hi ${vendor.name}, this is ${venue.name}.

Please process the following order:

${items}

Quantities to be confirmed over call.

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

export function buildOrderEmail(
  venueName: string,
  vendorName: string,
  skuNames: string[],
): string {
  return `Hi ${vendorName},

Please process the following order from ${venueName}:

${skuNames.join("\n")}

Quantities to be confirmed over call.

Thank you,
${venueName}`;
}

export function buildCancelEmail(
  venueName: string,
  vendorName: string,
  skuNames: string[],
): string {
  return `Hi ${vendorName},

We need to cancel the following order from ${venueName}:

${skuNames.join("\n")}

Sorry for the inconvenience.

Thank you,
${venueName}`;
}

export function buildModifyEmail(
  venueName: string,
  vendorName: string,
  productName: string,
  quantityBottles: number,
): string {
  return `Hi ${vendorName},

We need to update our order:

${productName} — updated to ${quantityBottles} bottles

Thank you,
${venueName}`;
}

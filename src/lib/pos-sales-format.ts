import { formatMappingSaleSize } from "@/lib/mapping-sale-size";

export function formatSaleLabel(saleId: string) {
  if (saleId.startsWith("sim_")) {
    const suffix = saleId.split("-").at(-1);
    return suffix ? `Sim Sale ${suffix}` : "Sim Sale";
  }
  return `Sale ${saleId.slice(0, 8)}`;
}

export function formatSaleDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatSaleTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatSaleSize(pourMl: number, bottleSizeMl?: number | null) {
  return formatMappingSaleSize(pourMl, bottleSizeMl);
}

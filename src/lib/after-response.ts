import { after } from "next/server";

/** Run non-critical work after the HTTP response is sent (Next.js `after`). */
export function afterResponse(
  task: () => unknown | Promise<unknown>,
  label?: string,
): void {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error(label ? `[after:${label}]` : "[after]", error);
    }
  });
}

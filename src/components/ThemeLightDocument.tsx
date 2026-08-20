"use client";

import { useEffect } from "react";

/** Paints html/body white while mounted. Lightning CSS strips :has(), so we set a class. */
export default function ThemeLightDocument() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-light-doc");
    return () => root.classList.remove("theme-light-doc");
  }, []);

  return null;
}

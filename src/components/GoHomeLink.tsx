import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type GoHomeLinkProps = {
  className?: string;
};

export default function GoHomeLink({ className = "" }: GoHomeLinkProps) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80 ${className}`}
      style={{ color: "var(--text-secondary)" }}
    >
      <ArrowLeft size={15} strokeWidth={2} aria-hidden />
      Go to home
    </Link>
  );
}

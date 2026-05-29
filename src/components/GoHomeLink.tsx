import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type GoHomeLinkProps = {
  className?: string;
};

export default function GoHomeLink({ className = "" }: GoHomeLinkProps) {
  return (
    <Link
      href="/"
      className={`auth-copy inline-flex items-center gap-1.5 font-medium transition-opacity hover:opacity-80 ${className}`}
      style={{ color: "#ffffff" }}
    >
      <ArrowLeft size={15} strokeWidth={2} aria-hidden />
      Go to home
    </Link>
  );
}

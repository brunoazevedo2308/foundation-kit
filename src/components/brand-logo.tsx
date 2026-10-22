import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/atino-logo.png"
      alt="Atino — Consultoria, Treinamento e DP"
      className={cn("mx-auto h-auto w-full max-w-52 object-contain", className)}
    />
  );
}

import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  variant?: "full" | "symbol";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  priority?: boolean;
};

const symbolSizeClasses = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-20 w-20",
  xl: "h-28 w-28",
};

const fullSizeClasses = {
  sm: "h-auto w-28",
  md: "h-auto w-36",
  lg: "h-auto w-44",
  xl: "h-auto w-56",
};

export default function BrandLogo({
  href,
  variant = "full",
  size = "md",
  className = "",
  priority = false,
}: BrandLogoProps) {
  const src =
    variant === "symbol"
      ? "/branding/icon-512.png"
      : "/branding/logo-funcional-up-digital.png";

  const sizeClass =
    variant === "symbol"
      ? symbolSizeClasses[size]
      : fullSizeClasses[size];

  const image = (
    <img
      src={src}
      alt="Funcional UP Digital"
      loading={priority ? "eager" : "lazy"}
      className={`${sizeClass} ${variant === "symbol" ? "rounded-full" : "rounded-none"} object-contain ${className}`}
    />
  );

  return href ? (
    <Link
      href={href}
      aria-label="Funcional UP Digital — início"
      className="inline-flex items-center"
    >
      {image}
    </Link>
  ) : (
    image
  );
}

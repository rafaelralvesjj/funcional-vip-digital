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
  xl: "h-28 w-28 sm:h-32 sm:w-32",
};

const fullSizeClasses = {
  sm: "h-auto w-28",
  md: "h-auto w-36",
  lg: "h-auto w-48",
  xl: "h-auto w-64 sm:w-72",
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
      ? "/branding/icon-funcional-up.svg"
      : "/branding/logo-funcional-up-digital.svg";

  const sizeClass =
    variant === "symbol" ? symbolSizeClasses[size] : fullSizeClasses[size];

  const image = (
    <img
      src={src}
      alt="Funcional UP Digital"
      loading={priority ? "eager" : "lazy"}
      className={`${sizeClass} object-contain ${className}`}
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

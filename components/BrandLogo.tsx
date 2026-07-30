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
  lg: "h-24 w-24",
  xl: "h-36 w-36 sm:h-44 sm:w-44",
};

const fullSizeClasses = {
  sm: "h-9 w-28",
  md: "h-12 w-40",
  lg: "h-24 w-72",
  xl: "h-32 w-[22rem] sm:h-36 sm:w-[28rem]",
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

  const image = (
    <img
      src={src}
      alt="Funcional UP Digital"
      loading={priority ? "eager" : "lazy"}
      className={`${variant === "symbol" ? symbolSizeClasses[size] : fullSizeClasses[size]} object-contain ${variant === "symbol" ? "rounded-full" : ""} ${className}`}
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

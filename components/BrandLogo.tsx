import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  variant?: "full" | "symbol";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  priority?: boolean;
};

const sizeClasses = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-24 w-24",
  xl: "h-36 w-36 sm:h-44 sm:w-44",
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
      : "/branding/logo-funcional-vip-digital.png";

  const image = (
    <img
      src={src}
      alt="Funcional VIP Digital"
      loading={priority ? "eager" : "lazy"}
      className={`${sizeClasses[size]} rounded-full object-contain ${className}`}
    />
  );

  return href ? (
    <Link
      href={href}
      aria-label="Funcional VIP Digital — início"
      className="inline-flex items-center"
    >
      {image}
    </Link>
  ) : (
    image
  );
}

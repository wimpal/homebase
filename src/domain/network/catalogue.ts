/** Seeded Network device type slugs (T-108). ADMIN may add more; system slugs immutable. */
export const SYSTEM_NETWORK_DEVICE_TYPES: ReadonlyArray<{
  slug: string;
  name: string;
}> = [
  { slug: "nas", name: "NAS" },
  { slug: "pc", name: "PC" },
  { slug: "laptop", name: "Laptop" },
  { slug: "phone", name: "Phone" },
  { slug: "tablet", name: "Tablet" },
  { slug: "router", name: "Router" },
  { slug: "ap", name: "Access point" },
  { slug: "printer", name: "Printer" },
  { slug: "tv", name: "TV" },
  { slug: "console", name: "Console" },
  { slug: "other", name: "Other" },
];

/** Reserved Device locations — not deletable; slug immutable. */
export const RESERVED_DEVICE_LOCATIONS: ReadonlyArray<{
  slug: string;
  name: string;
}> = [
  { slug: "unknown", name: "Unknown" },
  { slug: "portable", name: "Portable" },
];

export function slugifyLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

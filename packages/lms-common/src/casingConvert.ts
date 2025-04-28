export function kebabToCamelCase(kebab: string): string {
  const parts = kebab.split("-");
  return (
    parts[0] +
    parts
      .slice(1)
      .map(part => part[0].toUpperCase() + part.slice(1))
      .join("")
  );
}

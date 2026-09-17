/** Parse "Display Name <addr@x>" or a bare address. Uses the trailing angle-bracket address. */
export function parseFromHeader(from: string): { name: string | null; address: string | null } {
  const angle = from.match(/^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (angle) return { name: angle[1].replace(/^"|"$/g, "").trim() || null, address: angle[2].toLowerCase() };
  const bare = from.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  if (bare) return { name: null, address: bare[1].toLowerCase() };
  return { name: from.trim() || null, address: null };
}

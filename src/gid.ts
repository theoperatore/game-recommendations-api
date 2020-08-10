export function gidFrom(raw: string) {
  const converted = raw.toLowerCase().replace(/\W+/g, '-').replace(/\W+$/, '');
  return `gid${converted.startsWith('-') ? '' : '-'}${converted}`;
}

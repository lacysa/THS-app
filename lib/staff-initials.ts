/**
 * THS staff initials come from the two parts of the assigned login username
 * (firstname.lastname), not the first two letters of a display name.
 *
 * Return null when the surname is genuinely unavailable. Guessing a code from
 * "Sarah" or "Bonne" would reintroduce misleading SA/BO abbreviations.
 */
export function staffInitials(username?:string|null, name?:string|null):string|null {
  const login=String(username||'').trim().toLowerCase()
  const parts=login.split('.').filter(Boolean)
  if(parts.length>=2 && /^[a-z]/.test(parts[0]) && /^[a-z]/.test(parts[parts.length-1]))
    return (parts[0][0]+parts[parts.length-1][0]).toUpperCase()
  const nameParts=String(name||'').trim().split(/\s+/).filter(Boolean)
  if(nameParts.length>=2)return (nameParts[0][0]+nameParts[nameParts.length-1][0]).toUpperCase()
  return null
}

/** A readable attribution if an older account has no surname/login. */
export function staffAttribution(username?:string|null,name?:string|null):string {
  return staffInitials(username,name) || String(name||'').trim() || 'Staff'
}

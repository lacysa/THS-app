import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type StaffMember = {
  id: string
  auth_user_id: string | null
  name: string
  username: string | null
  job_title: string | null
  active: boolean
}

type CapabilityRow = {
  staff_member_id: string
  capability_key: string
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function html(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Provision Staff Accounts</title>
  <style>
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f5f3ee;color:#1e1e1b}
    main{max-width:980px;margin:40px auto;padding:0 20px}.card{background:#fff;border:1px solid #dedad1;border-radius:12px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.05)}
    h1{margin:0 0 8px;font-size:28px}p{line-height:1.5;color:#625f58}.warn{padding:12px 14px;background:#fff7df;border:1px solid #e7d69a;border-radius:8px;color:#6f5a18}
    button{border:0;border-radius:8px;background:#242421;color:#fff;font-weight:700;padding:12px 16px;cursor:pointer}button:hover{opacity:.9}
    table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}th,td{border-bottom:1px solid #e7e3db;padding:10px;text-align:left;vertical-align:top}th{background:#f8f7f3}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.ok{color:#285d3d}.skip{color:#6d685f}.err{color:#9a3028;font-weight:700}
  </style>
</head>
<body><main>${body}</main></body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  )
}

function slugUsername(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function makeTempPassword() {
  // Strong, URL-safe, easy enough to copy once. Never stored in the database.
  return `THS!${randomBytes(9).toString('base64url')}7a`
}

function chooseRole(capabilities: Set<string>) {
  if (capabilities.has('owner')) return { roleName: 'Owner', legacyRole: 'manager' }
  if (
    capabilities.has('general_manager') ||
    capabilities.has('operations_manager') ||
    capabilities.has('manager')
  ) return { roleName: 'Manager', legacyRole: 'manager' }
  if (capabilities.has('maintenance') || capabilities.has('maintenance_manager')) {
    return { roleName: 'Maintenance', legacyRole: 'maintenance' }
  }
  if (capabilities.has('kitchen')) return { roleName: 'Kitchen', legacyRole: 'kitchen' }
  if (capabilities.has('housekeeping') || capabilities.has('runner')) {
    return { roleName: 'Housekeeping', legacyRole: 'housekeeping' }
  }
  if (capabilities.has('hospitality_assistant') || capabilities.has('foh_manager')) {
    return { roleName: 'Front Desk', legacyRole: 'front_desk' }
  }
  if (capabilities.has('laundry')) return { roleName: 'Laundry', legacyRole: 'laundry' }
  return { roleName: null, legacyRole: 'staff' }
}

async function ownerOnly() {
  const access = await getStaffAccess()
  if (!access) return { ok: false as const, status: 401, message: 'You must be signed in.' }

  const admin = createSupabaseAdmin()
  const { data: member } = await admin
    .from('staff_members')
    .select('id,name,auth_user_id')
    .eq('auth_user_id', access.userId)
    .maybeSingle()

  if (!member?.id) {
    return { ok: false as const, status: 403, message: 'Your login is not linked to staff_members.' }
  }

  const { data: ownerCapability } = await admin
    .from('staff_member_capabilities')
    .select('capability_key')
    .eq('staff_member_id', member.id)
    .eq('capability_key', 'owner')
    .maybeSingle()

  if (!ownerCapability) {
    return { ok: false as const, status: 403, message: 'Owner access is required.' }
  }

  return { ok: true as const, access, admin }
}

export async function GET() {
  const gate = await ownerOnly()
  if (!gate.ok) {
    return html(`<div class="card"><h1>Access denied</h1><p>${escapeHtml(gate.message)}</p></div>`, gate.status)
  }

  const { data: staff, error } = await gate.admin
    .from('staff_members')
    .select('id,name,username,job_title,active,auth_user_id')
    .eq('active', true)
    .order('name')

  if (error) {
    return html(`<div class="card"><h1>Could not load staff</h1><p class="err">${escapeHtml(error.message)}</p></div>`, 500)
  }

  const eligible = (staff || []).filter((person: any) => {
    const n = String(person.name || '').trim().toLowerCase()
    return n !== 'al' && n !== 'al heminger'
  })

  const missing = eligible.filter((person: any) => !person.auth_user_id)
  const linked = eligible.length - missing.length

  return html(`
    <div class="card">
      <h1>Provision Staff Accounts</h1>
      <p>This creates Supabase Auth accounts only for active staff who do not already have one, links each new account to <code>staff_members.auth_user_id</code>, and assigns an app role from the capabilities you already created.</p>
      <p class="warn"><strong>Al is explicitly excluded.</strong> Temporary passwords are shown once after provisioning and are never stored in your tables.</p>
      <p><strong>${missing.length}</strong> account(s) need provisioning. <strong>${linked}</strong> active staff account(s) are already linked.</p>
      <form method="post">
        <button type="submit">Create missing staff accounts</button>
      </form>
    </div>
  `)
}

export async function POST() {
  const gate = await ownerOnly()
  if (!gate.ok) {
    return html(`<div class="card"><h1>Access denied</h1><p>${escapeHtml(gate.message)}</p></div>`, gate.status)
  }

  const admin = gate.admin

  const [{ data: staff, error: staffError }, { data: capabilityRows, error: capabilityError }, { data: roles, error: roleError }] = await Promise.all([
    admin
      .from('staff_members')
      .select('id,name,username,job_title,active,auth_user_id')
      .eq('active', true)
      .order('name'),
    admin
      .from('staff_member_capabilities')
      .select('staff_member_id,capability_key'),
    admin
      .from('staff_roles')
      .select('id,name')
      .eq('active', true)
  ])

  if (staffError || capabilityError || roleError) {
    const message = staffError?.message || capabilityError?.message || roleError?.message || 'Could not load provisioning data.'
    return html(`<div class="card"><h1>Provisioning failed</h1><p class="err">${escapeHtml(message)}</p></div>`, 500)
  }

  const capabilitiesByStaff = new Map<string, Set<string>>()
  for (const row of (capabilityRows || []) as CapabilityRow[]) {
    if (!capabilitiesByStaff.has(row.staff_member_id)) capabilitiesByStaff.set(row.staff_member_id, new Set())
    capabilitiesByStaff.get(row.staff_member_id)!.add(row.capability_key)
  }

  const roleIdByName = new Map<string, string>()
  for (const role of roles || []) roleIdByName.set(String((role as any).name), String((role as any).id))

  const { data: listedUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) {
    return html(`<div class="card"><h1>Provisioning failed</h1><p class="err">${escapeHtml(listError.message)}</p></div>`, 500)
  }

  const authByEmail = new Map<string, any>()
  for (const user of listedUsers.users || []) {
    if (user.email) authByEmail.set(user.email.toLowerCase(), user)
  }

  const results: Array<{
    name: string
    username: string
    email: string
    password?: string
    status: string
    role?: string
    error?: string
  }> = []

  const eligible = ((staff || []) as StaffMember[]).filter(person => {
    const n = String(person.name || '').trim().toLowerCase()
    return n !== 'al' && n !== 'al heminger'
  })

  for (const person of eligible) {
    const username = person.username?.trim() || slugUsername(person.name)
    const authEmail = `${username}@staff.thehotelsaugatuck.com`.toLowerCase()

    if (!person.username) {
      await admin.from('staff_members').update({ username }).eq('id', person.id)
    }

    if (person.auth_user_id) {
      results.push({
        name: person.name,
        username,
        email: authEmail,
        status: 'Already linked — no changes made.'
      })
      continue
    }

    let authUser = authByEmail.get(authEmail)
    let tempPassword: string | undefined

    if (!authUser) {
      tempPassword = makeTempPassword()
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: person.name,
          username,
          provisioned_from: 'staff_members'
        }
      })

      if (createError || !created.user) {
        results.push({
          name: person.name,
          username,
          email: authEmail,
          status: 'Failed',
          error: createError?.message || 'Supabase did not return a user.'
        })
        continue
      }

      authUser = created.user
      authByEmail.set(authEmail, authUser)
    }

    const capabilities = capabilitiesByStaff.get(person.id) || new Set<string>()
    const chosen = chooseRole(capabilities)
    const roleId = chosen.roleName ? roleIdByName.get(chosen.roleName) || null : null

    const { error: linkError } = await admin
      .from('staff_members')
      .update({ auth_user_id: authUser.id })
      .eq('id', person.id)

    if (linkError) {
      results.push({
        name: person.name,
        username,
        email: authEmail,
        password: tempPassword,
        status: 'Auth created, but linking failed',
        error: linkError.message
      })
      continue
    }

    const profilePayload = {
      user_id: authUser.id,
      name: person.name,
      preferred_name: person.name.split(/\s+/)[0] || person.name,
      email: authEmail,
      job_title: person.job_title,
      role: chosen.legacyRole,
      role_id: roleId,
      theme_preference: 'blue',
      active: true,
      updated_at: new Date().toISOString()
    }

    const { error: profileError } = await admin
      .from('staff_profiles')
      .upsert(profilePayload, { onConflict: 'user_id' })

    if (profileError) {
      results.push({
        name: person.name,
        username,
        email: authEmail,
        password: tempPassword,
        role: chosen.roleName || 'Staff',
        status: 'Linked, but profile update failed',
        error: profileError.message
      })
      continue
    }

    results.push({
      name: person.name,
      username,
      email: authEmail,
      password: tempPassword,
      role: chosen.roleName || 'Staff',
      status: tempPassword ? 'Created and linked' : 'Existing Auth account linked'
    })
  }

  const rows = results.map(result => `
    <tr>
      <td>${escapeHtml(result.name)}</td>
      <td><code>${escapeHtml(result.username)}</code></td>
      <td><code>${escapeHtml(result.email)}</code></td>
      <td>${result.password ? `<code>${escapeHtml(result.password)}</code>` : '<span class="skip">Password unchanged / not available</span>'}</td>
      <td>${escapeHtml(result.role || '')}</td>
      <td class="${result.error ? 'err' : result.status.startsWith('Already') ? 'skip' : 'ok'}">${escapeHtml(result.status)}${result.error ? `<br><small>${escapeHtml(result.error)}</small>` : ''}</td>
    </tr>
  `).join('')

  return html(`
    <div class="card">
      <h1>Staff account provisioning results</h1>
      <p class="warn"><strong>Copy the temporary passwords now.</strong> They are not stored by this route and cannot be retrieved later.</p>
      <table>
        <thead><tr><th>Name</th><th>Username</th><th>Auth email</th><th>Temporary password</th><th>App role</th><th>Result</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>After you verify everyone can sign in, remove this provisioning route from the project.</p>
    </div>
  `)
}

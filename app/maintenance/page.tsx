import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import { canUseModule } from '@/lib/access'
export const dynamic='force-dynamic'
export default async function Page(){const gate=await canUseModule('maintenance');if(!gate.access)redirect('/login');if(!gate.allowed)redirect('/dashboard');return <StaffShell title="Maintenance"><div className="preview-module-card"><span>Owner Preview</span><h2>Maintenance</h2><p>This module is unpublished. You can build and test it here without exposing it to the rest of the team.</p></div></StaffShell>}

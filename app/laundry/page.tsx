import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import DepartmentBoard from '@/components/DepartmentBoard'
import { canUseModule } from '@/lib/access'

export const dynamic='force-dynamic'
export default async function Page(){const gate=await canUseModule('laundry');if(!gate.access)redirect('/login');if(!gate.allowed)redirect('/dashboard');return <StaffShell title="Laundry"><DepartmentBoard department="laundry" label="Laundry"/></StaffShell>}

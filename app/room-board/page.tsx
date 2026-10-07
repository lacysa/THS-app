import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import RoomBoard from '@/components/RoomBoard'
import { canUseModule } from '@/lib/access'

export const dynamic='force-dynamic'

export default async function Page(){
  const gate=await canUseModule('room_board')
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')

  return (
    <StaffShell title="HSK">
      <RoomBoard/>
    </StaffShell>
  )
}

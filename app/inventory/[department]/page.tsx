import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import InventoryBoard from '@/components/InventoryBoard'
import { canUseModule } from '@/lib/access'

const map:Record<string,{moduleKey:string,department:string,label:string}> = {
  'front-desk':{moduleKey:'front_desk_inventory',department:'front_desk',label:'Front Desk'},
  kitchen:{moduleKey:'kitchen_inventory',department:'kitchen',label:'Kitchen'},
  housekeeping:{moduleKey:'housekeeping_inventory',department:'housekeeping',label:'Housekeeping'},
  laundry:{moduleKey:'laundry_inventory',department:'laundry',label:'Laundry'},
  lobby:{moduleKey:'lobby_inventory',department:'lobby',label:'Lobby'}
}

export const dynamic='force-dynamic'

export default async function Page({params}:{params:Promise<{department:string}>}) {
  const {department:key}=await params
  const config=map[key]
  if(!config) redirect('/dashboard')
  const gate=await canUseModule(config.moduleKey)
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')
  return <StaffShell title={`${config.label} Inventory`}><InventoryBoard department={config.department} label={config.label}/></StaffShell>
}

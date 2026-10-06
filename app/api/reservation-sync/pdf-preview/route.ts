// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'
import { parseArrivalReportPages } from '@/lib/reservations/import'

export const dynamic='force-dynamic'
export const runtime='nodejs'

const MANAGER_CAPS=['foh_manager','manager','general_manager','operations_manager','owner']
let pdfModulePromise:Promise<any>|null=null

function canSync(access:any){
  return Boolean(access?.isAdmin || MANAGER_CAPS.some(cap=>access?.capabilities?.includes(cap)))
}

function getPdfModule(){
  if(!pdfModulePromise){
    pdfModulePromise=(async()=>{
      const workerModule:any=await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
      ;(globalThis as any).pdfjsWorker={WorkerMessageHandler:workerModule.WorkerMessageHandler}
      return import('pdfjs-dist/legacy/build/pdf.mjs')
    })()
  }
  return pdfModulePromise
}

async function extractPageText(pdf:any,pageNumber:number){
  const page=await pdf.getPage(pageNumber)
  try{
    const content=await page.getTextContent()
    const positioned=(Array.from(content?.items||[]) as any[])
      .filter((item:any)=>String(item?.str||'').trim())
      .map((item:any)=>({
        text:String(item?.str||'').trim(),
        x:Number(item?.transform?.[4]||0),
        y:Number(item?.transform?.[5]||0)
      }))
      .sort((a:any,b:any)=>{
        const dy=b.y-a.y
        if(Math.abs(dy)>2.2) return dy
        return a.x-b.x
      })

    const rows:{y:number;items:any[]}[]=[]
    let current:{y:number;items:any[]}|null=null
    for(const item of positioned){
      if(!current || Math.abs(current.y-item.y)>2.2){
        current={y:item.y,items:[item]}
        rows.push(current)
      }else{
        current.items.push(item)
      }
    }

    return rows
      .map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' | '))
      .join('\n')
      .trim()
  }finally{
    await page.cleanup?.()
  }
}

async function extractPages(file:File){
  if(file.size>12*1024*1024) throw new Error('PDF is too large. Please use an Arrival Report under 12 MB.')

  const pdfjs:any=await getPdfModule()
  const data=new Uint8Array(await file.arrayBuffer())
  const loadingTask=pdfjs.getDocument({
    data,
    useWorkerFetch:false,
    isEvalSupported:false,
    useSystemFonts:true
  })
  const pdf=await loadingTask.promise

  try{
    const pages:string[]=new Array(pdf.numPages)
    const concurrency=4

    for(let start=1;start<=pdf.numPages;start+=concurrency){
      const pageNumbers=Array.from(
        {length:Math.min(concurrency,pdf.numPages-start+1)},
        (_,index)=>start+index
      )
      const texts=await Promise.all(pageNumbers.map(pageNumber=>extractPageText(pdf,pageNumber)))
      pageNumbers.forEach((pageNumber,index)=>{
        const text=texts[index]
        if(!text || text.length<80) throw new Error(`Page ${pageNumber} did not contain readable report text.`)
        pages[pageNumber-1]=text
      })
    }

    return pages
  }finally{
    await pdf.destroy?.()
  }
}

export async function POST(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!canSync(access)) return NextResponse.json({error:'Forbidden'},{status:403})

  try{
    const form=await req.formData()
    const file=form.get('file')
    if(!(file instanceof File)) return NextResponse.json({error:'Choose an Arrival Report PDF first.'},{status:400})
    if(!/\.pdf$/i.test(file.name) && file.type!=='application/pdf') return NextResponse.json({error:'Please upload a PDF.'},{status:400})

    const admin=createSupabaseAdmin()
    const [pages,roomResult]=await Promise.all([
      extractPages(file),
      admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order')
    ])

    if(roomResult.error) throw new Error(roomResult.error.message)
    const rooms=roomResult.data||[]
    const roomNames=rooms.map((room:any)=>String(room.name))
    const parsed=parseArrivalReportPages(pages,roomNames)

    const keys=parsed.reservations.map((row:any)=>row.reservationKey)
    let existing:any[]=[]
    if(keys.length){
      const existingResult=await admin.from('reservation_stays')
        .select('reservation_key,room_id,guest_name,door_code,arrival_date,checkout_date,occupancy,rate_plan,check_in_time,products_raw,dietary_restrictions,referral_source,reason_for_visit,guest_comments,innkeeper_notes')
        .in('reservation_key',keys)
      if(existingResult.error) throw new Error(existingResult.error.message)
      existing=existingResult.data||[]
    }

    const oldByKey=new Map(existing.map((row:any)=>[String(row.reservation_key),row]))
    const roomIdByName=new Map(rooms.map((room:any)=>[String(room.name),String(room.id)]))
    const tracked:any={
      guestName:'guest_name',
      doorCode:'door_code',
      arrivalDate:'arrival_date',
      checkoutDate:'checkout_date',
      occupancy:'occupancy',
      ratePlan:'rate_plan',
      checkInTime:'check_in_time',
      productsRaw:'products_raw',
      dietaryRestrictions:'dietary_restrictions',
      referralSource:'referral_source',
      reasonForVisit:'reason_for_visit',
      guestComments:'guest_comments',
      innkeeperNotes:'innkeeper_notes'
    }

    const reservations=parsed.reservations.map((row:any)=>{
      const old:any=oldByKey.get(row.reservationKey)
      const changedFields:any={}
      if(old){
        for(const key of Object.keys(tracked)){
          const before=old[tracked[key]]??null
          const after=row[key]??null
          if(String(before??'')!==String(after??'')) changedFields[key]={before,after}
        }
        const beforeRoom=String(old.room_id||'')
        const afterRoom=row.roomName?String(roomIdByName.get(row.roomName)||''):''
        if(beforeRoom!==afterRoom) changedFields.roomName={before:beforeRoom,after:afterRoom}
      }

      return {
        ...row,
        phone:null,
        changeType:!old?'new':Object.keys(changedFields).length?'updated':'unchanged',
        changedFields,
        include:!row.needsReview
      }
    })

    return NextResponse.json({
      reportStartDate:parsed.reportStartDate,
      reportEndDate:parsed.reportEndDate,
      warnings:parsed.warnings,
      fileName:file.name,
      reservations
    })
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not read this Arrival Report.'},{status:500})
  }
}

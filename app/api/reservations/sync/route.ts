import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'
import { normalizeEditedReservation, parseArrivalReportPages } from '@/lib/reservations/parser'

export const dynamic = 'force-dynamic'

function todayDetroit(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function datesBetween(start:string,end:string){const out:string[]=[];let d=new Date(start+'T12:00:00Z');const last=new Date(end+'T12:00:00Z');while(d<=last){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1)}return out}
function normalized(v:unknown){return String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function packageMatches(productsRaw:string|null,catalog:any[]){
  if(!productsRaw)return [];
  const source=normalized(productsRaw);
  return catalog.filter(item=>{
    const name=normalized(item.name);if(!name)return false;if(source.includes(name))return true;
    const aliases:Record<string,string[]>={
      'chocolatier board':['chocolatier board','chocolate board'],
      'local cheese fruit':['local cheese fruit','local cheeses fruit','cheese fruit'],
      'seasonal blooms':['seasonal blooms','blooms'],
      'charcuterie board':['charcuterie board','charcuterie'],
      'chocolate dipped strawberries prosecco':['chocolate dipped strawberries prosecco','strawberries prosecco']
    };
    for(const [key,values] of Object.entries(aliases)){if(name.includes(key)||key.includes(name)){if(values.some(alias=>source.includes(alias)))return true}}
    return false;
  });
}
async function requireManager(){
  const access=await getStaffAccess();if(!access)return {error:NextResponse.json({error:'Unauthorized'},{status:401}),access:null};
  const role=String(access.roleName||'').toLowerCase();
  const allowed=access.isAdmin||['manager','general manager','operations manager','owner'].includes(role)||access.capabilities.some(cap=>['manager','general_manager','operations_manager','owner','foh_manager'].includes(cap));
  if(!allowed)return {error:NextResponse.json({error:'Manager access required'},{status:403}),access:null};
  return {error:null,access};
}

export async function GET(req:NextRequest){
  const gate=await requireManager();if(gate.error)return gate.error;
  const admin=createSupabaseAdmin(),date=req.nextUrl.searchParams.get('date')||todayDetroit();
  const [{data:batches},{data:verification},{data:links},{data:rooms}]=await Promise.all([
    admin.from('reservation_import_batches').select('*').order('created_at',{ascending:false}).limit(8),
    admin.from('reservation_daily_verifications').select('*').eq('service_date',date).maybeSingle(),
    admin.from('reservation_daily_links').select('*,rooms(name),primary:reservation_stays!reservation_daily_links_primary_reservation_id_fkey(*)').eq('service_date',date),
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order')
  ]);
  const roomRows=(rooms||[]).map((room:any)=>{const link=(links||[]).find((x:any)=>String(x.room_id)===String(room.id)) as any;return {roomId:room.id,roomName:room.name,status:link?.reservation_status||'Vacant',reservation:link?.primary||null}});
  return NextResponse.json({date,batches:batches||[],verification:verification||null,rooms:roomRows});
}

export async function POST(req:NextRequest){
  const gate=await requireManager();if(gate.error||!gate.access)return gate.error;
  const access=gate.access,admin=createSupabaseAdmin(),payload=await req.json().catch(()=>({})),action=String(payload?.action||'');
  const {data:rooms,error:roomsError}=await admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order');
  if(roomsError)return NextResponse.json({error:roomsError.message},{status:500});
  const roomNames=(rooms||[]).map((r:any)=>String(r.name)),roomByName=new Map((rooms||[]).map((r:any)=>[String(r.name),r]));

  if(action==='preview'){
    const pages=Array.isArray(payload.pages)?payload.pages.map(String):[];
    if(!pages.length)return NextResponse.json({error:'No report text received.'},{status:400});
    return NextResponse.json(parseArrivalReportPages(pages,roomNames));
  }

  if(action==='verify'){
    const serviceDate=String(payload.serviceDate||todayDetroit());
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(serviceDate))return NextResponse.json({error:'Invalid date'},{status:400});
    const {error}=await admin.from('reservation_daily_verifications').upsert({service_date:serviceDate,verified_by:access.userId,verified_at:new Date().toISOString(),note:String(payload.note||'').trim()||null},{onConflict:'service_date'});
    if(error)return NextResponse.json({error:error.message},{status:500});
    return NextResponse.json({ok:true});
  }

  if(action!=='commit')return NextResponse.json({error:'Unsupported action'},{status:400});
  const submitted=Array.isArray(payload.reservations)?payload.reservations:[],parsed=submitted.map((row:any)=>normalizeEditedReservation(row,roomNames)),invalid=parsed.filter((row:any)=>row.needsReview);
  if(invalid.length)return NextResponse.json({error:'Please correct the highlighted reservations before importing.',invalid},{status:400});
  if(!parsed.length)return NextResponse.json({error:'No reservations to import.'},{status:400});

  const reportStartDate=String(payload.reportStartDate||parsed.map((r:any)=>r.arrivalDate).filter(Boolean).sort()[0]||'');
  const reportEndDate=String(payload.reportEndDate||parsed.map((r:any)=>r.checkoutDate).filter(Boolean).sort().slice(-1)[0]||'');
  const fileName=String(payload.fileName||'Arrival Report.pdf'),now=new Date().toISOString();

  const {data:batch,error:batchError}=await admin.from('reservation_import_batches').insert({file_name:fileName,report_start_date:reportStartDate||null,report_end_date:reportEndDate||null,status:'previewed',records_detected:parsed.length,warning_count:0,warnings:[],imported_by:access.userId}).select('*').single();
  if(batchError||!batch)return NextResponse.json({error:batchError?.message||'Could not create import batch.'},{status:500});

  const keys=parsed.map((r:any)=>r.reservationKey),{data:existingRows,error:existingError}=await admin.from('reservation_stays').select('*').in('reservation_key',keys);
  if(existingError)return NextResponse.json({error:existingError.message},{status:500});
  const existingByKey=new Map((existingRows||[]).map((row:any)=>[String(row.reservation_key),row])),changes:any[]=[];

  const upserts=parsed.map((row:any)=>{
    const room=roomByName.get(String(row.roomName)) as any,existing=existingByKey.get(row.reservationKey) as any;
    const next={reservation_key:row.reservationKey,reservation_number:row.reservationNumber,guest_name:row.guestName,guest_phone:row.phone,door_code:row.doorCode,arrival_date:row.arrivalDate,checkout_date:row.checkoutDate,room_id:room?.id||null,occupancy:row.occupancy,rate_plan:row.ratePlan,check_in_time:row.checkInTime,products_raw:row.productsRaw,dietary_restrictions:row.dietaryRestrictions,referral_source:row.referralSource,reason_for_visit:row.reasonForVisit,guest_comments:row.guestComments,innkeeper_notes:row.innkeeperNotes,source_page:row.sourcePage,raw_text:row.rawText,parser_confidence:row.confidence,needs_review:false,active:true,last_import_batch_id:batch.id,last_seen_at:now,updated_at:now};
    if(!existing)changes.push({batch_id:batch.id,reservation_key:row.reservationKey,change_type:'new',changed_fields:{created:true}});
    else{const tracked=['guest_name','guest_phone','door_code','arrival_date','checkout_date','room_id','occupancy','rate_plan','check_in_time','products_raw','dietary_restrictions','reason_for_visit','guest_comments','innkeeper_notes'],changedFields:Record<string,any>={};for(const f of tracked)if(String(existing[f]??'')!==String((next as any)[f]??''))changedFields[f]={from:existing[f]??null,to:(next as any)[f]??null};changes.push({batch_id:batch.id,reservation_id:existing.id,reservation_key:row.reservationKey,change_type:Object.keys(changedFields).length?'updated':'unchanged',changed_fields:changedFields})}
    return next;
  });

  const {data:savedStays,error:upsertError}=await admin.from('reservation_stays').upsert(upserts,{onConflict:'reservation_key'}).select('*');
  if(upsertError)return NextResponse.json({error:upsertError.message},{status:500});
  const stayByKey=new Map((savedStays||[]).map((row:any)=>[String(row.reservation_key),row]));
  for(const change of changes)if(!change.reservation_id)change.reservation_id=(stayByKey.get(change.reservation_key) as any)?.id||null;
  if(changes.length)await admin.from('reservation_import_changes').insert(changes);

  const spanStart=reportStartDate||parsed.map((r:any)=>r.arrivalDate).sort()[0],spanEnd=reportEndDate||parsed.map((r:any)=>r.checkoutDate).sort().slice(-1)[0],dates=datesBetween(spanStart,spanEnd);
  const {data:allStays,error:allError}=await admin.from('reservation_stays').select('*').eq('active',true).lte('arrival_date',spanEnd).gte('checkout_date',spanStart);
  if(allError)return NextResponse.json({error:allError.message},{status:500});

  const dailyLinks:any[]=[],housekeepingUpdates:any[]=[];
  for(const date of dates)for(const room of rooms||[]){
    const relevant=(allStays||[]).filter((stay:any)=>String(stay.room_id)===String((room as any).id)&&stay.arrival_date<=date&&stay.checkout_date>=date);
    const arriving=relevant.find((s:any)=>s.arrival_date===date),departing=relevant.find((s:any)=>s.checkout_date===date),stayover=relevant.find((s:any)=>s.arrival_date<date&&s.checkout_date>date);
    let status='Vacant';if(arriving&&departing&&arriving.id!==departing.id)status='Out/In';else if(arriving)status='Arrival';else if(departing)status='Checkout';else if(stayover)status='Stayover';
    const primary=arriving||stayover||departing||null;
    dailyLinks.push({service_date:date,room_id:(room as any).id,reservation_status:status,primary_reservation_id:primary?.id||null,arriving_reservation_id:arriving?.id||null,stay_reservation_id:stayover?.id||null,departing_reservation_id:departing?.id||null,updated_at:now});
    housekeepingUpdates.push({service_date:date,room_id:(room as any).id,reservation_status:status,updated_at:now});
  }
  if(dailyLinks.length){const {error}=await admin.from('reservation_daily_links').upsert(dailyLinks,{onConflict:'service_date,room_id'});if(error)return NextResponse.json({error:error.message},{status:500})}
  if(housekeepingUpdates.length){
    const roomIds=(rooms||[]).map((r:any)=>r.id),{data:blockedRows}=await admin.from('housekeeping_daily_rooms').select('service_date,room_id,reservation_status').gte('service_date',spanStart).lte('service_date',spanEnd).in('room_id',roomIds).eq('reservation_status','Blocked');
    const blocked=new Set((blockedRows||[]).map((r:any)=>r.service_date+'|'+r.room_id)),safe=housekeepingUpdates.filter(r=>!blocked.has(r.service_date+'|'+r.room_id));
    const {error}=await admin.from('housekeeping_daily_rooms').upsert(safe,{onConflict:'service_date,room_id'});if(error)return NextResponse.json({error:error.message},{status:500});
  }

  const {data:catalog}=await admin.from('room_package_catalog').select('id,name,available');
  await admin.from('housekeeping_room_packages').delete().eq('source','reservation_sync').gte('service_date',spanStart).lte('service_date',spanEnd);
  const autoPackages:any[]=[];
  for(const stay of allStays||[]){if(stay.arrival_date<spanStart||stay.arrival_date>spanEnd||!stay.room_id)continue;for(const item of packageMatches(stay.products_raw,catalog||[]))autoPackages.push({service_date:stay.arrival_date,room_id:stay.room_id,package_id:item.id,source:'reservation_sync',reservation_id:stay.id})}
  if(autoPackages.length)await admin.from('housekeeping_room_packages').insert(autoPackages);

  await admin.from('reservation_import_batches').update({status:'committed',records_imported:parsed.length,committed_at:now,updated_at:now}).eq('id',batch.id);
  const changeSummary=changes.reduce((s:any,c:any)=>{s[c.change_type]=(s[c.change_type]||0)+1;return s},{});
  return NextResponse.json({ok:true,batchId:batch.id,imported:parsed.length,changeSummary,datesUpdated:dates.length,packagesAdded:autoPackages.length});
}

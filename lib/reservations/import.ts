export type ParsedReservation = {
  reservationKey:string
  reservationNumber:string|null
  guestName:string
  phone:string|null
  doorCode:string|null
  arrivalDate:string|null
  checkoutDate:string|null
  roomName:string|null
  occupancy:number|null
  ratePlan:string|null
  checkInTime:string|null
  productsRaw:string|null
  dietaryRestrictions:string|null
  referralSource:string|null
  reasonForVisit:string|null
  guestComments:string|null
  innkeeperNotes:string|null
  sourcePage:number
  rawText:string
  confidence:number
  needsReview:boolean
  warnings:string[]
}

const DATE_RE = /\b(0?[1-9]|1[0-2])[\/-](0?[1-9]|[12]\d|3[01])[\/-](20\d{2})\b/g
const ORDER_RE = /(?:order\s*[:#]?\s*|\(order\s*[:#]?\s*)(\d{4,8})\)?/i
const PHONE_RE = /(?:Phone|Cell)\s*[:;]?\s*\+?1?\s*([2-9]\d{2})[\s.\-)]*([2-9]\d{2})[\s.\-]*([0-9]{4})/i
const TIME_RE = /\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)\b/i

function isoDate(value:string) {
  const m=value.match(/(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})/)
  if(!m) return null
  return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
}

function cmpDate(a:string,b:string){ return a.localeCompare(b) }
function clean(v:string|null|undefined){
  const s=String(v||'').replace(/\s+/g,' ').replace(/^[:;\-\s]+|[\s/]+$/g,'').trim()
  return s || null
}
function norm(v:string){ return v.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() }
function stableFallbackKey(parts:(string|null|undefined)[]){
  const raw=parts.map(x=>norm(String(x||''))).join('|')
  let hash=2166136261
  for(let i=0;i<raw.length;i++){ hash^=raw.charCodeAt(i); hash=Math.imul(hash,16777619) }
  return `fallback:${(hash>>>0).toString(16)}`
}

function findRoom(text:string, rooms:string[]) {
  const lower=text.toLowerCase()
  const exact=rooms.find(room=>lower.includes(room.toLowerCase()))
  if(exact) return exact
  const normalized=norm(text)
  return rooms.find(room=>normalized.includes(norm(room))) || null
}

function looksLikeGuestName(line:string) {
  if(!line || /\d/.test(line) || /,\s*[A-Z]{2}\b/.test(line) || /^\(.+\)$/.test(line)) return false
  if(/^(arrival|checkout|stay.?over|selection criteria|ordered by date|date|nights|room|occ|products|checkin|phone|cell|room only|room \+ breakfast|peace of mind|cancellation coverage)/i.test(line)) return false
  const words=line.trim().split(/\s+/)
  return line.length>=3 && line.length<=70 && words.length>=2 && words.length<=6 && words.every(w=>/^[A-Za-zÀ-ÿ'’.-]+$/.test(w))
}

function candidateGuestName(lines:string[], roomIndex:number, roomName:string|null) {
  if(roomName && roomIndex>=0){
    const sameLine=lines[roomIndex].replace(new RegExp(roomName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'').replace(/^\([^)]*\)\s*/,'').trim()
    if(looksLikeGuestName(sameLine)) return sameLine
  }
  for(let i=Math.min(roomIndex-1,lines.length-1);i>=Math.max(0,roomIndex-6);i--){
    const line=lines[i].trim()
    if(looksLikeGuestName(line)) return line
  }
  return ''
}

function closestDatesBeforeOrder(lines:string[],orderIndex:number){
  const found:string[]=[]
  for(let i=orderIndex;i>=Math.max(0,orderIndex-6);i--){
    const line=lines[i]
    if(/selection criteria|Date\s*>=|arrival guests|checkout guests|stay.?over guests|total .* guests/i.test(line)) continue
    const dates=[...line.matchAll(DATE_RE)].map(m=>isoDate(m[0])).filter(Boolean) as string[]
    for(const date of dates) if(!found.includes(date)) found.push(date)
    if(found.length>=2) break
  }
  return found.slice(0,2).sort(cmpDate)
}

function noteBlock(lines:string[],orderIndex:number,roomNames:string[]){
  const limit=Math.min(lines.length,orderIndex+12)
  let questionIndex=-1
  for(let i=orderIndex+1;i<limit;i++){
    if(/Do you have any dietary restrictions/i.test(lines[i])){ questionIndex=i; break }
  }
  if(questionIndex<0) return ''
  const out:string[]=[]
  for(let i=questionIndex;i<limit;i++){
    const line=lines[i]
    if(i>questionIndex && /arrival guests|checkout guests|stay.?over guests|total .* guests/i.test(line)) break
    if(i>questionIndex && looksLikeGuestName(line)){
      const lookahead=lines.slice(i,Math.min(limit,i+3)).join(' ')
      if(findRoom(lookahead,roomNames) || DATE_RE.test(lookahead)) break
    }
    out.push(line)
  }
  return out.join(' ')
}

function betweenLabels(text:string,startLabel:string,nextLabels:string[]) {
  const esc=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  const start=esc(startLabel)
  const next=nextLabels.map(esc).join('|')
  const re=new RegExp(`${start}\\s*:?\\s*([\\s\\S]*?)${next?`(?=\\s*\\/\\s*(?:${next})|$)`:'$'}`,'i')
  return clean(text.match(re)?.[1])
}

function extractNotes(text:string) {
  const labels={
    dietary:'Do you have any dietary restrictions?',
    referral:'How did you hear about us?',
    reason:'Reason for Your Visit',
    guest:'[GUEST COMMENT]',
    innkeeper:'[INNKEEPER NOTES]'
  }
  const dietary=betweenLabels(text,labels.dietary,[labels.referral,labels.reason,labels.guest,labels.innkeeper])
  const referral=betweenLabels(text,labels.referral,[labels.reason,labels.guest,labels.innkeeper])
  const reason=betweenLabels(text,labels.reason,[labels.guest,labels.innkeeper])
  const guest=betweenLabels(text,labels.guest,[labels.innkeeper])
  let innkeeper=betweenLabels(text,labels.innkeeper,[])
  if(innkeeper && innkeeper.length>500) innkeeper=innkeeper.slice(0,500)
  return {dietary,referral,reason,guest,innkeeper}
}

function inferRatePlan(text:string) {
  const matches=[
    /Room\s*\+\s*Breakfast\s*\+\s*Cancellation Coverage/i,
    /Room\s*Only\s*\+\s*Cancellation Coverage/i,
    /Room\s*\+\s*Breakfast/i,
    /Room\s*Only/i,
    /Peace of Mind Rate/i
  ]
  for(const re of matches){ const m=text.match(re); if(m) return clean(m[0]) }
  return null
}

function inferProducts(text:string) {
  const parts:string[]=[]
  const re=/\b\d+\s*x\s*([A-Za-z][A-Za-z &+'"()-]{2,80}?)(?=\s+(?:\d{1,2}:\d{2}\s*(?:AM|PM)|Not selected|\d\b|Cell|Phone|\(order)|$)/gi
  let m:RegExpExecArray|null
  while((m=re.exec(text))) parts.push(`${m[0]}`.replace(/\s+/g,' ').trim())
  return clean([...new Set(parts)].join('; '))
}

function inferOccupancy(text:string) {
  const beforeTime=text.split(TIME_RE)[0]
  const nums=[...beforeTime.matchAll(/\b([1-4])\b/g)].map(m=>Number(m[1]))
  return nums.length ? nums[nums.length-1] : null
}

export function parseArrivalReportPages(pages:string[], roomNames:string[]) {
  const reservations:ParsedReservation[]=[]
  const warnings:string[]=[]
  let reportStartDate:string|null=null
  let reportEndDate:string|null=null

  if(pages[0]){
    const criteria=pages[0].match(/Date\s*>=?\s*(\d{1,2}[\/-]\d{1,2}[\/-]20\d{2})\s*AND\s*Date\s*<=?\s*(\d{1,2}[\/-]\d{1,2}[\/-]20\d{2})/i)
    reportStartDate=criteria ? isoDate(criteria[1]) : null
    reportEndDate=criteria ? isoDate(criteria[2]) : null
  }

  pages.forEach((pageText,pageIdx)=>{
    const lines=pageText.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean)
    const orderLineIndexes:number[]=[]
    for(let i=0;i<lines.length;i++) if(ORDER_RE.test(lines[i])) orderLineIndexes.push(i)

    for(const orderIndex of orderLineIndexes){
      const orderMatch=lines[orderIndex].match(ORDER_RE)
      if(!orderMatch) continue
      const reservationNumber=orderMatch[1]
      const start=Math.max(0,orderIndex-6)
      const windowLines=lines.slice(start,orderIndex+1)
      const windowText=windowLines.join(' ')
      const roomName=findRoom(windowText,roomNames)
      const roomIndex=roomName ? lines.findIndex((line,idx)=>idx>=start&&idx<=orderIndex&&norm(line).includes(norm(roomName))) : -1
      const guestName=candidateGuestName(lines,roomIndex>=0?roomIndex:orderIndex,roomName)

      const dates=closestDatesBeforeOrder(lines,orderIndex)
      const arrivalDate=dates[0]||null
      const checkoutDate=dates.length>1?dates[dates.length-1]:null

      const phoneSearch=[lines[orderIndex],lines[orderIndex+1],lines[orderIndex+2],lines[orderIndex-1],lines[orderIndex-2]].filter(Boolean)
      let phoneMatch:RegExpMatchArray|null=null
      for(const candidate of phoneSearch){ const m=candidate.match(PHONE_RE); if(m){ phoneMatch=m; break } }
      const phone=phoneMatch ? `${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}` : null
      const doorCode=phone ? phone.slice(-4) : null
      const timeMatch=windowText.match(TIME_RE)
      const checkInTime=timeMatch ? `${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3].toUpperCase()}` : (/Not selected/i.test(windowText)?'Not selected':null)
      const occupancy=inferOccupancy(windowText)
      const ratePlan=inferRatePlan(windowText)
      const productsRaw=inferProducts(windowText)

      const noteText=noteBlock(lines,orderIndex,roomNames)
      const notes=extractNotes(noteText)

      const rowWarnings:string[]=[]
      if(!guestName) rowWarnings.push('Guest name could not be read')
      if(!arrivalDate||!checkoutDate) rowWarnings.push('Arrival/checkout dates need review')
      if(!roomName) rowWarnings.push('Room could not be matched')
      if(!phone) rowWarnings.push('Phone number could not be read')

      let confidence=100
      confidence-=rowWarnings.length*18
      if(!occupancy) confidence-=5
      if(!ratePlan) confidence-=5
      confidence=Math.max(0,confidence)

      const reservationKey=`order:${reservationNumber}`
      reservations.push({
        reservationKey,reservationNumber,guestName,phone,doorCode,arrivalDate,checkoutDate,
        roomName,occupancy,ratePlan,checkInTime,productsRaw,
        dietaryRestrictions:notes.dietary,referralSource:notes.referral,reasonForVisit:notes.reason,
        guestComments:notes.guest,innkeeperNotes:notes.innkeeper,
        sourcePage:pageIdx+1,rawText:windowText+' '+noteText,
        confidence,needsReview:rowWarnings.length>0,warnings:rowWarnings
      })
    }
  })

  const byKey=new Map<string,ParsedReservation>()
  for(const row of reservations){
    const existing=byKey.get(row.reservationKey)
    if(!existing || row.confidence>existing.confidence) byKey.set(row.reservationKey,row)
  }

  const deduped=[...byKey.values()]
  if(!deduped.length) warnings.push('No reservation order numbers were detected. The PDF may need OCR review.')
  const reviewCount=deduped.filter(r=>r.needsReview).length
  if(reviewCount) warnings.push(`${reviewCount} reservation${reviewCount===1?'':'s'} need manual review before import.`)

  return {reportStartDate,reportEndDate,reservations:deduped,warnings}
}

export function normalizeEditedReservation(row:any, roomNames:string[]):ParsedReservation {
  const phone=String(row.phone||'').replace(/\D/g,'').slice(-10)||null
  const roomName=roomNames.find(r=>r===row.roomName) || null
  const arrivalDate=/^20\d{2}-\d{2}-\d{2}$/.test(String(row.arrivalDate||''))?String(row.arrivalDate):null
  const checkoutDate=/^20\d{2}-\d{2}-\d{2}$/.test(String(row.checkoutDate||''))?String(row.checkoutDate):null
  const reservationNumber=clean(row.reservationNumber)
  const reservationKey=reservationNumber?`order:${reservationNumber}`:stableFallbackKey([row.guestName,arrivalDate,checkoutDate,roomName])
  const warnings:string[]=[]
  if(!clean(row.guestName)) warnings.push('Guest name is required')
  if(!arrivalDate||!checkoutDate) warnings.push('Valid arrival and checkout dates are required')
  if(arrivalDate&&checkoutDate&&checkoutDate<arrivalDate) warnings.push('Checkout cannot be before arrival')
  if(!roomName) warnings.push('Room is required')
  return {
    reservationKey,reservationNumber,guestName:clean(row.guestName)||'',phone,doorCode:phone?phone.slice(-4):null,
    arrivalDate,checkoutDate,roomName,occupancy:Number(row.occupancy)||null,ratePlan:clean(row.ratePlan),
    checkInTime:clean(row.checkInTime),productsRaw:clean(row.productsRaw),dietaryRestrictions:clean(row.dietaryRestrictions),
    referralSource:clean(row.referralSource),reasonForVisit:clean(row.reasonForVisit),guestComments:clean(row.guestComments),
    innkeeperNotes:clean(row.innkeeperNotes),sourcePage:Number(row.sourcePage)||0,rawText:String(row.rawText||''),
    confidence:Number(row.confidence)||0,needsReview:warnings.length>0,warnings
  }
}

'use client'
import { useState } from 'react'
import { ClipboardCopy, Check } from 'lucide-react'

export default function CopyHandoffButton({content}:{content:string}) {
  const [copied,setCopied]=useState(false)
  async function copy(){
    try{
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(()=>setCopied(false),2200)
    }catch{setCopied(false)}
  }
  return <button type="button" className="ops-command-copy" onClick={copy} title="Copy today's open work and shift notes">
    {copied?<Check size={15}/>:<ClipboardCopy size={15}/>}
    {copied?'Copied':'Copy handoff'}
  </button>
}

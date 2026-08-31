'use client'

import { useState } from 'react'
import { Icon } from './Icon'
import { trackEvent } from '../lib/analytics'
import { copyText } from '../lib/clipboard'

type CopyState='idle'|'copied'|'failed'

export function CodeBlock({children}:{children:string}) {
  const [state,setState]=useState<CopyState>('idle')
  async function copy(){
    try{
      await copyText(children)
      setState('copied')
      trackEvent('code_copied')
    }catch{
      setState('failed')
      trackEvent('code_copy_failed')
    }
    window.setTimeout(()=>setState('idle'),1600)
  }
  const label=state==='copied'?'Copied':state==='failed'?'Copy failed':'Copy'
  return <div className="code-block"><pre><code>{children}</code></pre><button type="button" className="copy-button" onClick={copy} aria-live="polite"><Icon name="code" size={13}/>{label}</button></div>
}

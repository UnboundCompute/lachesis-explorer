'use client'
import { useState } from 'react'
import { Icon } from './Icon'
import { trackEvent } from '../lib/analytics'
export function CodeBlock({children}:{children:string}) { const [copied,setCopied]=useState(false); return <div className="code-block"><pre><code>{children}</code></pre><button className="copy-button" onClick={()=>{navigator.clipboard?.writeText(children);setCopied(true);trackEvent('code_copied');setTimeout(()=>setCopied(false),1200)}}><Icon name="code" size={13}/>{copied?'Copied':'Copy'}</button></div> }

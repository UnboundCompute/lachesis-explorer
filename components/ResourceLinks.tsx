import { Icon } from './Icon'
import { trackEvent } from '../lib/analytics'

const resources = [
  { label: 'Main site', href: 'https://unboundcompute.com/', detail: 'UnboundCompute' },
  { label: 'Trace demo', href: 'https://trace.unboundcompute.com/', detail: 'See the proof' },
  { label: 'Security blog', href: 'https://security.unboundcompute.com/', detail: 'Research notes' },
  { label: 'Lachesis on GitHub', href: 'https://github.com/UnboundCompute/lachesis', detail: 'Source & docs' },
]

export function ResourceLinks() {
  return <nav className="resource-links" aria-label="UnboundCompute resources">
    <span className="resource-title">EXPLORE THE STACK</span>
    <div className="resource-list">
      {resources.map(resource => <a key={resource.href} href={resource.href} target="_blank" rel="noreferrer" onClick={()=>trackEvent('resource_opened',{resource:resource.label})}>
        <span><b>{resource.label}</b><small>{resource.detail}</small></span><Icon name="arrow" size={14}/>
      </a>)}
    </div>
  </nav>
}

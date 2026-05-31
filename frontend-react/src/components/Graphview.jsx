import React, { useEffect, useRef, useState } from 'react'

const NODE_COLORS = {
  article: '#1a8f7a', project: '#7b5ea7', cluster: '#2d4a6b',
  concept: '#c97a20', term_item: '#1a8f7a', idea_item: '#2e7d6b',
  entity_item: '#c97a20', link_item: '#1565c0', question_item: '#b06a00',
  sentiment_item: '#7b4a8a', stat_item: '#445566',
  tech_item: '#0d7377', feature_item: '#8b5e3c',
  file_item: '#4a6741', contributor: '#7b3f6e',
}
const NODE_RADIUS = {
  article: 16, project: 18, cluster: 13, concept: 9,
  term_item: 7, idea_item: 7, entity_item: 7, link_item: 7,
  question_item: 7, sentiment_item: 8, stat_item: 7,
  tech_item: 8, feature_item: 8, file_item: 8, contributor: 8,
}
const SMALL_TYPES = new Set([
  'concept','tech_item','feature_item','file_item','contributor',
  'term_item','idea_item','entity_item','link_item','question_item',
  'sentiment_item','stat_item'
])
const CLUSTER_EDGE_COLORS = {
  tech: '#0d7377', features: '#8b5e3c', files: '#4a6741', people: '#7b3f6e',
  terms: '#1a8f7a', ideas: '#2e7d6b', entities: '#c97a20', links: '#1565c0',
  questions: '#b06a00', sentiment: '#7b4a8a', sentiment_arc: '#9b6aaa',
  stats: '#445566', cooccurrence: '#e8a020',
}

const TYPE_LABELS = {
  article: 'Article', project: 'Project', cluster: 'Category',
  concept: 'Concept', term_item: 'Key Term', idea_item: 'Main Idea',
  entity_item: 'Entity', link_item: 'Related Link', question_item: 'Question',
  sentiment_item: 'Sentiment', stat_item: 'Stat', tech_item: 'Technology',
  feature_item: 'Feature', file_item: 'File', contributor: 'Contributor',
}

// ── Node detail panel ─────────────────────────────────────────────────────────
function NodePanel({ node, onClose }) {
  if (!node) return null
  const color = NODE_COLORS[node.type] || '#888'
  const typeLabel = TYPE_LABELS[node.type] || node.type

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 320, zIndex: 200,
      background: 'rgba(10,10,18,0.96)',
      backdropFilter: 'blur(20px)',
      borderLeft: `1px solid ${color}30`,
      borderTop: `2px solid ${color}`,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Syne', sans-serif",
      animation: 'slideIn 0.2s ease-out',
    }}>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 18px 14px', borderBottom: `1px solid ${color}20`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{typeLabel}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f0eff5', lineHeight: 1.4, wordBreak: 'break-word' }}>{node.fullLabel || node.label}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#444455', cursor: 'pointer', padding: 2, flexShrink: 0, fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

        {/* Summary / description for root nodes */}
        {node.summary && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: `${color}0d`, borderRadius: 8, borderLeft: `3px solid ${color}50` }}>
            <p style={{ fontSize: 13, color: '#aaaacc', lineHeight: 1.7, margin: 0 }}>{node.summary}</p>
          </div>
        )}

        {/* Full text for leaf nodes where label IS the content */}
        {!node.summary && node.fullLabel && node.fullLabel !== node.label && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: `${color}0d`, borderRadius: 8, borderLeft: `3px solid ${color}50` }}>
            <p style={{ fontSize: 13, color: '#aaaacc', lineHeight: 1.7, margin: 0 }}>{node.fullLabel}</p>
          </div>
        )}

        {/* Neighbors — connected nodes */}
        {node.neighbors?.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#444455', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Connected to
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {node.neighbors.map((nb, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: NODE_COLORS[nb.type] || '#666', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#8888aa', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nb.fullLabel || nb.label}</span>
                  <span style={{ fontSize: 9, color: '#333344', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{TYPE_LABELS[nb.type] || nb.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open URL for root + link nodes */}
        {node.url && (
          <a href={node.url} target="_blank" rel="noopener noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 16,
            padding: '9px 14px', borderRadius: 8,
            background: `${color}12`, border: `1px solid ${color}25`,
            color, fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>
            <span>↗</span> Open source
          </a>
        )}
      </div>
    </div>
  )
}

export default function GraphView({ entries }) {
  const svgRef       = useRef(null)
  const tooltipRef   = useRef(null)
  const containerRef = useRef(null)
  const nodesRef     = useRef([])   // keep node data for neighbor lookup
  const edgesRef     = useRef([])
  const [selectedNode, setSelectedNode] = useState(null)

  useEffect(() => {
    if (!entries?.length) return
    renderGraph()
  }, [entries])

  useEffect(() => {
    if (!entries?.length) return
    const ro = new ResizeObserver(() => renderGraph())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [entries])

  function buildGraphData(entries) {
    const nodes = [], edges = []
    const seen = {}, counter = { n: 0 }

    function mkId(pfx) { return `${pfx}_${counter.n++}` }

    function leaf(label, type, fullLabel = '') {
      const key = `${type}::${label.toLowerCase()}`
      if (!seen[key]) {
        seen[key] = mkId(type)
        nodes.push({
          id: seen[key], label: label.slice(0, 18) + (label.length > 18 ? '…' : ''),
          fullLabel: fullLabel || label,   // ← full untruncated text
          type, url: '', summary: '', cluster: null,
        })
      }
      return seen[key]
    }

    function clusterNode(label, clusterKey, parentId) {
      const cid = mkId('cluster')
      nodes.push({ id: cid, label, fullLabel: label, type: 'cluster', url: '', summary: '', cluster: clusterKey })
      edges.push({ source: parentId, target: cid, cluster: clusterKey })
      return cid
    }

    for (const entry of entries) {
      const etype = entry.type || 'article'
      const title = (entry.title || entry.url || 'Untitled').slice(0, 45)
      const rootId = mkId('root')
      nodes.push({
        id: rootId, label: title, fullLabel: entry.title || title, type: etype,
        url: entry.url || '', summary: entry.summary || entry.description || '',
        cluster: null,
      })

      if (etype === 'article') {
        const keyTerms = entry.key_terms || []
        const termIds = {}
        if (keyTerms.length) {
          const cid = clusterNode('Key Terms', 'terms', rootId)
          keyTerms.slice(0, 6).forEach(t => {
            const lid = leaf(t, 'term_item', t)
            termIds[t] = lid
            edges.push({ source: cid, target: lid, cluster: 'terms' })
          })
        }

        ;(entry.co_occurrences || []).forEach(co => {
          const a = termIds[co.term_a], b = termIds[co.term_b]
          if (a && b) edges.push({ source: a, target: b, cluster: 'cooccurrence', strength: co.strength || 0.5 })
        })

        const mainIdeas = entry.main_ideas || []
        if (mainIdeas.length) {
          const cid = clusterNode('Main Ideas', 'ideas', rootId)
          mainIdeas.slice(0, 4).forEach(idea => {
            const lid = leaf(idea.slice(0, 18), 'idea_item', idea)  // store full idea
            edges.push({ source: cid, target: lid, cluster: 'ideas' })
          })
        }

        const questions = entry.questions || []
        if (questions.length) {
          const cid = clusterNode('Questions', 'questions', rootId)
          questions.slice(0, 4).forEach(q => {
            const lid = leaf(q.slice(0, 18), 'question_item', q)  // store full question
            edges.push({ source: cid, target: lid, cluster: 'questions' })
          })
        }

        ;(entry.entities || []).slice(0, 5).forEach(ent => {
          edges.push({ source: rootId, target: leaf(ent, 'entity_item', ent), cluster: null })
        })

        ;(entry.links || []).slice(0, 6).forEach(c => {
          edges.push({ source: rootId, target: leaf(c, 'concept', c), cluster: null })
        })

      } else if (etype === 'project') {
        const tech = Array.isArray(entry.tech_stack) && entry.tech_stack.length
          ? entry.tech_stack : Object.keys(entry.languages || {})
        if (tech.length) {
          const cid = clusterNode('Tech Stack', 'tech', rootId)
          tech.slice(0, 8).forEach(t => {
            edges.push({ source: cid, target: leaf(t, 'tech_item', t), cluster: 'tech' })
          })
        }

        const features = entry.features || []
        if (features.length) {
          const cid = clusterNode('Features', 'features', rootId)
          features.slice(0, 5).forEach(f => {
            edges.push({ source: cid, target: leaf(f.slice(0, 18), 'feature_item', f), cluster: 'features' })
          })
        }

        // Claude-only clusters
        const arch = entry.architecture_notes || []
        if (arch.length) {
          const cid = clusterNode('Architecture', 'features', rootId)
          arch.slice(0, 4).forEach(a => {
            edges.push({ source: cid, target: leaf(a.slice(0, 18), 'feature_item', a), cluster: 'features' })
          })
        }

        const tradeoffs = entry.tradeoffs || []
        if (tradeoffs.length) {
          const cid = clusterNode('Tradeoffs', 'questions', rootId)
          tradeoffs.slice(0, 4).forEach(t => {
            edges.push({ source: cid, target: leaf(t.slice(0, 18), 'question_item', t), cluster: 'questions' })
          })
        }

        const useCases = entry.use_cases || []
        if (useCases.length) {
          const cid = clusterNode('Use Cases', 'ideas', rootId)
          useCases.slice(0, 4).forEach(u => {
            edges.push({ source: cid, target: leaf(u.slice(0, 18), 'idea_item', u), cluster: 'ideas' })
          })
        }

        const relTech = entry.related_technologies || []
        if (relTech.length) {
          const cid = clusterNode('Related Tech', 'tech', rootId)
          relTech.slice(0, 6).forEach(r => {
            edges.push({ source: cid, target: leaf(r, 'tech_item', r), cluster: 'tech' })
          })
        }

        const projQ = entry.questions || []
        if (projQ.length) {
          const cid = clusterNode('Questions', 'questions', rootId)
          projQ.slice(0, 4).forEach(q => {
            edges.push({ source: cid, target: leaf(q.slice(0, 18), 'question_item', q), cluster: 'questions' })
          })
        }

        const contribs = entry.contributors || []
        if (contribs.length) {
          const cid = clusterNode('Contributors', 'people', rootId)
          contribs.slice(0, 5).forEach(c => {
            const name = typeof c === 'string' ? c : (c.login || c.name || 'Unknown')
            edges.push({ source: cid, target: leaf(name, 'contributor', name), cluster: 'people' })
          })
        }

        ;(entry.key_concepts || entry.links || []).slice(0, 6).forEach(c => {
          edges.push({ source: rootId, target: leaf(c, 'concept', c), cluster: null })
        })
      }
    }

    return { nodes, edges }
  }

  async function renderGraph() {
    const d3 = await import('d3')
    const svgEl = svgRef.current
    const container = containerRef.current
    if (!svgEl || !container) return
    svgEl.innerHTML = ''
    setSelectedNode(null)

    const { nodes, edges } = buildGraphData(entries)
    nodesRef.current = nodes
    edgesRef.current = edges
    if (!nodes.length) return

    const W = container.clientWidth || 900
    const H = container.clientHeight || 600

    const svg = d3.select(svgEl).attr('width', W).attr('height', H)
    const zoom = d3.zoom().scaleExtent([0.1, 5]).on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)
    const g = svg.append('g')

    svg.append('defs').append('marker')
      .attr('id', 'arrow').attr('viewBox', '0 -5 10 10').attr('refX', 20)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', 'rgba(255,255,255,0.15)')

    const link = g.append('g').selectAll('line').data(edges).join('line')
      .attr('stroke', d =>
        d.cluster === 'cooccurrence' ? '#e8a020'
        : d.cluster ? (CLUSTER_EDGE_COLORS[d.cluster] || 'rgba(255,255,255,0.1)')
        : 'rgba(255,255,255,0.08)'
      )
      .attr('stroke-width', d => d.cluster === 'cooccurrence' ? (d.strength || 0.5) * 3 : 1.2)
      .attr('stroke-dasharray', d => (!d.cluster || d.cluster === 'concept') ? '4,3' : null)
      .attr('opacity', d => d.cluster === 'cooccurrence' ? 0.5 : 0.7)
      .attr('marker-end', d => d.cluster === 'cooccurrence' ? null : 'url(#arrow)')

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    node.append('circle')
      .attr('r', d => NODE_RADIUS[d.type] || 10)
      .attr('fill', d => NODE_COLORS[d.type] || '#666')
      .attr('stroke', 'rgba(255,255,255,0.15)')
      .attr('stroke-width', 1.5)

    node.append('text')
      .text(d => {
        const max = SMALL_TYPES.has(d.type) ? 14 : 18
        return d.label.length > max ? d.label.slice(0, max) + '…' : d.label
      })
      .attr('dy', d => (NODE_RADIUS[d.type] || 10) + 11)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => SMALL_TYPES.has(d.type) ? 8 : d.type === 'cluster' ? 10 : 11)
      .attr('font-family', 'Syne, sans-serif')
      .attr('fill', '#aaaacc')
      .attr('font-weight', d => SMALL_TYPES.has(d.type) ? '400' : '700')

    // Tooltip — hover only, shows type + short label
    const tooltip = d3.select(tooltipRef.current)
    node
      .on('mouseover', (e, d) => {
        const typeLabel = TYPE_LABELS[d.type] || d.type
        tooltip.style('opacity', '1').html(
          `<span style="font-size:9px;font-weight:700;color:${NODE_COLORS[d.type]||'#888'};text-transform:uppercase;letter-spacing:0.08em">${typeLabel}</span>`
          + `<br><strong style="color:#f0eff5;font-size:12px">${d.fullLabel?.slice(0, 60) || d.label}${(d.fullLabel?.length > 60) ? '…' : ''}</strong>`
          + `<br><span style="font-size:10px;color:#555566;margin-top:3px;display:block">Click to expand</span>`
        )
      })
      .on('mousemove', e => {
        const rect = container.getBoundingClientRect()
        tooltip.style('left', (e.clientX - rect.left + 14) + 'px').style('top', (e.clientY - rect.top - 10) + 'px')
      })
      .on('mouseout', () => tooltip.style('opacity', '0'))
      .on('click', (e, d) => {
        e.stopPropagation()
        tooltip.style('opacity', '0')

        // Build neighbor list from edges
        const neighborIds = new Set()
        edges.forEach(edge => {
          const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source
          const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target
          if (srcId === d.id) neighborIds.add(tgtId)
          if (tgtId === d.id) neighborIds.add(srcId)
        })
        const neighbors = nodes.filter(n => neighborIds.has(n.id) && n.id !== d.id)

        setSelectedNode({ ...d, neighbors })

        // Highlight connected nodes
        node.selectAll('circle')
          .attr('opacity', n => n.id === d.id || neighborIds.has(n.id) ? 1 : 0.25)
          .attr('stroke', n => n.id === d.id ? '#ffffff' : 'rgba(255,255,255,0.15)')
          .attr('stroke-width', n => n.id === d.id ? 2.5 : 1.5)
        link
          .attr('opacity', edge => {
            const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source
            const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target
            return srcId === d.id || tgtId === d.id ? 1 : 0.08
          })
        node.selectAll('text').attr('opacity', n => n.id === d.id || neighborIds.has(n.id) ? 1 : 0.2)
      })

    // Click background to deselect
    svg.on('click', () => {
      setSelectedNode(null)
      node.selectAll('circle').attr('opacity', 1).attr('stroke', 'rgba(255,255,255,0.15)').attr('stroke-width', 1.5)
      link.attr('opacity', d => d.cluster === 'cooccurrence' ? 0.5 : 0.7)
      node.selectAll('text').attr('opacity', 1)
    })

    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(edges).id(d => d.id).distance(d => d.cluster ? 55 : 100))
      .force('charge',    d3.forceManyBody().strength(d => SMALL_TYPES.has(d.type) ? -60 : -200))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => (NODE_RADIUS[d.type] || 10) + 12))
      .on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        node.attr('transform', d => `translate(${d.x},${d.y})`)
      })

    svgEl._zoomBehavior = zoom
  }

  if (!entries?.length) {
    return (
      <div ref={containerRef} style={emptyGraph}>
        <i className="ti ti-topology-star" style={{ fontSize: 48, color: '#333344', marginBottom: 14 }} aria-hidden="true" />
        <div style={{ color: '#555566', fontSize: 14 }}>Crawl some articles or projects to build your knowledge graph</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={graphWrap}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div ref={tooltipRef} style={tooltipStyle} />

      {/* Side panel */}
      <NodePanel node={selectedNode} onClose={() => {
        setSelectedNode(null)
        // Reset highlights via DOM (d3 manages the SVG)
        if (svgRef.current) {
          svgRef.current.querySelectorAll('circle').forEach(c => {
            c.setAttribute('opacity', '1')
            c.setAttribute('stroke', 'rgba(255,255,255,0.15)')
            c.setAttribute('stroke-width', '1.5')
          })
          svgRef.current.querySelectorAll('line').forEach(l => l.setAttribute('opacity', '0.7'))
          svgRef.current.querySelectorAll('text').forEach(t => t.setAttribute('opacity', '1'))
        }
      }} />

      {/* Legend */}
      <div style={{ ...legend, right: selectedNode ? 336 : 16, transition: 'right 0.2s' }}>
        {[
          ['#1a8f7a', 'Article'], ['#7b5ea7', 'Project'], ['#2d4a6b', 'Category'],
          ['#c97a20', 'Entity'],  ['#e8a020', 'Co-occurrence'], ['#1565c0', 'Link'],
        ].map(([c, l]) => (
          <div key={l} style={legendItem}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
            {l}
          </div>
        ))}
      </div>

      <div style={{ ...hint, right: selectedNode ? 336 : 16, transition: 'right 0.2s' }}>
        Scroll to zoom · Drag nodes · Click to expand
      </div>
    </div>
  )
}

const graphWrap    = { position: 'relative', width: '100%', height: '100%', background: '#08080d', overflow: 'hidden' }
const tooltipStyle = { position: 'absolute', background: '#111118', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#aaaacc', pointerEvents: 'none', opacity: 0, transition: 'opacity 0.15s', maxWidth: 260, lineHeight: 1.5, zIndex: 10 }
const legend       = { position: 'absolute', bottom: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', background: 'rgba(8,8,13,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 14px' }
const legendItem   = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8888aa' }
const hint         = { position: 'absolute', bottom: 16, fontSize: 11, color: '#333344', background: 'rgba(8,8,13,0.6)', borderRadius: 8, padding: '5px 10px' }
const emptyGraph   = { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#08080d' }
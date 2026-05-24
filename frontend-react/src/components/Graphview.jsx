import React, { useEffect, useRef } from 'react'

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
const SMALL_TYPES = new Set(['concept','tech_item','feature_item','file_item','contributor','term_item','idea_item','entity_item','link_item','question_item','sentiment_item','stat_item'])
const CLUSTER_EDGE_COLORS = {
  tech: '#0d7377', features: '#8b5e3c', files: '#4a6741', people: '#7b3f6e',
  terms: '#1a8f7a', ideas: '#2e7d6b', entities: '#c97a20', links: '#1565c0',
  questions: '#b06a00', sentiment: '#7b4a8a', sentiment_arc: '#9b6aaa', stats: '#445566',
  cooccurrence: '#e8a020',
}

export default function GraphView({ entries }) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => {
    if (!entries?.length) return
    renderGraph()
  }, [entries])

  function buildGraphData(entries) {
    const nodes = [], edges = []
    const seen = {}, counter = { n: 0 }

    function mkId(pfx) { return `${pfx}_${counter.n++}` }
    function leaf(label, type, url = '') {
      const key = `${type}::${label.toLowerCase()}`
      if (!seen[key]) {
        seen[key] = mkId(type)
        nodes.push({ id: seen[key], label, type, url, summary: '', cluster: null })
      }
      return seen[key]
    }

    for (const entry of entries) {
      const etype = entry.type || 'article'
      const title = (entry.title || entry.url || 'Untitled').slice(0, 45)
      const rootId = mkId('root')
      nodes.push({ id: rootId, label: title, type: etype, url: entry.url || '', summary: entry.summary || entry.description || '', cluster: null })

      if (etype === 'article') {
        const keyTerms = entry.key_terms || []
        const termIds = {}
        if (keyTerms.length) {
          const cid = mkId('cluster')
          nodes.push({ id: cid, label: '🔑 Key Terms', type: 'cluster', url: '', summary: '', cluster: 'terms' })
          edges.push({ source: rootId, target: cid, cluster: 'terms' })
          keyTerms.slice(0, 6).forEach(t => { const lid = leaf(t, 'term_item'); termIds[t] = lid; edges.push({ source: cid, target: lid, cluster: 'terms' }) })
        }
        ;(entry.co_occurrences || []).forEach(co => {
          if (termIds[co.term_a] && termIds[co.term_b])
            edges.push({ source: termIds[co.term_a], target: termIds[co.term_b], cluster: 'cooccurrence', strength: co.strength || 0.5 })
        })
        ;(entry.main_ideas || []).slice(0, 3).forEach((idea, i) => {
          if (i === 0) { const cid = mkId('cluster'); nodes.push({ id: cid, label: '💡 Main Ideas', type: 'cluster', url: '', summary: '', cluster: 'ideas' }); edges.push({ source: rootId, target: cid, cluster: 'ideas' }) }
        })
        ;(entry.questions || []).slice(0, 3).forEach((q, i) => {
          if (i === 0) { const cid = mkId('cluster'); nodes.push({ id: cid, label: '❓ Questions', type: 'cluster', url: '', summary: '', cluster: 'questions' }); edges.push({ source: rootId, target: cid, cluster: 'questions' }) }
        })
        ;(entry.entities || []).slice(0, 5).forEach(ent => { edges.push({ source: rootId, target: leaf(ent, 'entity_item'), cluster: null }) })
        ;(entry.links || []).slice(0, 6).forEach(c => edges.push({ source: rootId, target: leaf(c, 'concept'), cluster: null }))
      } else if (etype === 'project') {
        const tech = entry.tech_stack || entry.languages || []
        if (tech.length) { const cid = mkId('cluster'); nodes.push({ id: cid, label: 'Tech Stack', type: 'cluster', url: '', summary: '', cluster: 'tech' }); edges.push({ source: rootId, target: cid, cluster: 'tech' }); tech.slice(0, 8).forEach(t => edges.push({ source: cid, target: leaf(t, 'tech_item'), cluster: 'tech' })) }
        ;(entry.contributors || []).slice(0, 5).forEach((c, i) => {
          if (i === 0) { const cid = mkId('cluster'); nodes.push({ id: cid, label: 'Contributors', type: 'cluster', url: '', summary: '', cluster: 'people' }); edges.push({ source: rootId, target: cid, cluster: 'people' }) }
        })
        ;(entry.key_concepts || []).slice(0, 6).forEach(c => edges.push({ source: rootId, target: leaf(c, 'concept'), cluster: null }))
      }
    }
    return { nodes, edges }
  }

  async function renderGraph() {
    const d3 = await import('d3')
    const svgEl = svgRef.current
    if (!svgEl) return
    svgEl.innerHTML = ''

    const { nodes, edges } = buildGraphData(entries)
    if (!nodes.length) return

    const W = svgEl.clientWidth || 760, H = 460
    const svg = d3.select(svgEl)
    const zoom = d3.zoom().scaleExtent([0.2, 4]).on('zoom', e => g.attr('transform', e.transform))
    svg.call(zoom)
    const g = svg.append('g')

    svg.append('defs').append('marker')
      .attr('id','arrow').attr('viewBox','0 -5 10 10').attr('refX', 20)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d','M0,-5L10,0L0,5').attr('fill','rgba(255,255,255,0.15)')

    const link = g.append('g').selectAll('line').data(edges).join('line')
      .attr('stroke', d => d.cluster === 'cooccurrence' ? '#e8a020' : d.cluster ? (CLUSTER_EDGE_COLORS[d.cluster] || 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.08)')
      .attr('stroke-width', d => d.cluster === 'cooccurrence' ? (d.strength || 0.5) * 3 : 1.2)
      .attr('stroke-dasharray', d => (!d.cluster || d.cluster === 'concept') ? '4,3' : null)
      .attr('opacity', d => d.cluster === 'cooccurrence' ? 0.5 : 0.7)
      .attr('marker-end', d => d.cluster === 'cooccurrence' ? null : 'url(#arrow)')

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    node.append('circle')
      .attr('r', d => NODE_RADIUS[d.type] || 10)
      .attr('fill', d => NODE_COLORS[d.type] || '#666')
      .attr('stroke', 'rgba(255,255,255,0.15)').attr('stroke-width', 1.5)

    node.append('text')
      .text(d => { const max = SMALL_TYPES.has(d.type) ? 14 : 18; return d.label.length > max ? d.label.slice(0, max) + '…' : d.label })
      .attr('dy', d => (NODE_RADIUS[d.type] || 10) + 11)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => SMALL_TYPES.has(d.type) ? 8 : d.type === 'cluster' ? 10 : 11)
      .attr('font-family', 'Syne, sans-serif')
      .attr('fill', '#aaaacc')
      .attr('font-weight', d => SMALL_TYPES.has(d.type) ? '400' : '700')

    const tooltip = d3.select(tooltipRef.current)
    node.on('mouseover', (e, d) => {
      tooltip.style('opacity', '1')
        .html(`<strong style="color:#f0eff5">${d.label}</strong>${d.summary ? `<br><span style="opacity:0.7;font-size:11px">${d.summary.slice(0, 80)}…</span>` : ''}`)
    }).on('mousemove', e => {
      const rect = svgEl.parentElement.getBoundingClientRect()
      tooltip.style('left', (e.clientX - rect.left + 12) + 'px').style('top', (e.clientY - rect.top - 10) + 'px')
    }).on('mouseout', () => tooltip.style('opacity', '0'))

    node.on('click', (e, d) => { if (d.url) window.open(d.url, '_blank') })

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(d => d.cluster ? 55 : 100))
      .force('charge', d3.forceManyBody().strength(d => SMALL_TYPES.has(d.type) ? -60 : -200))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => (NODE_RADIUS[d.type] || 10) + 12))
      .on('tick', () => {
        link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        node.attr('transform', d => `translate(${d.x},${d.y})`)
      })
  }

  if (!entries?.length) {
    return (
      <div style={emptyGraph}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🕸</div>
        <div>Crawl some articles or projects to build your knowledge graph</div>
      </div>
    )
  }

  return (
    <div style={graphWrap}>
      <div style={graphControls}>
        <span style={{ fontSize: 12, color: '#8888aa' }}>Scroll to zoom · Drag to pan · Click nodes to open</span>
        <button style={graphBtn} onClick={() => {
          import('d3').then(d3 => d3.select(svgRef.current).transition().duration(400).call(
            d3.zoom().transform, d3.zoomIdentity
          ))
        }}>Reset zoom</button>
      </div>
      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} style={{ width: '100%', height: 460, display: 'block' }} />
        <div ref={tooltipRef} style={tooltip} />
      </div>
      <div style={legend}>
        {[['#1a8f7a','Article'],['#7b5ea7','Project'],['#2d4a6b','Category'],['#c97a20','Entity'],['#e8a020','Co-occurrence'],['#1565c0','Link']].map(([c,l]) => (
          <div key={l} style={legendItem}><div style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />{l}</div>
        ))}
      </div>
    </div>
  )
}

const graphWrap = { background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }
const graphControls = { padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
const graphBtn = { padding: '5px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#8888aa', fontSize: 12, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }
const tooltip = { position: 'absolute', background: '#111118', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#aaaacc', pointerEvents: 'none', opacity: 0, transition: 'opacity 0.15s', maxWidth: 220, lineHeight: 1.5, zIndex: 10 }
const legend = { display: 'flex', flexWrap: 'wrap', gap: 16, padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }
const legendItem = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8888aa' }
const emptyGraph = { height: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8888aa', fontSize: 14, background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }
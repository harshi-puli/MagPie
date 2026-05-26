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

export default function GraphView({ entries }) {
  const svgRef = useRef(null)
  const tooltipRef = useRef(null)
  const containerRef = useRef(null)

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

    // Returns a shared leaf node id — deduplicates across entries
    function leaf(label, type) {
      const key = `${type}::${label.toLowerCase()}`
      if (!seen[key]) {
        seen[key] = mkId(type)
        nodes.push({ id: seen[key], label, type, url: '', summary: '', cluster: null })
      }
      return seen[key]
    }

    // Creates a cluster hub and returns its id
    function cluster(label, clusterKey, parentId) {
      const cid = mkId('cluster')
      nodes.push({ id: cid, label, type: 'cluster', url: '', summary: '', cluster: clusterKey })
      edges.push({ source: parentId, target: cid, cluster: clusterKey })
      return cid
    }

    for (const entry of entries) {
      const etype = entry.type || 'article'
      const title = (entry.title || entry.url || 'Untitled').slice(0, 45)
      const rootId = mkId('root')
      nodes.push({
        id: rootId, label: title, type: etype,
        url: entry.url || '', summary: entry.summary || entry.description || '',
        cluster: null,
      })

      if (etype === 'article') {
        // ── Key Terms ──────────────────────────────────────────────────────
        const keyTerms = entry.key_terms || []
        const termIds = {}
        if (keyTerms.length) {
          const cid = cluster('Key Terms', 'terms', rootId)
          keyTerms.slice(0, 6).forEach(t => {
            const lid = leaf(t, 'term_item')
            termIds[t] = lid
            edges.push({ source: cid, target: lid, cluster: 'terms' })
          })
        }

        // ── Co-occurrences (edges between term nodes) ───────────────────────
        ;(entry.co_occurrences || []).forEach(co => {
          const a = termIds[co.term_a], b = termIds[co.term_b]
          if (a && b) edges.push({ source: a, target: b, cluster: 'cooccurrence', strength: co.strength || 0.5 })
        })

        // ── Main Ideas ────────────────────────────────────────────────────
        const mainIdeas = entry.main_ideas || []
        if (mainIdeas.length) {
          const cid = cluster('Main Ideas', 'ideas', rootId)
          mainIdeas.slice(0, 4).forEach(idea => {
            const lid = leaf(idea.slice(0, 40), 'idea_item')
            edges.push({ source: cid, target: lid, cluster: 'ideas' })
          })
        }

        // ── Questions ─────────────────────────────────────────────────────
        const questions = entry.questions || []
        if (questions.length) {
          const cid = cluster('Questions', 'questions', rootId)
          questions.slice(0, 4).forEach(q => {
            const lid = leaf(q.slice(0, 40), 'question_item')
            edges.push({ source: cid, target: lid, cluster: 'questions' })
          })
        }

        // ── Entities ──────────────────────────────────────────────────────
        ;(entry.entities || []).slice(0, 5).forEach(ent => {
          edges.push({ source: rootId, target: leaf(ent, 'entity_item'), cluster: null })
        })

        // ── Wikilink concepts ─────────────────────────────────────────────
        ;(entry.links || []).slice(0, 6).forEach(c => {
          edges.push({ source: rootId, target: leaf(c, 'concept'), cluster: null })
        })

      } else if (etype === 'project') {
        // ── Tech Stack ────────────────────────────────────────────────────
        // support both array form (tech_stack) and object form (languages)
        const tech = Array.isArray(entry.tech_stack) && entry.tech_stack.length
          ? entry.tech_stack
          : Object.keys(entry.languages || {})
        if (tech.length) {
          const cid = cluster('Tech Stack', 'tech', rootId)
          tech.slice(0, 8).forEach(t => {
            edges.push({ source: cid, target: leaf(t, 'tech_item'), cluster: 'tech' })
          })
        }

        // ── Features ──────────────────────────────────────────────────────
        const features = entry.features || []
        if (features.length) {
          const cid = cluster('Features', 'features', rootId)
          features.slice(0, 5).forEach(f => {
            edges.push({ source: cid, target: leaf(f.slice(0, 40), 'feature_item'), cluster: 'features' })
          })
        }

        // ── Contributors ──────────────────────────────────────────────────
        const contribs = entry.contributors || []
        if (contribs.length) {
          const cid = cluster('Contributors', 'people', rootId)
          contribs.slice(0, 5).forEach(c => {
            const name = typeof c === 'string' ? c : (c.login || c.name || 'Unknown')
            edges.push({ source: cid, target: leaf(name, 'contributor'), cluster: 'people' })
          })
        }

        // ── Key Concepts / wikilinks ──────────────────────────────────────
        ;(entry.key_concepts || entry.links || []).slice(0, 6).forEach(c => {
          edges.push({ source: rootId, target: leaf(c, 'concept'), cluster: null })
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

    const { nodes, edges } = buildGraphData(entries)
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

    const tooltip = d3.select(tooltipRef.current)
    node
      .on('mouseover', (e, d) => {
        tooltip.style('opacity', '1').html(
          `<strong style="color:#f0eff5">${d.label}</strong>`
          + (d.summary ? `<br><span style="opacity:0.7;font-size:11px">${d.summary.slice(0, 100)}…</span>` : '')
        )
      })
      .on('mousemove', e => {
        const rect = container.getBoundingClientRect()
        tooltip
          .style('left', (e.clientX - rect.left + 12) + 'px')
          .style('top',  (e.clientY - rect.top  - 10) + 'px')
      })
      .on('mouseout', () => tooltip.style('opacity', '0'))
      .on('click', (e, d) => { if (d.url) window.open(d.url, '_blank') })

    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(edges).id(d => d.id).distance(d => d.cluster ? 55 : 100))
      .force('charge',    d3.forceManyBody().strength(d => SMALL_TYPES.has(d.type) ? -60 : -200))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => (NODE_RADIUS[d.type] || 10) + 12))
      .on('tick', () => {
        link
          .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
        node.attr('transform', d => `translate(${d.x},${d.y})`)
      })

    svgEl._zoomBehavior = zoom
  }

  if (!entries?.length) {
    return (
      <div ref={containerRef} style={emptyGraph}>
        <i className="ti ti-topology-star" style={{ fontSize: 48, color: '#333344', marginBottom: 14 }} aria-hidden="true" />
        <div style={{ color: '#555566', fontSize: 14 }}>
          Crawl some articles or projects to build your knowledge graph
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={graphWrap}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div ref={tooltipRef} style={tooltipStyle} />

      {/* Legend */}
      <div style={legend}>
        {[
          ['#1a8f7a', 'Article'],
          ['#7b5ea7', 'Project'],
          ['#2d4a6b', 'Category'],
          ['#c97a20', 'Entity'],
          ['#e8a020', 'Co-occurrence'],
          ['#1565c0', 'Link'],
        ].map(([c, l]) => (
          <div key={l} style={legendItem}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
            {l}
          </div>
        ))}
      </div>

      <div style={hint}>Scroll to zoom · Drag nodes · Click to open</div>
    </div>
  )
}

const graphWrap    = { position: 'relative', width: '100%', height: '100%', background: '#08080d', overflow: 'hidden' }
const tooltipStyle = { position: 'absolute', background: '#111118', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#aaaacc', pointerEvents: 'none', opacity: 0, transition: 'opacity 0.15s', maxWidth: 240, lineHeight: 1.5, zIndex: 10 }
const legend       = { position: 'absolute', bottom: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', background: 'rgba(8,8,13,0.75)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 14px' }
const legendItem   = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8888aa' }
const hint         = { position: 'absolute', bottom: 16, right: 16, fontSize: 11, color: '#333344', background: 'rgba(8,8,13,0.6)', borderRadius: 8, padding: '5px 10px' }
const emptyGraph   = { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#08080d' }
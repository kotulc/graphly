/**
 * Graphly page-index strip: fetches a tree data file and renders it as a
 * compact heatmap treemap (see treemap.js). Tile size and color are named
 * values from the file; clicking a cell follows its href unless an on_click
 * override is given. Colors track the site theme via --site-hs.
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { useTheme } from 'next-themes'

import { render_treemap } from './treemap.js'


export default function Graphly({ src = 'graph.json', size = 'coverage', color = 'relevance',
                                  height = 180, selector = true, on_click }) {
  const { basePath } = useRouter()
  const { resolvedTheme } = useTheme()
  const container = useRef(null)
  const [tree, set_tree] = useState(null)
  const [metric, set_metric] = useState(color)

  useEffect(() => {
    fetch(`${basePath}/${src}`).then(r => r.json()).then(set_tree).catch(() => set_tree(null))
  }, [src, basePath])

  // Re-render on data, metric, or theme changes, and on container resizes
  useEffect(() => {
    if (!tree || !container.current) return
    const draw = () => render_treemap(container.current, tree,
      { size, color: metric, dark: resolvedTheme === 'dark', on_click })
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [tree, size, metric, resolvedTheme, on_click])

  if (!tree) return null
  return (
    <div className="graphly">
      <div ref={container} style={{ position: 'relative', width: '100%', height }} />
      {selector && tree.values.length > 1 && (
        <div className="graphly-selector" style={{ marginTop: '0.5rem' }}>
          {tree.values.map(name => (
            <button key={name} type="button" onClick={() => set_metric(name)}
                    className={name === metric ? 'chip chip-category' : 'chip chip-tag'}>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

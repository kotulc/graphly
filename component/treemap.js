/**
 * Framework-free squarified treemap renderer for graphly tree data files.
 * Tile area comes from the 'size' value summed over leaves; heatmap color from
 * the 'color' value (site theme hue via --site-hs, lightness interpolated,
 * flipped for dark themes). Group tiles reserve a thin label band and any cell
 * with an href acts as a link. Shared by the mdsite component and the viewer.
 */

import { hierarchy, treemap, treemapSquarify } from './d3_hierarchy.js';


const RAMP = { light: [94, 39], dark: [25, 70] };  // lightness %: low → high intensity
const BAND = 16;                                   // group label band height (px)


/** Heatmap lightness (%) for a normalized 0..1 level under the given theme. */
export function ramp(level, dark = false) {
  const [low, high] = dark ? RAMP.dark : RAMP.light;
  return low + (high - low) * Math.min(Math.max(level, 0), 1);
}

/** Read a named value from a tree node (missing values count as 0). */
export function value_of(node, name) {
  return node.values?.[name] ?? 0;
}

/** Tooltip text: node name plus each value and meta pair on its own line. */
function tooltip(node) {
  const values = Object.entries(node.values ?? {}).map(
    ([name, value]) => `${name}: ${Number(value.toFixed(3))}`);
  const meta = Object.entries(node.meta ?? {}).map(([name, value]) => `${name}: ${value}`);
  return [node.name, ...values, ...meta].join('\n');
}

/** Render the tree as a compact treemap inside el, replacing its contents. */
export function render_treemap(el, tree, options = {}) {
  const { size = 'coverage', color = 'relevance', dark = false, on_click } = options;
  const width = el.clientWidth || 640;
  const height = el.clientHeight || 180;

  // Squarified layout: leaves supply tile area, groups reserve a label band
  const root = hierarchy(tree.root)
    .sum(node => node.children?.length ? 0 : Math.max(value_of(node, size), 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  treemap().tile(treemapSquarify).size([width, height])
    .paddingInner(1).paddingTop(node => node.depth ? BAND : 0)(root);

  // Color values normalized against the greatest leaf value
  const max = Math.max(...root.leaves().map(node => value_of(node.data, color)), 0) || 1;
  const shade = node => ramp(Math.max(value_of(node.data, color), 0) / max, dark);

  el.replaceChildren();
  for (const node of root.descendants()) {
    if (!node.depth) continue;  // the container itself is the root tile
    const cell = document.createElement(node.data.href ? 'a' : 'div');
    if (node.data.href) cell.href = node.data.href;

    const leaf = !node.children;
    const lightness = shade(node);
    cell.className = leaf ? 'graphly-leaf' : 'graphly-group';
    cell.title = tooltip(node.data);
    cell.textContent = node.data.name;
    Object.assign(cell.style, {
      position: 'absolute', overflow: 'hidden', boxSizing: 'border-box',
      left: `${node.x0}px`, top: `${node.y0}px`,
      width: `${node.x1 - node.x0}px`, height: `${node.y1 - node.y0}px`,
      font: `11px/${BAND}px sans-serif`, padding: '0 3px',
      whiteSpace: 'nowrap', textOverflow: 'ellipsis', textDecoration: 'none',
    });
    if (leaf) Object.assign(cell.style, {
      background: `hsl(var(--site-hs) ${lightness}%)`,
      color: lightness < 55 ? '#fff' : '#111', borderRadius: '2px',
    });
    else Object.assign(cell.style, {
      border: `1px solid hsl(var(--site-hs) ${lightness}%)`,
      color: 'inherit', borderRadius: '3px',
    });

    if (on_click) cell.addEventListener('click', event => {
      event.preventDefault();
      on_click(node.data);
    });
    el.append(cell);
  }
}

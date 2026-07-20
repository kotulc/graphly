// @vitest-environment jsdom
/**
 * Unit tests for the treemap renderer: value lookup, heatmap ramp endpoints,
 * tile layout sanity, href anchors, and click overrides.
 */

import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error plain JS module shared with the browser component
import { ramp, render_treemap, value_of } from '../component/treemap.js';


const tree = {
  version: 1, title: 'doc', values: ['relevance', 'coverage', 'count'],
  root: {
    name: 'doc', values: { relevance: 1, coverage: 0.4, count: 8 }, meta: {},
    children: [
      { name: 'alpha', href: '#alpha', values: { relevance: 0.8, coverage: 0.3, count: 6 },
        meta: { category: 'concepts' },
        children: [
          { name: 'hot', values: { relevance: 0.6, coverage: 0.2, count: 4 }, meta: {} },
          { name: 'cold', values: { relevance: 0, coverage: 0.1, count: 2 }, meta: {} },
        ] },
      { name: 'beta', values: { relevance: 0.4, coverage: 0.1, count: 2 }, meta: {},
        children: [
          { name: 'warm', href: '#warm',
            values: { relevance: 0.3, coverage: 0.1, count: 2 }, meta: {} },
        ] },
    ],
  },
};

const render = (options = {}) => {
  const el = document.createElement('div');
  render_treemap(el, tree, options);
  return el;
};


describe('value_of', () => {
  it.each([
    [{ values: { count: 3 } }, 'count', 3],
    [{ values: { count: 3 } }, 'missing', 0],
    [{}, 'count', 0],
  ])('reads %j %s as %d', (node, name, expected) => {
    expect(value_of(node, name)).toBe(expected);
  });
});


describe('ramp', () => {
  it('interpolates light-theme lightness from pale to strong', () => {
    expect(ramp(0)).toBe(94);
    expect(ramp(1)).toBe(39);
  });

  it('flips direction for dark themes', () => {
    expect(ramp(0, true)).toBe(25);
    expect(ramp(1, true)).toBe(70);
  });

  it('clamps out-of-range levels', () => {
    expect(ramp(-1)).toBe(94);
    expect(ramp(2)).toBe(39);
  });
});


describe('render_treemap', () => {
  it('renders one cell per node below the root', () => {
    const el = render();
    expect(el.children.length).toBe(5);  // 2 groups + 3 leaves
    const names = [...el.children].map(cell => cell.textContent);
    expect(names).toContain('alpha');
    expect(names).toContain('hot');
  });

  it('renders cells with an href as anchors, others as divs', () => {
    const el = render();
    const tags = new Map([...el.children].map(cell => [cell.textContent, cell.tagName]));
    expect(tags.get('alpha')).toBe('A');
    expect(tags.get('warm')).toBe('A');
    expect(tags.get('hot')).toBe('DIV');
  });

  it('lays out every tile inside the container bounds', () => {
    const el = render();  // jsdom has no layout: falls back to 640x180
    const epsilon = 1e-6;
    for (const cell of el.children) {
      const { left, top, width, height } = (cell as HTMLElement).style;
      expect(parseFloat(left)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(top)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(left) + parseFloat(width)).toBeLessThanOrEqual(640 + epsilon);
      expect(parseFloat(top) + parseFloat(height)).toBeLessThanOrEqual(180 + epsilon);
    }
  });

  it('sizes leaf tiles by the size value: bigger value, bigger area', () => {
    const el = render({ size: 'coverage' });
    const area = (name: string) => {
      const cell = [...el.children].find(c => c.textContent === name) as HTMLElement;
      return parseFloat(cell.style.width) * parseFloat(cell.style.height);
    };
    expect(area('hot')).toBeGreaterThan(area('cold'));
  });

  it('puts each value and meta pair in the cell tooltip', () => {
    const el = render();
    const alpha = [...el.children].find(c => c.textContent === 'alpha') as HTMLElement;
    expect(alpha.title).toContain('alpha');
    expect(alpha.title).toContain('relevance: 0.8');
    expect(alpha.title).toContain('category: concepts');
  });

  it('routes clicks to the on_click override instead of navigating', () => {
    const on_click = vi.fn();
    const el = render({ on_click });
    const warm = [...el.children].find(c => c.textContent === 'warm') as HTMLElement;
    warm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(on_click).toHaveBeenCalledWith(expect.objectContaining({ name: 'warm' }));
  });
});

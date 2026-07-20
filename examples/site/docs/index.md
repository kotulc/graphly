# Graphly Example

import Graphly from '../components/custom/Graphly'

<Graphly src="assets/graph.json" height={160} />

A sample page embedding the graphly treemap page index. Tile size follows the
`coverage` value, heatmap color the `relevance` value (switchable with the chips
above), and clicking a cell jumps to the matching section below.

## Architecture

The event bus decouples producers from consumers, keeping latency predictable
as traffic grows. Sharding splits state across partitions so the event bus can
scale horizontally without hot spots.

## Operations

Every deployment rolls out incrementally, and a failed health check triggers an
automatic rollback. Monitoring dashboards track deployments and rollback rates
over time.

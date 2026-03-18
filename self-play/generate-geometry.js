#!/usr/bin/env node
/**
 * Generate geometry-data.json from SVG path definitions.
 * Computes land grid and path caches without a browser DOM.
 *
 * Uses computational geometry (point-in-polygon, cubic Bezier interpolation)
 * to replicate what buildLandGrid() and buildPathCaches() do via SVG DOM.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1680;
const LAND_GRID_CELL = 8;
const PATH_CACHE_STEP = 2;

// --- SVG geometry definitions (from hormuz-game.html) ---

// Iranian coastline polygon
const IRAN_COAST = [
    [-24, -24], [2424, -24], [2424, 1320],
    [2040, 1008], [1752, 456], [1248, 372],
    [768, 624], [-24, 312],
];

// Arabian coastline polygon
const ARABIA_COAST = [
    [-24, 1704], [2424, 1704], [2424, 1680],
    [1920, 1632], [1440, 1320], [1404, 720],
    [1236, 864], [1008, 1080], [720, 1224],
    [360, 1320], [-24, 1344],
];

// Islands
const ISLANDS = [
    // Qeshm (polygon)
    { type: 'polygon', points: [[950, 570], [1230, 440], [1260, 500], [980, 640]] },
    // Larak (circle)
    { type: 'circle', cx: 1340, cy: 560, r: 25 },
    // Hormuz (circle)
    { type: 'circle', cx: 1420, cy: 450, r: 28 },
    // Greater Tunb (circle)
    { type: 'circle', cx: 850, cy: 740, r: 22 },
    // Lesser Tunb (circle)
    { type: 'circle', cx: 790, cy: 770, r: 16 },
    // Abu Musa (circle)
    { type: 'circle', cx: 750, cy: 880, r: 25 },
    // Sirri (circle)
    { type: 'circle', cx: 580, cy: 940, r: 22 },
    // Kish (ellipse)
    { type: 'ellipse', cx: 240, cy: 920, rx: 50, ry: 25 },
];

// Shipping lane polylines (SVG path "d" attribute parsed to line segments)
const LANES = {
    'lane-tr7': [
        [120, 1080], [600, 912], [960, 720],
        [1272, 600], [1632, 840], [2280, 1392],
    ],
    'lane-north': [
        [120, 720], [480, 600], [840, 480],
        [1200, 420], [1500, 600], [1800, 840], [2280, 1200],
    ],
    'lane-south': [
        [120, 1320], [480, 1200], [840, 1080],
        [1200, 900], [1500, 840], [1800, 960], [2280, 1440],
    ],
};

// --- Point-in-polygon (ray casting algorithm) ---

function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function pointInCircle(x, y, cx, cy, r) {
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function pointInEllipse(x, y, cx, cy, rx, ry) {
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

function pointInIsland(x, y, island) {
    switch (island.type) {
        case 'polygon': return pointInPolygon(x, y, island.points);
        case 'circle': return pointInCircle(x, y, island.cx, island.cy, island.r);
        case 'ellipse': return pointInEllipse(x, y, island.cx, island.cy, island.rx, island.ry);
        default: return false;
    }
}

// --- Polyline path length and interpolation ---

function computePolylineLength(points) {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i][0] - points[i - 1][0];
        const dy = points[i][1] - points[i - 1][1];
        len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
}

function getPointAtLength(points, dist) {
    let remaining = dist;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i][0] - points[i - 1][0];
        const dy = points[i][1] - points[i - 1][1];
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (remaining <= segLen) {
            const t = segLen > 0 ? remaining / segLen : 0;
            return {
                x: points[i - 1][0] + dx * t,
                y: points[i - 1][1] + dy * t,
            };
        }
        remaining -= segLen;
    }
    // Past end — return last point
    return { x: points[points.length - 1][0], y: points[points.length - 1][1] };
}

// --- Build land grid ---

function buildLandGrid() {
    const cols = Math.ceil(MAP_WIDTH / LAND_GRID_CELL);
    const rows = Math.ceil(MAP_HEIGHT / LAND_GRID_CELL);
    const grid = new Uint8Array(cols * rows);

    console.log(`Building land grid: ${cols} x ${rows} = ${cols * rows} cells...`);

    for (let row = 0; row < rows; row++) {
        const y = row * LAND_GRID_CELL + LAND_GRID_CELL / 2;
        for (let col = 0; col < cols; col++) {
            const x = col * LAND_GRID_CELL + LAND_GRID_CELL / 2;
            if (pointInPolygon(x, y, IRAN_COAST)) {
                grid[row * cols + col] = 1;
            } else if (pointInPolygon(x, y, ARABIA_COAST)) {
                grid[row * cols + col] = 2;
            } else {
                for (const island of ISLANDS) {
                    if (pointInIsland(x, y, island)) {
                        grid[row * cols + col] = 3;
                        break;
                    }
                }
            }
        }
    }

    const iranCount = Array.from(grid).filter(v => v === 1).length;
    const arabiaCount = Array.from(grid).filter(v => v === 2).length;
    const islandCount = Array.from(grid).filter(v => v === 3).length;
    const waterCount = Array.from(grid).filter(v => v === 0).length;
    console.log(`  Iran: ${iranCount}, Arabia: ${arabiaCount}, Islands: ${islandCount}, Water: ${waterCount}`);

    return { grid: Array.from(grid), cols, rows };
}

// --- Build path caches ---

function buildPathCaches() {
    const caches = {};
    for (const [pathId, points] of Object.entries(LANES)) {
        const totalLen = computePolylineLength(points);
        const numPoints = Math.ceil(totalLen / PATH_CACHE_STEP) + 1;
        const data = new Float32Array(numPoints * 2);

        for (let i = 0; i < numPoints; i++) {
            const d = Math.min(i * PATH_CACHE_STEP, totalLen);
            const pt = getPointAtLength(points, d);
            data[i * 2] = pt.x;
            data[i * 2 + 1] = pt.y;
        }

        caches[pathId] = {
            data: Array.from(data),
            totalLength: totalLen,
            numPoints,
        };

        console.log(`  ${pathId}: ${numPoints} points, length ${totalLen.toFixed(1)}`);
    }
    return caches;
}

// --- Main ---

console.log('Generating geometry data...\n');

const landResult = buildLandGrid();
const pathResult = buildPathCaches();

const geometryData = {
    landGrid: landResult.grid,
    landGridCols: landResult.cols,
    landGridRows: landResult.rows,
    pathCache: pathResult,
    meta: {
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        gridCell: LAND_GRID_CELL,
        pathStep: PATH_CACHE_STEP,
        generatedAt: new Date().toISOString(),
        generator: 'generate-geometry.js (computational, no browser)',
    },
};

const outPath = path.join(__dirname, 'geometry-data.json');
fs.writeFileSync(outPath, JSON.stringify(geometryData));
console.log(`\nWritten to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

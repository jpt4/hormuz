/**
 * Headless Simulation Engine
 * Runs the Hormuz game logic in Node.js without any DOM/Canvas/SVG rendering.
 * Uses Node.js vm module to execute the game script in a sandboxed context.
 */

'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { SeededRNG } = require('./prng');

// --- DOM Stubs ---
// Minimal no-op stubs for DOM APIs referenced during game script initialization.
// All actual DOM writes are skipped by the HEADLESS flag in the game code.

function createElementStub() {
    return {
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        style: {},
        innerText: '',
        innerHTML: '',
        textContent: '',
        dataset: {},
        children: [],
        appendChild() {},
        removeChild() {},
        addEventListener() {},
        removeEventListener() {},
        setAttribute() {},
        getAttribute() { return ''; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 2400, height: 1680 }; },
        getContext() {
            // Fake canvas 2d context — all methods are no-ops
            return new Proxy({}, {
                get(target, prop) {
                    if (prop === 'canvas') return { width: 2400, height: 1680 };
                    if (typeof target[prop] === 'function') return target[prop];
                    return function() { return this; };
                },
                set() { return true; }
            });
        },
        width: 2400,
        height: 1680,
        // SVG stubs (should not be called in HEADLESS, but just in case)
        createSVGPoint() { return { x: 0, y: 0 }; },
        isPointInFill() { return false; },
        getTotalLength() { return 0; },
        getPointAtLength() { return { x: 0, y: 0 }; },
    };
}

function createDocumentStub() {
    const elements = {};
    return {
        getElementById(id) {
            if (!elements[id]) elements[id] = createElementStub();
            return elements[id];
        },
        createElement(tag) {
            return createElementStub();
        },
        createElementNS(ns, tag) {
            return createElementStub();
        },
        querySelectorAll() {
            return [];
        },
        addEventListener() {},
    };
}

/**
 * Load and parse the game script from hormuz-game.html.
 * Extracts the content between <script> and </script> tags.
 */
function extractGameScript(htmlPath) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    if (!match) throw new Error('Could not extract <script> content from game HTML');
    return match[1];
}

/**
 * Create a game simulation context.
 * Returns an object with access to game internals for driving automated play.
 */
function createSimulation(options = {}) {
    const {
        seed = 42,
        geometryPath = path.join(__dirname, 'geometry-data.json'),
        gamePath = path.join(__dirname, '..', 'hormuz-game.html'),
        difficulty = 'standard',
        constantOverrides = {},
    } = options;

    // Load geometry data
    const geometryData = JSON.parse(fs.readFileSync(geometryPath, 'utf8'));

    // Extract game script
    const gameScript = extractGameScript(gamePath);

    // Create seeded PRNG
    const rng = new SeededRNG(seed);

    // Build sandbox
    const windowStub = {
        __HORMUZ_HEADLESS: true,
        addEventListener() {},
        removeEventListener() {},
        location: { reload() {} },
        innerWidth: 1500,
        innerHeight: 1050,
    };

    const sandbox = {
        window: windowStub,
        document: createDocumentStub(),
        console: {
            log() {},
            warn() {},
            error() {},
            info() {},
            debug() {},
        },
        Math,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        Infinity,
        NaN,
        undefined,
        Array,
        Object,
        String,
        Number,
        Boolean,
        Date,
        JSON,
        Map,
        Set,
        Uint8Array,
        Float32Array,
        Int32Array,
        Proxy,
        Error,
        TypeError,
        RangeError,
        // Timers — execute immediately for init, no-op otherwise
        setTimeout: (fn) => { fn(); return 0; },
        clearTimeout() {},
        setInterval: () => 0,
        clearInterval() {},
        requestAnimationFrame: () => 0,
        cancelAnimationFrame() {},
        // localStorage stub
        localStorage: {
            getItem() { return null; },
            setItem() {},
        },
        // Module exports support
        module: { exports: {} },
    };

    // Make window properties accessible as globals
    sandbox.self = sandbox.window;

    vm.createContext(sandbox);

    // Execute game script
    try {
        vm.runInContext(gameScript, sandbox, {
            filename: 'hormuz-game.js',
            timeout: 5000,
        });
    } catch (e) {
        throw new Error(`Failed to initialize game script: ${e.message}\n${e.stack}`);
    }

    const game = sandbox.module.exports;

    // Inject seeded PRNG
    game._rng = rng.next.bind(rng);

    // Load geometry data
    game.loadGeometryData(geometryData);

    // Apply constant overrides (for rebalancing)
    // Tunable scalars are declared as `let` in the game code.
    // UNIT_DEFS properties are mutable since the array is a const reference.
    for (const [key, value] of Object.entries(constantOverrides)) {
        try {
            vm.runInContext(`${key} = ${JSON.stringify(value)};`, sandbox);
        } catch (e) {
            console.error(`Failed to override ${key}: ${e.message}`);
        }
    }

    // Set difficulty
    game.GameState.difficulty = difficulty;

    return {
        game,
        rng,
        sandbox,

        /** Start a new game (resets state, enters setup phase for wave 1) */
        startGame() {
            // Reset entities
            game.Entities.playerUnits.length = 0;
            game.Entities.enemies.length = 0;
            game.Entities.projectiles.length = 0;
            game.Entities.enemyProjectiles.length = 0;
            game.Entities.cruiseMissiles.length = 0;
            game.Entities.mines.length = 0;
            game.Entities.usvs.length = 0;
            game.Entities.effects.length = 0;

            // Reset game state
            game.GameState.phase = 'intro';
            game.GameState.previousPhase = null;
            game.GameState.passedStalemate = false;
            game.GameState.f14Charges = 0;
            game.GameState.f14KillCounter = 0;
            game.GameState.f14Cooldown = 0;
            game.GameState.f14Active = null;
            game.GameState.selectedUnitType = -1;
            game.GameState.selectedPlacedUnit = null;
            game.GameState.hoveredUnit = null;
            game.GameState.sidebarOpen = false;
            game.GameState.refOpen = false;
            game.GameState.spawnQueue = [];
            game.GameState.spawnTimer = 0;
            game.GameState.activePaths = ['lane-tr7'];
            game.GameState.totalTime = 0;
            game.GameState.lastTick = 0;

            // Call startGame to set phase, funds, oil, wave
            game.startGame();
        },

        /** Advance simulation by one fixed timestep */
        step(dt = 1 / 30) {
            game.update(dt);
        },

        /** Check if game is still running */
        isRunning() {
            const p = game.GameState.phase;
            return p !== 'victory' && p !== 'defeat' && p !== 'stalemate' && p !== 'intro';
        },

        /** Get current game phase */
        getPhase() {
            return game.GameState.phase;
        },

        /** Get observation for auto-player */
        getObservation() {
            const gs = game.GameState;
            const ent = game.Entities;
            return {
                phase: gs.phase,
                wave: gs.wave,
                oil: gs.oil,
                funds: gs.funds,
                setupTimeRemaining: gs.setupTimer,
                totalTime: gs.totalTime,
                playerUnits: ent.playerUnits.map(u => ({
                    defId: u.defId,
                    x: u.x,
                    y: u.y,
                    hp: u.hp,
                    hpMax: u.hpMax,
                    tier: u.tier,
                    range: u.range,
                    dps: u.dps,
                })),
                enemies: ent.enemies.map(e => ({
                    type: e.type,
                    x: e.x,
                    y: e.y,
                    hp: e.hp,
                    hpMax: e.hpMax,
                    pathId: e.pathId,
                })),
                f14Charges: gs.f14Charges,
                f14Cooldown: gs.f14Cooldown,
                activePaths: [...gs.activePaths],
                passedStalemate: gs.passedStalemate,
            };
        },

        /** Place a unit at world coordinates */
        placeUnit(unitTypeIndex, x, y) {
            const defs = game.UNIT_DEFS;
            if (unitTypeIndex < 0 || unitTypeIndex >= defs.length) return false;
            const def = defs[unitTypeIndex];
            if (game.GameState.funds < def.cost) return false;

            const check = game.validatePlacement(def, x, y);
            if (!check.valid) return false;

            game.GameState.funds -= def.cost;
            const unit = game.createPlayerUnit(def, x, y);
            game.Entities.playerUnits.push(unit);
            return unit;
        },

        /** Upgrade a placed unit */
        upgradeUnit(unit) {
            return game.upgradeUnit(unit);
        },

        /** Activate F-14 strike */
        activateF14() {
            return game.activateF14();
        },

        /** Get UNIT_DEFS for strategy planning */
        getUnitDefs() {
            return game.UNIT_DEFS;
        },

        /** Validate a placement position */
        validatePlacement(unitDef, x, y) {
            return game.validatePlacement(unitDef, x, y);
        },

        /** Run a complete game with an auto-player, returning trace data */
        runGame(autoPlayer, options = {}) {
            const { maxTicks = 100000, dt = 1 / 30 } = options;
            const TraceRecorder = require('./trace-recorder');
            const trace = new TraceRecorder();

            this.startGame();
            trace.recordEvent('gameStart', { wave: 1, difficulty: game.GameState.difficulty });

            let lastPhase = '';
            let lastWave = 0;
            let tickCount = 0;

            while (this.isRunning() && tickCount < maxTicks) {
                const obs = this.getObservation();

                // Detect phase transitions
                if (obs.phase !== lastPhase) {
                    trace.recordEvent('phaseChange', { from: lastPhase, to: obs.phase, wave: obs.wave });

                    // Auto-player acts at start of each setup phase
                    if (obs.phase === 'setup' && autoPlayer) {
                        const actions = autoPlayer.decide(obs, this);
                        for (const action of actions) {
                            this.executeAction(action, trace);
                        }
                    }
                    lastPhase = obs.phase;
                }

                // Detect wave transitions
                if (obs.wave !== lastWave) {
                    trace.recordWaveSummary(obs);
                    lastWave = obs.wave;
                }

                // F-14 decisions during defend phase
                if (obs.phase === 'defend' && autoPlayer && autoPlayer.shouldF14) {
                    if (autoPlayer.shouldF14(obs)) {
                        this.executeAction({ type: 'f14' }, trace);
                    }
                }

                // Track kills (compare enemy counts)
                const prevEnemyCount = obs.enemies.length;

                this.step(dt);
                tickCount++;

                // Record kills by comparing post-step state
                const postEnemyCount = game.Entities.enemies.length;
                if (postEnemyCount < prevEnemyCount) {
                    trace.recordEvent('enemiesCleared', {
                        count: prevEnemyCount - postEnemyCount,
                        wave: game.GameState.wave,
                    });
                }
            }

            // Final summary
            const finalObs = this.getObservation();
            trace.recordWaveSummary(finalObs);
            trace.recordEvent('gameEnd', {
                outcome: game.GameState.phase,
                wave: game.GameState.wave,
                oil: game.GameState.oil,
                funds: game.GameState.funds,
                totalTicks: tickCount,
                totalTime: game.GameState.totalTime,
            });

            return trace.finalize(game.UNIT_DEFS);
        },

        /** Execute a single action */
        executeAction(action, trace) {
            switch (action.type) {
                case 'place': {
                    const unit = this.placeUnit(action.unitType, action.x, action.y);
                    if (unit && trace) {
                        trace.recordEvent('place', {
                            unitType: action.unitType,
                            x: action.x,
                            y: action.y,
                            wave: game.GameState.wave,
                            fundsAfter: game.GameState.funds,
                        });
                    }
                    return !!unit;
                }
                case 'upgrade': {
                    const success = this.upgradeUnit(action.unit);
                    if (success && trace) {
                        trace.recordEvent('upgrade', {
                            unitType: action.unit.defId,
                            tier: action.unit.tier,
                            wave: game.GameState.wave,
                            fundsAfter: game.GameState.funds,
                        });
                    }
                    return success;
                }
                case 'f14': {
                    const result = this.activateF14();
                    if (trace) {
                        trace.recordEvent('f14', {
                            wave: game.GameState.wave,
                            charges: game.GameState.f14Charges,
                        });
                    }
                    return result;
                }
                default:
                    return false;
            }
        },
    };
}

module.exports = { createSimulation, extractGameScript };

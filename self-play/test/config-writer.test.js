/**
 * Config writer unit tests — format helpers and unattended-run detection.
 *
 * Git integration (commit/push) is exercised manually and in cloud dry runs;
 * these tests cover pure logic that must stay stable for CI/cloud balance.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    formatConfigJS,
    isUnattendedRun,
    defaultGitIdentity,
} = require('../config-writer');

describe('config-writer', () => {
    test('formatConfigJS emits empty overrides and metadata comments', () => {
        const js = formatConfigJS({}, { cycle: 1, winRate: '12.5', diversity: '60' });
        assert.match(js, /Cycle: 1 \| Win rate: 12\.5%/);
        assert.match(js, /window\.__BALANCE_OVERRIDES = \{\};/);
    });

    test('formatConfigJS serializes override keys', () => {
        const js = formatConfigJS({ 'UNIT_DEFS[0].dps': 61 }, { cycle: 2 });
        assert.match(js, /"UNIT_DEFS\[0\]\.dps": 61/);
    });

    test('isUnattendedRun is true when CI env is set', () => {
        const prev = process.env.CI;
        process.env.CI = 'true';
        try {
            assert.equal(isUnattendedRun(), true);
        } finally {
            if (prev === undefined) delete process.env.CI;
            else process.env.CI = prev;
        }
    });

    test('isUnattendedRun is true when CURSOR_CLOUD is set', () => {
        const prev = process.env.CURSOR_CLOUD;
        process.env.CURSOR_CLOUD = '1';
        try {
            assert.equal(isUnattendedRun(), true);
        } finally {
            if (prev === undefined) delete process.env.CURSOR_CLOUD;
            else process.env.CURSOR_CLOUD = prev;
        }
    });

    test('isUnattendedRun is false in a normal local shell', () => {
        const saved = {
            CI: process.env.CI,
            CURSOR_CLOUD: process.env.CURSOR_CLOUD,
            GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
        };
        delete process.env.CI;
        delete process.env.CURSOR_CLOUD;
        delete process.env.GITHUB_ACTIONS;
        try {
            assert.equal(isUnattendedRun(), false);
        } finally {
            for (const [key, value] of Object.entries(saved)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }
    });

    test('defaultGitIdentity provides stable bot defaults', () => {
        const id = defaultGitIdentity();
        assert.ok(id.name);
        assert.ok(id.email.includes('@'));
    });
});

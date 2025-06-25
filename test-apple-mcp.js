#!/usr/bin/env node

/**
 * Test script for Apple MCP Server
 * This script verifies that the Apple MCP server can be accessed and is working properly.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🍎 Testing Apple MCP Server...\n');

// Test 1: Check if bunx can access the server
console.log('1. Testing bunx access to @dhravya/apple-mcp...');

const testProcess = spawn('bunx', ['@dhravya/apple-mcp@latest', '--help'], {
    stdio: 'inherit',
    cwd: __dirname
});

testProcess.on('close', (code) => {
    if (code === 0) {
        console.log('✅ Apple MCP server is accessible via bunx');
        console.log('\n🎉 Apple MCP server installation completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Restart Claude Desktop to load the new MCP server');
        console.log('2. Start using Apple native tools in Claude:');
        console.log('   - "Send a message to [contact name]"');
        console.log('   - "List my notes" or "Search for notes about [topic]"');
        console.log('   - "Create a reminder to [task] for [time]"');
        console.log('   - "What\'s on my calendar tomorrow?"');
        console.log('   - "Search the web for [query]"');
        console.log('   - "Find directions to [location]"');
    } else {
        console.log('❌ Error accessing Apple MCP server via bunx');
        console.log('Exit code:', code);
    }
});

testProcess.on('error', (error) => {
    console.error('❌ Error running test:', error.message);
});
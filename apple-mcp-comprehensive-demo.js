#!/usr/bin/env node

/**
 * Comprehensive Apple MCP Server Demonstration
 * This script demonstrates the Apple MCP server's capabilities across multiple tool categories:
 * - Contacts (search, list)
 * - Notes (search, list, create)
 * - Messages (send, read)
 * - Mail (unread, search)
 * - Reminders (list, search, create)
 * - Calendar (search, list events)
 * - Maps (search locations)
 * - Web Search (Safari integration)
 */

import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class AppleMCPDemo {
    constructor() {
        this.client = null;
        this.transport = null;
        this.serverProcess = null;
        this.results = [];
        this.permissionsRequested = [];
    }

    async initialize() {
        console.log('🍎 Apple MCP Server Comprehensive Demonstration\n');
        console.log('📋 This demo will test the following capabilities:');
        console.log('   • Contacts management');
        console.log('   • Notes operations');
        console.log('   • Messages handling');
        console.log('   • Mail operations');
        console.log('   • Reminders management');
        console.log('   • Calendar integration');
        console.log('   • Maps location search');
        console.log('   • Web search via Safari\n');

        try {
            // Start the Apple MCP server
            await this.startServer();
            
            // Initialize MCP client
            await this.initializeClient();
            
            // Run demonstrations
            await this.runDemonstrations();
            
        } catch (error) {
            console.error('❌ Demo initialization failed:', error.message);
            this.logResult('Initialization', false, error.message);
        } finally {
            await this.cleanup();
        }
    }

    async startServer() {
        console.log('🚀 Starting Apple MCP Server...');
        
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('bunx', ['@dhravya/apple-mcp@latest'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });

            this.serverProcess.on('error', (error) => {
                reject(new Error(`Failed to start Apple MCP server: ${error.message}`));
            });

            // Give the server time to start
            setTimeout(() => {
                if (this.serverProcess && !this.serverProcess.killed) {
                    console.log('✅ Apple MCP Server started successfully');
                    resolve();
                } else {
                    reject(new Error('Apple MCP Server failed to start'));
                }
            }, 2000);
        });
    }

    async initializeClient() {
        console.log('🔗 Connecting MCP Client...');
        
        this.transport = new StdioClientTransport({
            command: 'bunx',
            args: ['@dhravya/apple-mcp@latest']
        });

        this.client = new Client({
            name: "apple-mcp-demo",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: {}
            }
        });

        await this.client.connect(this.transport);
        console.log('✅ MCP Client connected successfully');
    }

    async runDemonstrations() {
        console.log('\n📱 Starting Apple MCP Tool Demonstrations...\n');

        // Get available tools
        await this.listAvailableTools();

        // Test Notes functionality
        await this.demonstrateNotes();

        // Test Contacts functionality
        await this.demonstrateContacts();

        // Test Reminders functionality
        await this.demonstrateReminders();

        // Test Calendar functionality
        await this.demonstrateCalendar();

        // Test Mail functionality
        await this.demonstrateMail();

        // Test Maps functionality
        await this.demonstrateMaps();

        // Test Web Search functionality
        await this.demonstrateWebSearch();

        // Test Messages functionality (if available)
        await this.demonstrateMessages();

        // Print summary
        this.printSummary();
    }

    async listAvailableTools() {
        console.log('🔍 Discovering available Apple MCP tools...');
        
        try {
            const toolsResponse = await this.client.listTools();
            console.log('📋 Available tools:');
            
            if (toolsResponse.tools && toolsResponse.tools.length > 0) {
                toolsResponse.tools.forEach((tool, index) => {
                    console.log(`   ${index + 1}. ${tool.name} - ${tool.description || 'No description'}`);
                });
                this.logResult('Tool Discovery', true, `Found ${toolsResponse.tools.length} tools`);
            } else {
                console.log('   No tools found');
                this.logResult('Tool Discovery', false, 'No tools available');
            }
            console.log('');
        } catch (error) {
            console.error('❌ Failed to list tools:', error.message);
            this.logResult('Tool Discovery', false, error.message);
        }
    }

    async demonstrateNotes() {
        console.log('📝 Testing Notes Functionality...');
        
        // Test 1: List notes
        await this.testTool('notes_list', {}, 'List Notes', 'Retrieve all notes from Apple Notes');

        // Test 2: Search notes
        await this.testTool('notes_search', { 
            query: 'meeting' 
        }, 'Search Notes', 'Search for notes containing "meeting"');

        // Test 3: Create a note
        await this.testTool('notes_create', {
            title: 'Apple MCP Demo Note',
            content: 'This note was created during the Apple MCP server demonstration.'
        }, 'Create Note', 'Create a new note via Apple MCP');

        console.log('');
    }

    async demonstrateContacts() {
        console.log('👥 Testing Contacts Functionality...');
        
        // Test 1: List contacts
        await this.testTool('contacts_list', {}, 'List Contacts', 'Retrieve all contacts');

        // Test 2: Search contacts
        await this.testTool('contacts_search', { 
            query: 'John' 
        }, 'Search Contacts', 'Search for contacts named "John"');

        console.log('');
    }

    async demonstrateReminders() {
        console.log('⏰ Testing Reminders Functionality...');
        
        // Test 1: List reminders
        await this.testTool('reminders_list', {}, 'List Reminders', 'Retrieve all reminders');

        // Test 2: Search reminders
        await this.testTool('reminders_search', { 
            query: 'appointment' 
        }, 'Search Reminders', 'Search for reminders about "appointment"');

        // Test 3: Create reminder
        await this.testTool('reminders_create', {
            title: 'Test Apple MCP Integration',
            notes: 'Reminder created via Apple MCP server demonstration',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow
        }, 'Create Reminder', 'Create a new reminder for tomorrow');

        console.log('');
    }

    async demonstrateCalendar() {
        console.log('📅 Testing Calendar Functionality...');
        
        // Test 1: List events
        await this.testTool('calendar_list_events', {
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Next week
        }, 'List Calendar Events', 'List events for the next week');

        // Test 2: Search calendar
        await this.testTool('calendar_search', { 
            query: 'meeting' 
        }, 'Search Calendar', 'Search calendar for "meeting" events');

        console.log('');
    }

    async demonstrateMail() {
        console.log('📧 Testing Mail Functionality...');
        
        // Test 1: Get unread emails
        await this.testTool('mail_unread', {}, 'Unread Mail', 'Retrieve unread emails');

        // Test 2: Search emails
        await this.testTool('mail_search', { 
            query: 'important' 
        }, 'Search Mail', 'Search emails for "important"');

        console.log('');
    }

    async demonstrateMaps() {
        console.log('🗺️ Testing Maps Functionality...');
        
        // Test 1: Search for location
        await this.testTool('maps_search', { 
            query: 'Apple Park, Cupertino' 
        }, 'Maps Search', 'Search for Apple Park location');

        // Test 2: Search for nearby places
        await this.testTool('maps_search', { 
            query: 'coffee shops near me' 
        }, 'Maps Nearby Search', 'Find nearby coffee shops');

        console.log('');
    }

    async demonstrateWebSearch() {
        console.log('🌐 Testing Web Search Functionality...');
        
        // Test web search via Safari
        await this.testTool('web_search', { 
            query: 'Apple MCP server documentation' 
        }, 'Web Search', 'Search the web for Apple MCP documentation');

        console.log('');
    }

    async demonstrateMessages() {
        console.log('💬 Testing Messages Functionality...');
        
        // Test 1: Read recent messages
        await this.testTool('messages_read', {}, 'Read Messages', 'Retrieve recent messages');

        // Note: Sending messages requires careful handling and user consent
        console.log('ℹ️  Message sending skipped - requires explicit user consent');
        this.logResult('Send Messages', false, 'Skipped for safety - requires user consent');

        console.log('');
    }

    async testTool(toolName, parameters, displayName, description) {
        console.log(`  🧪 Testing: ${displayName}`);
        console.log(`     Description: ${description}`);
        
        try {
            const result = await this.client.callTool({
                name: toolName,
                arguments: parameters
            });

            if (result && result.content) {
                console.log(`     ✅ Success: ${displayName} executed successfully`);
                console.log(`     📊 Result type: ${typeof result.content}`);
                
                if (Array.isArray(result.content)) {
                    console.log(`     📈 Items returned: ${result.content.length}`);
                }
                
                this.logResult(displayName, true, 'Tool executed successfully');
            } else {
                console.log(`     ⚠️  Warning: ${displayName} returned no content`);
                this.logResult(displayName, false, 'No content returned');
            }
        } catch (error) {
            if (error.message.includes('permission') || error.message.includes('access')) {
                console.log(`     🔒 Permission Required: ${displayName}`);
                console.log(`     📝 Note: ${error.message}`);
                this.permissionsRequested.push(displayName);
                this.logResult(displayName, false, `Permission required: ${error.message}`);
            } else {
                console.log(`     ❌ Failed: ${displayName}`);
                console.log(`     🐛 Error: ${error.message}`);
                this.logResult(displayName, false, error.message);
            }
        }
    }

    logResult(testName, success, details) {
        this.results.push({
            test: testName,
            success: success,
            details: details,
            timestamp: new Date().toISOString()
        });
    }

    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 APPLE MCP SERVER DEMONSTRATION SUMMARY');
        console.log('='.repeat(60));

        const successful = this.results.filter(r => r.success).length;
        const failed = this.results.filter(r => !r.success).length;
        const total = this.results.length;

        console.log(`\n📈 Overall Results:`);
        console.log(`   ✅ Successful: ${successful}/${total}`);
        console.log(`   ❌ Failed: ${failed}/${total}`);
        console.log(`   📊 Success Rate: ${((successful/total) * 100).toFixed(1)}%`);

        if (this.permissionsRequested.length > 0) {
            console.log(`\n🔒 Permissions Required:`);
            this.permissionsRequested.forEach(permission => {
                console.log(`   • ${permission}`);
            });
            console.log(`\n💡 Note: Many failures may be due to required macOS permissions.`);
            console.log(`   Please grant necessary permissions in System Preferences > Privacy & Security.`);
        }

        console.log(`\n📝 Detailed Results:`);
        this.results.forEach(result => {
            const status = result.success ? '✅' : '❌';
            console.log(`   ${status} ${result.test}: ${result.details}`);
        });

        console.log(`\n🎯 Key Findings:`);
        console.log(`   • Apple MCP Server is ${this.serverProcess && !this.serverProcess.killed ? 'running' : 'not running'}`);
        console.log(`   • MCP Protocol connection: ${this.client ? 'established' : 'failed'}`);
        console.log(`   • Tool availability: ${this.results.find(r => r.test === 'Tool Discovery')?.success ? 'confirmed' : 'unconfirmed'}`);
        
        if (successful > 0) {
            console.log(`   • Server functionality: Partially or fully operational`);
        } else {
            console.log(`   • Server functionality: Requires permission setup`);
        }

        console.log(`\n🚀 Next Steps:`);
        console.log(`   1. Review permission requirements for failed tools`);
        console.log(`   2. Grant necessary macOS permissions in System Preferences`);
        console.log(`   3. Restart Claude Desktop to ensure MCP server integration`);
        console.log(`   4. Test individual tools through Claude interface`);

        console.log('\n' + '='.repeat(60));
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up...');
        
        try {
            if (this.client) {
                await this.client.close();
                console.log('✅ MCP Client disconnected');
            }
        } catch (error) {
            console.log('⚠️  Error disconnecting client:', error.message);
        }

        try {
            if (this.transport) {
                await this.transport.close();
                console.log('✅ Transport closed');
            }
        } catch (error) {
            console.log('⚠️  Error closing transport:', error.message);
        }

        if (this.serverProcess && !this.serverProcess.killed) {
            this.serverProcess.kill();
            console.log('✅ Server process terminated');
        }

        console.log('🏁 Demo completed!\n');
    }
}

// Run the demonstration
const demo = new AppleMCPDemo();
demo.initialize().catch(error => {
    console.error('💥 Demo failed with error:', error.message);
    process.exit(1);
});
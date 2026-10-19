#!/usr/bin/env node

/**
 * Test script to verify AI crawler can see prerendered content
 */

import fetch from 'node-fetch';

const baseUrl = 'http://localhost:5001';

async function testAICrawlerView() {
  console.log('🤖 Testing AI Crawler View\n');
  console.log('='.repeat(60));
  
  // Test 1: Homepage with AI crawler user agent
  console.log('\n📄 Test 1: Homepage as GPTBot');
  console.log('-'.repeat(60));
  
  try {
    const response = await fetch(`${baseUrl}/?forcePrerender=true`, {
      headers: {
        'User-Agent': 'GPTBot/1.0'
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      const hasContent = html.includes('NewsPlatform is an independent news aggregator');
      const hasArticles = html.includes('Latest Stories');
      const hasJsonLd = html.includes('"@type": "Organization"');
      
      console.log('✅ Homepage prerender works!');
      console.log(`   - Has description: ${hasContent ? '✓' : '✗'}`);
      console.log(`   - Has articles section: ${hasArticles ? '✓' : '✗'}`);
      console.log(`   - Has JSON-LD: ${hasJsonLd ? '✓' : '✗'}`);
      console.log(`   - Content length: ${html.length} characters`);
    } else {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  // Test 2: API integration endpoint
  console.log('\n📡 Test 2: AI Integration API');
  console.log('-'.repeat(60));
  
  try {
    const response = await fetch(`${baseUrl}/api/ai/latest-stories?limit=3`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API endpoint works!');
      console.log(`   - Success: ${data.success}`);
      console.log(`   - Articles returned: ${data.data?.length || 0}`);
      console.log(`   - Meta: limit=${data.meta.limit}, offset=${data.meta.offset}`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n   First article:');
        const article = data.data[0];
        console.log(`   - Title: ${article.title}`);
        console.log(`   - URL: ${article.url}`);
        console.log(`   - Channel: ${article.channel?.name}`);
        console.log(`   - Excerpt: ${article.excerpt.substring(0, 100)}...`);
      }
    } else {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  // Test 3: Check robots.txt
  console.log('\n🤖 Test 3: robots.txt');
  console.log('-'.repeat(60));
  
  try {
    const response = await fetch(`${baseUrl}/robots.txt`);
    
    if (response.ok) {
      const content = await response.text();
      const allowsGPTBot = content.includes('User-agent: GPTBot');
      const allowsPerplexity = content.includes('User-agent: PerplexityBot');
      const allowsClaude = content.includes('User-agent: ClaudeBot');
      const hasSitemap = content.includes('Sitemap:');
      
      console.log('✅ robots.txt exists!');
      console.log(`   - Allows GPTBot: ${allowsGPTBot ? '✓' : '✗'}`);
      console.log(`   - Allows PerplexityBot: ${allowsPerplexity ? '✓' : '✗'}`);
      console.log(`   - Allows ClaudeBot: ${allowsClaude ? '✓' : '✗'}`);
      console.log(`   - Has sitemap: ${hasSitemap ? '✓' : '✗'}`);
    } else {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  // Test 4: Check llms.txt
  console.log('\n📝 Test 4: llms.txt');
  console.log('-'.repeat(60));
  
  try {
    const response = await fetch(`${baseUrl}/llms.txt`);
    
    if (response.ok) {
      const content = await response.text();
      const hasTitle = content.includes('# NewsPlatform');
      const hasDescription = content.includes('independent news aggregator');
      const hasFeatures = content.includes('Key Features');
      const hasAPI = content.includes('API Access');
      
      console.log('✅ llms.txt exists!');
      console.log(`   - Has title: ${hasTitle ? '✓' : '✗'}`);
      console.log(`   - Has description: ${hasDescription ? '✓' : '✗'}`);
      console.log(`   - Has features: ${hasFeatures ? '✓' : '✗'}`);
      console.log(`   - Has API info: ${hasAPI ? '✓' : '✗'}`);
      console.log(`   - Length: ${content.length} characters`);
    } else {
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✨ Testing complete!\n');
}

// Run tests
testAICrawlerView().catch(console.error);

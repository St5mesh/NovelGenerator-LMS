#!/usr/bin/env node

/**
 * Manual test script for LM Studio service
 * This tests basic connectivity and text generation
 */

const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234/v1';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'llama-3.1-instruct-13b';

console.log('🧪 Testing LM Studio Connection');
console.log(`📍 URL: ${LM_STUDIO_URL}`);
console.log(`🤖 Model: ${LM_STUDIO_MODEL}`);
console.log('💡 Tip: Set LM_STUDIO_URL environment variable to use a different server\n');

// Test 1: Check if LM Studio is accessible
async function testConnectivity() {
  console.log('Test 1: Checking connectivity...');
  try {
    const response = await fetch(`${LM_STUDIO_URL}/models`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    console.log('✅ Connection successful');
    console.log('📦 Available models:', data.data?.map(m => m.id).join(', ') || 'None');
    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    return false;
  }
}

// Test 2: Simple text generation
async function testTextGeneration() {
  console.log('\nTest 2: Testing basic text generation...');
  try {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Write a single sentence about artificial intelligence.' }
    ];

    const requestBody = {
      model: LM_STUDIO_MODEL,
      messages,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 100,
      stream: false
    };

    const response = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) {
      throw new Error('No response text received');
    }

    console.log('✅ Text generation successful');
    console.log('📝 Response:', text);
    return true;
  } catch (error) {
    console.error('❌ Text generation failed:', error.message);
    return false;
  }
}

// Test 3: JSON structured output
async function testStructuredOutput() {
  console.log('\nTest 3: Testing JSON structured output...');
  try {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant that responds in JSON format.' },
      { 
        role: 'user', 
        content: 'Generate a JSON object with two fields: "title" (a book title) and "genre" (the genre). Respond ONLY with valid JSON, no other text.' 
      }
    ];

    const requestBody = {
      model: LM_STUDIO_MODEL,
      messages,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 100,
      stream: false,
      response_format: { type: 'json_object' }
    };

    const response = await fetch(`${LM_STUDIO_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) {
      throw new Error('No response text received');
    }

    const parsed = JSON.parse(text);
    console.log('✅ JSON structured output successful');
    console.log('📝 Response:', JSON.stringify(parsed, null, 2));
    return true;
  } catch (error) {
    console.error('❌ JSON structured output failed:', error.message);
    console.error('   Note: Some models may not support json_object format');
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('═'.repeat(60));
  
  const test1 = await testConnectivity();
  if (!test1) {
    console.log('\n❌ Connectivity test failed. Please ensure:');
    console.log('   1. LM Studio is running');
    console.log('   2. The server is accessible at ' + LM_STUDIO_URL);
    console.log('   3. A model is loaded in LM Studio');
    process.exit(1);
  }

  const test2 = await testTextGeneration();
  const test3 = await testStructuredOutput();

  console.log('\n' + '═'.repeat(60));
  console.log('📊 Test Results:');
  console.log(`   Connectivity: ${test1 ? '✅' : '❌'}`);
  console.log(`   Text Generation: ${test2 ? '✅' : '❌'}`);
  console.log(`   Structured Output: ${test3 ? '✅' : '⚠️  (optional)'}`);
  console.log('═'.repeat(60));

  if (test1 && test2) {
    console.log('\n✅ Basic LM Studio integration is working!');
    console.log('   You can now use the NovelGenerator with LM Studio.');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed. Please fix the issues above.');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});

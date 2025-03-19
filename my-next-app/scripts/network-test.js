// network-test.js
// A simple script to test connectivity to remote ChromaDB and Ollama services

const fetch = require('node-fetch');

// Configuration
const remoteServerIP = process.env.SERVER_IP || '192.168.0.105';
const chromaUrl = `http://${remoteServerIP}:8000`;
const ollamaUrl = process.env.OLLAMA_URL || `http://${remoteServerIP}:11434`;

async function testConnections() {
  console.log('Testing connections to remote services...');
  console.log(`Remote Server IP: ${remoteServerIP}`);
  
  // Test ChromaDB connection
  console.log('\n--- Testing ChromaDB ---');
  console.log(`URL: ${chromaUrl}`);
  
  try {
    const chromaResponse = await fetch(`${chromaUrl}/api/v1/heartbeat`);
    const chromaData = await chromaResponse.json();
    console.log('ChromaDB connection successful!');
    console.log('Response:', chromaData);
  } catch (error) {
    console.error('ChromaDB connection failed:', error.message);
    console.log('Troubleshooting tips:');
    console.log('1. Verify the ChromaDB container is running on the remote server');
    console.log('2. Check that port 8000 is exposed in the container and accessible');
    console.log('3. Make sure no firewall is blocking the connection');
  }
  
  // Test Ollama connection
  console.log('\n--- Testing Ollama ---');
  console.log(`URL: ${ollamaUrl}`);
  
  try {
    const ollamaResponse = await fetch(`${ollamaUrl}/api/tags`);
    if (ollamaResponse.status === 404) {
      console.log('Ollama API responded but endpoint may have changed. This is normal for some versions.');
      console.log('Status:', ollamaResponse.status);
    } else {
      const ollamaData = await ollamaResponse.json();
      console.log('Ollama connection successful!');
      console.log('Available models:');
      if (ollamaData.models) {
        ollamaData.models.forEach(model => {
          console.log(`- ${model.name}`);
        });
      } else {
        console.log(ollamaData);
      }
    }
  } catch (error) {
    console.error('Ollama connection failed:', error.message);
    console.log('Troubleshooting tips:');
    console.log('1. Verify the Ollama container is running on the remote server');
    console.log('2. Check that port 11434 is exposed in the container and accessible');
    console.log('3. Make sure no firewall is blocking the connection');
    
    // Try alternative endpoints that might work
    try {
      console.log('\nTrying alternative Ollama endpoint...');
      const altResponse = await fetch(`${ollamaUrl}/api/version`);
      const altData = await altResponse.json();
      console.log('Alternative endpoint successful!');
      console.log('Ollama version:', altData.version);
      console.log('Connection to Ollama is working, but the API might be different than expected.');
    } catch (altError) {
      console.error('Alternative endpoint also failed:', altError.message);
    }
  }
}

testConnections().catch(error => {
  console.error('Test failed with unexpected error:', error);
});